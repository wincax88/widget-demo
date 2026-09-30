# AI Center 对话测试

用户已确认实现 AI 对话测试，沿用此前讨论的服务端代理方案。

## 范围

新增 `/ai-chat`，对所有具有有效 EduPlus 应用会话的角色开放。支持非流式、多轮纯文本对话、可选模型编码、最大输出 Token 和 temperature。展示回答、实际模型、结束原因、Token 用量和请求编号。会话只保存在页面内存中；刷新或清空后不保留。不读取考试成绩，不上传文件，不接入 SSE。

## 服务端

新增 `AiCenterModule`，复用 `AuthModule`、`SessionGuard` 和全局 CSRF/Origin 保护。

- `GET /api/ai-center/status` 返回 `{ configured, defaultModel }`；configured 仅代表本地配置齐全，不证明上游授权或可用性。
- `POST /api/ai-center/chat` 接收 `{ messages, model?, max_tokens?, temperature? }`。
- messages 为 1–32 条 system/user/assistant 文本消息，每条最多 8000 字符，总计最多 32000 字符；拒绝空白正文和未定义字段。model 最多 128 字符；max_tokens 为 1–4096 的整数，默认 512；temperature 为 0–2，默认 0.2。
- `AI_CENTER_BASE_URL` 是部署公网 origin，不含 `/ai-center/openapi/v1`；只允许 HTTP(S)，拒绝用户信息、query、fragment 和非根路径。
- `AI_CENTER_API_KEY` 只从服务端环境读取；`AI_CENTER_MODEL` 可选；`AI_CENTER_TIMEOUT_MS` 默认 60000，范围 1000–120000。
- 未配置时应用仍可启动，但对话返回明确的 503 配置缺失错误。
- 调用 `${AI_CENTER_BASE_URL}/ai-center/openapi/v1/chat/completions`，使用 Bearer Key、服务端生成的 UUID 请求编号、JSON 请求和超时信号；拒绝 HTTP 重定向，避免把 Key 发送到另一地址。
- 响应只返回 `{ content, model, request_id, finish_reason, usage }`。usage 为上游的 input_tokens/output_tokens/total_tokens，缺失时为 null。过滤应用标识、API Key 标识和路由信息。
- 错误返回安全固定消息、错误编号、request_id、upstream_status 与 retryable；不透传上游原始错误消息、凭据或网络异常正文。上游 401 映射为 502，避免被误认为应用登录失效。429 保留；不自动重试。

## 前端

Ant Design 页面包括参数区、对话记录、问题输入、发送与清空。模型留空使用服务端配置或 AI Center 默认模型。发送期间禁用重复提交和清空；失败保留输入及此前成功对话，下一次发送不重复堆积失败消息。输入、回答均作为文本渲染。配置缺失、状态读取失败和调用失败分别显示可理解的提示；可重新读取连接状态。所有调用使用既有 request 工具携带会话和 CSRF。

## 配置与验证

更新 `.env.example`、Sealos 示例 Secret 和接入文档；不写入真实密钥、不修改集群、不发布。测试覆盖协议、配置校验、授权/CSRF、输入限制、响应过滤、超时、上游错误、页面提交/多轮/失败/清空/登录路由。运行 Jest、Vitest 和前后端构建；数据库集成测试依赖外部测试 PostgreSQL。真实模型联调须另行提供环境配置。

参考：[模型调用](https://ai-center.f123.pub/ai-center/docs/apis/models/)、[API Key](https://ai-center.f123.pub/ai-center/docs/auth/api-key/)、[Base URL](https://ai-center.f123.pub/ai-center/docs/getting-started/environments/)。
