import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import TodayLearningPage from './TodayLearningPage'

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') }
})
afterAll(() => { delete HTMLDialogElement.prototype.showModal; delete HTMLDialogElement.prototype.close })
beforeEach(() => { document.body.removeAttribute('style'); vi.spyOn(window, 'scrollTo').mockImplementation(() => {}) })
afterEach(() => { cleanup(); document.body.removeAttribute('style'); document.documentElement.style.removeProperty('scrollbar-gutter'); delete Element.prototype.animate })
const now = new Date(2026, 9, 6, 10)
function page(patch = {}) {
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } }, now: () => now })
  store.updateSettings({ examDate: '2026-10-16', todayWordBookId: 'cet4', dailyNewWords: 24, dailyReviewWords: 20, dailyStudyMinutes: 50, ...patch })
  const rendered = render(<LearningStoreProvider store={store}><TodayLearningPage now={now} /></LearningStoreProvider>)
  return { ...rendered, store, raw: () => raw }
}
function open() {
  const entry = screen.getByRole('button', { name: '学习建议' })
  entry.focus()
  fireEvent.click(entry)
  return { entry, dialog: screen.getByRole('dialog', { name: '学习建议' }) }
}
test('fixed entry opens native dialog with true comparisons and separately accessible evidence', () => {
  const { raw } = page()
  const before = raw()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  const { dialog } = open()
  expect(dialog).toHaveAttribute('open')
  expect(within(dialog).getByRole('tab', { name: '建议' })).toHaveAttribute('aria-selected', 'true')
  const panel = within(dialog).getByRole('tabpanel', { name: '建议' })
  expect(panel).toHaveTextContent('100')
  expect(panel).toHaveTextContent('24')
  expect(panel).toHaveTextContent('约 35')
  expect(panel).toHaveTextContent('分钟 / 天')
  expect(panel).toHaveTextContent('当前设置可能无法在考试前完成')
  fireEvent.click(within(dialog).getByRole('tab', { name: '依据' }))
  const evidence = within(dialog).getByRole('tabpanel', { name: '依据' })
  expect(evidence).toHaveTextContent('每天 455 词')
  expect(evidence).toHaveTextContent('新词 24 · 复习 20 · 计划 50 分钟')
  expect(evidence).toHaveTextContent('新词每词 60 秒、复习每词 20 秒')
  expect(within(evidence).getByRole('link', { name: '词汇间隔研究' })).toHaveAttribute('href', 'https://pubmed.ncbi.nlm.nih.gov/35303977/')
  expect(within(evidence).getAllByRole('link')).toHaveLength(3)
  expect(raw()).toBe(before)
})
test('closing and Escape restore entry focus, original scroll and compensated inline styles', () => {
  document.body.style.overflow = 'auto'
  document.body.style.paddingRight = '7px'
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024)
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000)
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(210)
  page()
  const { entry, dialog } = open()
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.body.style.paddingRight).toBe('31px')
  expect(within(dialog).getByRole('button', { name: '关闭学习建议' })).toHaveFocus()
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(entry).toHaveFocus()
  expect(document.body.style.overflow).toBe('auto')
  expect(document.body.style.paddingRight).toBe('7px')
  expect(scroll).toHaveBeenLastCalledWith(0, 210)
  fireEvent.click(entry)
  fireEvent.click(screen.getByRole('button', { name: '我知道了' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(entry).toHaveFocus()
})

test.each([[null, '未设置'], ['missing-book', '无法确认']])('saved book %s keeps its actual unknown context in the advice dialog', (todayWordBookId, expected) => {
  const { store } = page({ todayWordBookId })
  expect(store.getSnapshot().settings.todayWordBookId).toBe(todayWordBookId)
  const { dialog } = open()
  const panel = within(dialog).getByRole('tabpanel', { name: '建议' })
  expect(panel).toHaveTextContent(`当前词书 ${expected}`)
  expect(panel).not.toHaveTextContent('CET-4')
  expect(panel).toHaveTextContent('请选择词书并核对词书资料')
})

test.each(['stable', 'stable both-edges'])('root gutter %s reserves the gap without added body padding and restores styles', gutter => {
  document.documentElement.style.scrollbarGutter = gutter
  document.body.style.setProperty('overflow', 'auto', 'important')
  document.body.style.setProperty('padding-right', '7px', 'important')
  vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1024)
  vi.spyOn(document.documentElement, 'clientWidth', 'get').mockReturnValue(1000)
  const { unmount } = page()
  const { dialog } = open()
  expect(document.body.style.overflow).toBe('hidden')
  expect(document.body.style.paddingRight).toBe('7px')
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭学习建议' }))
  expect(document.body.style.overflow).toBe('auto')
  expect(document.body.style.getPropertyPriority('overflow')).toBe('important')
  expect(document.body.style.paddingRight).toBe('7px')
  expect(document.body.style.getPropertyPriority('padding-right')).toBe('important')
  open()
  unmount()
  expect(document.body.style.overflow).toBe('auto')
  expect(document.body.style.paddingRight).toBe('7px')
  expect(document.body.style.getPropertyPriority('padding-right')).toBe('important')
})
test('tabs support arrows, Home/End and keep inactive evidence outside the tab order', () => {
  page()
  const { dialog } = open()
  const advice = within(dialog).getByRole('tab', { name: '建议' })
  advice.focus()
  fireEvent.keyDown(advice, { key: 'ArrowRight' })
  const evidence = within(dialog).getByRole('tab', { name: '依据' })
  expect(evidence).toHaveFocus()
  expect(evidence).toHaveAttribute('aria-selected', 'true')
  expect(advice).toHaveAttribute('tabindex', '-1')
  fireEvent.keyDown(evidence, { key: 'Home' })
  expect(advice).toHaveFocus()
  expect(within(dialog).queryByRole('link')).not.toBeInTheDocument()
})
test('unmount clears background scroll lock without leaking changed styles', () => {
  document.body.style.overflow = 'scroll'
  const { unmount } = page()
  open()
  expect(document.body.style.overflow).toBe('hidden')
  unmount()
  expect(document.body.style.overflow).toBe('scroll')
  expect(document.body.style.paddingRight).toBe('')
})
test('unavailable quantities and past date never turn into fabricated recommendation zeros', () => {
  page({ examDate: '2026-10-05', dailyNewWords: 0, dailyReviewWords: 0 })
  const { dialog } = open()
  expect(within(dialog).getByRole('tabpanel', { name: '建议' })).toHaveTextContent('不适用：考试日期为今天或已过去')
  expect(within(dialog).getByRole('tabpanel', { name: '建议' })).toHaveTextContent('约 0')
  fireEvent.click(within(dialog).getByRole('tab', { name: '依据' }))
  expect(within(dialog).getByRole('tabpanel')).toHaveTextContent('约 0 分钟')
})
test('cancelable enter/exit and a live reduced-motion change settle to accessible final state', () => {
  const listeners = new Set()
  const media = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  vi.stubGlobal('matchMedia', () => media)
  const animations = []
  Element.prototype.animate = vi.fn((frames, options) => {
    const animation = { frames, options, cancel: vi.fn(), onfinish: null }
    animations.push(animation)
    return animation
  })
  page()
  const { entry, dialog } = open()
  expect(animations[0].options.duration).toBe(220)
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭学习建议' }))
  expect(animations[0].cancel).toHaveBeenCalled()
  expect(animations[1].options.duration).toBe(180)
  expect(dialog).toHaveAttribute('open')
  act(() => { media.matches = true; listeners.forEach(fn => fn()) })
  expect(animations[1].cancel).toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(entry).toHaveFocus()
})

