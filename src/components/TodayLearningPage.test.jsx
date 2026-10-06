import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'

import { createLearningStore, LearningStoreProvider } from '../data/learning'
import TodayLearningPage from './TodayLearningPage'

beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') } })
afterAll(() => { delete HTMLDialogElement.prototype.showModal; delete HTMLDialogElement.prototype.close })
beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => cleanup())
function showEvidence() { fireEvent.click(screen.getByRole('button', { name: '学习建议' })); fireEvent.click(screen.getByRole('tab', { name: '依据' })) }

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

test('one pair of study actions precedes status and task progress', () => {
  const store = createStore()
  configure(store)
  renderPage(store)
  const study = screen.getByRole('button', { name: '今日学习' })
  const progress = screen.getByRole('region', { name: '今日任务进度' })
  expect(study.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(screen.getAllByRole('button', { name: '今日学习' })).toHaveLength(1)
  expect(screen.getAllByRole('button', { name: '今日复习' })).toHaveLength(1)
})

test('shows exam progress, word-book progress, both actions, and all six recommendation rows', () => {
  const store = createStore()
  configure(store)
  store.ensureTask('learning', ['ability'], 'cet4')
  store.recordFeedback('learning', 'ability', 'known')
  store.recordFeedback('learning', 'ability', 'known')
  store.recordFeedback('learning', 'ability', 'known')

  renderPage(store)
  showEvidence()

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
  expect(screen.getByRole('region', { name: '研究依据' })).toBeInTheDocument()
})

test('separates an impossible raw deadline from the capped editable suggestion', () => {
  const store = createStore()
  configure(store, { examDate: '2026-09-12', dailyNewWords: 100, dailyStudyMinutes: 110 })
  renderPage(store)
  showEvidence()

  expect(screen.getByText('每天 4,544 词')).toBeInTheDocument()
  expect(screen.getByText('每天 100 词')).toBeInTheDocument()
  expect(screen.getByText(/考试前可能无法完成/)).toBeInTheDocument()
  expect(screen.getByText('当前设置可能无法在考试前完成，建议每天至少学习 4,544 个新词。')).toBeInTheDocument()
})

test('shows saved daily quantities and planned minutes separately from the formula estimate', () => {
  const store = createStore()
  configure(store, { dailyNewWords: 100, dailyReviewWords: 20, dailyStudyMinutes: 30 })
  renderPage(store)
  showEvidence()

  expect(screen.getByText('新词 100 · 复习 20 · 计划 30 分钟')).toBeInTheDocument()
  expect(screen.getByText('约 110 分钟')).toBeInTheDocument()
})

test('reports when the saved daily quantity can meet the deadline', () => {
  const store = createStore()
  configure(store, { examDate: '2027-09-11', dailyNewWords: 13 })
  renderPage(store)
  showEvidence()

  expect(screen.getByText('当前设置可以在考试前完成。')).toBeInTheDocument()
})

test('prompts for a future date when deadline plans are unavailable', () => {
  const store = createStore()
  configure(store, { examDate: null })
  renderPage(store)
  showEvidence()

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
  showEvidence()
  expect(screen.getByText(/当前到期 0 词/)).toBeInTheDocument()
  expect(screen.getByRole('img', { name: '今日复习：已完成 0 / 2 词，0%' })).toBeInTheDocument()
  expect(screen.getByText('已保存词书：CET-4')).toBeInTheDocument()
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
  showEvidence()
  expect(screen.getByText(/预计到期 1 词；开始复习时核对历史记录/)).toBeInTheDocument()
  expect(raw).toBe(before); expect(store.getTask('review')).toBeNull()
})

test('reveals the research sources without presenting them as a fixed word-count prescription', async () => {
  const user = userEvent.setup()
  const store = createStore()
  configure(store)
  renderPage(store)

  await user.click(screen.getByRole('button', { name: '学习建议' }))
  await user.click(screen.getByRole('tab', { name: '依据' }))

  expect(screen.getByText(/间隔学习与主动回忆是学习方法证据/)).toBeInTheDocument()
  expect(screen.getByRole('link', { name: /分散练习综述/ })).toHaveAttribute('href', 'https://pubmed.ncbi.nlm.nih.gov/16719566/')
  expect(screen.getByRole('link', { name: /主动回忆研究/ })).toHaveAttribute('href', 'https://doi.org/10.1126/science.1152408')
})

test('today retains necessary task progress and suggestions without full feedback or original record fields', () => {
  const store = createStore()
  configure(store)
  store.ensureTask('learning', ['ability'], 'cet4')
  renderPage(store)
  expect(screen.getByRole('region', { name: '今日任务进度' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: '今日新词：已完成 0 / 1 词，0%' })).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '额外学习' })).toHaveTextContent('尚未创建')
  expect(screen.getByText('学习建议')).toBeInTheDocument()
  expect(screen.queryByText('已记录反馈')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '近 7 天' })).not.toBeInTheDocument()
  expect(screen.queryByText('原始对账字段')).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: '今日复习' })).toHaveTextContent('尚未创建')
})

test('unconfigured learning suggestions preserve unavailable daily estimate', () => {
  const store = createStore()
  store.updateSettings({ todayWordBookId: 'cet4' })
  renderPage(store)
  showEvidence()
  expect(screen.getByText('无法估算：每日新词或复习数量未设置')).toBeInTheDocument()
})

test('today or past exam labels recommendations inapplicable and actual zero minutes separately', () => {
  const store = createStore()
  configure(store, { examDate: '2026-09-11', dailyNewWords: 0, dailyReviewWords: 0 })
  renderPage(store)
  showEvidence()
  expect(screen.getAllByText('不适用：考试日期为今天或已过去')).toHaveLength(2)
  expect(screen.getByText('约 0 分钟')).toBeInTheDocument()
})


test('an existing empty review task has one honest ring state without a duplicate progress row', () => {
  const store = createStore()
  configure(store)
  store.ensureTask('review', [], 'cet4')
  renderPage(store)
  expect(screen.getByRole('region', { name: '今日复习' })).toHaveTextContent('本日无复习任务')
  expect(screen.queryByText(/今日固定复习/)).not.toBeInTheDocument()
})
