import { assert, MISTAKE_ENTRY_THRESHOLD } from './model'

export const SELF_ASSESSMENT = Object.freeze({ id: 'self-assessment', rulesVersion: 1 })

// Presentation order can change without changing task.itemIds (the fixed assignment).
export function nextLearningItem(task) {
  const start = task.itemIds.indexOf(task.currentItemId)
  for (let offset = 1; offset <= task.itemIds.length; offset++) {
    const id = task.itemIds[(start + offset) % task.itemIds.length]
    if (!task.items[id].completed && !task.items[id].removed) return id
  }
  return null
}

export function requireLearningTurn(task, token, date, view) {
  assert(token?.date === date && task?.date === date, 'Learning date changed; start today again')
  assert(task.method?.id === SELF_ASSESSMENT.id && task.method.rulesVersion === 1, 'Unsupported learning method')
  assert(task.currentItemId !== null && task.currentItemId === token.itemId
    && task.sessionRevision === token.revision && task.view === view, 'Learning turn changed; reload progress')
  return task.items[token.itemId]
}

// Only self-assessment unknowns contribute to the existing mistake threshold.
export function applySelfAssessment(next, task, progress, feedback, at) {
  assert(['known', 'fuzzy', 'unknown'].includes(feedback), 'Invalid feedback')
  assert(!progress.completed && !progress.removed, 'Learning word already completed')
  progress.lastFeedback = feedback
  if (feedback === 'known') progress.knownCount += 1
  if (feedback === 'fuzzy') {
    progress.fuzzyCount += 1
    progress.knownCount = Math.max(0, progress.knownCount - 1)
  }
  if (feedback === 'unknown') {
    progress.unknownCount += 1
    progress.knownCount = 0
    const mistake = next.mistakes[progress.wordId]
    mistake.unknownCount += 1
    mistake.unknownCountSinceRemoval += 1
    mistake.lastErrorAt = at
    if (mistake.unknownCountSinceRemoval >= MISTAKE_ENTRY_THRESHOLD) {
      mistake.entered = true
      mistake.enteredAt ??= at
      mistake.removed = false
      mistake.removedAt = null
    }
  }
  progress.completed = progress.knownCount === 3
  if (progress.completed) {
    progress.completedAt = at
    const learning = next.wordBooks[progress.wordBookId].words[progress.wordId].learning
    learning.completed = true
    learning.completedAt ??= at
  }
  task.feedbackEvents.push({ source: 'self-assessment', rulesVersion: 1,
    itemId: progress.id, feedback, at, revision: task.sessionRevision })
  task.view = 'feedback'
  task.sessionRevision += 1
}
