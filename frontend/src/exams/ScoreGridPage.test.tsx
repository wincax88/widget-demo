import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Modal } from 'antd'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CsvImportPanel from './CsvImportPanel'
import ExamEditorPage from './ExamEditorPage'
import ExamListPage from './ExamListPage'
import ScoreGridPage from './ScoreGridPage'

const mocks = vi.hoisted(() => ({
  options: vi.fn(), detail: vi.fn(), list: vi.fn(), create: vi.fn(), saveScores: vi.fn(),
  importScores: vi.fn(), publish: vi.fn(), withdraw: vi.fn(),
}))
vi.mock('./examApi', () => ({ examApi: mocks }))

const options = {
  classrooms: [{
    id: 'class-1', name: 'Class A',
    courses: [{ id: 'subject-course', name: 'Math' }],
    students: [{ eduplusId: 'student-1', name: 'Student One' }],
  }],
}
const exam = {
  id: 'exam-1', title: 'Midterm', type: 'midterm', status: 'DRAFT' as const,
  classroomId: 'class-1', examDate: '2026-09-01',
  subjects: [{ id: 'subject-1', courseId: 'subject-course', maximumScore: 100, course: { name: 'Math' } }],
}

describe('teacher examination workspace', () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset())
    mocks.options.mockResolvedValue(options)
    mocks.detail.mockResolvedValue(exam)
    mocks.list.mockResolvedValue([exam])
    mocks.create.mockResolvedValue(exam)
    mocks.saveScores.mockResolvedValue({ saved: 1 })
  })

  it('shows only assignment-filtered choices and supports a custom exam type', async () => {
    render(<ExamEditorPage />, { wrapper: MemoryRouter })
    expect(await screen.findByText('Class A / Math')).toBeInTheDocument()
    expect(screen.queryByText('Unauthorized Class')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('radio', { name: '自定义' }))
    expect(screen.getByRole('textbox', { name: '自定义考试类型' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存草稿' })).toBeInTheDocument()
  })

  it('validates an edited score against the subject maximum before saving', async () => {
    render(<ScoreGridPage examId="exam-1" />, { wrapper: MemoryRouter })
    const input = await screen.findByRole('spinbutton', { name: 'Student One Math' })
    await userEvent.type(input, '101')
    expect(await screen.findByText('分数不能超过 100')).toBeInTheDocument()
    expect(mocks.saveScores).not.toHaveBeenCalled()
  })

  it('renders CSV validation errors returned by the server', async () => {
    mocks.importScores.mockResolvedValue({
      status: 'FAILED', errors: [{ rowNumber: 2, code: 'INVALID_SCORE', message: 'Score must be numeric' }],
    })
    const view = render(<CsvImportPanel examId="exam-1" />)
    const file = new File(['student_id,subject_id,score,absent\nstudent-1,subject-1,no,false'], 'scores.csv', { type: 'text/csv' })
    fireEvent.change(view.container.querySelector('input[type="file"]')!, { target: { files: [file] } })
    expect(await screen.findByText('Score must be numeric')).toBeInTheDocument()
  })

  it('asks for confirmation before publishing', async () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as never)
    render(<ExamListPage />, { wrapper: MemoryRouter })
    expect(await screen.findByText('草稿')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /发\s*布/ }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '确认发布考试？' }))
    confirm.mockRestore()
  })

  it('asks for confirmation before withdrawing', async () => {
    const confirm = vi.spyOn(Modal, 'confirm').mockImplementation(() => ({ destroy: vi.fn(), update: vi.fn() }) as never)
    mocks.list.mockResolvedValue([{ ...exam, status: 'PUBLISHED' }])
    render(<ExamListPage />, { wrapper: MemoryRouter })
    fireEvent.click(await screen.findByRole('button', { name: /撤\s*回/ }))
    expect(confirm).toHaveBeenCalledWith(expect.objectContaining({ title: '确认撤回考试？' }))
    confirm.mockRestore()
  })
})
