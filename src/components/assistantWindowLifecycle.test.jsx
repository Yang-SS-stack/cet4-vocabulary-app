import { useState } from 'react'
import { readFileSync } from 'node:fs'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import FloatingAssistantWindow from './FloatingAssistantWindow'

const windowCss = readFileSync('src/components/FloatingLearningAssistant.css', 'utf8')

const styles = []
afterEach(() => {
  styles.splice(0).forEach(style => style.remove())
  vi.useRealTimers()
})

function setup(width = 800, reduced = false) {
  vi.useFakeTimers()
  vi.stubGlobal('innerWidth', width)
  const listeners = new Set()
  const motion = { matches: reduced, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  vi.stubGlobal('matchMedia', () => motion)
  const closed = vi.fn(), closing = vi.fn(), cancellations = [], animations = []
  let panel
  const hidden = () => Boolean(panel.closest('[hidden]')) || getComputedStyle(panel).visibility === 'hidden'
  function Harness() {
    const [open, setOpen] = useState(false)
    return <>
      <button onClick={() => setOpen(true)}>打开</button>
      <FloatingAssistantWindow open={open} onClosing={closing} onClose={() => { closed(hidden()); setOpen(false) }}>
        <div className="assistant-layout"><div className="assistant-stage" /><div className="assistant-conversation__composer"><form><input /><button>发送</button></form></div></div>
      </FloatingAssistantWindow>
    </>
  }
  const result = render(<Harness />)
  panel = result.container.querySelector('.floating-assistant')
  panel.animate = vi.fn((frames, options) => {
    const animation = { playState: 'running', onfinish: null, cancel: vi.fn(() => cancellations.push({ duration: options.duration, hidden: hidden() })) }
    animations.push({ frames, options, animation })
    return animation
  })
  const open = () => fireEvent.click(screen.getByRole('button', { name: '打开' }))
  const close = () => fireEvent.keyDown(panel, { key: 'Escape' })
  const reduce = () => { motion.matches = true; act(() => [...listeners].forEach(fn => fn())) }
  return { ...result, panel, hidden, animations, cancellations, closed, closing, motion, open, close, reduce, listeners }
}

test.each([800, 390].flatMap(width => ['finish', 'fallback', 'reduce', 'resize'].map(completion => [width, completion])))('%ipx %s hides before cancelling exit, then reopens and rejects detached completion', (width, completion) => {
  const harness = setup(width)
  const { panel, animations, cancellations, closed, open, close, hidden } = harness
  open(); close(); close()
  const exit = animations.at(-1), oldFinish = exit.animation.onfinish
  expect(hidden()).toBe(false)
  expect(harness.closing).toHaveBeenCalledOnce()
  if (completion === 'finish') act(() => oldFinish())
  else if (completion === 'fallback') act(() => vi.advanceTimersByTime(width <= 640 ? 250 : 290))
  else if (completion === 'reduce') harness.reduce()
  else { vi.stubGlobal('innerWidth', width <= 640 ? 800 : 390); fireEvent(window, new Event('resize')) }
  expect(cancellations.filter(value => value.duration === exit.options.duration)).not.toHaveLength(0)
  expect(cancellations.filter(value => value.duration === exit.options.duration).every(value => value.hidden)).toBe(true)
  expect(closed).toHaveBeenCalledExactlyOnceWith(true)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  harness.motion.matches = false
  open(); act(() => { oldFinish(); vi.advanceTimersByTime(500) })
  expect(panel).toBeVisible()
  expect(closed).toHaveBeenCalledOnce()
  close(); act(() => oldFinish())
  expect(panel).toBeVisible()
  act(() => animations.at(-1).animation.onfinish())
  expect(closed).toHaveBeenCalledTimes(2)
})

test.each([800, 390].flatMap(width => ['reduced', 'missing', 'rejected'].map(mode => [width, mode])))('%ipx %s immediate close hides before releasing presentation and calling its parent', (width, mode) => {
  const { open, close, panel, motion, cancellations, closed } = setup(width)
  open()
  if (mode === 'reduced') motion.matches = true
  if (mode === 'missing') panel.animate = undefined
  if (mode === 'rejected') panel.animate = () => { throw new Error('animation unavailable') }
  close()
  expect(closed).toHaveBeenCalledExactlyOnceWith(true)
  expect(cancellations.every(value => value.hidden)).toBe(true)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test.each([800, 390])('%ipx interrupted opening snapshots its rendered presentation before cancelling entry', width => {
  const { panel, animations, open, close } = setup(width)
  open()
  const presentation = { transform: 'matrix(0.7, 0, 0, 0.7, 20, 40)', opacity: '0.68', borderRadius: '22px' }
  let entryCancelled = false
  animations[0].animation.cancel.mockImplementation(() => { entryCancelled = true })
  const nativeComputedStyle = globalThis.getComputedStyle
  vi.spyOn(globalThis, 'getComputedStyle').mockImplementation(element => element === panel ? entryCancelled ? nativeComputedStyle(element) : presentation : nativeComputedStyle(element))
  close()
  expect(animations.at(-1).frames[0]).toEqual(width <= 640 ? { transform: presentation.transform } : presentation)
})

test('mobile pull exit suppresses the transform rebound while retaining its exit start position', () => {
  vi.stubGlobal('PointerEvent', MouseEvent)
  applyViewportCss(390)
  const { panel, open, animations } = setup(390)
  open()
  vi.spyOn(panel, 'getBoundingClientRect').mockReturnValue({ height: 560 })
  const reboundTransition = getComputedStyle(panel).transition
  expect(reboundTransition).toContain('200ms')
  const grab = screen.getByRole('button', { name: '下拉收起学习助手' })
  fireEvent.pointerDown(grab, { clientY: 100, button: 0 })
  fireEvent.pointerMove(grab, { clientY: 381 })
  fireEvent.pointerUp(grab, { clientY: 381 })
  expect(animations.at(-1).frames).toEqual([{ transform: 'translateY(281px)' }, { transform: 'translateY(100%)' }])
  expect(getComputedStyle(panel).transition).toBe('none')
  expect(panel.style.transform).toBe('translateY(0px)')
  act(() => animations.at(-1).animation.onfinish())
  open()
  expect(panel).toBeVisible()
  expect(getComputedStyle(panel).transition).toBe(reboundTransition)
})

// jsdom computes declarations but does not evaluate width media queries. Resolve
// only those queries through CSSOM, then let it compute the actual CSS rules.
function applyViewportCss(width) {
  const source = document.createElement('style')
  source.textContent = windowCss
  document.head.append(source)
  const rules = [...source.sheet.cssRules].flatMap(rule => {
    if (rule.type !== CSSRule.MEDIA_RULE) return [rule.cssText]
    const bound = /^\((min|max)-width: (\d+)px\)$/.exec(rule.conditionText)
    if (!bound || !(bound[1] === 'min' ? width >= Number(bound[2]) : width <= Number(bound[2]))) return []
    return [...rule.cssRules].map(nested => nested.cssText)
  })
  source.remove()
  const resolved = document.createElement('style')
  resolved.textContent = rules.join('\n')
  document.head.append(resolved); styles.push(resolved)
}

test('desktop computed stacking keeps the 24px resizer above composer and reserves its own footer strip', () => {
  applyViewportCss(800)
  const { open, panel } = setup(800)
  open()
  const resizer = getComputedStyle(screen.getByRole('button', { name: '调整学习助手窗口大小' }))
  const composer = getComputedStyle(panel.querySelector('.assistant-conversation__composer'))
  expect(resizer.position).toBe('absolute')
  expect.soft(Number(resizer.zIndex)).toBeGreaterThan(Number(composer.zIndex))
  expect.soft(parseFloat(composer.paddingBottom)).toBeGreaterThanOrEqual(parseFloat(resizer.height) + parseFloat(resizer.bottom))
  const handle = screen.getByRole('button', { name: '调整学习助手窗口大小' })
  const originalWidth = parseFloat(panel.style.width)
  handle.focus(); fireEvent.keyDown(handle, { key: 'ArrowLeft' })
  expect(parseFloat(panel.style.width)).toBe(originalWidth - 20)
  expect(handle).toHaveFocus()
})

test('mobile computed composer padding remains 18px without desktop resize or title close buttons', () => {
  applyViewportCss(390)
  const { panel, open } = setup(390)
  open()
  expect(getComputedStyle(panel.querySelector('.assistant-conversation__composer')).paddingBottom).toBe('18px')
  expect(screen.queryByRole('button', { name: '调整学习助手窗口大小' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '关闭学习助手' })).not.toBeInTheDocument()
})
