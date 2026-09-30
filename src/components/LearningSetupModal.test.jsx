import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import LearningSetupModal from './LearningSetupModal'

const baseSettings = {
  examDate: '2026-12-12',
  todayWordBookId: 'cet4',
  dailyNewWords: 5,
  dailyReviewWords: 20,
  dailyStudyMinutes: 30,
  pronunciation: 'en-GB',
  mistakeStudyWords: 10,
}

const snapshot = {
  settings: {},
  wordBooks: {},
  mistakes: {},
  days: {},
}

const recommendation = {
  totalWords: 4544,
  completedWords: 0,
  daysRemaining: 90,
  deadlineDailyWords: 5,
  dailyReviewWords: 20,
}

const fixedNow = new Date(2026, 8, 13, 10)

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('shows all five first-run settings and the visible estimate explanation', () => {
  renderModal({ mode: 'initial' })

  expect(screen.getByRole('dialog', { name: '开始前，先设定你的学习计划' })).toBeInTheDocument()
  expect(summary('考试日期')).toBeInTheDocument()
  expect(summary('学习词表')).toBeInTheDocument()
  expect(summary('每日新词')).toBeInTheDocument()
  expect(summary('每日复习数量')).toBeInTheDocument()
  expect(summary('每日学习时长')).toBeInTheDocument()
  expect(screen.getByText(/每个新词约 1 分钟、每个复习词约 20 秒/)).toBeVisible()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

test('keeps the mistakes setup mode isolated for the later mistakes flow', () => {
  renderModal({ mode: 'mistakes' })
  expect(summary('错题本每日学习数量')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: /^每日复习数量 / })).not.toBeInTheDocument()
})

