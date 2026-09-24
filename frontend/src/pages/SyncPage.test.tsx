import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SyncPage from './SyncPage'

describe('SyncPage', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('shows a partial-sync warning and separates imported from skipped counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      run_id: 'run-1',
      status: 'partial',
      counts: {
        teacher: 349,
        student: 244,
        parent: 79,
        class: 19,
        course: 4,
        skipped_teacher_teaching_assignment: 12,
        skipped_student_class_relation: 0,
        skipped_parent_student_relation: 98,
      },
    }), { status: 200, headers: { 'content-type': 'application/json' } })))

    render(<SyncPage />)
    await userEvent.click(screen.getByRole('button', { name: '立即同步' }))

    expect(await screen.findByText('部分完成')).toBeInTheDocument()
    expect(screen.getByText(/任课、班级成员和亲子关系尚未导入/)).toBeInTheDocument()
    expect(screen.getByText('教职工')).toBeInTheDocument()
    expect(screen.getByText('349')).toBeInTheDocument()
    expect(screen.getByText('跳过任课关系')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
    expect(screen.getByText('跳过亲子关系')).toBeInTheDocument()
    expect(screen.getByText('98')).toBeInTheDocument()
  })
})
