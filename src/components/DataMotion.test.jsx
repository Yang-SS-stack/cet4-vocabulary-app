import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
import { CompletionChart, FeedbackDonut, SegmentedBar } from './DataCharts'
const modules = import.meta.glob('./DataMotion.jsx', { eager: true })
const Motion = modules['./DataMotion.jsx']
let frames, next, media, listeners, animations
beforeEach(() => {
  frames = new Map(); next = 0; listeners = new Set(); animations = []
  media = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  vi.stubGlobal('matchMedia', () => media)
  vi.stubGlobal('requestAnimationFrame', fn => { frames.set(++next, fn); return next })
  vi.stubGlobal('cancelAnimationFrame', id => frames.delete(id))
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  Object.defineProperty(document, 'timeline', { configurable: true, value: { currentTime: 123 } })
  Element.prototype.animate = vi.fn(function (keyframes, options) {
    const animation = { cancel: vi.fn(), keyframes, options, target: this, playState: 'running' }
    animations.push(animation)
    return animation
  })
})
function tick(time) { act(() => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn(time)) }) }
function count(value, replayKey = 'book') { expect(Motion?.AnimatedCount).toBeTypeOf('function'); return <Motion.AnimatedCount value={value} label={`已学 ${value} 词`} replayKey={replayKey} /> }
test('count is monotonic and reaches the exact accessible final value in the magnitude budget', () => {
  render(count(4120)); expect(screen.getByLabelText('已学 4120 词')).toHaveTextContent('4,120')
  const visual = document.querySelector('[aria-hidden="true"]')
  tick(0); tick(400); const mid = Number(visual.textContent.replaceAll(',', '')); expect(mid).toBeGreaterThan(0); expect(mid).toBeLessThan(4120)
  tick(1100); expect(visual.textContent).toBe('4,120'); expect(frames.size).toBe(0)
})
test('live changes continue from visible value, replay resets only on a new key, stale frames cancel and unmount cleans up', () => {
  const { rerender, unmount } = render(count(860)); tick(0); tick(400)
  const visual = document.querySelector('[aria-hidden="true"]'); const previous = Number(visual.textContent)
  rerender(count(1000)); expect(Number(visual.textContent)).toBe(previous)
  tick(500); tick(1700); expect(visual.textContent).toBe('1,000')
  rerender(count(1000)); expect(frames.size).toBe(0)
  rerender(count(12, 'other')); expect(visual.textContent).toBe('0'); expect(frames.size).toBe(1)
  unmount(); expect(frames.size).toBe(0); expect(listeners.size).toBe(0)
})
test('dynamic reduced motion and hidden document cancel work and immediately show the latest final value', () => {
  const { rerender } = render(count(860)); tick(0); tick(100)
  act(() => { media.matches = true; listeners.forEach(fn => fn()) })
  expect(document.querySelector('[aria-hidden="true"]')).toHaveTextContent('860'); expect(frames.size).toBe(0)
  act(() => { media.matches = false; listeners.forEach(fn => fn()) }); rerender(count(4120, 'other'))
  act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  expect(document.querySelector('[aria-hidden="true"]')).toHaveTextContent('4,120'); expect(frames.size).toBe(0)
})
test('reveals preserve final content, cancel on preference/hidden change, and do not replay unrelated rerenders', () => {
  expect(Motion?.DataReveal).toBeTypeOf('function')
  const view = key => <Motion.DataReveal replayKey={key}><span>final data</span></Motion.DataReveal>
  const { rerender, unmount } = render(view('a')); expect(screen.getByText('final data')).toBeVisible(); expect(animations).toHaveLength(1)
  rerender(view('a')); expect(animations).toHaveLength(1)
  rerender(view('b')); expect(animations[0].cancel).toHaveBeenCalled(); expect(animations).toHaveLength(2)
  act(() => { media.matches = true; listeners.forEach(fn => fn()) }); expect(animations[1].cancel).toHaveBeenCalled()
  unmount(); expect(listeners.size).toBe(0)
})
test('animation startup failures preserve final visual values and unknown values never animate', () => {
  vi.stubGlobal('requestAnimationFrame', () => { throw Error('unavailable') })
  const { rerender } = render(count(860))
  expect(document.querySelector('[aria-hidden="true"]')).toHaveTextContent('860')
  rerender(count(null, 'unknown')); expect(document.querySelector('[aria-hidden="true"]')).toHaveTextContent('不可计算')
})
test('reduced motion starts at final values and rings cancel updates and hidden-page animation', () => {
  expect(Motion?.ProgressRing).toBeTypeOf('function')
  media.matches = true
  const { rerender, unmount } = render(<Motion.ProgressRing value={2} total={10} label="新词" />)
  expect(animations).toHaveLength(0)
  media.matches = false
  rerender(<Motion.ProgressRing value={5} total={10} label="新词" />)
  expect(animations).toHaveLength(1); expect(animations[0].options.duration).toBe(700)
  expect(animations[0].keyframes[0]).toEqual({ strokeDashoffset: 80 })
  rerender(<Motion.ProgressRing value={6} total={10} label="新词" />)
  expect(animations[0].cancel).toHaveBeenCalled()
  act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  expect(animations[1].cancel).toHaveBeenCalled(); unmount(); expect(listeners.size).toBe(0)
})
test('segmented bars interpolate old geometry, continue from visible interrupted widths, and replay only on filters', () => {
  const items = value => [{ label: '新词', value, color: 'blue' }, { label: '复习', value: 100 - value, color: 'gold' }]
  const view = (value, replayKey = 'book') => <SegmentedBar items={items(value)} replayKey={replayKey} label="分布" />
  const { rerender, container } = render(view(20))
  animations[0].playState = 'finished'
  const first = container.querySelector('.data-bar__segments > span')
  rerender(view(60))
  const update = animations.find(animation => animation.target === first)
  expect(update?.keyframes).toEqual([{ width: '20%' }, { width: '60%' }])
  const style = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(node => node === first ? { width: '35%' } : style(node))
  rerender(view(80))
  expect(update.cancel).toHaveBeenCalled()
  expect(animations.filter(animation => animation.target === first).at(-1).keyframes).toEqual([{ width: '35%' }, { width: '80%' }])
  expect(screen.getByLabelText('分布')).toBeInTheDocument()
  rerender(view(25, 'other'))
  expect(animations.at(-1).keyframes[0]).toEqual({ clipPath: 'inset(0 100% 0 0)' })
})

