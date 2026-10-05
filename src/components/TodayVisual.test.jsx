import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import TodayLearningPage from './TodayLearningPage'
const now = new Date(2026, 9, 2, 12)
function page(prepare = () => {}) {
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } }, now: () => now })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  prepare(store)
  const rendered = render(<LearningStoreProvider store={store}><TodayLearningPage now={now} /></LearningStoreProvider>)
  return { store, ...rendered, corrupt: () => { raw = 'changed' } }
}
function finish(store, task = () => store.getTask('learning')) {
  while (task().currentItemId !== null) {
    const token = () => ({ date: task().date, itemId: task().currentItemId, revision: task().sessionRevision, ...(task().kind === 'extra-learning' ? { kind: task().kind, taskId: task().taskId } : {}) })
    store.submitSelfAssessment(token(), 'known'); store.advanceLearning(token())
  }
}
test('three rings distinguish absent tasks from assigned empty tasks and collapse recommendations', () => {
  page(store => store.ensureTask('review', [], 'cet4'))
  expect(screen.getByRole('region', { name: '今日新词' })).toHaveTextContent('尚未创建')
  expect(screen.getByRole('region', { name: '额外学习' })).toHaveTextContent('尚未创建')
  expect(screen.getByRole('region', { name: '今日复习' })).toHaveTextContent('本日无复习任务')
  expect(screen.queryByText('0%')).not.toBeInTheDocument()
  const details = screen.getByText('学习建议').closest('details')
  expect(details).not.toHaveAttribute('open')
  fireEvent.click(screen.getByText('学习建议')); expect(details).toHaveAttribute('open')
})
test('fixed rings retain task books and assigned counts after settings change', () => {
  page(store => { store.ensureTask('learning', ['a', 'b'], 'cet4'); store.ensureTask('review', ['c'], 'cet4'); store.updateSettings({ todayWordBookId: 'cet4-high-frequency', dailyNewWords: 20 }) })
  expect(screen.getByRole('region', { name: '今日新词' })).toHaveTextContent('CET-4')
  expect(screen.getByRole('img', { name: '今日新词：已完成 0 / 2 词，0%' })).toBeInTheDocument()
  expect(screen.getByRole('img', { name: '今日复习：已完成 0 / 1 词，0%' })).toBeInTheDocument()
})
test('extra ring uses only the current batch, and live progress uses actual task values', () => {
  const { store } = page(store => {
    store.ensureTodayLearning('cet4', ['daily']); finish(store)
    const words = ['daily', ...Array.from({ length: 15 }, (_, i) => `extra${i}`)]
    store.ensureExtraLearning(words); finish(store, () => store.getExtraLearning()); store.ensureExtraLearning(words)
  })
  expect(screen.getByRole('img', { name: '额外学习：已完成 0 / 5 词，0%' })).toBeInTheDocument()
  act(() => finish(store, () => store.getExtraLearning()))
  expect(screen.getByRole('img', { name: '额外学习：已完成 5 / 5 词，100%' })).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '额外学习' })).getByText('本轮进度')).toBeInTheDocument()
})
test('unreadable records show an error rather than absent or zero progress', () => {
  const { store, corrupt, rerender } = page(); corrupt()
  rerender(<LearningStoreProvider store={store}><TodayLearningPage now={now} /></LearningStoreProvider>)
  expect(screen.getByRole('region', { name: '今日新词' })).toHaveTextContent('资料异常')
  expect(screen.queryByRole('img', { name: /已完成 0/ })).not.toBeInTheDocument()
})
