import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../services/api'
import ChildResultsPage from './ChildResultsPage'
import MyResultsPage from './MyResultsPage'

const mocks = vi.hoisted(() => ({
  mine: vi.fn(),
  children: vi.fn(),
  child: vi.fn(),
}))

vi.mock('./resultsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./resultsApi')>()),
  resultsApi: mocks,
}))

const results = [
  {
    examId: 'exam-1',
    title: '期中考试',
    type: '期中',
    examDate: '2026-09-20',
    total: 180,
    average: 90,
    classRank: 2,
    subjects: [
      { id: 'subject-1', name: '数学', maximumScore: 100, score: 92, absent: false, rank: 2 },
      { id: 'subject-2', name: '语文', maximumScore: 100, score: 88, absent: false, rank: 4 },
    ],
  },
  {
    examId: 'exam-0',
    title: '月考',
    type: '月考',
    examDate: '2026-08-20',
    total: 170,
    average: 85,
    classRank: 3,
    subjects: [
      { id: 'subject-old', name: '英语', maximumScore: 100, score: 85, absent: false, rank: 5 },
    ],
  },
]

describe('student and parent result views', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.mine.mockResolvedValue(results)
    mocks.children.mockResolvedValue([{ id: 'child-1', eduplusId: 's-1001', name: '小明' }])
    mocks.child.mockResolvedValue(results)
  })

  it('shows the latest student summary, subject ranks, and a textual trend', async () => {
    render(<MyResultsPage />)

    expect(await screen.findByRole('heading', { name: '我的成绩' })).toBeInTheDocument()
    expect(screen.getAllByText('180').length).toBeGreaterThan(0)
    expect(screen.getByText('90')).toBeInTheDocument()
    expect(screen.getByText('2')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: '期中考试各科成绩' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '数学' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '第 2 名' })).toBeInTheDocument()
    expect(screen.getByText('最近一次总分 180，较上次上升 10 分。')).toBeInTheDocument()
    expect(screen.getByText('总分趋势')).toBeInTheDocument()
    expect(screen.getByRole('table', { name: '历次考试总分' })).toBeInTheDocument()

    await userEvent.selectOptions(screen.getByRole('combobox', { name: '选择考试' }), 'exam-0')
    expect(screen.getByRole('table', { name: '月考各科成绩' })).toBeInTheDocument()
    expect(screen.getByRole('cell', { name: '英语' })).toBeInTheDocument()
  })

  it('warns that a persisted demonstration exam is not a real grade', async () => {
    mocks.mine.mockResolvedValue([{ ...results[0], title: '【演示】周测', isDemo: true }])
    render(<MyResultsPage />)

    expect(await screen.findByText('演示数据，非真实成绩')).toBeInTheDocument()
  })

  it('renders an explicit empty state when there are no published results', async () => {
    mocks.mine.mockResolvedValue([])
    render(<MyResultsPage />)

    expect(await screen.findByText('暂无已发布成绩')).toBeInTheDocument()
    expect(screen.getByText('考试发布后，成绩会显示在这里。')).toBeInTheDocument()
  })

  it('loads only children returned by the authorization endpoint', async () => {
    render(<ChildResultsPage />)

    expect(await screen.findByRole('heading', { name: '子女成绩' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: '选择子女' })).toBeInTheDocument()
    expect(screen.getByText('小明')).toBeInTheDocument()
    await waitFor(() => expect(mocks.child).toHaveBeenCalledWith('child-1'))
    expect(mocks.child).not.toHaveBeenCalledWith('unlinked-child')
    expect(screen.queryByText('unlinked-child')).not.toBeInTheDocument()
  })

  it('shows an explicit state when no child is linked', async () => {
    mocks.children.mockResolvedValue([])
    render(<ChildResultsPage />)

    expect(await screen.findByText('暂无可查看的关联子女')).toBeInTheDocument()
    expect(mocks.child).not.toHaveBeenCalled()
  })

  it('ignores a stale child result response after the selection changes', async () => {
    const first = deferred<typeof results>()
    const second = deferred<typeof results>()
    mocks.children.mockResolvedValue([
      { id: 'child-1', eduplusId: 's-1001', name: '小明' },
      { id: 'child-2', eduplusId: 's-1002', name: '小红' },
    ])
    mocks.child.mockImplementation((id: string) => id === 'child-1' ? first.promise : second.promise)
    render(<ChildResultsPage />)

    await waitFor(() => expect(mocks.child).toHaveBeenCalledWith('child-1'))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: '选择子女' }), 'child-2')
    await waitFor(() => expect(mocks.child).toHaveBeenCalledWith('child-2'))
    second.resolve([{ ...results[0], title: '小红期中考试' }])
    expect((await screen.findAllByText('小红期中考试')).length).toBeGreaterThan(0)
    first.resolve([{ ...results[0], title: '小明期中考试' }])
    await waitFor(() => expect(screen.queryAllByText('小明期中考试')).toHaveLength(0))
    expect(screen.getAllByText('小红期中考试').length).toBeGreaterThan(0)
  })

  it('offers a retry for transient failures and a login action for expired sessions', async () => {
    mocks.mine.mockRejectedValueOnce(new ApiError(503, '服务暂时不可用')).mockResolvedValueOnce(results)
    const view = render(<MyResultsPage tenantCode="school-a" />)

    expect(await screen.findByText('服务暂时不可用')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '重新加载' }))
    expect((await screen.findAllByText('期中考试')).length).toBeGreaterThan(0)

    view.unmount()
    mocks.mine.mockRejectedValueOnce(new ApiError(401, '会话已过期'))
    render(<MyResultsPage tenantCode="school-a" />)
    expect(await screen.findByText('登录已过期')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '重新登录' })).toHaveAttribute('href', '/api/auth/login/school-a')
  })
})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}
