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

export function buildLearningRecommendation({ totalWords, completedWords, daysRemaining, dailyNewWords = 0, dailyReviewWords = 0, dailyStudyMinutes = 0 }) {
  const remainingWords = Math.max(0, totalWords - completedWords)
  const deadlineDailyWords = daysRemaining > 0 ? Math.ceil(remainingWords / daysRemaining) : null
  const estimatedMinutes = dailyNewWords * 3 + dailyReviewWords
  return { remainingWords, daysRemaining, deadlineDailyWords, estimatedMinutes, overloaded: dailyStudyMinutes > 0 && estimatedMinutes > dailyStudyMinutes }
}
