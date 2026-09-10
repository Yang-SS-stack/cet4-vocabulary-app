import { expect, test } from 'vitest'

import { buildLearningRecommendation, completedWordCount, daysUntilExam } from './recommendations'

test('calculates calendar days until the exam date', () => {
  expect(daysUntilExam('2026-09-21', new Date(2026, 8, 11, 18))).toBe(10)
})

test('counts completed words in the selected word book', () => {
  const snapshot = {
    wordBooks: {
      cet4: {
        words: {
          apple: { learning: { completed: true } },
          banana: { learning: { completed: false } },
          cherry: { learning: { completed: true } },
        },
      },
    },
  }

  expect(completedWordCount(snapshot, 'cet4')).toBe(2)
})

test('builds an overloaded learning recommendation from progress and settings', () => {
  expect(buildLearningRecommendation({
    totalWords: 100,
    completedWords: 1,
    daysRemaining: 10,
    dailyNewWords: 8,
    dailyReviewWords: 5,
    dailyStudyMinutes: 20,
  })).toEqual({
    remainingWords: 99,
    daysRemaining: 10,
    deadlineDailyWords: 10,
    estimatedMinutes: 29,
    overloaded: true,
  })
})
