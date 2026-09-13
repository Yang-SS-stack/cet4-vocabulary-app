import { expect, test } from 'vitest'

import {
  buildLearningRecommendation,
  completedWordCount,
  daysUntilExam,
  estimateDailyStudyMinutes,
} from './recommendations'

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

test('rounds the 60-second new-word and 20-second review estimate up to five minutes', () => {
  expect(estimateDailyStudyMinutes(13, 20)).toBe(20)
  expect(estimateDailyStudyMinutes(24, 20)).toBe(35)
  expect(estimateDailyStudyMinutes(1, 1)).toBe(5)
  expect(estimateDailyStudyMinutes(0, 0)).toBe(0)
})

test('caps the editable recommendation at 100 without hiding the deadline requirement', () => {
  expect(buildLearningRecommendation({
    totalWords: 4544,
    completedWords: 0,
    daysRemaining: 44,
    dailyNewWords: 100,
    dailyReviewWords: 100,
    dailyStudyMinutes: 100,
  })).toEqual({
    remainingWords: 4544,
    daysRemaining: 44,
    deadlineDailyWords: 104,
    recommendedDailyWords: 100,
    exceedsDailyWordLimit: true,
    estimatedMinutes: 135,
    overloaded: true,
  })
})

test('builds a recommendation from progress and the shared time estimate', () => {
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
    recommendedDailyWords: 10,
    exceedsDailyWordLimit: false,
    estimatedMinutes: 10,
    overloaded: false,
  })
})
