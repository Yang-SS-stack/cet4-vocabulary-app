import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import LearningSetupModal from './LearningSetupModal'

const baseSettings = {
  examDate: '2026-12-12',
  todayWordBookId: 'cet4',
  dailyNewWords: 5,
  dailyReviewWords: 5,
  dailyStudyMinutes: 30,
  pronunciation: 'en-GB',
  mistakeStudyWords: 10,
}

const recommendation = {
  totalWords: 4544,
  completedWords: 0,
  daysRemaining: 90,
  deadlineDailyWords: 5,
  dailyReviewWords: 5,
}

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('renders only the fields belonging to each setup mode and starts collapsed', () => {
  const { rerender } = renderModal({ mode: 'learning' })

  expect(screen.getByRole('dialog', { name: '开始前，先设定你的学习计划' })).toBeInTheDocument()
  expect(summary('考试日期')).toBeInTheDocument()
  expect(summary('学习词表')).toBeInTheDocument()
  expect(summary('每日新词')).toBeInTheDocument()
  expect(summary('每日学习时长')).toBeInTheDocument()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^每日复习数量 / })).not.toBeInTheDocument()

  rerender(<LearningSetupModal {...modalProps({ mode: 'review' })} />)
  expect(summary('每日复习数量')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^考试日期 / })).not.toBeInTheDocument()

  rerender(<LearningSetupModal {...modalProps({ mode: 'mistakes' })} />)
  expect(summary('错题本每日学习数量')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^每日复习数量 / })).not.toBeInTheDocument()
})

test('keeps only one wheel open and preserves draft choices while switching fields', async () => {
  const user = userEvent.setup()
  renderModal()

  await user.click(summary('每日新词'))
  await user.click(screen.getByRole('option', { name: '8 词' }))
  expect(summary('每日新词')).toHaveAccessibleName('每日新词 8 词')

  await user.click(summary('每日学习时长'))
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
  expect(screen.queryByRole('listbox', { name: '每日新词' })).not.toBeInTheDocument()
  expect(await screen.findByRole('listbox', { name: '每日学习时长' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)

  await user.click(summary('每日新词'))
  expect(await screen.findByRole('option', { name: '8 词', selected: true })).toBeInTheDocument()
})

test('commits the latest scroll position when saving immediately after a wheel scroll', async () => {
  const onSave = vi.fn()
  renderModal({ settings: { ...baseSettings, dailyStudyMinutes: 240 }, onSave })

  fireEvent.click(summary('每日新词'))
  const listbox = screen.getByRole('listbox', { name: '每日新词' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))

  await waitFor(() => expect(onSave).toHaveBeenCalledOnce())
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dailyNewWords: 10 }))
})

test('commits a closing wheel before saving and cancels its pending field switch', async () => {
  const onSave = vi.fn()
  renderModal({ settings: { ...baseSettings, dailyStudyMinutes: 240 }, onSave })

  fireEvent.click(summary('每日新词'))
  const listbox = screen.getByRole('listbox', { name: '每日新词' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)
  fireEvent.click(summary('每日学习时长'))
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))

  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dailyNewWords: 10 })))
  await new Promise((resolve) => window.setTimeout(resolve, 220))
  expect(screen.queryByRole('listbox', { name: '每日学习时长' })).not.toBeInTheDocument()
})

test('commits a wheel that was just collapsed before saving', async () => {
  const onSave = vi.fn()
  renderModal({ settings: { ...baseSettings, dailyStudyMinutes: 240 }, onSave })

  fireEvent.click(summary('每日新词'))
  const listbox = screen.getByRole('listbox', { name: '每日新词' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)
  fireEvent.click(summary('每日新词'))
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))

  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dailyNewWords: 10 })))
})

test('cancels without saving and keeps the dialog mounted for its close animation', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  const onClose = vi.fn()
  renderModal({ onSave, onClose })

  await user.click(screen.getByRole('button', { name: '暂不开始' }))

  expect(onSave).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toHaveClass('is-closing')
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
})

test('fills null fields with visible defaults and saves one complete mode patch', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  renderModal({
    settings: { ...baseSettings, examDate: null, todayWordBookId: null, dailyNewWords: null, dailyStudyMinutes: null },
    recommendation: { ...recommendation, deadlineDailyWords: 5, dailyReviewWords: 0 },
    onSave,
  })

  expect(summary('考试日期')).not.toHaveAccessibleName('考试日期 未设置')
  expect(summary('学习词表')).toHaveAccessibleName('学习词表 CET-4')
  expect(summary('每日新词')).toHaveAccessibleName('每日新词 5 词')
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 30 分钟')

  await user.click(screen.getByRole('button', { name: '保存并继续' }))

  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave).toHaveBeenCalledWith({
    examDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    todayWordBookId: 'cet4',
    dailyNewWords: 5,
    dailyStudyMinutes: 30,
  })
})