test('donut arcs interpolate together including zero segments and keep the final total accessible', () => {
  const items = values => values.map((value, index) => ({ label: String(index), value, color: ['blue', 'gold', 'red'][index] }))
  const { rerender, container } = render(<FeedbackDonut items={items([1, 3, 0])} replayKey="book" />)
  animations[0].playState = 'finished'
  rerender(<FeedbackDonut items={items([2, 1, 1])} replayKey="book" />)
  const updates = animations.filter(animation => animation.target.tagName === 'circle')
  expect(updates).toHaveLength(3)
  expect(updates[0].keyframes).toEqual([{ strokeDasharray: '25 75', strokeDashoffset: '0' }, { strokeDasharray: '50 50', strokeDashoffset: '0' }])
  expect(updates[1].keyframes).toEqual([{ strokeDasharray: '75 25', strokeDashoffset: '-25' }, { strokeDasharray: '25 75', strokeDashoffset: '-50' }])
  expect(updates[2].keyframes[0].strokeDasharray).toBe('0 100')
  expect(updates.every(animation => animation.startTime === 123)).toBe(true)
  expect(container.querySelector('.feedback-donut__total')).toHaveTextContent('4次反馈')
})

test('stacked columns interpolate from old heights with a common baseline and synchronized timing', () => {
  const buckets = values => [{ fromDate: '2026-10-01', toDate: '2026-10-01', label: '2026-10-01', completions: { learningWords: values[0], extraLearningWords: values[1], reviewWords: values[2] } }]
  const view = values => <CompletionChart buckets={buckets(values)} granularity="day" replayKey="book" colors={['blue', 'gold', 'red']} />
  const { rerender } = render(view([1, 1, 2]))
  animations[0].playState = 'finished'
  rerender(view([2, 1, 1]))
  const updates = animations.filter(animation => animation.target.tagName === 'rect')
  expect(updates).toHaveLength(3)
  expect(updates[0].keyframes[0]).toMatchObject({ y: '153px', height: '51px' })
  expect(updates[0].keyframes[1]).toMatchObject({ y: '102px', height: '102px' })
  for (const endpoint of [0, 1]) {
    const stack = updates.map(animation => animation.keyframes[endpoint])
    expect(parseFloat(stack[0].y) + parseFloat(stack[0].height)).toBe(204)
    expect(parseFloat(stack[1].y) + parseFloat(stack[1].height)).toBe(parseFloat(stack[0].y))
    expect(parseFloat(stack[2].y) + parseFloat(stack[2].height)).toBe(parseFloat(stack[1].y))
  }
  expect(updates.every(animation => animation.startTime === 123)).toBe(true)
  expect(updates.every(animation => animation.options.duration === 800)).toBe(true)
})

