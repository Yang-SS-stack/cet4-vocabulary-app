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

function renderPage(store, now = new Date(2026, 8, 11, 10), onOpenMaintenance = vi.fn()) {
  return render(
    <LearningStoreProvider store={store}>
      <SettingsPage now={now} onOpenMaintenance={onOpenMaintenance} />
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

test('selection mode stays in the draft until the shared save action succeeds', async () => {
  const store = createStore()
  renderPage(store)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '随机选词' }))
  expect(screen.getByRole('button', { name: '随机选词' })).toHaveAttribute('aria-pressed', 'true')
  expect(store.getSnapshot().settings.newWordSelectionMode).toBe('sequential')
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  await waitFor(() => expect(store.getSnapshot().settings.newWordSelectionMode).toBe('random'))
})
test('unsaved mode participates in discard confirmation and failed save preserves it', async () => {
  const store = createStore(), open = vi.fn()
  renderPage(store, undefined, open)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '随机选词' }))
  vi.spyOn(store, 'updateSettings').mockRejectedValue(Error('quota'))
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  await screen.findByText(/保存失败/)
  expect(screen.getByRole('button', { name: '随机选词' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: '开发验收与维护' }))
  expect(screen.getByRole('dialog', { name: '设置尚未保存' })).toBeInTheDocument()
  expect(open).not.toHaveBeenCalled()
})

test('opens maintenance from an unchanged normalized draft without saving', async () => {
  const store = createStore()
  const save = vi.spyOn(store, 'updateSettings')
  const open = vi.fn()
  renderPage(store, undefined, open)
  await userEvent.setup().click(screen.getByRole('button', { name: '开发验收与维护' }))
  expect(open).toHaveBeenCalledOnce()
  expect(save).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.queryByText('开发验收：本机后端')).not.toBeInTheDocument()
})

test('keeps unsaved settings on the default choice and Escape, and discards only explicitly', async () => {
  const user = userEvent.setup()
  const store = createStore()
  const open = vi.fn()
  renderPage(store, undefined, open)
  await user.click(summary('发音偏好'))
  await user.click(screen.getByRole('option', { name: '美音' }))
  await user.click(screen.getByRole('button', { name: '开发验收与维护' }))
  expect(screen.getByRole('button', { name: '留在设置' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(summary('发音偏好')).toHaveAccessibleName('发音偏好 美音')
  expect(open).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '开发验收与维护' }))
  await user.click(screen.getByRole('button', { name: '放弃修改并进入' }))
  expect(open).toHaveBeenCalledOnce()
  expect(store.getSnapshot().settings.pronunciation).toBe('en-GB')
})

test('successful save updates the entry baseline and a failed save keeps the draft protected', async () => {
  const user = userEvent.setup()
  const store = createStore()
  const open = vi.fn()
  renderPage(store, undefined, open)
  await user.click(summary('发音偏好'))
  await user.click(screen.getByRole('option', { name: '美音' }))
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('设置已保存'))
  await user.click(screen.getByRole('button', { name: '开发验收与维护' }))
  expect(open).toHaveBeenCalledOnce()
  open.mockClear()
  await user.click(summary('发音偏好'))
  await user.click(screen.getByRole('option', { name: '英音' }))
  store.updateSettings = () => Promise.reject(Error('quota'))
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('保存失败'))
  await user.click(screen.getByRole('button', { name: '开发验收与维护' }))
  expect(screen.getByRole('dialog', { name: '设置尚未保存' })).toBeInTheDocument()
  expect(open).not.toHaveBeenCalled()
})