test('normalizes legacy values to choices supported by every setup wheel before saving', async () => {
  const user = userEvent.setup()
  const legacySettings = {
    ...baseSettings,
    examDate: 'not-a-date',
    todayWordBookId: 'missing-book',
    dailyNewWords: 0,
    dailyReviewWords: 101,
    dailyStudyMinutes: 31,
    mistakeStudyWords: 0,
  }
  const learningSave = vi.fn()
  const { unmount } = renderModal({ settings: legacySettings, onSave: learningSave })

  expect(summary('考试日期')).toHaveAccessibleName(expect.stringMatching(/^考试日期 \d{4} 年 \d{1,2} 月 \d{1,2} 日$/))
  expect(summary('学习词表')).toHaveAccessibleName('学习词表 CET-4')
  expect(summary('每日新词')).toHaveAccessibleName('每日新词 1 词')
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 30 分钟')

  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(learningSave).toHaveBeenCalledWith({
    examDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    todayWordBookId: 'cet4',
    dailyNewWords: 1,
    dailyStudyMinutes: 30,
  })
  unmount()

  const reviewSave = vi.fn()
  const review = renderModal({
    mode: 'review',
    settings: { ...legacySettings, dailyNewWords: 1, dailyStudyMinutes: 240 },
    onSave: reviewSave,
  })
  expect(summary('每日复习数量')).toHaveAccessibleName('每日复习数量 100 词')
  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(reviewSave).toHaveBeenCalledWith({ dailyReviewWords: 100 })
  review.unmount()

  const mistakesSave = vi.fn()
  renderModal({
    mode: 'mistakes',
    settings: { ...legacySettings, dailyNewWords: 1, dailyStudyMinutes: 240 },
    onSave: mistakesSave,
  })
  expect(summary('错题本每日学习数量')).toHaveAccessibleName('错题本每日学习数量 1 词')
  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(mistakesSave).toHaveBeenCalledWith({ mistakeStudyWords: 1 })
})

test('asks before an overloaded save and never changes the chosen draft', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  renderModal({ settings: { ...baseSettings, dailyNewWords: 20, dailyStudyMinutes: 30 }, onSave })

  await user.click(screen.getByRole('button', { name: '保存并继续' }))

  expect(screen.getByText(/预计约 65 分钟，超过你的 30 分钟计划/)).toBeInTheDocument()
  expect(onSave).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '返回调整' }))
  expect(summary('每日新词')).toHaveAccessibleName('每日新词 20 词')
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 30 分钟')

  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  await user.click(screen.getByRole('button', { name: '仍然保存' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dailyNewWords: 20, dailyStudyMinutes: 30 }))
})

test('keeps the draft and announces an understandable save failure', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn().mockRejectedValue(new Error('storage full'))
  renderModal({ onSave })

  await user.click(summary('每日新词'))
  await user.click(screen.getByRole('option', { name: '6 词' }))
  await user.click(screen.getByRole('button', { name: '保存并继续' }))

  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('保存失败，请重试。你的设置仍保留在这里。'))
  expect(summary('每日新词')).toHaveAccessibleName('每日新词 6 词')
})

test('traps keyboard focus, closes with Escape, and restores focus to the trigger', async () => {
  const user = userEvent.setup()
  render(<ModalLauncher />)

  const trigger = screen.getByRole('button', { name: '打开设置' })
  await user.click(trigger)
  expect(screen.getByRole('dialog')).toContainElement(document.activeElement)

  const save = screen.getByRole('button', { name: '保存并继续' })
  save.focus()
  await user.tab()
  expect(screen.getByRole('button', { name: '考试日期 2026 年 12 月 12 日' })).toHaveFocus()

  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(trigger).toHaveFocus()
})

test('removes the dialog immediately when reduced motion is requested', async () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  const onClose = vi.fn()
  renderModal({ onClose })

  await userEvent.click(screen.getByRole('button', { name: '暂不开始' }))

  expect(onClose).toHaveBeenCalledOnce()
})

function modalProps(overrides = {}) {
  return {
    mode: 'learning',
    settings: baseSettings,
    recommendation,
    onSave: vi.fn(),
    onClose: vi.fn(),
    ...overrides,
  }
}

function renderModal(overrides = {}) {
  return render(<LearningSetupModal {...modalProps(overrides)} />)
}

function summary(label) {
  return screen.getByRole('button', { name: new RegExp(`^${label} `) })
}

function ModalLauncher() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开设置</button>
      {open && <LearningSetupModal {...modalProps({ onClose: () => setOpen(false) })} />}
    </>
  )
}
