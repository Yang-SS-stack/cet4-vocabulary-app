import { createLearningStore } from './store'
import { assert, LEARNING_STORAGE_KEY } from './model'

// All browser mutations (including settings) use the same origin-wide lock.
// The synchronous core is retained for deterministic tests and legacy callers.
export function createBrowserLearningStore({ locks = globalThis.navigator?.locks, ...options } = {}) {
  const core = createLearningStore(options)
  const reads = new Set(['getSnapshot', 'readAssistantSnapshot', 'subscribe', 'getWord', 'getMistake', 'getTask',
    'getReviewLibrary', 'getDueReviews', 'getMistakes', 'getDailyStats', 'getToday', 'reload',
    'getExtraLearning', 'getExtraLearningProcess', 'getReviewOverview'])
  const writes = new Set(['updateSettings', 'ensureTodayLearning', 'prepareLearningChoice',
    'submitLearningChoice', 'revealLearningDetails', 'submitSelfAssessment', 'correctLearningFeedback', 'advanceLearning', 'ensureExtraLearning',
    'ensureTodayReview', 'prepareReviewChoice', 'submitReviewChoice', 'revealReviewDetails', 'submitReviewFeedback', 'correctReviewFeedback', 'advanceReview'])
  return Object.fromEntries(Object.entries(core).filter(([name]) => reads.has(name) || writes.has(name)).map(([name, method]) => [name,
    reads.has(name) ? method : async (...args) => {
      assert(typeof locks?.request === 'function', 'Safe storage lock unavailable')
      return locks.request(LEARNING_STORAGE_KEY, { mode: 'exclusive' }, () => method(...args))
    },
  ]))
}
