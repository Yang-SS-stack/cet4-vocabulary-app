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
  expect(screen.getByText('使用间隔学习与主动回忆；复习时优先完成全部到期词')).toBeInTheDocument()
  expect(screen.getByText('尚无到期复习；开始复习后按当天到期词更新')).toBeInTheDocument()
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

test('leaves first-run setup to the app entry and keeps later flows disabled', async () => {
  const user = userEvent.setup()
  const store = createStore()
  renderPage(store)

  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('学习流程将在下一阶段启用')

  await user.click(screen.getByRole('button', { name: '今日复习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('复习流程将在下一阶段启用')
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
