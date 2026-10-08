import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import { gsap } from 'gsap'
import FadeContent from './FadeContent'

test('renders the content passed into the fade container', () => {
  render(
    <FadeContent>
      <p>今日学习内容</p>
    </FadeContent>,
  )

  expect(screen.getByText('今日学习内容')).toBeInTheDocument()
})

test('removes the entry transform only after the animation completes', () => {
  const { container } = render(<FadeContent>学习卡片</FadeContent>)
  const content = container.firstChild
  const [entry] = gsap.getTweensOf(content)

  entry.pause().progress(0.5)
  expect(content.style.transform).not.toBe('')
  expect(Number(content.style.opacity)).toBeGreaterThan(0)
  expect(Number(content.style.opacity)).toBeLessThan(1)

  entry.progress(1)
  expect(content.style.transform).toBe('')
  expect(content.style.opacity).toBe('1')
})

test('reverts and stops an unfinished entry animation on unmount', () => {
  const { container, unmount } = render(<FadeContent>学习卡片</FadeContent>)
  const content = container.firstChild
  const [entry] = gsap.getTweensOf(content)

  entry.pause().progress(0.5)
  unmount()

  expect(gsap.getTweensOf(content)).toHaveLength(0)
  expect(content.style.transform).toBe('')
  expect(content.style.opacity).toBe('')
})

test('leaves reduced-motion content visible without an entry transform or tween', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })))
  const { container } = render(<FadeContent>学习卡片</FadeContent>)
  const content = container.firstChild

  expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)')
  expect(gsap.getTweensOf(content)).toHaveLength(0)
  expect(content.style.transform).toBe('')
  expect(content.style.opacity).toBe('')
  expect(screen.getByText('学习卡片')).toBeVisible()
})