test('a live update during entry preserves the currently visible reveal', () => {
  const view = value => <SegmentedBar items={[{ label: '新词', value, color: 'blue' }]} total={100} replayKey="book" label="进度" />
  const { rerender, container } = render(view(20))
  const wrapper = container.querySelector('.data-bar__segments')
  const style = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(node => node === wrapper ? { clipPath: 'inset(0 40% 0 0)' } : style(node))
  rerender(view(60))
  expect(animations[0].cancel).toHaveBeenCalled()
  const continuation = animations.filter(animation => animation.target === wrapper).at(-1)
  expect(continuation.keyframes).toEqual([{ clipPath: 'inset(0 40% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }])
})

test('rapid ring updates start from the visible offset and settle to the newest target', () => {
  const view = value => <Motion.ProgressRing value={value} total={10} label="新词" />
  const { rerender, container } = render(view(5))
  const stroke = container.querySelector('.progress-ring__fill')
  const style = window.getComputedStyle
  vi.spyOn(window, 'getComputedStyle').mockImplementation(node => node === stroke ? { strokeDashoffset: '72' } : style(node))
  rerender(view(8))
  expect(animations[0].cancel).toHaveBeenCalled()
  expect(Number(animations[1].keyframes[0].strokeDashoffset)).toBe(72)
  expect(Number(animations[1].keyframes[1].strokeDashoffset)).toBeCloseTo(20)
  act(() => { media.matches = true; listeners.forEach(fn => fn()) })
  expect(animations[1].cancel).toHaveBeenCalled()
  expect(Number(stroke.getAttribute('stroke-dashoffset'))).toBeCloseTo(20)
  expect(screen.getByRole('img')).toHaveAccessibleName('新词：已完成 8 / 10 词，80%')
})

test('geometry groups settle to final data on dynamic motion preference and visibility changes', () => {
  const items = value => [{ label: '新词', value, color: 'blue' }, { label: '复习', value: 100 - value, color: 'gold' }]
  const view = value => <SegmentedBar items={items(value)} replayKey="book" label="分布" />
  const { rerender, container, unmount } = render(view(20))
  animations[0].playState = 'finished'
  rerender(view(60))
  const firstUpdate = animations.slice(1)
  act(() => { media.matches = true; listeners.forEach(fn => fn()) })
  expect(firstUpdate.every(animation => animation.cancel.mock.calls.length === 1)).toBe(true)
  expect(container.querySelector('.data-bar__segments > span')).toHaveStyle({ width: '60%' })
  act(() => { media.matches = false; listeners.forEach(fn => fn()) })
  rerender(view(80))
  const secondUpdate = animations.slice(3)
  expect(secondUpdate[0].keyframes[0]).toEqual({ width: '60%' })
  act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  expect(secondUpdate.every(animation => animation.cancel.mock.calls.length === 1)).toBe(true)
  expect(container.querySelector('.data-bar__segments > span')).toHaveStyle({ width: '80%' })
  const count = animations.length
  rerender(view(90))
  expect(animations).toHaveLength(count)
  expect(container.querySelector('.data-bar__segments > span')).toHaveStyle({ width: '90%' })
  unmount()
  expect(listeners.size).toBe(0)
})

test('invalid data immediately removes and cancels old geometry without animating a false zero', () => {
  const view = value => <SegmentedBar items={[{ label: '新词', value, color: 'blue' }]} total={100} replayKey="book" label="进度" />
  const { rerender } = render(view(20))
  animations[0].playState = 'finished'
  rerender(view(60))
  const update = animations.at(-1)
  const count = animations.length
  rerender(view(null))
  expect(update.cancel).toHaveBeenCalled()
  expect(animations).toHaveLength(count)
  expect(screen.queryByLabelText('进度')).not.toBeInTheDocument()
  expect(screen.getByText('不可计算：记录存在冲突')).toBeVisible()
})

test('partial native animation failure cancels started siblings and leaves true final geometry', () => {
  const view = value => <SegmentedBar items={[{ label: '新词', value, color: 'blue' }, { label: '复习', value: 100 - value, color: 'gold' }]} replayKey="book" label="分布" />
  const { rerender, container } = render(view(20))
  animations[0].playState = 'finished'
  const animate = Element.prototype.animate.getMockImplementation()
  Element.prototype.animate.mockImplementationOnce(animate).mockImplementationOnce(() => { throw Error('unavailable') })
  rerender(view(60))
  expect(animations.at(-1).cancel).toHaveBeenCalled()
  expect([...container.querySelectorAll('.data-bar__segments > span')].map(node => node.style.width)).toEqual(['60%', '40%'])
})

test('new date columns enter from the shared baseline while existing columns retain their geometry', () => {
  const bucket = date => ({ fromDate: date, toDate: date, label: date, completions: { learningWords: 1, extraLearningWords: 1, reviewWords: 2 } })
  const first = bucket('2026-10-01')
  const view = buckets => <CompletionChart buckets={buckets} granularity="day" replayKey="book" colors={['blue', 'gold', 'red']} />
  const { rerender } = render(view([first]))
  animations[0].playState = 'finished'
  rerender(view([first, bucket('2026-10-02')]))
  const updates = animations.filter(animation => animation.target.tagName === 'rect')
  expect(updates).toHaveLength(6)
  expect(parseFloat(updates[0].keyframes[0].x)).toBeCloseTo(84)
  expect(updates[0].keyframes[0]).toMatchObject({ width: '432px', y: '153px', height: '51px' })
  for (const update of updates.slice(3)) expect(update.keyframes[0]).toMatchObject({ y: '204px', height: '0px' })
})

test('after reduced motion settles a count, new data starts from that settled value', () => {
  const { rerender } = render(count(860)); tick(0); tick(100)
  act(() => { media.matches = true; listeners.forEach(fn => fn()) })
  act(() => { media.matches = false; listeners.forEach(fn => fn()) })
  rerender(count(1000))
  expect(document.querySelector('[aria-hidden="true"]')).toHaveTextContent('860')
})
test('stacked columns rise together from the baseline without changing category proportions', () => {
  render(<Motion.DataReveal replayKey="bar" direction="vertical"><span>stack</span></Motion.DataReveal>)
  expect(animations[0].keyframes).toEqual([{ transform: 'scaleY(0)', transformOrigin: 'bottom' }, { transform: 'scaleY(1)', transformOrigin: 'bottom' }])
})
