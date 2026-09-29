# 应用登录 Audience 校验与诊断日志设计

## 背景

`widget-demo` 通过应用登录 handoff code 向 EduPlus 换取 OIDC Token。当前登录校验已验证签名、签发方和 `azp/client_id`，但没有要求 `access_token.aud` 包含当前 OAuth `client_id`，也没有记录受众不匹配所需的安全诊断信息。

本变更仅作用于应用登录 handoff；Widget 数据 handoff 继续使用 `app:<appCode>:widget-data` 受众规则。

## 设计

1. 在 `OidcVerifier.verify()` 调用 `jwtVerify` 时传入 `audience: context.clientId`。由 JOSE 按标准同时支持字符串和字符串数组形式的 `aud`。
2. 保留 `azp/client_id === context.clientId` 校验。`aud` 表示 Token 的目标受众，`azp` 表示被授权方，两者职责不同。
3. 增加结构化日志：
   - 成功：记录事件名、`expected_aud`、已验证的 `received_aud`、`azp` 和 `aud_verified: true`。
   - 失败：安全解码 JWT payload，仅提取并规范化 `aud`，记录 `expected_aud`、`received_aud`、安全错误分类和 `aud_verified: false`。
4. 失败路径中的 `received_aud` 明确属于未验证输入；只用于排障。只接受字符串或字符串数组，限制元素数量和长度，并移除控制字符，避免日志注入或超大日志。
5. 任何日志均不得包含 access token、handoff code、client secret、refresh token、用户姓名或身份标识。

## 错误处理

外部响应保持现有兼容行为：所有应用登录 Token 校验失败仍返回 `401 OIDC token validation failed`。详细原因仅进入服务端安全日志，不向浏览器暴露。

## 验收

- `aud` 为当前 `client_id` 时通过。
- `aud` 为数组且包含当前 `client_id` 时通过。
- `aud` 缺失或不包含当前 `client_id` 时拒绝。
- `azp/client_id` 不匹配时仍拒绝。
- 成功和失败日志包含规范化后的 `received_aud`，且不包含原始 Token 或其他凭据。
- Widget Token 原有严格受众规则和测试保持通过。
