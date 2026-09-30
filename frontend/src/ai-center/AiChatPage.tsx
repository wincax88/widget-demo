import { Alert, Button, Card, Col, Empty, Form, Input, InputNumber, Row, Space, Spin, Typography } from 'antd'
import { useEffect, useRef, useState } from 'react'
import { ApiError } from '../services/api'
import { aiCenterApi, AiCenterStatus, ChatMessage, ChatResponse } from './aiCenterApi'

interface Exchange {
  question: string
  response: ChatResponse
}

export default function AiChatPage() {
  const [status, setStatus] = useState<AiCenterStatus | null>(null)
  const [statusLoading, setStatusLoading] = useState(true)
  const [statusError, setStatusError] = useState<string | null>(null)
  const [statusAttempt, setStatusAttempt] = useState(0)
  const [exchanges, setExchanges] = useState<Exchange[]>([])
  const [question, setQuestion] = useState('')
  const [model, setModel] = useState('')
  const [maxTokens, setMaxTokens] = useState<number | null>(512)
  const [temperature, setTemperature] = useState<number | null>(0.2)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<Error | null>(null)
  const pending = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setStatusLoading(true)
    setStatusError(null)
    void aiCenterApi.status(controller.signal).then((value) => {
      if (!controller.signal.aborted) setStatus(value)
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setStatusError(cause instanceof Error ? cause.message : '状态读取失败')
    }).finally(() => {
      if (!controller.signal.aborted) setStatusLoading(false)
    })
    return () => controller.abort()
  }, [statusAttempt])

  useEffect(() => () => pending.current?.abort(), [])

  const send = async () => {
    if (pending.current || !status?.configured || statusLoading || statusError) return
    const content = question.trim()
    const messages: ChatMessage[] = exchanges.flatMap(({ question: previousQuestion, response }) => [
      { role: 'user', content: previousQuestion }, { role: 'assistant', content: response.content },
    ])
    messages.push({ role: 'user', content })
    let validationError: string | null = null
    if (!content) validationError = '请输入问题'
    else if (content.length > 8000) validationError = '问题不能超过 8000 个字符'
    else if (model.trim().length > 128) validationError = '模型名称不能超过 128 个字符'
    else if (maxTokens === null || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 4096) validationError = '最大输出 Tokens 必须是 1 到 4096 的整数'
    else if (temperature === null || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) validationError = '温度必须在 0 到 2 之间'
    else if (messages.length > 32 || messages.some((message) => message.content.length > 8000) || messages.reduce((total, message) => total + message.content.length, 0) > 32000) validationError = '对话已达到上下文限制，请清空对话后再发送'
    if (validationError) {
      setError(new Error(validationError))
      return
    }
    const controller = new AbortController()
    pending.current = controller
    setSending(true)
    setError(null)
    try {
      const response = await aiCenterApi.chat({
        messages, ...(model.trim() ? { model: model.trim() } : {}), max_tokens: maxTokens!, temperature: temperature!,
      }, controller.signal)
      if (!controller.signal.aborted) {
        setExchanges((previous) => [...previous, { question: content, response }])
        setQuestion('')
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause : new Error('发送失败，请重试'))
    } finally {
      pending.current = null
      if (!controller.signal.aborted) setSending(false)
    }
  }

  const clear = () => {
    if (pending.current) return
    setExchanges([])
    setQuestion('')
    setError(null)
  }
  const details = error instanceof ApiError ? error.details : undefined

  return (
    <Space direction="vertical" size="large" style={{ width: '100%', maxWidth: 1100 }}>
      <Typography.Title level={2} style={{ margin: 0 }}>AI 对话测试</Typography.Title>
      <Typography.Text type="secondary">对话仅保留在当前页面，刷新或离开页面后清除。发送时会包含此前成功的对话。</Typography.Text>
      {statusLoading ? <Space role="status"><Spin size="small" />正在检查服务端配置<Button disabled>重新检查配置</Button></Space>
        : statusError ? <Alert type="error" showIcon message={statusError} action={<Button disabled={sending} onClick={() => setStatusAttempt((value) => value + 1)}>重试状态检查</Button>} />
          : <Alert type={status?.configured ? 'success' : 'warning'} showIcon
            message={status?.configured ? '服务端已配置' : '服务端尚未配置 AI Center，请联系管理员'}
            action={<Button disabled={sending} onClick={() => setStatusAttempt((value) => value + 1)}>重新检查配置</Button>}
            description={status?.configured ? '配置状态表示服务端本地配置已就绪，实际可用性以发送结果为准。' : undefined} />}
      <Card title="对话参数">
        <Typography.Paragraph>默认模型：{status?.defaultModel || '由 AI Center 决定'}</Typography.Paragraph>
        <Form layout="vertical" onFinish={() => void send()}>
          <Row gutter={16}>
            <Col xs={24} md={12}><Form.Item label="模型（可选）" htmlFor="ai-model">
              <Input id="ai-model" value={model} onChange={(event) => setModel(event.target.value)} disabled={sending} placeholder="留空使用默认模型" />
            </Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="最大输出 Tokens" htmlFor="ai-max-tokens">
              <InputNumber id="ai-max-tokens" value={maxTokens} onChange={setMaxTokens} disabled={sending} style={{ width: '100%' }} />
            </Form.Item></Col>
            <Col xs={12} md={6}><Form.Item label="温度" htmlFor="ai-temperature">
              <InputNumber id="ai-temperature" value={temperature} onChange={setTemperature} step={0.1} disabled={sending} style={{ width: '100%' }} />
            </Form.Item></Col>
          </Row>
          <Typography.Paragraph type="secondary">最大输出 Tokens：1–4096；温度：0–2；单条消息最多 8000 字符，上下文最多 32 条消息、32000 字符。</Typography.Paragraph>
          <Form.Item label="问题" htmlFor="ai-question">
            <Input.TextArea id="ai-question" value={question} onChange={(event) => setQuestion(event.target.value)} disabled={sending} rows={4} placeholder="输入要测试的问题" />
          </Form.Item>
          {error && <Alert type="error" showIcon message={error.message} style={{ marginBottom: 16 }} description={details && <Space direction="vertical">
            {details.code && <span>错误码：{details.code}</span>}
            {details.request_id && <span>请求 ID：{details.request_id}</span>}
            {details.retryable !== undefined && <span>{details.retryable ? '可以重试' : '请根据错误提示检查后再发送'}</span>}
          </Space>} />}
          <Space>
            <Button type="primary" htmlType="submit" aria-label="发送" loading={sending} disabled={sending || statusLoading || !status?.configured || !!statusError}>发送</Button>
            <Button onClick={clear} disabled={sending}>清空对话</Button>
          </Space>
          {sending && <Typography.Paragraph role="status" style={{ marginTop: 16 }}>正在等待 AI 回复…</Typography.Paragraph>}
        </Form>
      </Card>
      <Card title="对话记录">
        <div role="log" aria-label="对话记录" aria-live="polite" aria-busy={sending}>
          {exchanges.length === 0 ? <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无对话" /> : exchanges.map(({ question: previousQuestion, response }, index) => (
            <div key={index} style={{ borderBottom: '1px solid #f0f0f0', padding: '16px 0' }}>
              <Typography.Text strong>你</Typography.Text>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{previousQuestion}</Typography.Paragraph>
              <Typography.Text strong>AI</Typography.Text>
              <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{response.content}</Typography.Paragraph>
              <Typography.Paragraph type="secondary">实际模型：{response.model}</Typography.Paragraph>
              <Typography.Paragraph type="secondary">{response.usage ? `输入 Tokens：${response.usage.input_tokens} · 输出 Tokens：${response.usage.output_tokens} · 总 Tokens：${response.usage.total_tokens}` : 'Tokens 用量：未提供'}</Typography.Paragraph>
              <Typography.Paragraph type="secondary" style={{ overflowWrap: 'anywhere' }}>请求 ID：{response.request_id}</Typography.Paragraph>
              <Typography.Paragraph type="secondary">结束原因：{response.finish_reason ?? '未提供'}</Typography.Paragraph>
            </div>
          ))}
        </div>
      </Card>
    </Space>
  )
}
