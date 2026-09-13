import { expect, test } from 'vitest'
import { initialSetupComplete, setupPlanStatus, synchronizeSetupDraft } from './setupDraft'

const snapshot = {
  settings: {},
  wordBooks: {},
  mistakes: {},
  days: {},
}

test('links an exam change to the suggested count and rounded time', () => {
  const draft = synchronizeSetupDraft({
    draft: {
      examDate: '2026-12-12',
      todayWordBookId: 'cet4',
      dailyNewWords: 15,
      dailyReviewWords: 20,
      dailyStudyMinutes: 30,
    },
    changedField: 'examDate',
    snapshot,
    now: new Date(2026, 8, 13, 10),
  })

  expect(draft.dailyNewWords).toBe(51)
  expect(draft.dailyStudyMinutes).toBe(60)
})

test('links either word count to time but preserves a manual time edit', () => {
  const base = {
    examDate: '2026-12-12', todayWordBookId: 'cet4',
    dailyNewWords: 13, dailyReviewWords: 20, dailyStudyMinutes: 45,
  }
  expect(synchronizeSetupDraft({
    draft: base, changedField: 'dailyNewWords', snapshot, now: new Date(2026, 8, 13),
  }).dailyStudyMinutes).toBe(20)
  expect(synchronizeSetupDraft({
    draft: base, changedField: 'dailyStudyMinutes', snapshot, now: new Date(2026, 8, 13),
  }).dailyStudyMinutes).toBe(45)
})

test('reports past dates and uncapped plans', () => {
  const status = setupPlanStatus({
    draft: {
      examDate: '2026-09-13', todayWordBookId: 'cet4',
      dailyNewWords: 100, dailyReviewWords: 20, dailyStudyMinutes: 110,
    },
    snapshot,
    now: new Date(2026, 8, 13, 10),
  })
  expect(status.invalidExamDate).toBe(true)
})

test('requires all five supported first-run fields', () => {
  const complete = {
    examDate: '2027-09-13', todayWordBookId: 'cet4', dailyNewWords: 20,
    dailyReviewWords: 20, dailyStudyMinutes: 30,
  }
  expect(initialSetupComplete(complete)).toBe(true)
  expect(initialSetupComplete({ ...complete, dailyReviewWords: null })).toBe(false)
})
