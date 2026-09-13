export function daysUntilExam(examDate, now) {
  if (!examDate) return null
  const [year, month, day] = examDate.split('-').map(Number)
  const exam = new Date(year, month - 1, day)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((exam - today) / 86_400_000)
}

export function completedWordCount(snapshot, wordBookId) {
  return Object.values(snapshot.wordBooks[wordBookId]?.words ?? {})
    .filter((word) => word.learning.completed).length
}

export const MAX_DAILY_NEW_WORDS = 100
const FIVE_MINUTES_IN_SECONDS = 5 * 60

export function estimateDailyStudyMinutes(dailyNewWords, dailyReviewWords) {
  const seconds = Math.max(0, dailyNewWords) * 60 + Math.max(0, dailyReviewWords) * 20
  return seconds === 0 ? 0 : Math.ceil(seconds / FIVE_MINUTES_IN_SECONDS) * 5
}

export function buildLearningRecommendation({ totalWords, completedWords, daysRemaining, dailyNewWords = 0, dailyReviewWords = 0, dailyStudyMinutes = 0 }) {
  const remainingWords = Math.max(0, totalWords - completedWords)
  const deadlineDailyWords = daysRemaining > 0 ? Math.ceil(remainingWords / daysRemaining) : null
  const recommendedDailyWords = deadlineDailyWords === null
    ? null
    : Math.min(MAX_DAILY_NEW_WORDS, Math.max(1, deadlineDailyWords))
  const exceedsDailyWordLimit = deadlineDailyWords !== null && deadlineDailyWords > MAX_DAILY_NEW_WORDS
  const estimatedMinutes = estimateDailyStudyMinutes(dailyNewWords, dailyReviewWords)
  return {
    remainingWords,
    daysRemaining,
    deadlineDailyWords,
    recommendedDailyWords,
    exceedsDailyWordLimit,
    estimatedMinutes,
    overloaded: dailyStudyMinutes > 0 && estimatedMinutes > dailyStudyMinutes,
  }
}
