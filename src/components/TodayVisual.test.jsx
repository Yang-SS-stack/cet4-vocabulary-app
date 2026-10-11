import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import TodayLearningPage from './TodayLearningPage'
const now = new Date(2026, 9, 2, 12)
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') } })
afterAll(() => { delete HTMLDialogElement.prototype.showModal; delete HTMLDialogElement.prototype.close })
function page(prepare = () => {}, legacy = false) {
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } }, now: () => now })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  prepare(store)
  const rendered = render(<LearningStoreProvider store={store}><TodayLearningPage legacy={legacy} now={now} /></LearningStoreProvider>)
  return { store, ...rendered, corrupt: () => { raw = 'changed' } }
}
function finish(store, task = () => store.getTask('learning')) {
  while (task().currentItemId !== null) {
    const token = () => ({ date: task().date, itemId: task().currentItemId, revision: task().sessionRevision, ...(task().kind === 'extra-learning' ? { kind: task().kind, taskId: task().taskId } : {}) })
    store.submitSelfAssessment(token(), 'known'); store.advanceLearning(token())
  }
}
test('three rings distinguish absent tasks from empty tasks and advice opens without an extending disclosure', () => {
  vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  page(store => store.ensureTask('review', [], 'cet4'), true)
  expect(screen.getByRole('region', { name: '今日新词' })).toHaveTextContent('尚未创建')
  expect(screen.getByRole('region', { name: '额外学习' })).toHaveTextContent('尚未创建')
  expect(screen.getByRole('region', { name: '今日复习' })).toHaveTextContent('本日无复习任务')
  expect(screen.queryByText('0%')).not.toBeInTheDocument()
  const entry = screen.getByRole('button', { name: '学习建议' })
  expect(entry.closest('details')).toBeNull()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.click(entry)
  expect(screen.getByRole('dialog', { name: '学习建议' })).toHaveAttribute('open')
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
test('default task area contains progress and original study actions without separate advice entries', () => {
  const { store } = page()
  const before = JSON.stringify(store.getSnapshot())
  const tasks = screen.getByRole('region', { name: '今日任务进度' })
  expect(within(tasks).getByRole('button', { name: '今日学习' })).toBeInTheDocument()
  expect(within(tasks).getByRole('button', { name: '今日复习' })).toBeInTheDocument()
  expect(within(tasks).getAllByRole('region').map(region => region.getAttribute('aria-label'))).toEqual(['今日新词', '今日复习', '额外学习'])
  expect(screen.queryByRole('button', { name: '学习建议' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '安排本次学习' })).not.toBeInTheDocument()
  expect(JSON.stringify(store.getSnapshot())).toBe(before)
})
test('unavailable summary uses small text in normal flow to reserve its complete height before tasks', () => {
  const styles = document.createElement('style')
  styles.textContent = readFileSync('src/components/TodayLearningPage.css', 'utf8')
  document.head.append(styles)
  try {
    page(store => store.updateSettings({ todayWordBookId: null }))
    const message = screen.getByText('词书资料不完整或不一致，无法计算')
    const summary = message.closest('.learning-overview__status-strip')
    expect(getComputedStyle(message).fontSize).toBe('14px')
    expect(getComputedStyle(summary).position).toBe('static')
    expect(summary.compareDocumentPosition(screen.getByRole('region', { name: '今日任务进度' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  } finally { styles.remove() }
})
test('configured numeric summary keeps its approved compact header positioning', () => {
  const styles = document.createElement('style')
  styles.textContent = readFileSync('src/components/TodayLearningPage.css', 'utf8')
  document.head.append(styles)
  try {
    const { container } = page()
    expect(getComputedStyle(container.querySelector('.learning-overview__status-strip')).position).toBe('absolute')
  } finally { styles.remove() }
})
