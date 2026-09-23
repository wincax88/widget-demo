import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

describe('authenticated application shell', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    window.history.replaceState({}, '', '/')
  })

  it('exchanges launch parameters and removes them from the URL', async () => {
    window.history.replaceState(
      {},
      '',
      '/launch/school-a?eduplus_handoff_code=code-1&eduplus_state=state-1',
    )
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ authenticated: false }))
      .mockResolvedValueOnce(json({ authenticated: true }))
      .mockResolvedValueOnce(
        json({
          authenticated: true,
          tenant: { code: 'school-a', name: 'School A' },
          identity: { id: 'teacher-1', type: 'TEACHER', name: 'Teacher' },
        }),
      )

    render(<App />, { wrapper: BrowserRouter })

    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/auth/handoff',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            tenant_code: 'school-a',
            code: 'code-1',
            state: 'state-1',
          }),
        }),
      ),
    )
    await waitFor(() => expect(window.location.search).toBe(''))
  })

  it('shows an EduPlus login action when no application session exists', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ authenticated: false }))
    render(<App />, { wrapper: BrowserRouter })

    expect(await screen.findByRole('link', { name: '使用 EduPlus 登录' })).toBeInTheDocument()
  })

  it('allows staff to open synchronization while hiding it from students', async () => {
    window.history.replaceState({}, '', '/sync')
    vi.mocked(fetch).mockResolvedValueOnce(
      json({
        authenticated: true,
        tenant: { code: 'school-a', name: 'School A' },
        identity: { id: 'teacher-1', type: 'TEACHER', name: 'Teacher' },
      }),
    )
    const staff = render(<App />, { wrapper: BrowserRouter })
    expect(await screen.findByText('同步基座主数据')).toBeInTheDocument()

    staff.unmount()
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(
      json({
        authenticated: true,
        tenant: { code: 'school-a', name: 'School A' },
        identity: { id: 'student-1', type: 'STUDENT', name: 'Student' },
      }),
    )
    render(<App />, { wrapper: BrowserRouter })
    expect((await screen.findAllByText('考试成绩')).length).toBeGreaterThan(0)
    expect(screen.queryByText('同步基座主数据')).not.toBeInTheDocument()
  })
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}
