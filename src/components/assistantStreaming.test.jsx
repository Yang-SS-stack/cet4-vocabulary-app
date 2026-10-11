import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import FloatingLearningAssistant from './FloatingLearningAssistant'
import { mockAssistantReply } from './assistantMockConversation'
import * as replies from './assistantMockConversation'
import { completeAssistantReply, requestConfirmedPlan, sendAssistantText } from '../test/assistantClock'

const now = new Date(2026, 9, 10, 12)
const tick = ms => act(() => vi.advanceTimersByTime(ms))
const open = () => fireEvent.click(screen.getByRole('button', { name: '学习助手' }))
const greeting = mockAssistantReply().text
function setup(props = {}, strict = false) {
  vi.useFakeTimers()
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } }, now: () => now })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 20, dailyReviewWords: 20, dailyStudyMinutes: 30 })
  const show = enabled => {
    const content = <LearningStoreProvider store={store}><FloatingLearningAssistant enabled={enabled} selectedPage="词表" now={now} {...props} /></LearningStoreProvider>
    return strict ? <StrictMode>{content}</StrictMode> : content
  }
  return { ...render(show(true)), show, store, raw: () => raw, corrupt: () => { raw = 'invalid' } }
}
const requestPlan = () => { open(); completeAssistantReply(); requestConfirmedPlan('安排复习') }
const failure = kind => { fireEvent.change(screen.getByLabelText('演示状态'), { target: { value: kind } }); fireEvent.click(screen.getByRole('button', { name: '运行演示' })) }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

test('first open grows actual text with one pending indicator and announces only the finished reply', () => {
  const { container, raw } = setup(), before = raw()
  tick(4000); expect(container.querySelector('.assistant-message')).toBeNull()
  open(); const pending = screen.getByRole('status', { name: '助手正在回复' })
  tick(450)
  const bubble = container.querySelector('.assistant-message--assistant .assistant-message__text')
  expect(bubble).not.toBeNull()
  expect(bubble.textContent).toBe('👋')
  expect(container.textContent).not.toContain(greeting)
  expect(screen.getByRole('status', { name: '助手正在回复' })).toBe(pending)
  expect(screen.getByRole('button', { name: '专属练习' })).toBeDisabled()
  expect(screen.getByRole('status', { name: '助手完整回复' })).toBeEmptyDOMElement()
  completeAssistantReply()
  expect(bubble.textContent).toBe(greeting)
  expect(screen.queryByRole('status', { name: '助手正在回复' })).not.toBeInTheDocument()
  expect(screen.getByRole('status', { name: '助手完整回复' }).textContent).toBe(greeting)
  expect(raw()).toBe(before)
})

test.each(['greeting', 'plan'])('folding partial %s preserves the unique bubble and resumes its cursor', kind => {
  const { container, raw } = setup(), before = raw()
  if (kind === 'plan') requestPlan(); else open()
  tick(550)
  const bubbles = container.querySelectorAll('.assistant-message--assistant'), bubble = bubbles[bubbles.length - 1]
  expect(bubble.querySelector('.assistant-message__text')).not.toBeNull()
  const prefix = bubble.querySelector('.assistant-message__text').textContent
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' })); tick(5000)
  expect(bubble.querySelector('.assistant-message__text').textContent).toBe(prefix)
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
  open(); expect(container.querySelectorAll('.assistant-message--assistant')).toHaveLength(bubbles.length)
  tick(25)
  expect(bubble.querySelector('.assistant-message__text').textContent).toBe(Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(kind === 'plan' ? mockAssistantReply('安排复习').text : greeting), part => part.segment).slice(0, Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(prefix)).length + 1).join(''))
  completeAssistantReply(); tick(900)
  if (kind === 'plan') expect(screen.getByRole('heading', { name: '特殊学习计划' })).toBeVisible()
  else { fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' })); open(); tick(5000); expect(container.querySelectorAll('.assistant-message--assistant')).toHaveLength(1) }
  expect(raw()).toBe(before)
})

test('completed plan text enables requests before the read pause and fresh basis entry resumes only while open', () => {
  const { store, container } = setup()
  requestPlan(); requestConfirmedPlan('安排复习')
  const text = mockAssistantReply('安排复习').text, duration = 450 + (Array.from(text).length - 1) * 25
  tick(duration - 25)
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '学习答疑' })).toBeDisabled()
  tick(25)
  expect(screen.getByRole('button', { name: '学习答疑' })).toBeEnabled()
  expect(container.querySelectorAll('.assistant-message--user')).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' })); tick(5000)
  act(() => store.updateSettings({ dailyNewWords: 2 }))
  open(); tick(899)
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
  tick(1)
  expect(screen.getByRole('heading', { name: '特殊学习计划' })).toBeVisible()
  expect(screen.getByText('今日剩余新词').nextElementSibling).toHaveTextContent('2')
})

