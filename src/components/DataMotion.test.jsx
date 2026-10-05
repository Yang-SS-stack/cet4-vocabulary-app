import { act, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'
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
  Element.prototype.animate = vi.fn((keyframes, options) => { const animation = { cancel: vi.fn(), keyframes, options }; animations.push(animation); return animation })
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
test('live chart data changes keep the filled geometry and only filter changes replay from empty', () => {
  expect(Motion?.DataReveal).toBeTypeOf('function')
  const { rerender } = render(<Motion.DataReveal replayKey="book" dataKey="1"><span>one</span></Motion.DataReveal>)
  rerender(<Motion.DataReveal replayKey="book" dataKey="2"><span>two</span></Motion.DataReveal>)
  expect(animations).toHaveLength(2)
  expect(animations[1].keyframes[0]).not.toHaveProperty('clipPath')
  expect(animations[1].keyframes.at(-1)).toEqual({ opacity: 1 })
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