test('recalculates time from count changes but still allows a final manual time choice', async () => {
  const user = userEvent.setup()
  renderModal({ mode: 'initial' })

  await user.click(summary('每日新词'))
  await user.click(screen.getByRole('option', { name: '13 词' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 20 分钟')

  await user.click(summary('每日学习时长'))
  await user.click(await screen.findByRole('option', { name: '30 分钟' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 30 分钟')
})

test('blocks a non-future exam date and preserves the draft', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  renderModal({
    mode: 'initial',
    now: new Date(2026, 8, 13, 10),
    settings: { ...baseSettings, examDate: '2026-09-13' },
    onSave,
  })

  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(screen.getByRole('status')).toHaveTextContent('请选择未来的考试日期')
  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2026 年 9 月 13 日')
  expect(onSave).not.toHaveBeenCalled()
})

test('warns when the remaining words cannot fit the daily word limit', () => {
  renderModal({
    mode: 'initial',
    now: new Date(2026, 8, 13, 10),
    settings: { ...baseSettings, examDate: '2026-09-14' },
  })

  expect(screen.getByText(/按当前日期和剩余词量，考试前可能无法完成/)).toBeVisible()
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

test('rapidly switching across three fields keeps one tray mounted and opens only the latest field', () => {
  vi.useFakeTimers()
  renderModal()

  fireEvent.click(summary('每日新词'))
  expect(screen.getByRole('listbox', { name: '每日新词' })).toBeInTheDocument()

  fireEvent.click(summary('每日复习数量'))
  fireEvent.click(summary('每日学习时长'))

  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
  expect(screen.queryByRole('listbox', { name: '每日复习数量' })).not.toBeInTheDocument()
  expect(screen.queryByRole('listbox', { name: '每日学习时长' })).not.toBeInTheDocument()

  act(() => vi.advanceTimersByTime(219))
  expect(screen.queryByRole('listbox', { name: '每日学习时长' })).not.toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1))

  expect(screen.getByRole('listbox', { name: '每日学习时长' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
})

test('a later field click keeps the original close deadline', () => {
  vi.useFakeTimers()
  renderModal()
  fireEvent.click(summary('每日新词'))
  fireEvent.click(summary('每日复习数量'))

  act(() => vi.advanceTimersByTime(100))
  fireEvent.click(summary('每日学习时长'))
  act(() => vi.advanceTimersByTime(119))
  expect(screen.queryByRole('listbox', { name: '每日学习时长' })).not.toBeInTheDocument()

  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('listbox', { name: '每日学习时长' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
})

test('reduced motion settles the current scroll before a rapid three-field switch opens only the latest field', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  renderModal()

  fireEvent.click(summary('每日新词'))
  const listbox = screen.getByRole('listbox', { name: '每日新词' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)

  fireEvent.click(summary('每日复习数量'))
  fireEvent.click(summary('每日学习时长'))

  expect(screen.getByRole('listbox', { name: '每日新词' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
  expect(screen.queryByRole('listbox', { name: '每日复习数量' })).not.toBeInTheDocument()
  expect(screen.queryByRole('listbox', { name: '每日学习时长' })).not.toBeInTheDocument()

  act(() => vi.advanceTimersByTime(100))
  expect(summary('每日新词')).toHaveAccessibleName('每日新词 10 词')
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)

  act(() => vi.advanceTimersByTime(10))
  expect(screen.getByRole('listbox', { name: '每日学习时长' })).toBeInTheDocument()
  expect(screen.queryByRole('listbox', { name: '每日复习数量' })).not.toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
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

test('reduced motion keeps the scrolled wheel mounted through settlement before an immediate save', async () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  const onSave = vi.fn().mockResolvedValue(undefined)
  renderModal({ settings: { ...baseSettings, dailyStudyMinutes: 240 }, onSave })

  fireEvent.click(summary('每日新词'))
  const listbox = screen.getByRole('listbox', { name: '每日新词' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))

  expect(screen.getByRole('listbox', { name: '每日新词' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
  expect(onSave).not.toHaveBeenCalled()

  act(() => vi.advanceTimersByTime(100))
  expect(summary('每日新词')).toHaveAccessibleName('每日新词 10 词')
  expect(onSave).not.toHaveBeenCalled()

  await act(async () => vi.advanceTimersByTime(10))

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dailyNewWords: 10 }))
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(0)
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
    settings: {
      ...baseSettings,
      examDate: null,
      todayWordBookId: null,
      dailyNewWords: null,
      dailyReviewWords: null,
      dailyStudyMinutes: null,
    },
    recommendation: { ...recommendation, deadlineDailyWords: 5, dailyReviewWords: 0 },
    onSave,
  })

  expect(summary('考试日期')).not.toHaveAccessibleName('考试日期 未设置')
  expect(summary('学习词表')).toHaveAccessibleName('学习词表 CET-4')
  expect(summary('每日新词')).toHaveAccessibleName(expect.stringMatching(/^每日新词 \d+ 词$/))
  expect(summary('每日复习数量')).toHaveAccessibleName('每日复习数量 20 词')
  expect(summary('每日学习时长')).toHaveAccessibleName(expect.stringMatching(/^每日学习时长 \d+ 分钟$/))

  await user.click(screen.getByRole('button', { name: '保存并继续' }))

  expect(onSave).toHaveBeenCalledOnce()
  expect(onSave).toHaveBeenCalledWith({
    examDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    todayWordBookId: 'cet4',
    dailyNewWords: expect.any(Number),
    dailyReviewWords: 20,
    dailyStudyMinutes: expect.any(Number),
  })
})

test('uses the injected date for fallback defaults and year options after the real clock passes the fixture exam date', () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2035, 0, 1, 10))
  renderModal({ settings: { ...baseSettings, examDate: null } })

  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2026 年 12 月 12 日')

  fireEvent.click(summary('考试日期'))

  expect(screen.getByRole('option', { name: '2031 年' })).toBeInTheDocument()
  expect(screen.queryByRole('option', { name: '2032 年' })).not.toBeInTheDocument()
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
  expect(summary('每日新词')).toHaveAccessibleName(expect.stringMatching(/^每日新词 \d+ 词$/))
  expect(summary('每日复习数量')).toHaveAccessibleName('每日复习数量 100 词')
  expect(summary('每日学习时长')).toHaveAccessibleName(expect.stringMatching(/^每日学习时长 \d+ 分钟$/))

  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(learningSave).toHaveBeenCalledWith({
    examDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    todayWordBookId: 'cet4',
    dailyNewWords: expect.any(Number),
    dailyReviewWords: 100,
    dailyStudyMinutes: expect.any(Number),
  })
  unmount()

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
  renderModal({ now: new Date(2026, 8, 13, 10), onSave })

  await user.click(summary('每日学习时长'))
  await user.click(screen.getByRole('option', { name: '30 分钟' }))

  await user.click(screen.getByRole('button', { name: '保存并继续' }))

  expect(await screen.findByText(/预计约 60 分钟，超过你的 30 分钟计划/)).toBeInTheDocument()
  expect(onSave).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '返回调整' }))
  expect(summary('每日新词')).toHaveAccessibleName('每日新词 51 词')
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 30 分钟')

  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  await user.click(screen.getByRole('button', { name: '仍然保存' }))
  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dailyNewWords: 51, dailyReviewWords: 20, dailyStudyMinutes: 30 }))
})

test('moves focus to the overload decision after closing a focused wheel', async () => {
  const user = userEvent.setup()
  renderModal({ now: new Date(2026, 8, 13, 10) })

  await user.click(summary('每日学习时长'))
  await user.click(screen.getByRole('option', { name: '30 分钟' }))

  await user.click(summary('每日新词'))
  const selectedOption = await screen.findByRole('option', { name: '51 词' })
  selectedOption.focus()
  fireEvent.click(screen.getByRole('button', { name: '保存并继续' }))

  await waitFor(() => expect(screen.getByText(/预计约 60 分钟，超过你的 30 分钟计划/)).toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole('button', { name: '返回调整' })).toHaveFocus())
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
    mode: 'initial',
    now: fixedNow,
    settings: baseSettings,
    snapshot,
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