test('reduced motion changes complete active text through the same completion path', () => {
  const listeners = new Set(), motion = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  vi.stubGlobal('matchMedia', () => motion)
  setup(); requestPlan(); tick(475)
  motion.matches = true; act(() => [...listeners].forEach(fn => fn()))
  expect(screen.getByText(mockAssistantReply('安排复习').text, { selector: '.assistant-message__text' })).toBeVisible()
  expect(screen.getByRole('button', { name: '学习答疑' })).toBeEnabled()
  tick(900); expect(screen.getByRole('heading', { name: '特殊学习计划' })).toBeVisible()
})

test('disabled and unmounted requests never run late transitions', () => {
  const { rerender, show, unmount, container } = setup()
  requestPlan(); tick(500); rerender(show(false)); tick(5000)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  rerender(show(true)); open(); tick(5000)
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
  requestConfirmedPlan('安排复习'); unmount(); tick(5000)
  expect(container).toBeEmptyDOMElement()
})

test('timeout hides adoption and locally retries from fresh real rules without writes', () => {
  const { store, raw } = setup(); requestPlan(); tick(4000)
  fireEvent.change(screen.getByRole('slider', { name: '本次可用时间' }), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: '生成规则建议' }))
  fireEvent.click(screen.getByRole('button', { name: '采用此计划' }))
  failure('timeout')
  expect(screen.getByRole('heading', { name: '特殊学习计划' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: '确认学习草稿' })).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: '生成建议超时' })).toBeVisible()
  expect(screen.getByRole('region', { name: '建议异常提示' })).toHaveTextContent('模拟状态 · 未接入模型')
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '确认应用计划' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '按原设置开始学习' })).toBeEnabled()
  act(() => store.updateSettings({ dailyNewWords: 3 }))
  expect(screen.queryByRole('slider', { name: '本次可用时间' })).not.toBeInTheDocument()
  const before = raw()
  fireEvent.click(screen.getByRole('button', { name: '重试', exact: true }))
  const draft = screen.getByRole('article', { name: '本次建议草稿' })
  expect(within(draft).getByText('新词').nextElementSibling).toHaveTextContent('3 词')
  expect(screen.getByRole('slider')).toHaveValue('5')
  expect(screen.getByRole('button', { name: '优先复习' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.queryByRole('region', { name: '建议异常提示' })).not.toBeInTheDocument()
  expect(raw()).toBe(before)
  act(() => store.updateSettings({ dailyNewWords: 2 }))
  expect(screen.getByRole('button', { name: '采用此计划' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '微调计划' })).toBeDisabled()
  expect(screen.getByText(/依据或输入已变化/)).toBeInTheDocument()
})

test('quota keeps only the original-study recovery action without writes', () => {
  const onStartLearning = vi.fn()
  const { raw } = setup({ onStartLearning }); requestPlan(); tick(4000)
  fireEvent.click(screen.getByRole('button', { name: '采用此计划' }))
  failure('quota')
  const before = raw(), card = screen.getByRole('region', { name: '建议异常提示' })
  expect(card).toHaveTextContent('模拟状态 · 未接入模型')
  expect(within(card).getAllByRole('button')).toHaveLength(1)
  expect(screen.queryByRole('button', { name: '重试', exact: true })).not.toBeInTheDocument()
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '确认应用计划' })).not.toBeInTheDocument()
  fireEvent.click(within(card).getByRole('button', { name: '按原设置开始学习' }))
  expect(onStartLearning).toHaveBeenCalledOnce()
  expect(raw()).toBe(before)
})

test('local retry rejects unreadable persistence and does not reveal a stale successful draft', () => {
  const { corrupt, raw } = setup(); requestPlan(); tick(4000); failure('timeout'); corrupt()
  const before = raw(); fireEvent.click(screen.getByRole('button', { name: '重试', exact: true }))
  expect(screen.getByRole('alert')).toHaveTextContent('学习记录已变化或无法读取')
  expect(screen.getByRole('region', { name: '建议异常提示' })).toBeVisible()
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
  expect(raw()).toBe(before)
})

