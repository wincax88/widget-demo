# EduPlus Webhook 接收器 (Rust Demo)

第三方应用接收和验证 EduPlus webhook 事件的演示应用。

## 构建和运行

```bash
# 构建
cargo build --release

# 运行（监听 0.0.0.0:3099）
cargo run --release
```

## 配置

启动后默认 webhook secret 为 `test-secret`，可通过 API 修改：

```bash
curl -X POST http://localhost:3099/api/config \
  -H 'Content-Type: application/json' \
  -d '{"webhook_secret": "your-actual-secret"}'
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/webhook/eduplus` | 接收 webhook 事件，验证 HMAC 签名 |
| GET | `/api/events` | 查看所有已接收的事件（最新在前） |
| GET | `/api/events/by-type/{event_type}` | 按事件类型过滤，如 `subscription.created` |
| DELETE | `/api/events` | 清空所有事件 |
| GET | `/api/verify-issues` | 验证 GitHub issue 修复情况 |
| GET | `/api/config` | 查看当前配置 |
| POST | `/api/config` | 更新 webhook secret |

## HMAC 签名验证

Webhook 请求头：
- `X-EduPlus-Signature: sha256={hex_digest}`
- `X-EduPlus-Timestamp: {unix_seconds}`
- `X-EduPlus-Event: {event_type}`
- `X-EduPlus-Delivery-Id: {uuid}`

签名计算：
```
payload = "{timestamp}.{event}.{raw_body}"
signature = HMAC-SHA256(webhook_secret, payload)
```

## 问题验证

访问 `GET /api/verify-issues` 可自动检查以下问题的修复情况：

- #2/#6: `credential.rotated` 事件包含 `new_secret`
- #3: 订阅事件时间戳早于凭证创建事件
- #4: `subscription.created` 包含 `oauth_client` 和 `actor`
- #5: 激活学校不会自动订阅全部应用
- #7: 登录跳转 redirect_uri 有效（需手动测试）
- #8: 停止/恢复学校会发送对应通知事件
- #16: actor 信息与 Token 一致，姓名未颠倒
