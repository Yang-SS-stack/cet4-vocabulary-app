import { expect, test } from 'vitest'
import { createMotion, positionAt, TRANSITION_DURATION } from './particleMotion'

test('particles leave the same point in different directions and at different times', () => {
  const motions = Array.from({ length: 80 }, (_, index) => createMotion(
    { x: 400, y: 320 }, { x: 40, y: 40 }, index, 900, 700,
  ))
  expect(new Set(motions.map(p => p.gatherStart)).size).toBe(80)
  const positions = motions.map(p => positionAt(p, 400))
  expect(Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x))).toBeGreaterThan(150)
  expect(Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y))).toBeGreaterThan(150)
})

test('motion starts at the source and converges to the destination without a phase jump', () => {
  for (let index = 0; index < 80; index++) {
    const p = createMotion({ x: 400, y: 320 }, { x: 40, y: 40 }, index, 900, 700)
    expect(positionAt(p, 0)).toEqual({ x: 400, y: 320 })
    expect(positionAt(p, TRANSITION_DURATION)).toEqual({ x: 40, y: 40 })
    let previous = positionAt(p, 0)
    for (let time = 1; time <= TRANSITION_DURATION; time++) {
      const next = positionAt(p, time)
      expect(Number.isFinite(next.x + next.y)).toBe(true)
      expect(Math.hypot(next.x - previous.x, next.y - previous.y)).toBeLessThan(8)
      previous = next
    }
  }
})