test('exit completion restores focus once and detached animation callbacks cannot affect a reopened modal', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const animations = []
  Element.prototype.animate = () => {
    const animation = { cancel: vi.fn(), onfinish: null }
    animations.push(animation)
    return animation
  }
  const { unmount } = page()
  const { entry, dialog } = open()
  const oldFinish = animations[0].onfinish
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭学习建议' }))
  act(() => animations[1].onfinish())
  expect(entry).toHaveFocus()
  expect(document.body.style.overflow).toBe('')
  fireEvent.click(entry)
  act(() => oldFinish())
  expect(screen.getByRole('dialog', { name: '学习建议' })).toHaveAttribute('open')
  const last = animations.at(-1)
  unmount()
  expect(last.cancel).toHaveBeenCalled()
})

test('initial reduced motion skips transitions while unknown estimate remains distinct from zero', () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  Element.prototype.animate = vi.fn()
  page({ examDate: null, dailyNewWords: null, dailyReviewWords: null, dailyStudyMinutes: null })
  const { dialog } = open()
  const panel = within(dialog).getByRole('tabpanel', { name: '建议' })
  expect(panel).toHaveTextContent('设置未来考试日期后计算')
  expect(panel).toHaveTextContent('未设置')
  expect(panel).toHaveTextContent('无法估算')
  expect(panel).not.toHaveTextContent('约 0')
  fireEvent.click(within(dialog).getByRole('button', { name: '关闭学习建议' }))
  expect(Element.prototype.animate).not.toHaveBeenCalled()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
