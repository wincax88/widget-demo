# EduPlus 第三方考试成绩应用设计

## 背景

`widget-demo` 当前是一个第三方接入诊断 Demo，包含 Webhook 展示、开放 API 调试、OAuth 调试和一组使用内存模拟 token 与硬编码数据的 Widget 接口。目标是将其改造成可在 EduPlus 开发者门户注册、审核、被租户订阅并从工作台无感启动的考试成绩应用。业务实现全部位于 `widget-demo`；`edu-plus-2` 只增加 Widget handoff 所缺少的公开 OAuth `client_id` 选择信息，不扩展平台业务能力。

应用同时提供独立应用入口和第三方 Widget。独立应用优先完成租户订阅、工作台入口、Handoff 登录、基座公开 API 主数据同步和考试成绩业务闭环；Widget 使用相同的真实租户、身份、关系和成绩数据。

## 目标

- 使用 EduPlus `subscription.*` 与 `credential.*` Webhook 管理租户订阅和租户 OAuth 凭证。
- 使用工作台 `eduplus_handoff_code` 建立第三方应用服务端登录会话。
- 通过 EduPlus Open User Data API 获取教职工、学生、家长、班级、课程、任课和亲子关系。
- 支持教职工创建考试、录入或导入成绩、发布与撤回成绩。
- 支持学生查看本人已发布成绩，家长查看关联子女已发布成绩。
- 计算总分、平均分、班级排名、科目排名和历次成绩趋势。
- 提供基于真实数据的成绩 Widget schema、授权、刷新和批量数据 API。
- 为 EduPlus Widget handoff metadata 和授权请求补充公开 `client_id`，使多租户第三方应用能够选择正确的租户凭证。
- 修复 EduPlus `widget_data` token exchange 不返回服务端 refresh capability 的既有协议缺口。
- 使用 NestJS、Prisma 和 PostgreSQL 替换现有 Java Spring Boot 后端。
- 将应用部署到 Sealos 广州区集群的 `ns-gc40gxwh` namespace，并连接 Sealos 托管 PostgreSQL。

## 非目标

- 不修改 `edu-plus-2` 的数据库、OpenFGA 模型、Keycloak 配置、订阅模型或既有权限能力。
- 除 Widget handoff DTO、工作台调用参数、测试和接入文档外，不修改 `edu-plus-2` 的其他业务代码。
- 不自动调用开发者门户内部管理 API 注册或审核应用；注册、审核、授权和订阅按文档人工完成。
- 不保留现有 Config、API Tester、OAuth Test 或 Webhook Events 调试页面及其危险配置接口。
- 不生成模拟人员、模拟考试或模拟成绩作为运行态兜底。
- 不实现后台定时全量同步，也不长期依赖代表用户的 refresh token 执行无人值守同步。
- 不在 Kubernetes namespace 内自建 PostgreSQL StatefulSet。

## 技术方案

### 总体架构

应用采用模块化单体：

- React 负责不同身份的成绩应用界面。
- NestJS 同时提供业务 API、EduPlus 接入端点并托管 React 生产静态文件。
- Prisma 管理 PostgreSQL 数据访问和迁移。
- 浏览器仅保存随机的 HttpOnly 会话 Cookie；EduPlus token 和租户密钥只由服务端处理。

NestJS 模块边界：

- `integration`：EduPlus Handoff token exchange、OIDC/JWKS 校验和 Open User Data API 客户端。
- `subscriptions`：Webhook 验签、幂等、订阅生命周期和租户 OAuth 凭证管理。
- `auth`：应用会话、当前用户上下文、身份与租户守卫。
- `directory-sync`：基座主数据分页读取、校验、幂等投影和同步运行记录。
- `exams`：考试、班级、科目、成绩、CSV 导入、发布、统计与排名。
- `widgets`：组件 schema、`widget_data` 授权、refresh session 和批量数据响应。

### 租户订阅与凭证

`subscription.created` 是租户初始化入口。接收方必须先使用原始请求体、`X-EduPlus-Timestamp`、`X-EduPlus-Event` 和应用 Webhook Secret 验证 HMAC-SHA256 签名，再使用 `event_id` 幂等处理事件。

