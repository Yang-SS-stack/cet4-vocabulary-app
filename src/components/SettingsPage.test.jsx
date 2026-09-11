import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

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

function renderPage(store) {
  return render(
    <LearningStoreProvider store={store}>
      <SettingsPage />
    </LearningStoreProvider>,
  )
}

function summary(label) {
  return screen.getByRole('button', { name: new RegExp(`^${label} `) })
}

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
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  await user.click(await screen.findByRole('button', { name: '仍然保存' }))

  await waitFor(() => expect(store.getSnapshot().settings.dailyNewWords).toBe(24))
  expect(store.getSnapshot().settings.pronunciation).toBe('en-US')
  expect(store.getTask('learning')).toEqual(taskBefore)
  expect(screen.getByRole('status')).toHaveTextContent('设置已保存')
})
