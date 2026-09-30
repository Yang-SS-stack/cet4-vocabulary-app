import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import { createInlineWordBookSession } from '../data/wordBookSession'
import TodayLearningPage from './TodayLearningPage'

vi.mock('../data/audioManifest', () => ({ loadAudioManifest: async () => ({ words: { alpha: { 'en-GB': '/alpha' } } }) }))
const words = ['alpha', 'beta', 'gamma', 'delta'].map(word => ({ word, meaning: word, example: `${word} example` }))
let play
beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  play = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('Audio', class { play = play; pause = vi.fn() })
})
afterEach(() => vi.useRealTimers())
function setup(loadBook = vi.fn(async () => createInlineWordBookSession(words)), review = false) {
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } }, now: () => new Date(2026, 8, 30, 12) })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1, dailyReviewWords: 1, pronunciation: 'en-GB' })
  if (review) store.addToReview('cet4', 'alpha', { nextReviewAt: new Date(2026, 8, 30).toISOString() })
  const focus = vi.fn()
  const rendered = render(<LearningStoreProvider store={store}><TodayLearningPage loadBook={loadBook} onFocusModeChange={focus} /></LearningStoreProvider>)
  return { store, loadBook, focus, ...rendered }
}
test('fades the overview once, then waits for study entry before speech and interaction', async () => {
  const env = setup()
  const button = screen.getByRole('button', { name: '今日学习' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(screen.getByRole('region', { name: '今日学习概览' })).toHaveAttribute('inert')
  expect(env.loadBook).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(179))
  expect(env.focus).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(env.loadBook).toHaveBeenCalledOnce()
  expect(screen.getByRole('region', { name: '今日学习练习' })).toHaveAttribute('inert')
  expect(play).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(239))
  expect(play).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(screen.getByRole('region', { name: '今日学习练习' })).not.toHaveAttribute('inert')
  expect(play).toHaveBeenCalledOnce()
  expect(env.focus).toHaveBeenCalledExactlyOnceWith(true)
})

test('review shares overview fade, double-click guard and entry gate, and returns focus to review', async () => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  const env = setup(undefined, true)
  const button = screen.getByRole('button', { name: '今日复习' })
  fireEvent.click(button); fireEvent.click(button)
  expect(env.loadBook).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(180))
  expect(env.loadBook).toHaveBeenCalledOnce(); expect(play).not.toHaveBeenCalled()
  expect(screen.getByRole('region', { name: '今日复习练习' })).toHaveAttribute('inert')
  await act(async () => vi.advanceTimersByTimeAsync(240))
  expect(play).toHaveBeenCalledOnce(); expect(env.focus).toHaveBeenCalledExactlyOnceWith(true)
  fireEvent.click(screen.getByRole('button', { name: '返回主界面' })); fireEvent.click(screen.getByRole('button', { name: '确认退出' }))
  await act(async () => vi.advanceTimersByTimeAsync(239)); expect(screen.queryByRole('button', { name: '今日复习' })).not.toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(1)); expect(screen.getByRole('button', { name: '今日复习' })).toHaveFocus()
})

test('reduced motion review enters once immediately', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const env = setup(undefined, true); const button = screen.getByRole('button', { name: '今日复习' })
  fireEvent.click(button); fireEvent.click(button)
  await act(async () => Promise.resolve())
  expect(env.loadBook).toHaveBeenCalledOnce()
  expect(screen.getByRole('region', { name: '今日复习练习' })).not.toHaveAttribute('inert')
})
test('unmounting during the overview fade never enters or starts loading', async () => {
  const env = setup()
  fireEvent.click(screen.getByRole('button', { name: '今日学习' }))
  env.unmount()
  await act(async () => vi.advanceTimersByTimeAsync(500))
  expect(env.loadBook).not.toHaveBeenCalled()
  expect(env.focus).not.toHaveBeenCalled()
})
test('a slow first word also finishes its own reveal before automatic speech', async () => {
  let resolve
  setup(() => new Promise(done => { resolve = done }))
  fireEvent.click(screen.getByRole('button', { name: '今日学习' }))
  await act(async () => vi.advanceTimersByTimeAsync(180))
  await act(async () => vi.advanceTimersByTimeAsync(270))
  await act(async () => resolve(createInlineWordBookSession(words)))
  expect(screen.getByRole('heading', { name: 'alpha' })).toBeInTheDocument()
  expect(play).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(239))
  expect(play).not.toHaveBeenCalled()
  await act(async () => vi.advanceTimersByTimeAsync(1))
  expect(play).toHaveBeenCalledOnce()
})
test('reduced motion enters immediately and slow or failed data shows the correct loading state', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  let reject
  const loader = vi.fn(() => new Promise((_, fail) => { reject = fail }))
  setup(loader)
  fireEvent.click(screen.getByRole('button', { name: '今日学习' }))
  expect(loader).toHaveBeenCalledOnce()
  expect(screen.getByRole('region', { name: '今日学习练习' })).not.toHaveAttribute('inert')
  expect(screen.queryByRole('status', { name: '正在准备学习' })).not.toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(200))
  expect(screen.getByRole('status', { name: '正在准备学习' })).toBeInTheDocument()
  await act(async () => reject(Error('offline')))
  expect(screen.queryByRole('status', { name: '正在准备学习' })).not.toBeInTheDocument()
  expect(screen.getByRole('alert')).toHaveTextContent('词书加载失败')
  expect(play).not.toHaveBeenCalled()
})
