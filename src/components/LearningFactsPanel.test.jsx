import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import TodayLearningPage from './TodayLearningPage'
import LearningFactsPanel from './LearningFactsPanel'
import { buildLearningFacts } from '../data/assistant/facts'
const now = new Date(2026, 9, 2, 12)
function page(patch = {}, prepare = () => {}) {
  let raw = null
  const storage = { getItem: () => raw, setItem: vi.fn((_, value) => { raw = value }) }
  const store = createLearningStore({ storage, now: () => now })
  store.updateSettings({ todayWordBookId: 'cet4', ...patch })
  prepare(store)
  storage.setItem.mockClear()
  render(<LearningStoreProvider store={store}><TodayLearningPage now={now} /></LearningStoreProvider>)
  return { store, storage }
}
test('facts distinguish absent tasks and unavailable minutes from zero recorded feedback without writes', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const { storage } = page()
  const panel = screen.getByRole('region', { name: '计划依据与已记录反馈' })
  expect(within(panel).getByText('今日固定学习：尚未创建')).toBeInTheDocument()
  expect(within(panel).getByText('自评：认识 0 · 模糊 0 · 不认识 0')).toBeInTheDocument()
  expect(screen.getByText('无法估算：每日新词或复习数量未设置')).toBeInTheDocument()
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})
test('current book facts stay separate from fixed task book and evidence', async () => {
  page({}, store => { store.ensureTask('learning', ['alpha'], 'cet4'); store.updateSettings({ todayWordBookId: 'cet4-high-frequency' }) })
  const panel = screen.getByRole('region', { name: '计划依据与已记录反馈' })
  expect(within(panel).getByText('当前词书：CET-4高频词汇')).toBeInTheDocument()
  expect(within(panel).getByText(/今日固定学习：CET-4 · 分配 1/)).toBeInTheDocument()
  await userEvent.click(within(panel).getByRole('button', { name: '近 7 天' }))
  expect(within(panel).getByText(/2026-09-26 至 2026-10-02/)).toBeInTheDocument()
  expect(within(panel).getByText(/历史反馈完整性无法证明/)).toBeInTheDocument()
})
test('today or past exam clearly labels the recommendation inapplicable', () => {
  page({ examDate: '2026-10-02', dailyNewWords: 0, dailyReviewWords: 0 })
  expect(screen.getAllByText('不适用：考试日期为今天或已过去')).toHaveLength(2)
  expect(screen.getByText('约 0 分钟')).toBeInTheDocument()
})
test('evidence pages contain at most 50 original event rows and conflict stays unavailable', async () => {
  const store = createLearningStore({ storage: { getItem: () => null, setItem: () => {} }, now: () => now })
  const facts = buildLearningFacts(store.getSnapshot(), { now, wordBooks: [{ id: 'a', label: 'A', totalWords: 1 }], selectedWordBookId: 'a' })
  facts.history.today.selfAssessments = null
  facts.history.today.effectiveSelfAssessments = null
  facts.evidence.today.events = Array.from({ length: 51 }, (_, revision) => ({ date: '2026-10-02', wordBookId: 'a', kind: 'learning', itemId: `word-${revision}`, revision, source: 'self-assessment', feedback: 'known' }))
  render(<LearningFactsPanel facts={facts} />)
  expect(screen.getAllByText(/记录存在冲突，无法计算/)).toHaveLength(2)
  await userEvent.click(screen.getByText('查看记录依据'))
  const evidence = screen.getByLabelText('事件依据')
  expect(within(evidence).getAllByRole('listitem')).toHaveLength(50)
  await userEvent.click(screen.getByRole('button', { name: '事件下一页' }))
  expect(within(evidence).getAllByRole('listitem')).toHaveLength(1)
  expect(within(evidence).getByText(/第 2 \/ 2 页/)).toBeInTheDocument()
})
test('true self-assessment and its correction stay separate and preserve original evidence', async () => {
  page({}, store => {
    store.ensureTask('learning', ['alpha'], 'cet4')
    const token = () => { const task = store.getTask('learning'); return { date: task.date, itemId: task.currentItemId, revision: task.sessionRevision } }
    store.submitSelfAssessment(token(), 'known')
    store.correctLearningFeedback(token())
  })
  expect(screen.getByText('自评：认识 1 · 模糊 0 · 不认识 0')).toBeInTheDocument()
  expect(screen.getByText('更正：自评更正 1 · 选择更正 0')).toBeInTheDocument()
  expect(screen.getByText('有效自评：认识 0 · 模糊 1 · 不认识 0')).toBeInTheDocument()
  await userEvent.click(screen.getByText('查看记录依据'))
  const evidence = screen.getByLabelText('事件依据')
  expect(within(evidence).getAllByRole('listitem')).toHaveLength(2)
  expect(within(evidence).getByText(/来源 self-assessment · 原反馈 known/)).toBeInTheDocument()
})
test('an existing empty task shows actual zero rather than missing task', () => {
  page({}, store => store.ensureTask('review', [], 'cet4'))
  expect(screen.getByText('今日固定复习：CET-4 · 分配 0 · 完成 0 · 剩余 0 词')).toBeInTheDocument()
})
