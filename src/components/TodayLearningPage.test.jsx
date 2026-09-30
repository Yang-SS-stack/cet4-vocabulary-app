import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { createLearningStore, LearningStoreProvider } from '../data/learning'
import TodayLearningPage from './TodayLearningPage'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

function createStore() {
  return createLearningStore({
    storage: createMemoryStorage(),
    now: () => new Date(2026, 8, 11, 10),
  })
}

function renderPage(store) {
  return render(
    <LearningStoreProvider store={store}>
      <TodayLearningPage now={new Date(2026, 8, 11, 10)} />
    </LearningStoreProvider>,
  )
}

function configure(store, patch = {}) {
  store.updateSettings({
    examDate: '2026-09-21',
    todayWordBookId: 'cet4',
    dailyNewWords: 12,
    dailyReviewWords: 7,
    dailyStudyMinutes: 50,
    ...patch,
  })
}

test('shows exam progress, word-book progress, both actions, and all six recommendation rows', () => {
  const store = createStore()
  configure(store)
  store.ensureTask('learning', ['ability'], 'cet4')
  store.recordFeedback('learning', 'ability', 'known')
  store.recordFeedback('learning', 'ability', 'known')
  store.recordFeedback('learning', 'ability', 'known')

  renderPage(store)

  expect(screen.getByText('距离考试')).toBeInTheDocument()
  expect(screen.getByText('10 天')).toBeInTheDocument()
  expect(screen.getByText('CET-4 剩余')).toBeInTheDocument()
  expect(screen.getByText('4,543 / 4,544 词')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '今日学习' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '今日复习' })).toBeInTheDocument()

  expect(screen.getByText('学习方法建议')).toBeInTheDocument()
  expect(screen.getByText('使用间隔学习与主动回忆；在设定数量内优先复习逾期词')).toBeInTheDocument()
  expect(screen.getByText(/当前到期 0 词/)).toBeInTheDocument()
  expect(screen.getByText('考试目标需要')).toBeInTheDocument()
  expect(screen.getByText('每天 455 词')).toBeInTheDocument()
  expect(screen.getByText('系统建议')).toBeInTheDocument()
  expect(screen.getByText('每天 100 词')).toBeInTheDocument()
  expect(screen.getByText('用户当前设置')).toBeInTheDocument()
  expect(screen.getByText('新词 12 · 复习 7 · 计划 50 分钟')).toBeInTheDocument()
  expect(screen.getByText('预计每日学习时间')).toBeInTheDocument()
  expect(screen.getByText('约 15 分钟')).toBeInTheDocument()
  expect(screen.getByText('计划结果')).toBeInTheDocument()
  expect(screen.getByText('当前设置可能无法在考试前完成，建议每天至少学习 455 个新词。')).toBeInTheDocument()
  expect(screen.getByText('查看依据')).toBeInTheDocument()
})

test('separates an impossible raw deadline from the capped editable suggestion', () => {
  const store = createStore()
  configure(store, { examDate: '2026-09-12', dailyNewWords: 100, dailyStudyMinutes: 110 })
  renderPage(store)

  expect(screen.getByText('每天 4,544 词')).toBeInTheDocument()
  expect(screen.getByText('每天 100 词')).toBeInTheDocument()
  expect(screen.getByText(/考试前可能无法完成/)).toBeInTheDocument()
  expect(screen.getByText('当前设置可能无法在考试前完成，建议每天至少学习 4,544 个新词。')).toBeInTheDocument()
})

test('shows saved daily quantities and planned minutes separately from the formula estimate', () => {
  const store = createStore()
  configure(store, { dailyNewWords: 100, dailyReviewWords: 20, dailyStudyMinutes: 30 })
  renderPage(store)

  expect(screen.getByText('新词 100 · 复习 20 · 计划 30 分钟')).toBeInTheDocument()
  expect(screen.getByText('约 110 分钟')).toBeInTheDocument()
})

test('reports when the saved daily quantity can meet the deadline', () => {
  const store = createStore()
  configure(store, { examDate: '2027-09-11', dailyNewWords: 13 })
  renderPage(store)

  expect(screen.getByText('当前设置可以在考试前完成。')).toBeInTheDocument()
})

test('prompts for a future date when deadline plans are unavailable', () => {
  const store = createStore()
  configure(store, { examDate: null })
  renderPage(store)

  expect(screen.getAllByText('设置未来考试日期后计算')).toHaveLength(2)
  expect(screen.getByText('请先设置未来的考试日期。')).toBeInTheDocument()
})

test('requires learning and review settings', async () => {
  const user = userEvent.setup()
  const store = createStore()
  renderPage(store)

  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('请先在设置中选择词书和每日新词数量')

  await user.click(screen.getByRole('button', { name: '今日复习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(await screen.findByRole('alert')).toHaveTextContent('请先在设置中选择词书和每日复习数量')
})

test('overview shows true due, assigned and unassigned counts and saved task book after settings change', () => {
  const store = createStore(); configure(store, { dailyReviewWords: 2 })
  for (const word of ['alpha', 'beta', 'gamma']) store.addToReview('cet4', word, { nextReviewAt: new Date(2026, 8, 11).toISOString() })
  store.ensureTodayReview()
  store.updateSettings({ todayWordBookId: 'cet4-high-frequency', dailyReviewWords: 1 })
  renderPage(store)
  expect(screen.getByText(/当前到期 3 词/)).toBeInTheDocument()
  expect(screen.getByText(/已完成 0 \/ 2 词/)).toBeInTheDocument()
  expect(screen.getByText(/尚未分配 1 词/)).toBeInTheDocument()
  expect(screen.getByText(/复习沿用已保存词书：CET-4/)).toBeInTheDocument()
})

test('overview labels projected historical due counts without writing or silently assigning them', () => {
  let raw = null, date = new Date(2026, 8, 9, 12)
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  const store = createLearningStore({ storage, now: () => date }); configure(store)
  store.ensureTask('learning', ['alpha'], 'cet4')
  for (let i = 0; i < 3; i++) store.recordFeedback('learning', 'alpha', 'known')
  const snapshot = JSON.parse(raw); snapshot.wordBooks.cet4.words.alpha.review = null; raw = JSON.stringify(snapshot)
  date = new Date(2026, 8, 11, 12); store.reload(); const before = raw
  renderPage(store)
  expect(screen.getByText(/预计到期 1 词；开始复习时核对历史记录/)).toBeInTheDocument()
  expect(raw).toBe(before); expect(store.getTask('review')).toBeNull()
})

test('reveals the research sources without presenting them as a fixed word-count prescription', async () => {
  const user = userEvent.setup()
  const store = createStore()
  configure(store)
  renderPage(store)

  await user.click(screen.getByText('查看依据'))

  expect(screen.getByText(/间隔学习与主动回忆是学习方法证据/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /分散练习综述/ })).toHaveAttribute('href', 'https://pubmed.ncbi.nlm.nih.gov/16719566/')
  expect(screen.getByRole('link', { name: /主动回忆研究/ })).toHaveAttribute('href', 'https://doi.org/10.1126/science.1152408')
})