应用保存租户、应用、套餐、订阅状态和有效期，并使用环境变量提供的主密钥加密 `oauth_client.client_secret`。`subscription.reactivated`、`subscription.suspended`、`subscription.terminated`、`subscription.plan_changed`、`subscription.renewed`、`subscription.expiring` 和 `subscription.expired` 更新本地订阅状态。`credential.rotated` 更新加密密钥，`credential.revoked` 立即禁用对应凭证。

订阅非活跃、已到期或已终止时，应用拒绝新登录、主数据同步、成绩读取和 Widget 数据读取，同时保留已有业务数据。

### 工作台 Handoff 登录

工作台入口配置为 `/launch/{tenant_code}`，使用 EduPlus 既有入口 URL 变量把租户代码写入服务端路由。入口可能携带 `eduplus_handoff_code` 和 `eduplus_state`。

1. 前端将 code 与 state 提交给 NestJS 后端。
2. 后端使用入口路径中的租户代码选择本地有效租户凭证；租户代码只用于选择候选凭证，不作为最终授权依据。
3. 后端生成 `timestamp`、随机 `nonce`，并计算以下 HMAC-SHA256 base64url 无 padding 签名：

   ```text
   client_id + "\n" + code + "\n" + timestamp + "\n" + nonce
   ```

4. 后端调用 EduPlus `POST /api/v1/app-handoff/token`。
5. 后端校验 token 签名、issuer、client/audience、租户、身份和 handoff 类型，并要求 token 中的租户与入口路径选择的租户完全一致。
6. 后端创建随机服务端会话，Cookie 使用 `HttpOnly`、`Secure` 和合适的 `SameSite` 策略。
7. 后端返回 303，使浏览器进入不含 handoff 参数的应用首页。

应用不向浏览器返回 access token、ID token、refresh token、client secret 或 HMAC 签名。code 缺失、过期、重复使用或凭证失效时，页面提示用户从 EduPlus 工作台重新进入。

### 基座主数据同步

应用使用当前教职工 Handoff 会话中的用户 access token 调用：

- `/api/v1/open/userdata/master-data/teacher`
- `/api/v1/open/userdata/master-data/student`
- `/api/v1/open/userdata/master-data/parent`
- `/api/v1/open/userdata/master-data/class`
- `/api/v1/open/userdata/master-data/course`
- `/api/v1/open/userdata/master-data/subject`
- `/api/v1/open/userdata/master-data/teacher_class_relation`
- `/api/v1/open/userdata/master-data/teacher_teaching_assignment`
- `/api/v1/open/userdata/master-data/student_class_relation`
- `/api/v1/open/userdata/master-data/parent_student_relation`

同步严格遵循不透明 cursor 分页，直到 `has_more=false`。只有教职工身份可以发起同步。同步范围由 EduPlus 当前应用数据访问策略、用户访问策略和发起人的授权上下文决定，应用不得扩大范围。

同步使用租户 ID 与 EduPlus 记录 ID 作为稳定复合标识进行幂等 upsert。因为不同教职工可能只获得局部范围，某次同步未出现的记录不会被直接删除。基座返回的状态字段用于更新本地有效状态；同步错误、游标和数量写入 `sync_runs`，不以空数据伪装成功。

学生或家长在尚未完成完整主数据同步时，可以使用当前用户 profile 补充本人或关联子女的最小投影，但不能借此读取其他用户。

### 考试与成绩

考试支持周测、月考、期中、期末等预设展示值，并允许自定义考试类型。考试包含名称、学年、学期、日期、覆盖班级、科目、满分、创建人和状态。

教职工只能为自己具有有效任课关系的班级与科目创建或维护考试内容。成绩以考试、班级、科目和学生为授权边界：

- 教职工只能录入或修改其任教班级与科目的成绩。
- 学生只能读取与本人 EduPlus user ID 对应的已发布成绩。
- 家长只能读取有效亲子关系中子女的已发布成绩。
- 未发布考试不向学生、家长和对应 Widget 返回。

成绩录入支持页面表格和 CSV。CSV 在选定考试、班级与科目后下载模板和上传，最少包含稳定学生标识与分数。导入先进入预览，检查未知学生、重复学生、非法数值、超出满分和重复成绩；存在错误时不提交任何成绩。确认后的写入在单个数据库事务中完成。

考试发布时计算并保存或可重复计算以下结果：

