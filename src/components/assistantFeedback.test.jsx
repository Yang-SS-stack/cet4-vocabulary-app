import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import FloatingLearningAssistant from './FloatingLearningAssistant'
import { completeAssistantReply, completeAssistantTurn, requestConfirmedPlan, sendAssistantText } from '../test/assistantClock'

const now = new Date(2026, 9, 10, 12)
function setup(props = {}) {
  vi.useFakeTimers()
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } }, now: () => now })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 20, dailyReviewWords: 20, dailyStudyMinutes: 30 })
  const show = (enabled = true) => <LearningStoreProvider store={store}><FloatingLearningAssistant enabled={enabled} selectedPage="词表" now={now} {...props} /></LearningStoreProvider>
  return { ...render(show()), show, store, raw: () => raw }
}
const tick = ms => act(() => vi.advanceTimersByTime(ms))
const open = () => fireEvent.click(screen.getByRole('button', { name: '学习助手' }))
afterEach(() => vi.useRealTimers())

test('first greeting starts only on opening and completing it once prevents duplicate greetings', () => {
  const { container, raw } = setup(), before = raw()
  expect(container.querySelector('.assistant-message')).toBeNull()
  tick(2000)
  expect(container.querySelector('.assistant-message')).toBeNull()
  open()
  expect(screen.getByRole('status', { name: '助手正在回复' })).toHaveTextContent('模拟')
  completeAssistantReply()
  expect(screen.getByText(/你好！我是你的 LinguaJet 学习助手/, { selector: '.assistant-message__text' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' })); open(); tick(2000)
  expect(container.querySelectorAll('.assistant-message--assistant')).toHaveLength(1)
  expect(raw()).toBe(before)
})

test('review request waits, presents its response, prepares current rules and only then enters review', () => {
  const { store, raw, container } = setup()
  open(); completeAssistantReply()
  const before = raw()
  requestConfirmedPlan('安排复习'); requestConfirmedPlan('安排复习')
  expect(screen.getByText('安排复习 30分钟', { selector: '.assistant-message--user .assistant-message__text' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
  expect(screen.getByRole('status', { name: '助手正在回复' })).toBeVisible()
  expect(screen.getByRole('button', { name: '学习答疑' })).toBeDisabled()
  tick(450)
  expect(container.querySelectorAll('.assistant-message__text')[2]).toHaveTextContent('已')
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
  completeAssistantReply()
  expect(screen.getByText(/已准备优先复习/, { selector: '.assistant-message__text' })).toBeVisible()
  act(() => store.updateSettings({ dailyNewWords: 2 }))
  const latest = raw()
  tick(900)
  expect(screen.getByRole('heading', { name: '特殊学习计划' })).toBeVisible()
  expect(screen.getByRole('article', { name: '本次建议草稿' })).toBeVisible()
  expect(screen.getByRole('button', { name: '优先复习' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByText('今日剩余新词').nextElementSibling).toHaveTextContent('2')
  expect(container.querySelectorAll('.assistant-message--user')).toHaveLength(1)
  expect(raw()).toBe(latest)
  expect(latest).not.toBe(before)
  expect(screen.queryByRole('button', { name: '每日计划设置' })).not.toBeInTheDocument()
})

test.each(['pending', 'reply'])('closing during %s pauses the request and prevents hidden navigation', phase => {
  setup(); open(); completeAssistantReply()
  requestConfirmedPlan('设置学习计划')
  if (phase === 'reply') tick(450)
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' }))
  tick(3000)
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
  open()
  expect(screen.getByRole('status', { name: '助手正在回复' })).toBeVisible()
  completeAssistantTurn()
  expect(screen.getByRole('heading', { name: '特殊学习计划' })).toBeVisible()
})

test('disabled or unmounted assistant cancels a greeting and restarts it only on next open', () => {
  const { rerender, show, unmount } = setup()
  open(); tick(100); rerender(show(false)); tick(3000)
  rerender(show()); open()
  expect(screen.getByRole('status', { name: '助手正在回复' })).toBeVisible()
  completeAssistantReply()
  expect(screen.getAllByText(/你好！我是你的 LinguaJet 学习助手/, { selector: '.assistant-message__text' })).toHaveLength(1)
  requestConfirmedPlan('设置学习计划'); unmount(); tick(3000)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('desktop entry and sole close animate between window and actual moved launcher with bounded exit', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  const { container } = setup(), animations = []
  const panel = container.querySelector('.floating-assistant')
  panel.animate = vi.fn((keys, options) => { const value = { cancel: vi.fn(), onfinish: null }; animations.push({ keys, options, value }); return value })
  const launcher = screen.getByRole('button', { name: '学习助手' })
  vi.spyOn(launcher, 'getBoundingClientRect').mockReturnValue({ left: 45, top: 75, width: 150, height: 48 })
  open()
  expect(animations[0].options.duration).toBe(420)
  const targetTransform = `translate(${45 - parseFloat(panel.style.left)}px, ${75 - parseFloat(panel.style.top)}px)`
  expect(animations[0].keys[0].transform).toContain(targetTransform)
  expect(screen.queryByRole('button', { name: '收起学习助手' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' }))
  expect(animations.at(-1).options.duration).toBe(260)
  expect(animations.at(-1).keys.at(-1).transform).toContain(targetTransform)
  expect(screen.getByRole('dialog')).toBeVisible()
  tick(300)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(launcher).toHaveFocus()
  const oldFinish = animations.at(-1).value.onfinish
  open(); act(() => oldFinish()); completeAssistantReply()
  expect(screen.getByRole('dialog')).toBeVisible()
})

test('mobile header exposes no close controls and reduced motion skips all window movement', () => {
  vi.stubGlobal('innerWidth', 390)
  vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener() {}, removeEventListener() {} }))
  const { container } = setup()
  const panel = container.querySelector('.floating-assistant'), animate = vi.fn()
  panel.animate = animate
  open(); completeAssistantReply()
  expect(within(screen.getByLabelText('移动学习助手窗口')).queryByRole('button')).not.toBeInTheDocument()
  expect(animate).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('exit immediately cancels and rejects requests even before its animation finishes', () => {
  const { container } = setup()
  const panel = container.querySelector('.floating-assistant')
  panel.animate = () => ({ cancel() {}, onfinish: null })
  open(); completeAssistantReply()
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' }))
  requestConfirmedPlan('安排复习')
  tick(3000); open(); tick(3000)
  expect(screen.queryByText('安排复习', { selector: '.assistant-message--user .assistant-message__text' })).not.toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
})

test('desktop shrink follows a default launcher after viewport resize rather than the old captured position', () => {
  const { container } = setup(), calls = []
  const panel = container.querySelector('.floating-assistant')
  panel.animate = (keys, options) => { calls.push({ keys, options }); return { cancel() {}, onfinish: null } }
  const launcher = screen.getByRole('button', { name: '学习助手' })
  vi.spyOn(launcher, 'getBoundingClientRect').mockReturnValue({ left: 850, top: 680, width: 150, height: 48 })
  open()
  vi.stubGlobal('innerWidth', 800); vi.stubGlobal('innerHeight', 600); fireEvent(window, new Event('resize'))
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' }))
  const point = { x: 800 - 150 - 24, y: 600 - 48 - 20 }
  expect(calls.at(-1).keys.at(-1).transform).toContain(`translate(${point.x - parseFloat(panel.style.left)}px, ${point.y - parseFloat(panel.style.top)}px)`)
})

test('original learning starts once after the same shrink animation and never writes an assistant plan', () => {
  const start = vi.fn(), { container, raw } = setup({ onStartLearning: start }), animations = []
  container.querySelector('.floating-assistant').animate = () => { const animation = { cancel() {}, onfinish: null }; animations.push(animation); return animation }
  const before = raw()
  open(); completeAssistantReply()
  requestConfirmedPlan('设置学习计划'); completeAssistantTurn()
  const action = screen.getByRole('button', { name: '按原设置开始学习' })
  fireEvent.click(action); fireEvent.click(action)
  expect(start).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeVisible()
  const finish = animations.at(-1).onfinish
  act(() => finish()); act(() => finish()); tick(1000)
  expect(start).toHaveBeenCalledOnce()
  expect(raw()).toBe(before)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('entering review reveals the prepared result and content changes animate their actual visible surfaces', () => {
  const scroll = vi.fn(), calls = []
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const scrollDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')
  HTMLElement.prototype.scrollIntoView = scroll
  const animateDescriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'animate')
  HTMLElement.prototype.animate = function(keys, options) { calls.push({ element: this, keys, options }); return { cancel() {} } }
  try {
    setup(); open(); completeAssistantReply()
    expect(scroll).not.toHaveBeenCalled() // Conversation growth stays inside its own scroll container.
    requestConfirmedPlan('设置学习计划'); completeAssistantTurn()
    expect(scroll).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' })
    const planAnimation = calls.find(call => call.element.querySelector?.('.assistant-plan') && !call.element.closest('[hidden]') && call.options.duration === 280)
    expect(planAnimation.keys).toEqual([{ opacity: .7, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }])
    const article = screen.getByRole('article', { name: '本次建议草稿' }), before = calls.length
    fireEvent.click(screen.getByRole('button', { name: '微调计划' }))
    expect(calls.slice(before).some(call => call.element === article)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '取消微调' }))
    fireEvent.click(screen.getByRole('button', { name: '采用此计划' }))
    expect(calls.at(-1).element).toBe(article)
    expect(screen.getByRole('button', { name: '确认应用计划' })).toBeDisabled()
  } finally {
    if (scrollDescriptor) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', scrollDescriptor)
    else delete HTMLElement.prototype.scrollIntoView
    if (animateDescriptor) Object.defineProperty(HTMLElement.prototype, 'animate', animateDescriptor)
    else delete HTMLElement.prototype.animate
  }
})

test('animation rejection leaves visible usable content and still closes safely', () => {
  const { container, raw } = setup(), before = raw()
  container.querySelector('.floating-assistant').animate = () => { throw new Error('animation unavailable') }
  open(); completeAssistantReply()
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(screen.getByText(/你好！我是你的 LinguaJet 学习助手/, { selector: '.assistant-message__text' })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(raw()).toBe(before)
})

test('turning on reduced motion finishes an in-flight close once and invalidates its old callback', () => {
  const listeners = new Set()
  const motion = { matches: false, addEventListener: (_, listener) => listeners.add(listener), removeEventListener: (_, listener) => listeners.delete(listener) }
  vi.stubGlobal('matchMedia', () => motion)
  const { container } = setup(), animations = []
  container.querySelector('.floating-assistant').animate = () => { const value = { cancel: vi.fn(), onfinish: null }; animations.push(value); return value }
  open(); completeAssistantReply(); fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' }))
  const oldFinish = animations.at(-1).onfinish
  motion.matches = true; act(() => { for (const listener of [...listeners]) listener() })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(animations.at(-1).cancel).toHaveBeenCalled()
  open(); act(() => oldFinish()); completeAssistantReply(); tick(1000)
  expect(screen.getByRole('dialog')).toBeVisible()
})

test.each([[800, 390], [390, 800], [800, 900]])('closing at %ipx finishes once when resized to %ipx and reopens with working requests', (from, to) => {
  vi.stubGlobal('innerWidth', from)
  const { container, raw } = setup(), animations = []
  const before = raw()
  container.querySelector('.floating-assistant').animate = () => { const value = { cancel: vi.fn(), onfinish: null }; animations.push(value); return value }
  open(); completeAssistantReply()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  const oldFinish = animations.at(-1).onfinish
  vi.stubGlobal('innerWidth', to); fireEvent(window, new Event('resize')); tick(2000)
  act(() => oldFinish())
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.body.style.overflow).not.toBe('hidden')
  expect(screen.getByRole('button', { name: '学习助手' })).toHaveFocus()
  open(); act(() => oldFinish()); completeAssistantReply()
  sendAssistantText('今日任务'); completeAssistantReply()
  expect(screen.getByRole('region', { name: '助手今日任务摘要' })).toBeVisible()
  expect(raw()).toBe(before)
})

test.each([[800, 390], [390, 800]])('original start at %ipx survives resize to %ipx without duplicate or late start', (from, to) => {
  vi.stubGlobal('innerWidth', from)
  const start = vi.fn(), { container, raw } = setup({ onStartLearning: start }), animations = []
  const before = raw()
  container.querySelector('.floating-assistant').animate = () => { const value = { cancel: vi.fn(), onfinish: null }; animations.push(value); return value }
  open(); completeAssistantReply()
  requestConfirmedPlan('设置学习计划'); completeAssistantTurn()
  fireEvent.click(screen.getByRole('button', { name: '按原设置开始学习' }))
  const oldFinish = animations.at(-1).onfinish
  expect(start).not.toHaveBeenCalled()
  vi.stubGlobal('innerWidth', to); fireEvent(window, new Event('resize')); tick(2000)
  expect(start).toHaveBeenCalledOnce()
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(document.body.style.overflow).not.toBe('hidden')
  open(); act(() => oldFinish()); completeAssistantReply(); tick(500)
  expect(screen.getByRole('dialog')).toBeVisible()
  expect(start).toHaveBeenCalledOnce()
  expect(raw()).toBe(before)
})

test('disabling during original-start exit cancels it even after resize and detached animation completion', () => {
  const start = vi.fn(), { container, rerender, show } = setup({ onStartLearning: start }), animations = []
  container.querySelector('.floating-assistant').animate = () => { const value = { cancel() {}, onfinish: null }; animations.push(value); return value }
  open(); completeAssistantReply()
  requestConfirmedPlan('设置学习计划'); completeAssistantTurn()
  fireEvent.click(screen.getByRole('button', { name: '按原设置开始学习' }))
  const oldFinish = animations.at(-1).onfinish
  rerender(show(false))
  vi.stubGlobal('innerWidth', 390); fireEvent(window, new Event('resize')); act(() => oldFinish()); tick(2000)
  expect(start).not.toHaveBeenCalled()
})

test.each([[51, 60, 55], [5, 15, 5]])('draft uses real daily %i words and explicit %i session minutes with true %i-minute estimate and leaves persistence intact', (newWords, minutes, estimate) => {
  const { store, raw } = setup()
  act(() => store.updateSettings({ dailyNewWords: newWords, dailyStudyMinutes: minutes }))
  const before = raw()
  open(); completeAssistantReply()
  requestConfirmedPlan('安排复习', minutes); completeAssistantTurn()
  const article = screen.getByRole('article', { name: '本次建议草稿' })
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveValue(String(minutes))
  expect(screen.getByText('今日剩余新词').nextElementSibling).toHaveTextContent(String(newWords))
  expect(within(article).getByText('新词').nextElementSibling).toHaveTextContent(`${newWords} 词`)
  expect(within(article).getByText('复习').nextElementSibling).toHaveTextContent('0 词')
  expect(within(article).getByText('预计用时').nextElementSibling).toHaveTextContent(`${estimate} 分钟`)
  expect(raw()).toBe(before)
})
