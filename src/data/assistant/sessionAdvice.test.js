import { expect, test } from 'vitest'
import { adviceAvailability, buildSessionAdvice, adjustSessionAdvice } from './sessionAdvice'

const settings = { todayWordBookId: 'cet4', dailyNewWords: 100, dailyReviewWords: 100 }
const facts = { book: { id: 'cet4', totalWords: 500, completedWords: 100 }, today: { learning: null, review: null }, reviewLoad: { wordBookId: 'cet4', dueCount: 100, needsReconciliation: false } }

test('three goals actually allocate differently under the same real bounds', () => {
  const intent = { availableMinutes: 30, goal: 'progress' }
  const balanced = buildSessionAdvice({ facts, settings, intent })
  const review = buildSessionAdvice({ facts, settings, intent: { ...intent, goal: 'review' } })
  const lighter = buildSessionAdvice({ facts, settings, intent: { ...intent, goal: 'lighter' } })
  expect(balanced.newWords).toBeGreaterThan(0)
  expect(balanced.reviewWords).toBeGreaterThan(0)
  expect(review.reviewWords).toBeGreaterThan(balanced.reviewWords)
  expect(lighter.newSeconds + lighter.reviewSeconds).toBeLessThan(balanced.newSeconds + balanced.reviewSeconds)
  expect(balanced.source).toBe('rules')
})

test('all budgets respect the rounded estimate and actual available quantities', () => {
  for (let availableMinutes = 5; availableMinutes <= 60; availableMinutes++) {
    for (const goal of ['progress', 'review', 'lighter']) {
      const draft = buildSessionAdvice({ facts, settings, intent: { availableMinutes, goal } })
      expect(draft.estimatedMinutes).toBeLessThanOrEqual(availableMinutes)
      expect(draft.newWords).toBeLessThanOrEqual(100)
      expect(draft.reviewWords).toBeLessThanOrEqual(100)
      expect(draft.estimatedMinutes % 5).toBe(0)
    }
  }
})

test('frozen empty and completed tasks stay zero instead of refilling from daily settings', () => {
  const fixed = { ...facts, today: { learning: { wordBookId: 'cet4', remainingWords: 0 }, review: { wordBookId: 'cet4', remainingWords: 2 } } }
  expect(adviceAvailability(fixed, settings)).toMatchObject({ newWords: 0, reviewWords: 2 })
  expect(buildSessionAdvice({ facts: fixed, settings, intent: { availableMinutes: 60, goal: 'progress' } })).toMatchObject({ newWords: 0, reviewWords: 2, estimatedMinutes: 5 })
})

test('unknown facts, reconciliation and different frozen task books cannot become zero', () => {
  for (const bad of [
    { ...facts, book: { ...facts.book, totalWords: null } },
    { ...facts, reviewLoad: { ...facts.reviewLoad, needsReconciliation: true } },
    { ...facts, today: { ...facts.today, learning: { wordBookId: 'other', remainingWords: 3 } } },
  ]) {
    expect(adviceAvailability(bad, settings).status).toBe('unavailable')
    expect(buildSessionAdvice({ facts: bad, settings, intent: { availableMinutes: 20, goal: 'progress' } }).newWords).toBeNull()
  }
})

test('quantities never exceed the remaining book, due review or daily limits without tasks', () => {
  expect(adviceAvailability({ ...facts, book: { ...facts.book, completedWords: 498 }, reviewLoad: { ...facts.reviewLoad, dueCount: 3 } }, settings)).toMatchObject({ newWords: 2, reviewWords: 3 })
})

test('manual adjustment rejects time/count overflow and preserves all input facts', () => {
  const original = structuredClone(facts)
  const draft = buildSessionAdvice({ facts, settings, intent: { availableMinutes: 5, goal: 'progress' } })
  expect(adjustSessionAdvice(draft, { newWords: 5, reviewWords: 1 }).error).toMatch(/时间/)
  expect(adjustSessionAdvice(draft, { newWords: 101, reviewWords: 0 }).error).toMatch(/数量/)
  expect(adjustSessionAdvice(draft, { newWords: 0, reviewWords: 0 }).draft).toMatchObject({ estimatedMinutes: 0, order: 'none' })
  expect(facts).toEqual(original)
})
