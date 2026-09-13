import { wordBooks } from '../data/wordBooks'
import {
  buildLearningRecommendation,
  completedWordCount,
  daysUntilExam,
  estimateDailyStudyMinutes,
} from '../data/learning/recommendations'

export const INITIAL_SETUP_FIELDS = [
  'examDate', 'todayWordBookId', 'dailyNewWords', 'dailyReviewWords', 'dailyStudyMinutes',
]

const countValid = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 100
const minutesValid = (value) => Number.isSafeInteger(value)
  && value >= 5 && value <= 240 && value % 5 === 0

export function setupPlanStatus({ draft, snapshot, now }) {
  const book = wordBooks.find(({ id }) => id === draft.todayWordBookId) ?? wordBooks[0]
  const daysRemaining = daysUntilExam(draft.examDate, now)
  const recommendation = buildLearningRecommendation({
    totalWords: book.totalWords,
    completedWords: completedWordCount(snapshot, book.id),
    daysRemaining,
    dailyNewWords: draft.dailyNewWords,
    dailyReviewWords: draft.dailyReviewWords,
    dailyStudyMinutes: draft.dailyStudyMinutes,
  })
  return {
    invalidExamDate: !Number.isFinite(daysRemaining) || daysRemaining <= 0,
    exceedsDailyWordLimit: recommendation.exceedsDailyWordLimit,
    deadlineDailyWords: recommendation.deadlineDailyWords,
    recommendedDailyWords: recommendation.recommendedDailyWords,
  }
}

export function synchronizeSetupDraft({ draft, changedField, snapshot, now }) {
  const next = { ...draft }
  if (changedField === 'examDate' || changedField === 'todayWordBookId') {
    const status = setupPlanStatus({ draft: next, snapshot, now })
    if (!status.invalidExamDate && status.recommendedDailyWords !== null) {
      next.dailyNewWords = status.recommendedDailyWords
    }
  }
  if (['examDate', 'todayWordBookId', 'dailyNewWords', 'dailyReviewWords'].includes(changedField)) {
    next.dailyStudyMinutes = estimateDailyStudyMinutes(next.dailyNewWords, next.dailyReviewWords)
  }
  return next
}

export function initialSetupComplete(settings) {
  const validDate = typeof settings.examDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(settings.examDate)
    && Number.isFinite(Date.parse(`${settings.examDate}T00:00:00`))
  return validDate
    && wordBooks.some(({ id }) => id === settings.todayWordBookId)
    && countValid(settings.dailyNewWords)
    && countValid(settings.dailyReviewWords)
    && minutesValid(settings.dailyStudyMinutes)
}
