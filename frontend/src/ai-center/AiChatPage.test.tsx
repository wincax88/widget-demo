import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import AiChatPage from './AiChatPage'
import { AiCenterStatus } from './aiCenterApi'

const ready = { configured: true, defaultModel: 'default-model' }
const answer = {
  content: '你好，这是回答', model: 'actual-model', request_id: 'request-1', finish_reason: 'stop',
  usage: { input_tokens: 8, output_tokens: 12, total_tokens: 20 },
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}

async function open(status: AiCenterStatus = ready) {
  vi.mocked(fetch).mockImplementation(async (url) => json(url === '/api/ai-center/status' ? status : []))
  const view = render(<AiChatPage />)
  await screen.findByLabelText('问题')
  await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/ai-center/status', expect.anything()))
  await screen.findByText(status.configured ? '服务端已配置' : '服务端尚未配置 AI Center，请联系管理员')
  return view
}

function lastRequest() {
  return vi.mocked(fetch).mock.calls[vi.mocked(fetch).mock.calls.length - 1]
}

function enter(question = '你好') {
  fireEvent.change(screen.getByLabelText('问题'), { target: { value: question } })
  fireEvent.click(screen.getByRole('button', { name: '发送', hidden: true }))
}

describe('AI dialogue at the HTTP boundary', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/ai-chat')
    vi.stubGlobal('fetch', vi.fn())
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.cookie = 'widget_demo_csrf=; max-age=0; path=/'
    window.history.replaceState({}, '', '/')
  })

  it('sends defaults with session credentials and CSRF and renders response metadata', async () => {
    await open()
    expect(await screen.findByText('服务端已配置')).toBeInTheDocument()
    expect(screen.getByText('默认模型：default-model')).toBeInTheDocument()
    document.cookie = 'widget_demo_csrf=csrf-value; path=/'
    vi.mocked(fetch).mockResolvedValueOnce(json(answer))
    enter('  你好  ')

    expect(await screen.findByText(answer.content)).toBeInTheDocument()
    const [, options] = lastRequest()
    expect(lastRequest()[0]).toBe('/api/ai-center/chat')
    expect(options?.credentials).toBe('include')
    expect(new Headers(options?.headers).get('x-csrf-token')).toBe('csrf-value')
    expect(JSON.parse(String(options?.body))).toEqual({
      messages: [{ role: 'user', content: '你好' }], max_tokens: 512, temperature: 0.2,
    })
    expect(screen.getByText(/实际模型：actual-model/)).toBeInTheDocument()
    expect(screen.getByText(/输入 Tokens：8.*输出 Tokens：12.*总 Tokens：20/)).toBeInTheDocument()
    expect(screen.getByText(/请求 ID：request-1/)).toBeInTheDocument()
    expect(screen.getByText(/结束原因：stop/)).toBeInTheDocument()
    expect(screen.getByLabelText('问题')).toHaveValue('')
  })

  it('sends successful turns as history and includes optional parameters', async () => {
    await open()
    vi.mocked(fetch).mockResolvedValueOnce(json(answer))
    enter('第一问')
    await screen.findByText(answer.content)
    fireEvent.change(screen.getByLabelText('模型（可选）'), { target: { value: 'custom-model' } })
    fireEvent.change(screen.getByLabelText('最大输出 Tokens'), { target: { value: '256' } })
    fireEvent.change(screen.getByLabelText('温度'), { target: { value: '0.5' } })
    vi.mocked(fetch).mockResolvedValueOnce(json({ ...answer, content: '第二答', usage: null, finish_reason: null }))
    enter('第二问')
    await screen.findByText('第二答')
    expect(JSON.parse(String(lastRequest()[1]?.body))).toEqual({
      messages: [{ role: 'user', content: '第一问' }, { role: 'assistant', content: answer.content }, { role: 'user', content: '第二问' }],
      model: 'custom-model', max_tokens: 256, temperature: 0.5,
    })
    expect(screen.getByText('Tokens 用量：未提供')).toBeInTheDocument()
  }, 15000)

  it('preserves prior history and the question after failure and excludes the failed turn from retry', async () => {
    await open()
    vi.mocked(fetch).mockResolvedValueOnce(json(answer))
    enter('第一问')
    await screen.findByText(answer.content)
    vi.mocked(fetch).mockResolvedValueOnce(json({ message: 'AI 服务暂时不可用', code: 'UPSTREAM_ERROR', request_id: 'failed-request', retryable: true }, 503))
    enter('失败问题')
    expect(await screen.findByText('AI 服务暂时不可用')).toBeInTheDocument()
    expect(screen.getByText(/请求 ID：failed-request/)).toBeInTheDocument()
    expect(screen.getByText(/错误码：UPSTREAM_ERROR/)).toBeInTheDocument()
    expect(screen.getByText(/可以重试/)).toBeInTheDocument()
    expect(screen.getByLabelText('问题')).toHaveValue('失败问题')
    expect(screen.getByText(answer.content)).toBeInTheDocument()
    vi.mocked(fetch).mockResolvedValueOnce(json({ ...answer, content: '恢复回答' }))
    fireEvent.click(screen.getByRole('button', { name: '发送', hidden: true }))
    await screen.findByText('恢复回答')
    expect(JSON.parse(String(lastRequest()[1]?.body)).messages).toHaveLength(3)
  }, 15000)

  it('clears conversation and the draft and starts a new conversation', async () => {
    await open()
    vi.mocked(fetch).mockResolvedValueOnce(json(answer))
    enter()
    await screen.findByText(answer.content)
    fireEvent.change(screen.getByLabelText('问题'), { target: { value: '草稿' } })
    fireEvent.click(screen.getByRole('button', { name: '清空对话', hidden: true }))
    expect(screen.queryByText(answer.content)).not.toBeInTheDocument()
    expect(screen.getByLabelText('问题')).toHaveValue('')
    vi.mocked(fetch).mockResolvedValueOnce(json(answer))
    enter('新问题')
    await screen.findByText(answer.content)
    expect(JSON.parse(String(lastRequest()[1]?.body)).messages).toEqual([{ role: 'user', content: '新问题' }])
  }, 15000)

  it('disables sending without server configuration', async () => {
    await open({ configured: false, defaultModel: null })
    expect(await screen.findByText(/服务端尚未配置 AI Center/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('问题'), { target: { value: '你好' } })
    expect(screen.getByRole('button', { name: '发送', hidden: true })).toBeDisabled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('refreshes server configuration after an administrator configures AI Center', async () => {
    await open({ configured: false, defaultModel: null })
    vi.mocked(fetch).mockResolvedValueOnce(json(ready))
    fireEvent.click(screen.getByRole('button', { name: '重新检查配置', hidden: true }))
    expect(await screen.findByText('服务端已配置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送', hidden: true })).not.toBeDisabled()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('offers status retry after a loading failure', async () => {
    vi.mocked(fetch).mockImplementation(async (url) =>
      url === '/api/ai-center/status' ? json({ message: '状态读取失败' }, 503) : json([]))
    render(<AiChatPage />)
    expect(await screen.findByText('状态读取失败')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('button', { name: '发送', hidden: true })).toBeDisabled())
    vi.mocked(fetch).mockResolvedValueOnce(json(ready))
    fireEvent.click(screen.getByRole('button', { name: '重试状态检查' }))
    expect(await screen.findByText('服务端已配置')).toBeInTheDocument()
  })

  it('disables sending while loading and explains an unspecified default model', async () => {
    let resolve!: (value: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    render(<AiChatPage />)
    expect(screen.getByText('正在检查服务端配置')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '发送', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重新检查配置', hidden: true })).toBeDisabled()
    expect(lastRequest()[1]?.credentials).toBe('include')
    resolve(json({ configured: true, defaultModel: null }))
    await screen.findByText('服务端已配置')
    expect(screen.getByText('默认模型：由 AI Center 决定')).toBeInTheDocument()
  })

  it('blocks duplicate sends, clearing, editing and parameters while a request is pending', async () => {
    await open()
    let resolve!: (value: Response) => void
    vi.mocked(fetch).mockReturnValueOnce(new Promise((done) => { resolve = done }))
    enter()
    await waitFor(() => expect(screen.getByRole('button', { name: '发送', hidden: true })).toBeDisabled())
    expect(screen.getByRole('button', { name: '清空对话', hidden: true })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重新检查配置', hidden: true })).toBeDisabled()
    expect(screen.getByLabelText('问题')).toBeDisabled()
    expect(screen.getByLabelText('模型（可选）')).toBeDisabled()
    expect(screen.getByLabelText('最大输出 Tokens')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '发送', hidden: true }))
    fireEvent.click(screen.getByRole('button', { name: '清空对话', hidden: true }))
    expect(fetch).toHaveBeenCalledTimes(2)
    resolve(json(answer))
    await screen.findByText(answer.content)
    expect(screen.getByLabelText('问题')).not.toBeDisabled()
  })

  it('rejects blank questions and questions longer than 8000 characters before making a request', async () => {
    await open()
    enter('   ')
    expect(await screen.findByText('请输入问题')).toBeInTheDocument()
    enter('字'.repeat(8001))
    expect(await screen.findByText('问题不能超过 8000 个字符')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('renders model output as text without interpreting HTML', async () => {
    await open()
    vi.mocked(fetch).mockResolvedValueOnce(json({ ...answer, content: '<img src=x onerror=alert(1)>' }))
    enter()
    expect(await screen.findByText('<img src=x onerror=alert(1)>')).toBeInTheDocument()
    expect(document.querySelector('img[src="x"]')).toBeNull()
  })

  it.each([
    ['模型（可选）', 'm'.repeat(129), '模型名称不能超过 128 个字符'],
    ['最大输出 Tokens', '0', '最大输出 Tokens 必须是 1 到 4096 的整数'],
    ['最大输出 Tokens', '4097', '最大输出 Tokens 必须是 1 到 4096 的整数'],
    ['最大输出 Tokens', '1.5', '最大输出 Tokens 必须是 1 到 4096 的整数'],
    ['温度', '2.1', '温度必须在 0 到 2 之间'],
    ['温度', '-1', '温度必须在 0 到 2 之间'],
  ])('rejects invalid %s value %s', async (label, value, message) => {
    await open()
    fireEvent.change(screen.getByLabelText(label), { target: { value } })
    enter()
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('limits total history characters and lets clearing recover', async () => {
    await open()
    for (let index = 0; index < 2; index++) {
      vi.mocked(fetch).mockResolvedValueOnce(json({ ...answer, content: '答'.repeat(8000) }))
      enter(String(index).repeat(8000))
      await waitFor(() => expect(screen.getByLabelText('问题')).toHaveValue(''))
    }
    enter('超过总长')
    expect(await screen.findByText('对话已达到上下文限制，请清空对话后再发送')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(3)
    fireEvent.click(screen.getByRole('button', { name: '清空对话', hidden: true }))
    vi.mocked(fetch).mockResolvedValueOnce(json(answer))
    enter('重启')
    await screen.findByText(answer.content)
    expect(JSON.parse(String(lastRequest()[1]?.body)).messages).toHaveLength(1)
  }, 15000)

  it('limits the next request to 32 messages without silently dropping history', async () => {
    await open()
    for (let index = 0; index < 16; index++) {
      vi.mocked(fetch).mockResolvedValueOnce(json({ ...answer, content: `回答 ${index}` }))
      enter(`问题 ${index}`)
      await waitFor(() => expect(screen.getByLabelText('问题')).toHaveValue(''))
    }
    expect(JSON.parse(String(lastRequest()[1]?.body)).messages).toHaveLength(31)
    enter('第十七轮')
    expect(await screen.findByText('对话已达到上下文限制，请清空对话后再发送')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(17)
    expect(screen.getByLabelText('问题')).toHaveValue('第十七轮')
  }, 60000)

  it('does not restore history after leaving the page', async () => {
    const view = await open()
    vi.mocked(fetch).mockResolvedValueOnce(json(answer))
    enter()
    await screen.findByText(answer.content)
    view.unmount()
    await open()
    expect(screen.queryByText(answer.content)).not.toBeInTheDocument()
    expect(screen.getByLabelText('问题')).toHaveValue('')
    expect(screen.getByText('暂无对话')).toBeInTheDocument()
  })
})