- 学生总分与平均分。
- 班级总分排名。
- 各科班级排名。
- 各科班级均分、最高分和及格率。
- 同一学生跨已发布考试的成绩趋势。

排名采用标准竞赛排名，同分同名次并跳过后续名次，例如 `1、2、2、4`。撤回后，学生、家长和 Widget 立即不可见该考试，但成绩记录仍保留供教职工修订。

### Widget

应用提供并注册以下真实数据组件：

- 最近一次考试总分与班级排名：`stat-card`。
- 最近考试各科成绩：`table`。
- 历次考试列表：`list-card`。
- 成绩变化时间线：`timeline`。

教职工身份下，Widget 返回其授权范围内的考试发布状态和成绩录入进度；学生返回本人已发布成绩；家长按可信 token 上下文与有效亲子关系返回关联子女成绩。没有真实成绩时返回协议规定的空状态，不返回硬编码示例。

Widget 授权 API 将浏览器提交的 handoff code 交给服务端，由服务端使用租户 OAuth 凭证调用既有 `/api/v1/app-handoff/token`。后端验证 `handoff_type=widget_data`、audience、scope、租户、应用和允许的 widget keys。refresh session 保存在服务端并与租户、用户、身份、应用及配置快照绑定。批量数据 API 仅接受有效的 `widget.data.read` token，并对每个 widget 独立应用数据范围校验。

现有 EduPlus Widget handoff metadata 只返回 opaque handoff code，但 token exchange 要求第三方后端预先提交该租户的 `client_id`。为支持多租户，平台协议进行以下最小增量修改：

1. `third_party_handoffs[]` 增加公开字段 `client_id`。该值必须来自生成 handoff code 时已经选定并写入服务端 handoff context 的同一 OAuth 凭证。
2. 工作台调用第三方 Widget 授权 API 时，同时提交 `client_id`、`handoff_code`、`grant_type` 和 `idempotency_key`。
3. `widget-demo` 仅使用 `client_id` 查找本地加密凭证，不接受浏览器提交的租户、用户、身份、班级或授权范围。
4. EduPlus `/api/v1/app-handoff/token` 继续把请求 `client_id` 与已原子消费的 handoff context 进行绑定校验。篡改 `client_id` 只能导致交换失败，不能扩大权限。
5. `client_id` 是公开 OAuth 客户端标识；`client_secret` 仍只存在于 EduPlus 与 `widget-demo` 服务端。
6. `widget_data` token exchange 向第三方后端返回 refresh token；`widget-demo` 将其加密绑定到 refresh session，授权 API 和 refresh API 均不得把 refresh token 返回浏览器。

这一平台变更是加法协议变更，不改变数据库、OpenFGA、Keycloak 配置、订阅或权限模型。Keycloak 扩展需要调整 `widget_data` grant 的 refresh token 签发行为并随扩展镜像发布，但不需要配置迁移。实施前必须在 `edu-plus-2` 更新并严格验证现有 `add-third-party-widget-runtime-auth` OpenSpec change，完成 DTO、工作台前端、Keycloak 扩展、接入文档以及成功、缺失、篡改 `client_id` 和 refresh token 不泄露的测试后，才可联调 `widget-demo` 多租户 Widget。

### 页面

教职工端包括：

- 首页：真实租户、当前身份、订阅状态、最近考试和待录入项目。
- 基座数据同步：授权范围、同步进度、实体数量与错误结果。
- 考试管理：创建、编辑、发布、撤回和查看考试。
- 成绩录入：表格编辑、CSV 模板、导入预览和错误修正。
- 成绩分析：班级及科目统计、学生总分与排名。

学生端展示本人已发布考试的各科成绩、总分、平均分、班级排名、科目排名和历次趋势。

家长端根据真实亲子关系切换子女，并展示所选子女的已发布成绩、排名和趋势。

应用必须为无数据、同步中、同步失败、无权限、订阅失效和会话过期提供明确状态及可执行的下一步，不得使用模拟数据兜底。

## 数据模型

核心 PostgreSQL 表：

