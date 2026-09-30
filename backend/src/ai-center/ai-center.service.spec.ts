import { ConfigService } from '@nestjs/config'
import { HttpException } from '@nestjs/common'
import { AiCenterService } from './ai-center.service'

const input = { messages: [{ role: 'user' as const, content: '你好' }] }
const success = {
  request_id: 'upstream-request-1', object: 'chat.completion', application_id: 'private-app-id',
  application_code: 'private-app-code', api_key_id: 'private-key-id', model: 'model-a',
  choices: [{ index: 0, message: { role: 'assistant', content: '你好！' }, finish_reason: 'stop' }],
  usage: { input_tokens: 4, output_tokens: 5, total_tokens: 9 },
}
const config = { AI_CENTER_BASE_URL: 'https://ai.example.com', AI_CENTER_API_KEY: 'key-canary', AI_CENTER_TIMEOUT_MS: 10000 }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
const service = (values: Record<string, unknown> = config) => new AiCenterService(new ConfigService(values))
const errorOf = async (operation: Promise<unknown>) => {
  const error: unknown = await operation.catch((value: unknown) => value)
  expect(error).toBeInstanceOf(HttpException)
  return error as HttpException
}

describe('AI Center server-side Chat client', () => {
  afterEach(() => jest.restoreAllMocks())

  it('reports configuration readiness without returning secrets', () => {
    expect(service().status()).toEqual({ configured: true, defaultModel: null })
    expect(service({}).status()).toEqual({ configured: false, defaultModel: null })
  })

  it('sends the documented request and returns only displayable fields', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(json(success))
    expect(await service().chat(input)).toEqual({
      content: '你好！', model: 'model-a', request_id: 'upstream-request-1', finish_reason: 'stop', usage: success.usage,
    })
    const [url, options] = fetchMock.mock.calls[0]
    expect(url).toBe('https://ai.example.com/ai-center/openapi/v1/chat/completions')
    expect(options).toMatchObject({ method: 'POST', redirect: 'error' })
    const headers = new Headers(options?.headers)
    expect(headers.get('authorization')).toBe('Bearer key-canary')
    expect(headers.get('content-type')).toBe('application/json')
    expect(headers.get('x-request-id')).toMatch(/^[0-9a-f-]{36}$/)
    expect(JSON.parse(options?.body as string)).toEqual({ ...input, max_tokens: 512, temperature: 0.2 })
    expect(options?.signal).toBeInstanceOf(AbortSignal)
  })

  it('uses a configured model but lets a nonempty explicit model override it', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockImplementation(async () => json(success))
    const client = service({ ...config, AI_CENTER_MODEL: 'configured-model' })
    expect(client.status()).toEqual({ configured: true, defaultModel: 'configured-model' })
    await client.chat(input)
    await client.chat({ ...input, model: 'explicit-model', max_tokens: 128, temperature: 0 })
    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string).model).toBe('configured-model')
    expect(JSON.parse(fetchMock.mock.calls[1][1]?.body as string)).toMatchObject({ model: 'explicit-model', max_tokens: 128, temperature: 0 })
  })

  it('does not call the upstream when local configuration is missing', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch')
    const error = await errorOf(service({}).chat(input))
    expect(error.getStatus()).toBe(503)
    expect(error.getResponse()).toMatchObject({ code: 'ai_center_not_configured', retryable: false })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it.each([
    [400, 'invalid_request', 400], [401, 'api_key_invalid', 502], [403, 'model_not_authorized', 403],
    [429, 'quota_exceeded', 429], [429, 'concurrency_limit_exceeded', 429], [503, 'timeout', 503],
  ])('maps upstream %s/%s safely to HTTP %s without retrying', async (status, code, expectedStatus) => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      request_id: 'upstream-error-1', error: { code, message: 'key-canary raw private message', retryable: true },
      api_key: 'key-canary',
    }, status))
    const error = await errorOf(service().chat(input))
    expect(error.getStatus()).toBe(expectedStatus)
    expect(error.getResponse()).toMatchObject({ code, request_id: 'upstream-error-1', upstream_status: status, retryable: true })
    expect(JSON.stringify(error.getResponse())).not.toContain('key-canary')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not relay unrecognized error codes or sensitive request IDs', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      request_id: 'key-canary', error: { code: 'private-code-canary', message: 'private-canary' },
    }, 500))
    const error = await errorOf(service().chat(input))
    expect(error.getStatus()).toBe(502)
    expect(error.getResponse()).toMatchObject({ code: 'upstream_error', retryable: false })
    expect(JSON.stringify(error.getResponse())).not.toMatch(/private|key-canary/)
  })

  it.each([
    [502, 'provider_authentication_failed', false, '模型服务商鉴权失败'],
    [502, 'provider_auth_failed', false, '模型服务商鉴权失败'],
    [502, 'provider_invalid_request', false, '模型服务商拒绝了请求'],
    [502, 'provider_malformed_response', false, '模型服务商响应格式无效'],
    [502, 'provider_upstream_error', true, '模型服务商暂时异常'],
    [502, 'upstream_http_error', true, '模型服务商暂时异常'],
    [504, 'provider_timeout', true, '模型服务商响应超时'],
    [504, 'upstream_timeout', true, '模型服务商响应超时'],
    [503, 'provider_unavailable', true, '模型服务商暂不可用'],
    [503, 'provider_not_ready', true, '模型服务商尚未就绪'],
    [503, 'model_not_ready', true, '模型尚未就绪'],
    [403, 'provider_disabled', false, '模型服务商已停用'],
    [403, 'model_disabled', false, '模型已停用'],
    [429, 'provider_rate_limited', true, '模型服务商限流'],
    [403, 'model_not_authorized', false, '调用未获授权'],
  ])('parses the standard flat OpenAPI error %s/%s without exposing upstream details', async (status, code, retryable, message) => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      code, message: 'key-canary private-canary', request_id: 'flat-error-1', retryable,
      http_status: status, details: 'private-canary', descriptor: { next_action: 'key-canary' },
    }, status))
    const error = await errorOf(service().chat(input))
    expect(error.getStatus()).toBe(status)
    expect(error.getResponse()).toMatchObject({ code, request_id: 'flat-error-1', retryable, upstream_status: status })
    expect((error.getResponse() as { message: string }).message).toContain(message)
    expect(JSON.stringify(error.getResponse())).not.toMatch(/key-canary|private-canary|descriptor|details/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('does not relay unknown flat codes, text or unsafe request IDs', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      code: 'private-canary', message: 'key-canary', request_id: 'key-canary', retryable: true,
    }, 502))
    const error = await errorOf(service().chat(input))
    expect(error.getResponse()).toMatchObject({ code: 'upstream_error', retryable: true })
    expect(JSON.stringify(error.getResponse())).not.toMatch(/private-canary|key-canary/)
  })

  it('uses the nested request ID for a compatible error envelope', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      error: { code: 'api_key_invalid', request_id: 'nested-error-1', retryable: false },
    }, 401))
    const error = await errorOf(service().chat(input))
    expect(error.getResponse()).toMatchObject({ code: 'api_key_invalid', request_id: 'nested-error-1', retryable: false })
  })

  it.each([null, { choices: [] }, { choices: [{ message: { content: 123 } }] }])('rejects malformed success payload %s', async (payload) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(json(payload))
    const error = await errorOf(service().chat(input))
    expect(error.getStatus()).toBe(502)
    expect(error.getResponse()).toMatchObject({ code: 'invalid_upstream_response' })
  })

  it.each(['', ' \n\t '])('rejects blank assistant output instead of poisoning the next conversation turn', async (content) => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({
      ...success, choices: [{ message: { role: 'assistant', content }, finish_reason: 'stop' }],
    }))
    const error = await errorOf(service().chat(input))
    expect(error.getStatus()).toBe(502)
    expect(error.getResponse()).toMatchObject({ code: 'invalid_upstream_response', retryable: false })
  })

  it('reports missing usage honestly instead of inventing zero counts', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...success, usage: undefined }))
    expect(await service().chat(input)).toMatchObject({ usage: null })
  })

  it('falls back to the generated request ID if upstream omits it', async () => {
    const fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(json({ ...success, request_id: undefined }))
    const result = await service().chat(input)
    expect(result.request_id).toBe(new Headers(fetchMock.mock.calls[0][1]?.headers).get('x-request-id'))
  })

  it('maps local timeout to 504 with safe diagnostics', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new DOMException('private-canary key-canary', 'TimeoutError'))
    const error = await errorOf(service().chat(input))
    expect(error.getStatus()).toBe(504)
    expect(error.getResponse()).toMatchObject({ code: 'ai_center_timeout', retryable: true })
    expect(JSON.stringify(error.getResponse())).not.toMatch(/private-canary|key-canary/)
  })

  it('maps network or redirect failures to safe 502 without raw exception text', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('private-canary key-canary'))
    const error = await errorOf(service().chat(input))
    expect(error.getStatus()).toBe(502)
    expect(error.getResponse()).toMatchObject({ code: 'ai_center_unavailable', retryable: true })
    expect(JSON.stringify(error.getResponse())).not.toMatch(/private-canary|key-canary/)
  })

  it('rejects non-JSON responses safely', async () => {
    jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>private-canary key-canary</html>'))
    const error = await errorOf(service().chat(input))
    expect(error.getResponse()).toMatchObject({ code: 'invalid_upstream_response' })
    expect(JSON.stringify(error.getResponse())).not.toMatch(/private-canary|key-canary/)
  })
})