test.each([[1242, false], [500, false], [1242, true]])('typed submission at width %i (strict %s) crosses the composer/scroll boundary and lands once', (width, strict) => {
  vi.stubGlobal('innerWidth', width)
  const { container } = setup({}, strict); open(); completeAssistantReply()
  const input = screen.getByRole('textbox', { name: '学习要求' })
  const rect = { left: 50, top: 450, width: 240, height: 44 }
  vi.spyOn(input, 'getBoundingClientRect').mockReturnValue(rect)
  const calls = []
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function() { return this.classList.contains('assistant-message--user') ? { left: 160, top: 200, width: 180, height: 70 } : rect })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: function(frames, options) { const animation = { cancel: vi.fn() }; calls.push({ element: this, frames, options, animation }); return animation } })
  try {
    fireEvent.change(input, { target: { value: '我的要求 👩‍🚀' } }); fireEvent.submit(input.closest('form'))
    const bubbles = container.querySelectorAll('.assistant-message--user')
    expect(bubbles).toHaveLength(1)
    const call = calls.find(call => call.options.duration === 350 && call.element.isConnected)
    expect(call).toBeDefined()
    // The input is outside the scrolling stage. Its visible flight must be too.
    expect(call.element.closest('.assistant-stage')).toBeNull()
    expect(call.element.closest('.assistant-layout')).not.toBeNull()
    expect(call.element.closest('[aria-hidden="true"]')).not.toBeNull()
    expect(call.element.style.left).toBe('110px')
    expect(call.element.style.top).toBe('-250px')
    expect(call.element.style.width).toBe('180px')
    expect(call.element.style.height).toBe('70px')
    expect(within(screen.getByRole('log')).getAllByText('我的要求 👩‍🚀')).toHaveLength(1)
    expect(bubbles[0]).toHaveClass('is-sending')
    expect(call.frames[0].transform).toContain('translate(-110px, 250px)')
    expect(input).toHaveValue('')
    act(() => call.animation.onfinish())
    expect(call.element).not.toBeInTheDocument()
    expect(bubbles[0]).not.toHaveClass('is-sending')
    completeAssistantReply()
    fireEvent.change(input, { target: { value: '第二条要求' } }); fireEvent.submit(input.closest('form'))
    const next = calls.find(call => call.options.duration === 350 && call.element.isConnected)
    expect(next).toBeDefined()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(next.animation.cancel).toHaveBeenCalled()
    expect(next.element).not.toBeInTheDocument()
    const attempts = calls.filter(call => call.options.duration === 350).length
    tick(400); open()
    expect(calls.filter(call => call.options.duration === 350)).toHaveLength(attempts)
  } finally { delete HTMLElement.prototype.animate }
})

test.each(['学习计划', '单词记忆', '专属练习', '学习答疑'].flatMap(name => [1242, 500].map(width => [name, width])))('shortcut %s at width %i sends from its own center without moving the button', (name, width) => {
  vi.stubGlobal('innerWidth', width)
  const { container, raw } = setup(); open(); completeAssistantReply()
  const before = raw(), button = screen.getByRole('button', { name, exact: true }), input = screen.getByRole('textbox', { name: '学习要求' }), calls = []
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function() {
    return this === button ? { left: 80, top: 400, width: 100, height: 36 } : { left: 160, top: 200, width: 180, height: 70 }
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: function(frames, options) { const animation = { cancel: vi.fn() }; calls.push({ element: this, frames, options, animation }); return animation } })
  try {
    fireEvent.click(button)
    const call = calls.find(call => call.options.duration === 300 && call.element.isConnected)
    expect(call).toBeDefined()
    expect(call.element.closest('.assistant-stage')).toBeNull()
    expect(call.element.style.transformOrigin).toBe('center center')
    expect(call.frames[0].transform).toBe('translate(-120px, 183px) scale(.72)')
    expect(call.element).toHaveTextContent(name)
    expect(button).toBeInTheDocument(); expect(button).toBeDisabled()
    expect(calls.some(call => call.element === button)).toBe(false)
    fireEvent.click(button)
    expect(container.querySelectorAll('.assistant-message--user')).toHaveLength(1)
    expect(input).toHaveValue('')
    act(() => call.animation.onfinish())
    expect(call.element).not.toBeInTheDocument()
    expect(container.querySelector('.assistant-message--user')).not.toHaveClass('is-sending')
    completeAssistantReply(); expect(raw()).toBe(before)
  } finally { delete HTMLElement.prototype.animate }
})

test('a shortcut with typed text still sends from the input and keeps the explicit request', () => {
  const { container } = setup(); open(); completeAssistantReply()
  const input = screen.getByRole('textbox', { name: '学习要求' }), button = screen.getByRole('button', { name: '学习答疑', exact: true }), calls = []
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function() {
    return this === input ? { left: 50, top: 450, width: 240, height: 44 } : { left: 160, top: 200, width: 180, height: 70 }
  })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: function(frames, options) { calls.push({ frames, options }); return { cancel() {} } } })
  try {
    fireEvent.change(input, { target: { value: '这个句子的语法是什么？' } }); fireEvent.click(button)
    expect(container.querySelector('.assistant-message--user')).toHaveTextContent('这个句子的语法是什么？')
    expect(calls.find(call => call.options.duration === 350).frames[0].transform).toContain('translate(-110px, 250px)')
    expect(calls.some(call => call.options.duration === 300)).toBe(false)
  } finally { delete HTMLElement.prototype.animate }
})