- `tenant_subscriptions`
- `tenant_credentials`
- `webhook_deliveries`
- `app_sessions`
- `teachers`
- `students`
- `parents`
- `classes`
- `courses`
- `subjects`
- `teacher_class_relations`
- `teacher_assignments`
- `student_class_relations`
- `parent_student_relations`
- `sync_runs`
- `exams`
- `exam_classes`
- `exam_subjects`
- `scores`
- `score_imports`
- `score_import_errors`
- `widget_refresh_sessions`

所有业务表包含租户边界；所有唯一约束和查询必须包含 `tenant_id`。基座投影记录同时保存 EduPlus 内部 ID 和可用的外部来源标识，但不会用外部 ID 替代缺失的内部授权标识。成绩对考试、学生和科目建立唯一约束。

## API 边界

主要外部端点：

- `POST /api/webhooks/eduplus`
- `POST /api/auth/handoff`
- `POST /api/auth/logout`
- `GET /api/session`
- `POST /api/directory-sync`
- `GET /api/directory-sync/runs`
- `GET|POST|PUT /api/exams`
- `POST /api/exams/:id/publish`
- `POST /api/exams/:id/withdraw`
- `GET|PUT /api/exams/:id/scores`
- `POST /api/exams/:id/scores/imports/preview`
- `POST /api/exams/:id/scores/imports/:importId/commit`
- `GET /api/results/me`
- `GET /api/results/children/:studentId`
- `GET /v1/open/demo-school/widgets/schema`
- `POST /v1/open/demo-school/widgets/auth`
- `POST /v1/open/demo-school/widgets/token/refresh`
- `POST /v1/open/demo-school/widgets/batch-data`

实际 Widget 注册路径保持稳定，以兼容当前开发者门户配置；应用代码和路径前缀在实现时集中配置，不散落硬编码。

Widget 授权请求的必要字段为：

```json
{
  "grant_type": "eduplus_widget_handoff",
  "client_id": "public-tenant-oauth-client-id",
  "handoff_code": "opaque-one-time-code",
  "idempotency_key": "frontend-generated-uuid"
}
```

## 安全设计

- Webhook 读取原始 body 验签，限制五分钟时间窗并使用 `event_id` 防重放。
- 租户 client secret、用户 token 和 refresh capability 使用 AES-GCM 等认证加密方式保存，主密钥仅由部署 Secret 注入。
- 日志不记录 handoff code、token、refresh session ID、client secret、Cookie 或完整敏感请求体。
- 所有数据库访问使用服务端租户上下文，禁止从普通请求 body 直接信任 `tenant_id`。
- 所有成绩写接口同时校验登录、活跃订阅、身份和任课关系。
- CORS 仅允许显式配置的 EduPlus 与应用 origin；敏感响应禁止 wildcard origin。
- Cookie 使用安全属性，写操作使用 CSRF 防护；登录、Webhook、同步和导入接口使用独立速率限制。
- 外部 API 设置连接和响应超时；Handoff code exchange 不进行可能造成重复消费的自动重试。

## 错误处理

- Handoff code 缺失、过期或已消费：提示从工作台重新进入。
- 租户凭证不存在、已吊销或解密失败：拒绝登录并记录不含密钥的诊断事件。
- 订阅暂停、过期或终止：返回稳定业务错误并保留数据。
- Open User Data 返回 401：结束当前会话并要求重新从工作台进入。
- Open User Data 返回 403：显示平台数据授权不足，不降级为无数据成功。
- Cursor 失效：本次同步失败并允许用户重新发起完整同步。
- CSV 校验失败：返回逐行错误，不写入部分成绩。
- Widget 中某个组件无权访问：只返回该组件的授权错误，不扩大其他组件权限。

## 部署设计

目标环境：

- Sealos 区域入口：`https://gzg.sealos.run`
- Kubernetes namespace：`ns-gc40gxwh`
- 数据库：Sealos 托管 PostgreSQL

仓库交付应用 Deployment、Service、HTTPS 暴露配置、Prisma migration Job 和部署说明。React 在生产构建阶段输出静态资源并由 NestJS 同源托管。应用配置健康检查、就绪检查、资源 requests/limits 和滚动更新策略。

数据库连接串、加密主密钥、Webhook Secret、会话密钥、EduPlus API 地址、允许的 origin 和应用公开地址通过 Kubernetes Secret 或 ConfigMap 注入；仓库不保存 kubeconfig 或真实凭证。Prisma migration Job 成功后才滚动应用 Deployment。

