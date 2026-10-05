import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import StatisticsPage from './StatisticsPage'
import * as factsModule from '../data/assistant/facts'
const now = new Date(2026, 9, 2, 12)
function page(prepare = () => {}) {
  let raw = null, date = now
  const storage = { getItem: () => raw, setItem: vi.fn((_, value) => { raw = value }) }
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
  const store = createLearningStore({ storage, now: () => date })
  store.updateSettings({ todayWordBookId: 'cet4' })
  prepare(store, value => { date = value })
  storage.setItem.mockClear()
  const rendered = render(<LearningStoreProvider store={store}><StatisticsPage now={now} /></LearningStoreProvider>)
  return { ...rendered, store, storage, fetch, changeRaw: value => { raw = value } }
}
function finish(store, word) { for (let i = 0; i < 3; i++) store.recordFeedback('learning', word, 'known') }
test('defaults to all saved history; independent book and date controls never write settings or send requests', () => {
  const { store, storage, fetch } = page((store, date) => {
    date(new Date(2026, 7, 1, 12)); store.ensureTask('learning', ['old'], 'cet4'); finish(store, 'old')
    date(now); store.ensureTask('learning', ['today'], 'cet4'); finish(store, 'today')
  })
  expect(screen.getByRole('button', { name: '全部', pressed: true })).toBeInTheDocument()
  expect(within(screen.getByRole('region', { name: '累计完成' })).getByLabelText('累计完成 2 词次')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '今日', exact: true }))
  expect(screen.getByLabelText('累计完成 1 词次')).toBeInTheDocument()
  expect(screen.getByLabelText('已学 2 词')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'CET-4 高频', exact: true }))
  expect(screen.getByLabelText('已学 0 词')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '今日', pressed: true })).toBeInTheDocument()
  expect(store.getSnapshot().settings.todayWordBookId).toBe('cet4')
  expect(storage.setItem).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
})
test('self feedback toggle distinguishes recorded and corrected data; raw choice and corrections stay separate', () => {
  page(store => {
    store.ensureTask('learning', ['alpha'], 'cet4')
    const token = () => { const task = store.getTask('learning'); return { date: task.date, itemId: task.currentItemId, revision: task.sessionRevision } }
    store.submitSelfAssessment(token(), 'known'); store.correctLearningFeedback(token())
  })
  const self = screen.getByRole('region', { name: '自评反馈' })
  expect(within(self).getByText('模糊 1（100%）')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '原记录', exact: true }))
  expect(within(self).getByText('认识 1（100%）')).toBeInTheDocument()
  expect(screen.getByRole('region', { name: '选择作答（原记录）' })).toHaveTextContent('尚无选择作答')
  expect(screen.getByRole('region', { name: '反馈更正' })).toHaveTextContent('自评 1')
  expect(screen.getByText('数据说明').closest('details')).not.toHaveAttribute('open')
})
test('empty history retains true zero, empty tracks, and no invented feedback', () => {
  page()
  expect(screen.getByLabelText('已学 0 词')).toBeInTheDocument()
  expect(screen.getByLabelText('累计完成 0 词次')).toBeInTheDocument()
  expect(screen.getByText('这段时间尚无完成记录')).toBeInTheDocument()
  expect(screen.getByText('尚无自评反馈')).toBeInTheDocument()
})
test('failed consistent read is unavailable, never zero', () => {
  const { rerender, store, storage, fetch, changeRaw } = page()
  changeRaw('changed externally')
  rerender(<LearningStoreProvider store={store}><StatisticsPage now={new Date(now)} /></LearningStoreProvider>)
  expect(screen.getByRole('alert')).toHaveTextContent('学习记录已变化或无法读取，请重新载入页面。')
  expect(screen.queryByLabelText('已学 0 词')).not.toBeInTheDocument()
  expect(storage.setItem).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled()
})
test('date filters preserve current due burden and label projected historical records', () => {
  const { store, storage } = page((store, date) => {
    date(new Date(2026, 8, 1, 12)); store.ensureTask('learning', ['old'], 'cet4'); finish(store, 'old'); date(now)
  })
  const before = store.getSnapshot()
  const burden = screen.getByRole('region', { name: '当前复习负担' }).textContent
  fireEvent.click(screen.getByRole('button', { name: '近7天' }))
  expect(screen.getByRole('region', { name: '当前复习负担' })).toHaveTextContent(burden)
  expect(store.getSnapshot()).toBe(before); expect(store.getTask('review')).toBeNull(); expect(storage.setItem).not.toHaveBeenCalled()
})
test('live store changes update the displayed final data', () => {
  const { store } = page()
  act(() => { store.ensureTask('learning', ['new'], 'cet4'); finish(store, 'new') })
  expect(screen.getByLabelText('已学 1 词')).toBeInTheDocument()
  expect(screen.getByLabelText('累计完成 1 词次')).toBeInTheDocument()
})
test('feedback conflicts display unavailable instead of zero or invented proportions', () => {
  const { store, rerender } = page(store => {
    store.ensureTask('learning', ['alpha'], 'cet4')
    const task = store.getTask('learning')
    store.submitSelfAssessment({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision }, 'known')
  })
  const saved = structuredClone(store.getSnapshot())
  const task = saved.days['2026-10-02'].learning
  task.feedbackEvents.push({ ...task.feedbackEvents[0], feedback: 'unknown' })
  vi.spyOn(store, 'readAssistantSnapshot').mockReturnValue({ snapshot: saved })
  rerender(<LearningStoreProvider store={store}><StatisticsPage now={now} /></LearningStoreProvider>)
  expect(screen.getByRole('region', { name: '自评反馈' })).toHaveTextContent('不可计算：自评记录存在冲突')
  expect(screen.queryByText('尚无自评反馈')).not.toBeInTheDocument()
})

test('same-day unrelated renders reuse the history projection, but a newly due review updates the burden', () => {
  const calculate = vi.spyOn(factsModule, 'buildStatisticsFacts')
  const { store, rerender } = page(store => store.addToReview('cet4', 'later', { nextReviewAt: new Date(2026, 9, 2, 14).toISOString() }))
  const view = date => <LearningStoreProvider store={store}><StatisticsPage now={date} /></LearningStoreProvider>
  expect(screen.getByRole('region', { name: '当前复习负担' })).toHaveTextContent('当前到期 0')
  rerender(view(new Date(2026, 9, 2, 12, 1))); expect(calculate).toHaveBeenCalledTimes(1)
  rerender(view(new Date(2026, 9, 2, 15))); expect(calculate).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('region', { name: '当前复习负担' })).toHaveTextContent('当前到期 1')
})
