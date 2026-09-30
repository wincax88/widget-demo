import { HttpException, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomUUID } from 'node:crypto'

export interface ChatInput {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[]
  model?: string
  max_tokens?: number
  temperature?: number
}

export interface ChatResult {
  content: string
  model: string
  request_id: string
  finish_reason: string | null
  usage: { input_tokens: number; output_tokens: number; total_tokens: number } | null
}

const ERROR_CODES = new Set([
  'invalid_request', 'context_policy_exceeded', 'api_key_missing', 'api_key_invalid', 'api_key_revoked',
  'api_key_disabled', 'capability_not_allowed', 'model_not_authorized', 'model_unavailable',
  'quota_exceeded', 'concurrency_limit_exceeded', 'timeout', 'service_unavailable',
])

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}

const tokenCount = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

@Injectable()
export class AiCenterService {
  constructor(private readonly config: ConfigService) {}

  status(): { configured: boolean; defaultModel: string | null } {
    return {
      configured: Boolean(this.config.get<string>('AI_CENTER_BASE_URL') && this.config.get<string>('AI_CENTER_API_KEY')),
      defaultModel: this.config.get<string>('AI_CENTER_MODEL') || null,
    }
  }

  async chat(input: ChatInput): Promise<ChatResult> {
    const requestId = randomUUID()
    if (!this.status().configured) {
      throw this.failure(503, 'ai_center_not_configured', 'AI Center 尚未配置，请联系管理员设置服务地址和 API Key。', requestId)
    }
    const model = input.model || this.config.get<string>('AI_CENTER_MODEL')
    const signal = AbortSignal.timeout(this.config.get<number>('AI_CENTER_TIMEOUT_MS') ?? 60000)
    let response: Response
    let payload: unknown
    try {
      response = await fetch(`${this.config.get<string>('AI_CENTER_BASE_URL')}/ai-center/openapi/v1/chat/completions`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${this.config.get<string>('AI_CENTER_API_KEY')}`,
          'content-type': 'application/json',
          accept: 'application/json',
          'x-request-id': requestId,
        },
        body: JSON.stringify({
          messages: input.messages,
          ...(model ? { model } : {}),
          max_tokens: input.max_tokens ?? 512,
          temperature: input.temperature ?? 0.2,
        }),
        signal,
        redirect: 'error',
      })
      // JSON parse failures are handled separately from transport failures.
      payload = await response.json().catch((error: unknown) => {
        if (signal.aborted) throw error
        return null
      })
    } catch (error) {
      const timedOut = signal.aborted || ['TimeoutError', 'AbortError'].includes(String(record(error).name))
      throw this.failure(timedOut ? 504 : 502,
        timedOut ? 'ai_center_timeout' : 'ai_center_unavailable',
        timedOut ? 'AI Center 响应超时，请稍后重试。' : '暂时无法连接 AI Center，请稍后重试或联系管理员。', requestId, true)
    }

    const body = record(payload)
    const upstreamRequestId = this.safeRequestId(body.request_id) ?? requestId
    if (!response.ok) {
      const upstreamError = record(body.error)
      const code = typeof upstreamError.code === 'string' && ERROR_CODES.has(upstreamError.code) ? upstreamError.code : 'upstream_error'
      const messages: Record<number, string> = {
        400: 'AI Center 拒绝了请求，请检查模型、消息长度和参数范围。',
        401: 'AI Center API Key 无效或已撤销，请联系管理员检查配置。',
        403: 'AI Center 调用未获授权，请联系管理员检查 API Key 状态、对话能力和模型授权。',
        429: 'AI Center 额度或并发数已达限制，请稍后重试或联系管理员。',
        503: 'AI Center 服务暂不可用，请稍后重试。',
      }
      const status = [400, 403, 429, 503].includes(response.status) ? response.status : 502
      throw this.failure(status, code, messages[response.status] ?? 'AI Center 调用失败，请稍后重试或联系管理员。',
        upstreamRequestId, upstreamError.retryable === true, response.status)
    }

    const choice = record(Array.isArray(body.choices) ? body.choices[0] : undefined)
    const message = record(choice.message)
    if (typeof message.content !== 'string' || !message.content.trim()) {
      throw this.failure(502, 'invalid_upstream_response', 'AI Center 返回了无法识别的响应，请联系管理员。', upstreamRequestId, false, response.status)
    }
    const usage = record(body.usage)
    return {
      content: message.content,
      model: typeof body.model === 'string' ? body.model : model || 'default',
      request_id: upstreamRequestId,
      finish_reason: typeof choice.finish_reason === 'string' ? choice.finish_reason : null,
      usage: tokenCount(usage.input_tokens) && tokenCount(usage.output_tokens) && tokenCount(usage.total_tokens)
        ? { input_tokens: usage.input_tokens, output_tokens: usage.output_tokens, total_tokens: usage.total_tokens }
        : null,
    }
  }

  private safeRequestId(value: unknown): string | null {
    const key = this.config.get<string>('AI_CENTER_API_KEY')
    return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,128}$/.test(value) && (!key || !value.includes(key)) ? value : null
  }

  private failure(status: number, code: string, message: string, requestId: string, retryable = false, upstreamStatus?: number) {
    return new HttpException({
      message, code, request_id: requestId, retryable,
      ...(upstreamStatus !== undefined ? { upstream_status: upstreamStatus } : {}),
    }, status)
  }
}