Sealos 分配最终 HTTPS 域名后，同一 origin 用于应用入口；Webhook 与 Widget API 使用该 origin 下的各自路径。最终地址再人工写入 EduPlus 开发者门户的应用环境、入口、Webhook 和 Widget 配置。

## 测试与验收

### 后端

- Webhook 签名、时间窗、重放、幂等和订阅状态转换。
- 凭证加密、轮换、吊销和日志脱敏。
- Handoff HMAC、单次 code、错误凭证、过期 token、租户不匹配和会话建立。
- OIDC issuer、audience/client、tenant、identity 和 handoff type 校验。
- Open User Data cursor 分页、局部授权、同步幂等和失败恢复。
- 教职工跨班级或跨科目录入返回 403。
- 学生读取他人成绩、家长读取非关联学生返回 403。
- CSV 未知学生、重复行、非法分数、超出满分和事务原子性。
- 发布前不可见、发布后统计与标准竞赛排名、撤回后立即不可见。
- Widget auth、refresh、批量读取、跨租户和跨身份隔离。

### EduPlus 最小协议变更

- handoff metadata 中的 `client_id` 与生成 code 时选定的 credential 一致。
- 工作台只把后端返回的 `client_id` 转交给受控 `auth_url`，不从 Widget schema 或其他浏览器输入覆盖。
- 缺失或篡改 `client_id` 时第三方授权或平台 token exchange 明确失败。
- 错误 `client_id` 不得换取其他租户、用户、身份或应用的 token。
- `widget_data` exchange 向第三方后端签发 refresh token，且 refresh token 的授权范围不得超过初始 token。
- 工作台浏览器收到的第三方授权和 refresh 响应均不得包含 refresh token。
- 既有不使用第三方 Widget 的页面响应和应用入口 handoff 行为保持不变。

### 前端

- Handoff 启动、参数清理和会话过期恢复。
- 三类身份路由和菜单隔离。
- 同步、考试、成绩、导入预览、发布和撤回流程。
- 空状态、权限错误、订阅失效与外部依赖失败。
- React 类型检查、单元测试和生产构建。

### 部署验收

- Prisma migration Job 成功。
- 应用 Pod 就绪且重启后数据仍在托管 PostgreSQL 中。
- HTTPS、Cookie、CORS、CSRF 与健康检查正常。
- 开发者门户完成应用创建、环境配置、入口、Webhook、Widget、提交审核和租户订阅。
- 真实租户完成 `subscription.created`、教职工 Handoff、主数据同步、考试录入发布、学生/家长查看和 Widget 展示闭环。

## 实施顺序

1. 在 `edu-plus-2` 更新并审核现有 `add-third-party-widget-runtime-auth` OpenSpec change，补充 `client_id` 透传和服务端 refresh capability。
2. 实施并验证 EduPlus DTO、工作台请求、Keycloak 扩展、测试与接入文档的最小协议变更。
3. 重建 Node/NestJS 后端骨架、Prisma schema、迁移与基础测试。
4. 完成 Webhook、租户订阅和凭证加密。
5. 完成 Handoff 登录、OIDC 校验和服务端会话。
6. 完成 Open User Data 客户端和手动主数据同步。
7. 完成考试、成绩、CSV、发布、排名和权限。
8. 重建 React 三身份应用界面。
9. 将 Widget 改为真实 token 与成绩数据。
10. 补齐开发者门户接入文档和 Sealos 部署资产。
11. 完成自动化测试、构建、部署及真实链路验收。

## 风险与缓解

- Open User Data 授权范围不足：明确显示 403 与缺少的数据范围，由平台管理员调整应用数据授权；不绕过策略。
- 教职工只获得局部数据：同步只做幂等合并，未见记录不删除；考试操作继续受本地已同步任课关系限制。
- Handoff token 生命周期短：code 立即兑换且不自动重试，失败时引导重新从工作台进入。
- 订阅或凭证事件重复：以 `event_id` 幂等处理，并记录最终处理结果。
- 排名数据敏感：只在活跃订阅、已发布考试和严格本人/亲子/任课授权内返回。
- 托管 PostgreSQL 或 EduPlus 暂时不可用：返回明确依赖错误，保留既有数据，不使用模拟数据降级。
