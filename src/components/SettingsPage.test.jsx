import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'

import { createLearningStore, LearningStoreProvider } from '../data/learning'
import SettingsPage from './SettingsPage'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

function createStore() {
  const store = createLearningStore({
    storage: createMemoryStorage(),
    now: () => new Date(2026, 8, 11, 10),
  })
  store.updateSettings({
    examDate: '2026-12-12',
    todayWordBookId: 'cet4',
    dailyNewWords: 15,
    dailyReviewWords: 20,
    dailyStudyMinutes: 90,
    pronunciation: 'en-GB',
    mistakeStudyWords: 10,
  })
  return store
}

function renderPage(store, now = new Date(2026, 8, 11, 10)) {
  return render(
    <LearningStoreProvider store={store}>
      <SettingsPage now={now} />
    </LearningStoreProvider>,
  )
}

function summary(label) {
  return screen.getByRole('button', { name: new RegExp(`^${label} `) })
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('shows all seven editable settings as collapsed wheels', () => {
  renderPage(createStore())

  expect(summary('考试日期')).toBeInTheDocument()
  expect(summary('今日学习词表')).toBeInTheDocument()
  expect(summary('每日新词数量')).toBeInTheDocument()
  expect(summary('每日复习数量')).toBeInTheDocument()
  expect(summary('每日学习时长')).toBeInTheDocument()
  expect(summary('发音偏好')).toHaveAccessibleName('发音偏好 英音')
  expect(summary('错题本每日学习数量')).toBeInTheDocument()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})

test('keeps one wheel open while preserving the draft across a field switch', async () => {
  const user = userEvent.setup()
  renderPage(createStore())

  await user.click(summary('每日新词数量'))
  await user.click(screen.getByRole('option', { name: '24 词' }))
  expect(summary('每日新词数量')).toHaveAccessibleName('每日新词数量 24 词')

  await user.click(summary('每日学习时长'))
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
  expect(screen.queryByRole('listbox', { name: '每日新词数量' })).not.toBeInTheDocument()
  expect(await screen.findByRole('listbox', { name: '每日学习时长' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)

  await user.click(summary('每日新词数量'))
  expect(await screen.findByRole('option', { name: '24 词', selected: true })).toBeInTheDocument()
})

test('does not overlap wheel trays when the user changes the pending field quickly', async () => {
  const user = userEvent.setup()
  renderPage(createStore())

  await user.click(summary('每日新词数量'))
  await user.click(summary('每日学习时长'))
  await user.click(summary('发音偏好'))

  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
  expect(await screen.findByRole('listbox', { name: '发音偏好' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
})

test('opens the latest requested wheel as soon as the 220ms collapse finishes', () => {
  vi.useFakeTimers()
  renderPage(createStore())
  fireEvent.click(summary('每日新词数量'))
  fireEvent.click(summary('每日复习数量'))
  fireEvent.click(summary('发音偏好'))

  act(() => vi.advanceTimersByTime(219))
  expect(screen.queryByRole('listbox', { name: '发音偏好' })).not.toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)

  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('listbox', { name: '发音偏好' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
})

test('a later field click does not restart the current collapse', () => {
  vi.useFakeTimers()
  renderPage(createStore())
  fireEvent.click(summary('每日新词数量'))
  fireEvent.click(summary('每日复习数量'))

  act(() => vi.advanceTimersByTime(100))
  fireEvent.click(summary('发音偏好'))
  act(() => vi.advanceTimersByTime(119))
  expect(screen.queryByRole('listbox', { name: '发音偏好' })).not.toBeInTheDocument()

  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('listbox', { name: '发音偏好' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
})

test('reduced motion commits the scrolled value before a rapid three-field switch opens only the latest field', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  renderPage(createStore())

  fireEvent.click(summary('每日新词数量'))
  const listbox = screen.getByRole('listbox', { name: '每日新词数量' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)

  fireEvent.click(summary('每日复习数量'))
  fireEvent.click(summary('每日学习时长'))

  expect(screen.getByRole('listbox', { name: '每日新词数量' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
  expect(screen.queryByRole('listbox', { name: '每日复习数量' })).not.toBeInTheDocument()
  expect(screen.queryByRole('listbox', { name: '每日学习时长' })).not.toBeInTheDocument()

  act(() => vi.advanceTimersByTime(100))

  expect(summary('每日新词数量')).toHaveAccessibleName('每日新词数量 10 词')
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)

  act(() => vi.advanceTimersByTime(10))

  expect(screen.getByRole('listbox', { name: '每日学习时长' })).toBeInTheDocument()
  expect(screen.queryByRole('listbox', { name: '每日复习数量' })).not.toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
})

test('reduced motion commits the scrolled value before an immediate save', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  const store = createStore()
  store.updateSettings({ dailyStudyMinutes: 240 })
  renderPage(store)

  fireEvent.click(summary('每日新词数量'))
  const listbox = screen.getByRole('listbox', { name: '每日新词数量' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))

  expect(screen.getByRole('listbox', { name: '每日新词数量' })).toBeInTheDocument()
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(1)
  expect(store.getSnapshot().settings.dailyNewWords).toBe(15)

  act(() => vi.advanceTimersByTime(100))

  expect(summary('每日新词数量')).toHaveAccessibleName('每日新词数量 10 词')
  expect(store.getSnapshot().settings.dailyNewWords).toBe(15)

  act(() => vi.advanceTimersByTime(10))

  expect(store.getSnapshot().settings.dailyNewWords).toBe(10)
  expect(document.querySelectorAll('.settings-wheel__tray')).toHaveLength(0)
})

test('recalculates study minutes when either word count changes', async () => {
  const user = userEvent.setup()
  renderPage(createStore(), new Date(2026, 8, 13, 10))

  await user.click(summary('每日新词数量'))
  await user.click(screen.getByRole('option', { name: '13 词' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 20 分钟')

  await user.click(summary('每日复习数量'))
  await user.click(await screen.findByRole('option', { name: '1 词' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 15 分钟')
})

test('does not save a date that is today or earlier', async () => {
  const user = userEvent.setup()
  const store = createStore()
  store.updateSettings({ examDate: '2026-09-13' })
  renderPage(store, new Date(2026, 8, 13, 10))

  await user.click(screen.getByRole('button', { name: '保存设置' }))

  expect(screen.getByRole('status')).toHaveTextContent('请选择未来的考试日期')
  expect(store.getSnapshot().settings.examDate).toBe('2026-09-13')
})

test('clamps the selected day when the month has fewer days', () => {
  const store = createStore()
  store.updateSettings({ examDate: '2027-01-31' })
  renderPage(store)

  fireEvent.click(summary('考试日期'))
  fireEvent.click(screen.getByRole('option', { name: '2 月' }))

  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2027 年 2 月 28 日')
})

test('warns when the deadline requires more than the editable daily limit', () => {
  const store = createStore()
  store.updateSettings({ examDate: '2026-09-12' })

  renderPage(store)

  expect(screen.getByText(/考试前可能无法完成/)).toBeInTheDocument()
})

test('saves en-US and later settings changes without rewriting an existing daily task snapshot', async () => {
  const user = userEvent.setup()
  const store = createStore()
  store.ensureTask('learning', ['ability'], 'cet4')
  const taskBefore = structuredClone(store.getTask('learning'))
  renderPage(store)

  await user.click(summary('发音偏好'))
  await user.click(screen.getByRole('option', { name: '美音' }))
  await user.click(screen.getByRole('button', { name: '保存设置' }))

  await waitFor(() => expect(store.getSnapshot().settings.pronunciation).toBe('en-US'))
  expect(store.getTask('learning')).toEqual(taskBefore)

  await user.click(summary('每日新词数量'))
  await user.click(screen.getByRole('option', { name: '24 词' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 35 分钟')
  await user.click(screen.getByRole('button', { name: '保存设置' }))

  await waitFor(() => expect(store.getSnapshot().settings.dailyNewWords).toBe(24))
  expect(store.getSnapshot().settings.pronunciation).toBe('en-US')
  expect(store.getTask('learning')).toEqual(taskBefore)
  expect(screen.getByRole('status')).toHaveTextContent('设置已保存')
})

test('waits for asynchronous settings persistence and reports rejection without success', async () => {
  const store = createStore()
  let rejectSave
  store.updateSettings = () => new Promise((_, reject) => { rejectSave = reject })
  renderPage(store)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  expect(screen.queryByText(/设置已保存/)).not.toBeInTheDocument()
  await act(async () => rejectSave(Error('quota')))
  expect(screen.getByRole('status')).toHaveTextContent('保存失败')
})

test('offers explicit reload after another tab changes settings and then permits saving', async () => {
  const store = createStore()
  const original = store.updateSettings
  let stale = true
  store.updateSettings = patch => { if (stale) throw Error('Learning data changed elsewhere'); original(patch) }
  const originalReload = store.reload
  store.reload = () => { originalReload(); stale = false }
  renderPage(store)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  expect(screen.getByRole('status')).toHaveTextContent('其他页面')
  await user.click(screen.getByRole('button', { name: '重新读取已保存设置' }))
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  expect(screen.getByRole('status')).toHaveTextContent('设置已保存')
})
