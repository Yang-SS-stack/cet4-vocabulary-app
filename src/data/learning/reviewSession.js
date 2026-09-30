import { assert, createProgress, localDayStartIso, MISTAKE_ENTRY_THRESHOLD } from './model'
import { nextLearningItem } from './selfAssessment'

export const REVIEW_GUIDED_RECALL = Object.freeze({ id: 'review-guided-recall', rulesVersion: 1 })
const intervals = [2, 4, 7, 15, 30, 30]
export const isReviewSession = task => task?.kind === 'review' && task.method?.id === REVIEW_GUIDED_RECALL.id
export function requireReviewTurn(task, token, date, view) {
  assert(token?.date === date && task?.date === date, 'Review date changed; start today again')
  assert(isReviewSession(task), 'Legacy review cannot use this review session')
  assert(task.currentItemId !== null && token.itemId === task.currentItemId
    && token.revision === task.sessionRevision && task.view === view, 'Review turn changed; reload progress')
  return task.items[token.itemId]
}
export function createReviewProgress(word, initialKnownCount) {
  return { ...createProgress(word), knownCount: initialKnownCount, initialKnownCount, settlement: null }
}
export const nextReviewItem = nextLearningItem
export function canCorrectReviewFeedback(task) {
  if (!isReviewSession(task) || task.view !== 'feedback' || task.currentItemId === null) return false
  const event = task.feedbackEvents.at(-1)
  if (event?.itemId !== task.currentItemId || !task.items[event.itemId]?.knownCount) return false
  return event.source === 'self-assessment' && event.feedback === 'known' && task.choice === null
    || event.source === 'guided-choice' && event.outcome === 'correct' && task.choice?.revealed === true
}
export function applyReviewFeedback(next, task, progress, feedback, at) {
  assert(['known', 'fuzzy', 'unknown'].includes(feedback), 'Invalid feedback')
  assert(progress.knownCount >= 1 && !progress.completed && task.choice === null, 'Choose the first meaning before review feedback')
  progress.lastFeedback = feedback
  if (feedback === 'known') progress.knownCount += 1
  if (feedback === 'fuzzy') { progress.fuzzyCount += 1; progress.knownCount = Math.max(0, progress.knownCount - 1) }
  if (feedback === 'unknown') {
    progress.unknownCount += 1; progress.knownCount = 0
    const mistake = next.mistakes[progress.wordId]
    mistake.unknownCount += 1; mistake.unknownCountSinceRemoval += 1; mistake.lastErrorAt = at
    if (mistake.unknownCountSinceRemoval >= MISTAKE_ENTRY_THRESHOLD) {
      mistake.entered = true; mistake.enteredAt ??= at; mistake.removed = false; mistake.removedAt = null
    }
  }
  progress.completed = progress.knownCount === 4
  if (progress.completed) {
    const review = next.wordBooks[progress.wordBookId].words[progress.wordId].review
    progress.settlement = { previousReview: JSON.parse(JSON.stringify(review)), revision: task.sessionRevision }
    progress.completedAt = at
    const days = progress.unknownCount || progress.fuzzyCount ? 1 : intervals[review.stage]
    review.stage = progress.unknownCount ? 0 : progress.fuzzyCount ? review.stage : Math.min(5, review.stage + 1)
    review.lastReviewedAt = at
    review.nextReviewAt = localDayStartIso(new Date(at), days)
    review.completedReviewCount += 1
    review.mastered = false
  }
  task.feedbackEvents.push({ source: 'self-assessment', rulesVersion: 1, itemId: progress.id, feedback, at, revision: task.sessionRevision })
  task.view = 'feedback'; task.sessionRevision += 1
}
