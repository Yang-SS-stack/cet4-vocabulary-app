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

  expect(screen.getByText('研究建议：新词')).toBeInTheDocument()
  expect(screen.getByText('研究未给出通用固定数量')).toBeInTheDocument()
  expect(screen.getByText('研究建议：复习')).toBeInTheDocument()
  expect(screen.getByText('优先完成全部到期词')).toBeInTheDocument()
  expect(screen.getByText('考试计划计算')).toBeInTheDocument()
  expect(screen.getAllByText('每天 455 词')).toHaveLength(2)
  expect(screen.getByText('系统最终建议')).toBeInTheDocument()
  expect(screen.getByText('用户当前设置')).toBeInTheDocument()
  expect(screen.getByText('新词 12 · 复习 7')).toBeInTheDocument()
  expect(screen.getByText('预计每日学习时间')).toBeInTheDocument()
  expect(screen.getByText('约 15 分钟')).toBeInTheDocument()
  expect(screen.getByText('查看依据')).toBeInTheDocument()
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