test('disables maintenance while a scroll has an unsettled draft value', () => {
  vi.useFakeTimers()
  renderPage(createStore())
  fireEvent.click(summary('每日新词数量'))
  const listbox = screen.getByRole('listbox', { name: '每日新词数量' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)
  expect(screen.getByRole('button', { name: '开发验收与维护' })).toBeDisabled()
  act(() => vi.advanceTimersByTime(100))
  expect(screen.getByRole('button', { name: '开发验收与维护' })).toBeEnabled()
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

test('switches and rapidly reverses in the same card slots without a waiting state', () => {
  renderPage(createStore())
  const first = summary('每日新词数量').closest('.settings-wheel')
  const second = summary('每日复习数量').closest('.settings-wheel')
  fireEvent.click(summary('每日新词数量'))
  fireEvent.click(summary('每日复习数量'))
  expect(screen.getByRole('listbox', { name: '每日复习数量' })).toBeInTheDocument()
  expect(screen.queryByRole('listbox', { name: '每日新词数量' })).not.toBeInTheDocument()
  fireEvent.click(summary('每日新词数量'))
  expect(screen.getByRole('listbox', { name: '每日新词数量' })).toBeInTheDocument()
  expect(summary('每日新词数量').closest('.settings-wheel')).toBe(first)
  expect(summary('每日复习数量').closest('.settings-wheel')).toBe(second)
})

test('commits a pending touch scroll immediately on switching even with reduced motion', () => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  renderPage(createStore())
  fireEvent.click(summary('每日新词数量'))
  const listbox = screen.getByRole('listbox', { name: '每日新词数量' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)
  fireEvent.click(summary('每日复习数量'))
  fireEvent.click(summary('每日学习时长'))
  expect(summary('每日新词数量')).toHaveAccessibleName('每日新词数量 10 词')
  expect(screen.getByRole('listbox', { name: '每日学习时长' })).toBeInTheDocument()
  act(() => vi.advanceTimersByTime(400))
  expect(screen.queryByRole('listbox', { name: '每日复习数量' })).not.toBeInTheDocument()
})

test('save flushes the visible pending option and disables every field until persistence ends', async () => {
  const store = createStore()
  let resolveSave
  const save = vi.fn(() => new Promise(resolve => { resolveSave = resolve }))
  store.updateSettings = save
  renderPage(store)
  fireEvent.click(summary('每日新词数量'))
  const listbox = screen.getByRole('listbox', { name: '每日新词数量' })
  listbox.scrollTop = 9 * 48
  fireEvent.scroll(listbox)
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ dailyNewWords: 10 }))
  for (const label of ['考试日期', '今日学习词表', '每日新词数量', '每日复习数量', '每日学习时长', '发音偏好', '错题本每日学习数量']) {
    expect(summary(label)).toBeDisabled()
    fireEvent.click(summary(label))
  }
  expect(screen.getByRole('button', { name: '开发验收与维护' })).toBeDisabled()
  expect(summary('每日新词数量')).toHaveAccessibleName('每日新词数量 10 词')
  await act(async () => resolveSave())
  expect(summary('每日新词数量')).toBeEnabled()
})

test('date settlement protects maintenance until a sibling change settles every pending column', () => {
  vi.useFakeTimers()
  renderPage(createStore())
  fireEvent.click(summary('考试日期'))
  const month = screen.getByRole('listbox', { name: '月' })
  const day = screen.getByRole('listbox', { name: '日' })
  month.scrollTop = 48
  fireEvent.scroll(month)
  act(() => vi.advanceTimersByTime(50))
  day.scrollTop = 48
  fireEvent.scroll(day)
  expect(screen.getByRole('button', { name: '开发验收与维护' })).toBeDisabled()
  act(() => vi.advanceTimersByTime(49))
  expect(screen.getByRole('button', { name: '开发验收与维护' })).toBeDisabled()
  act(() => vi.advanceTimersByTime(1))
  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2026 年 2 月 2 日')
  expect(screen.getByRole('button', { name: '开发验收与维护' })).toBeEnabled()
  act(() => vi.advanceTimersByTime(50))
  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2026 年 2 月 2 日')
  expect(screen.getByRole('button', { name: '开发验收与维护' })).toBeEnabled()
})

