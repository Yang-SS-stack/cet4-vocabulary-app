import { localDateKey, localDayStartIso } from './model'
import { canCorrectLearningFeedback } from './selfAssessment'

const learningTasks = (state, date) => [state.days[date]?.learning, ...(state.extraLearning[date]?.batches ?? [])].filter(Boolean)
export function completionIdentity(task, revision) {
  return { date: task.date, kind: task.kind, taskId: task.taskId ?? `${task.date}:learning`, revision }
}
export function reviewFromCompletion(at, source, completion) {
  return { enteredAt: at, lastReviewedAt: null, nextReviewAt: localDayStartIso(new Date(at), 1), stage: 0,
    completedReviewCount: 0, mastered: false, paused: false, provenance: { source, completion } }
}
export function addCompletedLearningReview(next, task, progress, at, revision) {
  const word = next.wordBooks[progress.wordBookId].words[progress.wordId]
  if (word.review === null) word.review = reviewFromCompletion(at, task.kind, completionIdentity(task, revision))
}
export function withdrawLearningReview(next, task, progress, revision) {
  const word = next.wordBooks[progress.wordBookId].words[progress.wordId], review = word.review
  if (!review || review.provenance?.source !== task.kind
    || JSON.stringify(review.provenance.completion) !== JSON.stringify(completionIdentity(task, revision))) return
  const fresh = reviewFromCompletion(progress.completedAt, task.kind, completionIdentity(task, revision))
  if (JSON.stringify(review) !== JSON.stringify(fresh)) return
  if (Object.values(next.days).some(tasks => tasks.review?.itemIds.includes(progress.id))) return
  word.review = null
}
export function correctableLearningIds(state, date) {
  return new Set(learningTasks(state, date).filter(canCorrectLearningFeedback)
    .filter(task => task.items[task.currentItemId].completed).map(task => task.currentItemId))
}
export function projectedMissingReviews(state, bookId, date) {
  const correctable = correctableLearningIds(state, date)
  return Object.values(state.wordBooks[bookId]?.words ?? {}).filter(word => word.learning.completed
    && word.review === null && !correctable.has(word.id)).map(word => {
      const at = word.learning.completedAt
      let completion = null
      for (const task of learningTasks(state, localDateKey(new Date(at)))) {
        const progress = task.items[word.id]
        const event = task.feedbackEvents.findLast(e => e.itemId === word.id && e.at === at && e.source === 'self-assessment' && e.feedback === 'known')
        if (progress?.completedAt === at && event) completion = completionIdentity(task, event.revision)
      }
      return { ...word, review: reviewFromCompletion(at, 'historical', completion) }
    })
}
export function dueReviewWords(state, bookId, at, date, projected = []) {
  const correctable = correctableLearningIds(state, date)
  return [...Object.values(state.wordBooks[bookId]?.words ?? {}).filter(w => w.review), ...projected]
    .filter(word => !correctable.has(word.id) && !word.review.paused && !word.review.mastered
      && word.review.nextReviewAt !== null && Date.parse(word.review.nextReviewAt) <= Date.parse(at))
    .sort((a, b) => a.review.nextReviewAt.localeCompare(b.review.nextReviewAt) || a.id.localeCompare(b.id))
}
