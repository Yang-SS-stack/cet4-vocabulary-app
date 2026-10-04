import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createLearningStore } from '../data/learning'
import * as FactsComponents from './LearningFactsPanel'
import { buildLearningFacts } from '../data/assistant/facts'
const now = new Date(2026, 9, 2, 12)
function factsFor(prepare = () => {}) {
  const store = createLearningStore({ storage: { getItem: () => null, setItem: () => {} }, now: () => now })
  prepare(store)
  return buildLearningFacts(store.getSnapshot(), { now, wordBooks: [{ id: 'a', label: 'A', totalWords: 1 }], selectedWordBookId: 'a' })
}

test('today task progress distinguishes absent and zero tasks without full feedback or evidence', () => {
  expect(FactsComponents.TodayTaskProgress).toBeTypeOf('function')
  const facts = factsFor()
  facts.today.review = { wordBookId: 'a', assignedWords: 0, completedWords: 0, remainingWords: 0 }
  const { rerender } = render(<FactsComponents.TodayTaskProgress facts={facts} />)
  const panel = screen.getByRole('region', { name: '今日任务进度' })
  expect(within(panel).getByText('今日固定学习：尚未创建')).toBeInTheDocument()
  expect(within(panel).getByText('今日固定复习：a · 分配 0 · 完成 0 · 剩余 0 词')).toBeInTheDocument()
  expect(screen.queryByText('已记录反馈')).not.toBeInTheDocument()
  expect(screen.queryByText('原始对账字段')).not.toBeInTheDocument()
  rerender(<FactsComponents.TodayTaskProgress facts={facts} includeReview={false} />)
  expect(screen.queryByText(/今日固定复习/)).not.toBeInTheDocument()
})

test('split components preserve the read-failure message instead of invented zero values', () => {
  for (const name of ['TodayTaskProgress', 'LearningFactsSummary', 'LearningFactsEvidence']) {
    expect(FactsComponents[name]).toBeTypeOf('function')
    const Component = FactsComponents[name]
    const { unmount } = render(<Component facts={null} error="学习记录无法读取" />)
    expect(screen.getByText('学习记录无法读取')).toBeInTheDocument()
    expect(screen.queryByText(/认识 0/)).not.toBeInTheDocument()
    unmount()
  }
})

test('evidence stays read-only while switching ranges and paging 51 original rows', async () => {
  expect(FactsComponents.LearningFactsEvidence).toBeTypeOf('function')
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const facts = factsFor()
  const rows = Array.from({ length: 51 }, (_, revision) => ({ date: '2026-10-02', wordBookId: 'a', kind: 'learning', itemId: `word-${revision}`, revision, source: 'self-assessment', feedback: 'known' }))
  facts.evidence.today.events = rows
  facts.evidence.last7Days.events = rows
  const before = JSON.stringify(facts)
  render(<FactsComponents.LearningFactsEvidence facts={facts} />)
  await userEvent.click(screen.getByText('查看记录依据'))
  const evidence = screen.getByLabelText('事件依据')
  expect(within(evidence).getAllByRole('listitem')).toHaveLength(50)
  await userEvent.click(screen.getByRole('button', { name: '事件下一页' }))
  expect(within(evidence).getAllByRole('listitem')).toHaveLength(1)
  expect(within(evidence).getByText(/第 2 \/ 2 页/)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: '近 7 天' }))
  const resetEvidence = screen.getByLabelText('事件依据')
  expect(within(resetEvidence).getAllByRole('listitem')).toHaveLength(50)
  expect(screen.getByText(/2026-09-26 至 2026-10-02 · 当前词书；按任务日期归属/)).toBeInTheDocument()
  await userEvent.click(within(resetEvidence).getAllByText('原始对账字段')[0])
  expect(within(resetEvidence).getAllByText(/"itemId": "word-0"/)).toHaveLength(1)
  expect(JSON.stringify(facts)).toBe(before)
  expect(fetch).not.toHaveBeenCalled()
})

test('summary keeps conflicting indicators unavailable and exposes no original rows', () => {
  expect(FactsComponents.LearningFactsSummary).toBeTypeOf('function')
  const facts = factsFor()
  facts.history.today.selfAssessments = null
  facts.history.today.effectiveSelfAssessments = null
  facts.history.today.issues = ['duplicate-event']
  render(<FactsComponents.LearningFactsSummary facts={facts} />)
  expect(screen.getAllByText(/记录存在冲突，无法计算/)).toHaveLength(2)
  expect(screen.getByText(/记录异常：duplicate-event/)).toBeInTheDocument()
  expect(screen.queryByText('原始对账字段')).not.toBeInTheDocument()
})

test('evidence preserves both original self-assessment and correction rows', async () => {
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } }, now: () => now })
  store.ensureTask('learning', ['alpha'], 'cet4')
  const token = () => { const task = store.getTask('learning'); return { date: task.date, itemId: task.currentItemId, revision: task.sessionRevision } }
  store.submitSelfAssessment(token(), 'known')
  store.correctLearningFeedback(token())
  const facts = buildLearningFacts(store.getSnapshot(), { now, wordBooks: [{ id: 'cet4', label: 'CET-4', totalWords: 4544 }], selectedWordBookId: 'cet4' })
  render(<FactsComponents.LearningFactsEvidence facts={facts} />)
  await userEvent.click(screen.getByText('查看记录依据'))
  const evidence = screen.getByLabelText('事件依据')
  expect(within(evidence).getAllByRole('listitem')).toHaveLength(2)
  expect(within(evidence).getByText(/来源 self-assessment · 原反馈 known/)).toBeInTheDocument()
  expect(within(evidence).getByText(/来源 feedback-correction · 原反馈 无 · 更正引用 0/)).toBeInTheDocument()
})
