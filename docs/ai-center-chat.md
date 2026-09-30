# AI Center 对话测试

登录 widget-demo 后，在菜单选择 **AI 对话测试**，或访问 `/ai-chat`。教职工、教师、学生和家长均可使用，需要有效的 EduPlus 应用会话。

## 服务端接入

1. 在 AI Center 管理端填写应用名称并生成 API Key，安全保存只展示一次的明文。
2. 为该 Key 启用 `ai_center:chat:invoke`，授权目标模型；模型留空时还须配置默认模型。
3. 本地开发在 NestJS 后端环境中配置以下变量，再重启后端。Sealos 部署时，推荐在 GitHub 仓库 **Settings → Secrets and variables → Actions → Repository secrets** 添加 `AI_CENTER_BASE_URL` 和 `AI_CENTER_API_KEY`。
4. 推送到 `main` 或手动运行 Sealos 部署工作流；工作流会将两个值合并到现有 Sealos `widget-demo` Secret，保留数据库、加密和 Webhook 等其他配置，并滚动重启应用。仅修改 GitHub Secret 不会自动触发部署。

两个 GitHub Secrets 都未配置时，工作流跳过同步，保留 Sealos 中直接配置的值；只配置一项时，工作流停止部署并提示补齐。临时配置文件仅在 Runner 中创建，结束时清理，日志不输出值。`AI_CENTER_MODEL` 和 `AI_CENTER_TIMEOUT_MS` 可选，仍在 Sealos Secret 中配置，直接修改后需重启应用。

| 变量 | 说明 |
| --- | --- |
| `AI_CENTER_BASE_URL` | 实际 AI Center 部署 origin，例如 `https://ai-center.example.invalid`。不要包含 `/ai-center`、API 路径、用户名、query 或 fragment。示例域名是占位符。 |
| `AI_CENTER_API_KEY` | AI Center 生成的 API Key，仅保存于服务端 Secret 或未提交的本地环境文件。 |
| `AI_CENTER_MODEL` | 可选的已授权模型编码。留空使用 AI Center 为当前 Key 配置的默认模型。 |
| `AI_CENTER_TIMEOUT_MS` | 可选，默认 `60000`；允许 `1000`–`120000` 的整数毫秒。 |

页面不接收或显示 API Key，也不需要 EduPlus 的 OAuth 凭据来调用 AI Center。真实 Key 不得写入 `VITE_*`、代码、提交、浏览器存储或日志。省略 AI Center 配置不会阻止应用启动。

## 对话操作

- 模型留空使用服务端 `AI_CENTER_MODEL`，服务端也未设置时使用 AI Center 默认模型。输入模型编码可覆盖默认模型，但仍需上游授权。
- 最大输出 Tokens 默认 `512`，支持整数 `1`–`4096`；temperature 默认 `0.2`，范围 `0`–`2`。上游应用或模型可以有更严格的限制。
- 输入问题并发送，页面展示回答、实际模型、输入/输出/总 Tokens、请求 ID 和结束原因。上游未返回 Token 用量时显示“未提供”。
- 后续请求会附带此前成功的问答。记录只在当前页面内存保存，离开或刷新页面即清除；“清空对话”开始新的上下文。
- 发送期间禁用重复发送和清空。失败保留输入和此前成功的对话，可调整后再次发送，不自动重试。
- 单条消息最多 8000 字符；请求最多 32 条消息、32000 字符。达到上下文限制时请清空。生成的长回答也计入下次请求的限制。
- “服务端已配置”只说明地址和 Key 在后端配置齐全，不代表上游鉴权、模型授权、额度或服务已经验证。

第一版仅支持非流式纯文本对话，不读取考试数据、不上传文件、不持久化聊天记录。

## 请求协议

`GET /api/ai-center/status` 返回：

```json
{"configured": true, "defaultModel": null}
```

`POST /api/ai-center/chat` 示例（所有 HTTP 请求需要应用会话；POST 还需匹配的 CSRF Cookie 和 header）：

```json
{
  "messages": [{"role": "user", "content": "请用一句话介绍 AI Center。"}],
  "max_tokens": 512,
  "temperature": 0.2
}
```

messages 支持 `system`、`user`、`assistant` 的纯文本正文。`model` 可选；拒绝空白正文、未定义字段、数组正文和超限参数。

后端调用 `POST {AI_CENTER_BASE_URL}/ai-center/openapi/v1/chat/completions`，使用服务端 Bearer Key 和每次生成的 `X-Request-Id`。禁止 HTTP 重定向，不把密钥交给其他地址。返回值仅包含 `content`、`model`、`request_id`、`finish_reason`、`usage`，不透传应用、API Key 和路由标识。

## 失败排查

| 情况 | 处理 |
| --- | --- |
| 本地未配置 | 检查服务端地址和 Key；页面禁用发送。 |
| 上游 400 | 检查参数、上下文和模型限制。 |
| 上游 401 | 检查 Key 的格式和生命周期；对前端返回 502，区别于 widget-demo 登录失效。 |
| 上游 403 | 检查 Key 状态、`ai_center:chat:invoke`、模型授权与模型启用状态。 |
| 上游 429 | 检查额度、并发数；避免高频重复发送。 |
| 上游 503、网络失败或超时 | 查看错误码和请求 ID；只有可重试提示明确时才稍后重试。后端本地超时返回 504。 |
| widget-demo 401 | 重新从 EduPlus 登录；不是 AI Center Key 错误。 |

错误消息经过固定映射，不包含原始上游错误正文或凭据。使用页面请求 ID 与 AI Center 服务端日志关联排查。当前应用共用一份服务端 Key，其额度和模型授权适用于所有登录用户。

## 验证

```powershell
cd backend
npm test -- --runInBand --runTestsByPath src/ai-center/ai-center.service.spec.ts src/ai-center/ai-center.e2e-spec.ts src/config/env.schema.spec.ts
npm run build
cd ../frontend
npm test -- --run src/ai-center src/App.test.tsx src/services/api.test.ts
npm run build
```

新增后端测试模拟外部 AI Center 响应；使用实际会话 Guard 和 CSRF Guard，不需要真实 API Key。运行整个后端套件时须配置隔离测试 PostgreSQL 并先执行 `npx prisma migrate deploy`。

参考：[模型接口](https://ai-center.f123.pub/ai-center/docs/apis/models/)、[API Key](https://ai-center.f123.pub/ai-center/docs/auth/api-key/)、[部署基址](https://ai-center.f123.pub/ai-center/docs/getting-started/environments/)、[错误协议](https://ai-center.f123.pub/ai-center/docs/common/responses-errors/)。
