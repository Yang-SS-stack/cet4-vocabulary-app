import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
const pages = import.meta.glob('./StatisticsPage.jsx', { eager: true })
const StatisticsPage = pages['./StatisticsPage.jsx']?.default
const now = new Date(2026, 9, 2, 12)
function page(prepare = () => {}, at = now) {
  expect(StatisticsPage).toBeTypeOf('function')
  let raw = null
  const storage = { getItem: () => raw, setItem: vi.fn((_, value) => { raw = value }) }
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const store = createLearningStore({ storage, now: () => at })
  store.updateSettings({ todayWordBookId: 'cet4' })
  prepare(store)
  storage.setItem.mockClear()
  const rendered = render(<LearningStoreProvider store={store}><StatisticsPage now={at} /></LearningStoreProvider>)
  return { ...rendered, store, storage, fetch, changeRaw: value => { raw = value } }
}

test('statistics show absent tasks, actual zero feedback, and seven-day range without requests or writes', async () => {
  const { storage, fetch } = page()
  expect(screen.getByRole('region', { name: '学习统计' })).toBeInTheDocument()
  expect(screen.getByText('今日固定学习：尚未创建')).toBeInTheDocument()
  expect(screen.getByText('自评：认识 0 · 模糊 0 · 不认识 0')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '近 7 天' }))
  expect(screen.getByText(/2026-09-26 至 2026-10-02 · 当前词书；按任务日期归属/)).toBeInTheDocument()
  expect(screen.queryByText('原始对账字段')).not.toBeInTheDocument()
  expect(screen.queryByText('查看记录依据')).not.toBeInTheDocument()
  expect(screen.getByText(/设置中的“开发验收与维护”/)).toBeInTheDocument()
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

test('statistics separate current book from fixed task book, and empty assigned tasks from absent tasks', () => {
  page(store => {
    store.ensureTask('learning', ['alpha'], 'cet4')
    store.ensureTask('review', [], 'cet4')
    store.updateSettings({ todayWordBookId: 'cet4-high-frequency' })
  })
  expect(screen.getByText('当前词书：CET-4高频词汇')).toBeInTheDocument()
  expect(screen.getByText(/今日固定学习：CET-4 · 分配 1/)).toBeInTheDocument()
  expect(screen.getByText('今日固定复习：CET-4 · 分配 0 · 完成 0 · 剩余 0 词')).toBeInTheDocument()
})

test('statistics retain true feedback, corrections and effective self-assessment independently', async () => {
  page(store => {
    store.ensureTask('learning', ['alpha'], 'cet4')
    const token = () => { const task = store.getTask('learning'); return { date: task.date, itemId: task.currentItemId, revision: task.sessionRevision } }
    store.submitSelfAssessment(token(), 'known')
    store.correctLearningFeedback(token())
  })
  for (const range of ['今日', '近 7 天']) {
    await userEvent.click(screen.getByRole('button', { name: range }))
    expect(screen.getByText('自评：认识 1 · 模糊 0 · 不认识 0')).toBeInTheDocument()
    expect(screen.getByText('更正：自评更正 1 · 选择更正 0')).toBeInTheDocument()
    expect(screen.getByText('有效自评：认识 0 · 模糊 1 · 不认识 0')).toBeInTheDocument()
    expect(screen.getByText(/历史反馈完整性无法证明/)).toBeInTheDocument()
    expect(screen.queryByText('原始对账字段')).not.toBeInTheDocument()
  }
})

test('default review progress does not masquerade as two real feedback events', () => {
  page(store => {
    store.updateSettings({ dailyReviewWords: 1 })
    store.addToReview('cet4', 'alpha', { nextReviewAt: now.toISOString() })
    store.ensureTodayReview()
  })
  expect(screen.getByText('今日固定复习：CET-4 · 分配 1 · 完成 0 · 剩余 1 词')).toBeInTheDocument()
  expect(screen.getByText('自评：认识 0 · 模糊 0 · 不认识 0')).toBeInTheDocument()
})

test('statistics show failed consistent read and do not turn missing facts into zero', () => {
  const { rerender, store, storage, fetch, changeRaw } = page()
  changeRaw('changed externally')
  rerender(<LearningStoreProvider store={store}><StatisticsPage now={new Date(now)} /></LearningStoreProvider>)
  const region = screen.getByRole('region', { name: '学习统计' })
  expect(within(region).getByText('学习记录已变化或无法读取，请重新载入页面。')).toBeInTheDocument()
  expect(screen.queryByText(/自评：认识 0/)).not.toBeInTheDocument()
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
})

test('statistics label historical due projection without assigning review tasks or saving records', () => {
  let raw = null, date = new Date(2026, 8, 9, 12)
  const storage = { getItem: () => raw, setItem: vi.fn((_, value) => { raw = value }) }
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const store = createLearningStore({ storage, now: () => date })
  store.updateSettings({ todayWordBookId: 'cet4' })
  store.ensureTask('learning', ['alpha'], 'cet4')
  for (let i = 0; i < 3; i++) store.recordFeedback('learning', 'alpha', 'known')
  const snapshot = JSON.parse(raw)
  snapshot.wordBooks.cet4.words.alpha.review = null
  raw = JSON.stringify(snapshot)
  date = new Date(2026, 8, 11, 12)
  store.reload()
  storage.setItem.mockClear()
  const before = raw
  render(<LearningStoreProvider store={store}><StatisticsPage now={date} /></LearningStoreProvider>)
  expect(screen.getByText('当前词书到期：1 词；任务外积压：1 词。任务剩余独立计算。')).toBeInTheDocument()
  expect(screen.getByText('包含历史补齐估算；开始复习时核对历史记录。')).toBeInTheDocument()
  expect(raw).toBe(before)
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(store.getTask('review')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
})
