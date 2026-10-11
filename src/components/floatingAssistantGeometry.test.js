import { expect, test } from 'vitest'

const geometry = await import('./floatingAssistantGeometry').catch(() => ({}))
test('mobile dismissal requires strictly more than half of the panel height', () => {
  expect(geometry.shouldDismissMobile).toBeTypeOf('function')
  expect(geometry.shouldDismissMobile(280, 560)).toBe(false)
  expect(geometry.shouldDismissMobile(281, 560)).toBe(true)
  expect(geometry.shouldDismissMobile(-20, 560)).toBe(false)
})
test('window bounds, resizing and viewport shrink keep the complete window usable', () => {
  expect(geometry.clampWindow).toBeTypeOf('function')
  expect(geometry.clampWindow({ x: -50, y: 900, width: 2000, height: 2000 }, { width: 1000, height: 800 })).toEqual({ x: 8, y: 8, width: 984, height: 784 })
  const small = geometry.clampWindow({ x: 800, y: 500, width: 420, height: 560 }, { width: 390, height: 500 })
  expect(small).toEqual({ x: 8, y: 8, width: 374, height: 484 })
  expect(geometry.resizeWindow({ x: 100, y: 100, width: 420, height: 560 }, 800, 800, { width: 1000, height: 800 })).toEqual({ x: 100, y: 100, width: 892, height: 692 })
})
test('launcher bounds include its full dimensions', () => {
  expect(geometry.clampLauncher).toBeTypeOf('function')
  expect(geometry.clampLauncher({ x: 900, y: -100 }, { width: 390, height: 844 }, { width: 150, height: 48 })).toEqual({ x: 232, y: 8 })
})
