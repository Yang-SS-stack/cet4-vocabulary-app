import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, test, vi } from 'vitest'

const modules = import.meta.glob('./AnimatedDisclosure.jsx', { eager: true })
const Disclosure = modules['./AnimatedDisclosure.jsx']?.default
let animations, media, listeners, visibleHeight

beforeEach(() => {
  animations = []; listeners = new Set(); visibleHeight = 120
  media = { matches: false, addEventListener: (_, fn) => listeners.add(fn), removeEventListener: (_, fn) => listeners.delete(fn) }
  vi.stubGlobal('matchMedia', () => media)
  Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height: visibleHeight }))
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 120 })
  Element.prototype.animate = vi.fn(function (frames, options) {
    const animation = { cancel: vi.fn(), frames, options, onfinish: null }
    animations.push(animation)
    return animation
  })
})

function page() {
  expect(Disclosure).toBeTypeOf('function')
  return render(<Disclosure title="学习建议"><p>建议正文</p></Disclosure>)
}

test('native disclosure opens with motion and hides content only after closing finishes', () => {
  page()
  const summary = screen.getByText('学习建议'), details = summary.closest('details')
  expect(details.open).toBe(false)
  fireEvent.click(summary)
  expect(details.open).toBe(true)
  expect(animations[0].frames).toEqual([{ height: '0px', opacity: 0 }, { height: '120px', opacity: 1 }])
  act(() => animations[0].onfinish())
  fireEvent.click(summary)
  expect(details.open).toBe(true)
  expect(animations[1].frames[1]).toEqual({ height: '0px', opacity: 0 })
  act(() => animations[1].onfinish())
  expect(details.open).toBe(false)
  expect(screen.getByText('建议正文')).not.toBeVisible()
})

test('rapid reversal uses the visible height and ignores a stale finish', () => {
  page()
  const summary = screen.getByText('学习建议'), details = summary.closest('details')
  fireEvent.click(summary)
  visibleHeight = 45
  fireEvent.click(summary)
  expect(animations[0].cancel).toHaveBeenCalled()
  expect(animations[1].frames[0].height).toBe('45px')
  const staleFinish = animations[1].onfinish
  visibleHeight = 36
  fireEvent.click(summary)
  expect(animations[1].cancel).toHaveBeenCalled()
  expect(animations[2].frames[0].height).toBe('36px')
  act(() => staleFinish())
  expect(details.open).toBe(true)
  act(() => animations[2].onfinish())
  expect(details.open).toBe(true)
})

test('reduced motion settles the latest intent and subsequent toggles are immediate', () => {
  page()
  const summary = screen.getByText('学习建议'), details = summary.closest('details')
  fireEvent.click(summary); fireEvent.click(summary)
  act(() => { media.matches = true; listeners.forEach(fn => fn()) })
  expect(details.open).toBe(false)
  expect(animations[1].cancel).toHaveBeenCalled()
  fireEvent.click(summary)
  expect(details.open).toBe(true)
  expect(animations).toHaveLength(2)
})

test('failure, hidden document and unmount preserve native state and clean up motion', () => {
  const { unmount } = page()
  const summary = screen.getByText('学习建议'), details = summary.closest('details')
  Element.prototype.animate.mockImplementationOnce(() => { throw Error('unsupported') })
  fireEvent.click(summary)
  expect(details.open).toBe(true)
  fireEvent.click(summary)
  act(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')) })
  expect(details.open).toBe(false)
  expect(animations[0].cancel).toHaveBeenCalled()
  unmount()
  expect(listeners.size).toBe(0)
})