test.each(['unsupported', 'reduced', 'reduce-during-flight'].flatMap(mode => ['input', 'shortcut'].map(source => [mode, source])))('send motion settles without losing or duplicating the message: %s / %s', (mode, source) => {
  const listeners = new Set(), motion = { matches: mode === 'reduced', addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  vi.stubGlobal('matchMedia', () => motion)
  const { container, raw } = setup(); open(); completeAssistantReply()
  const before = raw(), input = screen.getByRole('textbox', { name: '学习要求' }), animations = []
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 50, top: 200, width: 180, height: 44 })
  Object.defineProperty(HTMLElement.prototype, 'animate', { configurable: true, value: function(_, options) {
    if (mode === 'unsupported') throw Error('animation unavailable')
    const animation = { cancel: vi.fn() }; animations.push({ animation, options }); return animation
  } })
  try {
    if (source === 'input') { fireEvent.change(input, { target: { value: '解释这个句子' } }); fireEvent.submit(input.closest('form')) }
    else fireEvent.click(screen.getByRole('button', { name: '学习答疑', exact: true }))
    if (mode === 'reduce-during-flight') {
      expect(container.querySelector('.assistant-message--flight')).not.toBeNull()
      motion.matches = true; act(() => [...listeners].forEach(fn => fn()))
      expect(animations.find(value => value.options.duration === (source === 'input' ? 350 : 300)).animation.cancel).toHaveBeenCalledOnce()
    }
    expect(container.querySelector('.assistant-message--flight')).toBeNull()
    expect(container.querySelectorAll('.assistant-message--user')).toHaveLength(1)
    expect(container.querySelector('.assistant-message--user')).not.toHaveClass('is-sending')
    expect(input).toHaveValue('')
    completeAssistantReply(); expect(raw()).toBe(before)
  } finally { delete HTMLElement.prototype.animate }
})


test('Unicode graphemes grow intact and unsupported animation cannot block completion', () => {
  vi.spyOn(replies, 'mockAssistantReply').mockReturnValue({ text: '👩‍🚀a\u0301你好', stage: 'conversation' })
  const { container } = setup(); open(); tick(450)
  expect(container.querySelector('.assistant-message__text')).toHaveTextContent('👩‍🚀')
  tick(25); expect(container.querySelector('.assistant-message__text').textContent).toBe('👩‍🚀a\u0301')
  tick(50); expect(screen.getByRole('status', { name: '助手完整回复' })).toHaveTextContent('👩‍🚀a\u0301你好')
})


test('a new request during read pause cancels the old plan hop and clears its live announcement', () => {
  setup(); requestPlan(); tick(450 + (Array.from(mockAssistantReply('安排复习').text).length - 1) * 25)
  sendAssistantText('今日任务')
  expect(screen.getByRole('status', { name: '助手完整回复' })).toBeEmptyDOMElement()
  tick(4000)
  expect(screen.getByRole('region', { name: '助手今日任务摘要' })).toBeVisible()
  expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
})

test('motion preference changed while folded preserves the paused prefix until reopening', () => {
  const listeners = new Set(), motion = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  vi.stubGlobal('matchMedia', () => motion)
  const { container } = setup(); open(); tick(500)
  const bubble = container.querySelector('.assistant-message__text'), prefix = bubble.textContent
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' }))
  motion.matches = true; act(() => [...listeners].forEach(fn => fn())); tick(5000)
  expect(bubble.textContent).toBe(prefix)
  open(); tick(25)
  expect(bubble.textContent).toBe(greeting)
})

test('waiting time pauses rather than reissues a greeting and pending stays one node after reopening', () => {
  const { container } = setup(); open(); tick(100)
  fireEvent.click(screen.getByRole('button', { name: '关闭学习助手' })); tick(5000); open(); tick(349)
  expect(container.querySelector('.assistant-message')).toBeNull()
  expect(screen.getAllByRole('status', { name: '助手正在回复' })).toHaveLength(1)
  tick(1); expect(container.querySelector('.assistant-message__text')).toHaveTextContent('👋')
  tick(4000); expect(container.querySelectorAll('.assistant-message--assistant')).toHaveLength(1)
})

test('plan replies prepare true rules before their first character and unreadable data gets a truthful answer', () => {
  const { corrupt, container } = setup(); requestPlan(); corrupt(); tick(450)
  expect(container.querySelectorAll('.assistant-message__text')[2]).toHaveTextContent('当')
  tick(4000)
  const reply = container.querySelectorAll('.assistant-message--assistant .assistant-message__text')[1]
  expect(reply).toHaveTextContent('当前资料不足以安排可采用的计划')
  expect(screen.getByRole('heading', { name: '特殊学习计划' })).toBeVisible()
  expect(screen.queryByRole('button', { name: '采用此计划' })).not.toBeInTheDocument()
})