test('a month choice preserves the pending day before shortening its range and saves that date', () => {
  vi.useFakeTimers()
  const store = createStore()
  store.updateSettings({ examDate: '2027-01-31' })
  const save = vi.spyOn(store, 'updateSettings')
  renderPage(store)
  fireEvent.click(summary('考试日期'))
  const day = screen.getByRole('listbox', { name: '日' })
  day.scrollTop = 14 * 48
  fireEvent.scroll(day)
  fireEvent.click(screen.getByRole('option', { name: '2 月' }))
  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2027 年 2 月 15 日')
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ examDate: '2027-02-15' }))
})

test('a year choice captures pending month and day values before batched date updates clamp them', () => {
  vi.useFakeTimers()
  const store = createStore()
  store.updateSettings({ examDate: '2027-01-31' })
  renderPage(store)
  fireEvent.click(summary('考试日期'))
  const month = screen.getByRole('listbox', { name: '月' })
  const day = screen.getByRole('listbox', { name: '日' })
  month.scrollTop = 48
  fireEvent.scroll(month)
  day.scrollTop = 14 * 48
  fireEvent.scroll(day)
  fireEvent.click(screen.getByRole('option', { name: '2028 年' }))
  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2028 年 2 月 15 日')
  act(() => vi.advanceTimersByTime(100))
  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2028 年 2 月 15 日')
  expect(screen.getByRole('button', { name: '开发验收与维护' })).toBeEnabled()
})

test.each([
  ['year then month', ['年', '月']],
  ['month then year', ['月', '年']],
])('pending leap-year date parts normalize once when scrolling %s', (_description, order) => {
  vi.useFakeTimers()
  const store = createStore()
  store.updateSettings({ examDate: '2027-01-31' })
  const save = vi.spyOn(store, 'updateSettings')
  renderPage(store)
  fireEvent.click(summary('考试日期'))
  for (const label of order) {
    const list = screen.getByRole('listbox', { name: label })
    list.scrollTop = label === '年' ? 2 * 48 : 48
    fireEvent.scroll(list)
    act(() => vi.advanceTimersByTime(10))
  }
  act(() => vi.advanceTimersByTime(100))
  expect(summary('考试日期')).toHaveAccessibleName('考试日期 2028 年 2 月 29 日')
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ examDate: '2028-02-29' }))
})

test('saving pending year and month applies the final leap-year date parts together', () => {
  vi.useFakeTimers()
  const store = createStore()
  store.updateSettings({ examDate: '2027-01-31' })
  const save = vi.spyOn(store, 'updateSettings')
  renderPage(store)
  fireEvent.click(summary('考试日期'))
  const year = screen.getByRole('listbox', { name: '年' })
  const month = screen.getByRole('listbox', { name: '月' })
  year.scrollTop = 2 * 48
  fireEvent.scroll(year)
  month.scrollTop = 48
  fireEvent.scroll(month)
  fireEvent.click(screen.getByRole('button', { name: '保存设置' }))
  expect(save).toHaveBeenCalledWith(expect.objectContaining({ examDate: '2028-02-29' }))
})

test('a date sibling choice leaves nonpending authored movement at its visible offset', () => {
  const frames = new Map()
  let nextId = 0
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextId, callback)
    return nextId
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id))
  const advance = time => act(() => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(time))
  })
  try {
    const store = createStore()
    store.updateSettings({ examDate: '2027-01-31' })
    renderPage(store)
    fireEvent.click(summary('考试日期'))
    const year = screen.getByRole('listbox', { name: '年' })
    fireEvent.click(screen.getByRole('option', { name: '2028 年' }))
    advance(0)
    advance(90)
    const visibleOffset = year.scrollTop
    expect(visibleOffset).toBeGreaterThan(48)
    expect(visibleOffset).toBeLessThan(96)
    fireEvent.click(screen.getByRole('option', { name: '2 月' }))
    expect(year.scrollTop).toBe(visibleOffset)
    advance(180)
    expect(year.scrollTop).toBe(96)
  } finally {
    request.mockRestore()
    cancel.mockRestore()
  }
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
