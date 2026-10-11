export const SESSION_GOALS = [
  { id: 'progress', label: '保持备考进度' },
  { id: 'review', label: '优先复习' },
  { id: 'lighter', label: '减少负担' },
]
const count = value => Number.isSafeInteger(value) && value >= 0
const unavailable = message => ({ status: 'unavailable', newWords: null, reviewWords: null, message })

/** Read-only bounds: never creates a task or reconciles the review library. */
export function adviceAvailability(facts, settings) {
  if (!facts || !settings || !facts.book?.id || facts.book.id !== settings.todayWordBookId) return unavailable('请先选择词书并核对学习记录。')
  const { book, today, reviewLoad } = facts
  if (!count(book.totalWords) || !count(book.completedWords) || book.completedWords > book.totalWords || !today) return unavailable('词书剩余量无法确认，请核对资料。')
  if ([today.learning, today.review].some(task => task && task.wordBookId !== book.id)) return unavailable('今日冻结任务使用另一词书，请先核对任务词书。')
  const remaining = book.totalWords - book.completedWords
  const newWords = today.learning ? today.learning.remainingWords
    : count(settings.dailyNewWords) ? Math.min(settings.dailyNewWords, remaining) : null
  const reviewWords = today.review ? today.review.remainingWords
    : count(settings.dailyReviewWords) && reviewLoad?.wordBookId === book.id && count(reviewLoad.dueCount) && !reviewLoad.needsReconciliation
      ? Math.min(settings.dailyReviewWords, reviewLoad.dueCount) : null
  if (!count(newWords) || !count(reviewWords)) return unavailable('新词或待复习量无法确认；历史复习记录可能需要核对。仍可按原设置学习。')
  return { status: 'ready', newWords: Math.min(100, newWords), reviewWords: Math.min(100, reviewWords),
    newBasis: today.learning ? '今日冻结任务剩余' : '每日设置与词书剩余',
    reviewBasis: today.review ? '今日冻结任务剩余' : '每日设置与当前到期量' }
}

const estimate = (newWords, reviewWords) => Math.ceil((newWords * 60 + reviewWords * 20) / 300) * 5
function quantify(draft, newWords, reviewWords) {
  return { ...draft, newWords, reviewWords, newSeconds: newWords * 60, reviewSeconds: reviewWords * 20,
    estimatedMinutes: estimate(newWords, reviewWords),
    order: !newWords && !reviewWords ? 'none' : !newWords || draft.intent.goal === 'review' ? 'review-first' : !reviewWords ? 'new-first' : 'balanced' }
}

export function buildSessionAdvice({ facts, settings, intent }) {
  if (!Number.isSafeInteger(intent.availableMinutes) || intent.availableMinutes < 5 || intent.availableMinutes > 60 || !SESSION_GOALS.some(goal => goal.id === intent.goal)) throw new Error('Invalid session intent')
  const limits = adviceAvailability(facts, settings)
  const base = { source: 'rules', status: limits.status, intent: { ...intent }, limits, bookId: facts?.book?.id ?? null, message: limits.message ?? null }
  if (limits.status !== 'ready') return { ...base, newWords: null, reviewWords: null, estimatedMinutes: null, order: 'none' }
  const budget = Math.floor(intent.availableMinutes / 5) * 300
  const seconds = intent.goal === 'lighter' ? Math.floor(budget * 0.6) : budget
  let newWords = 0, reviewWords = 0
  if (intent.goal === 'review') {
    reviewWords = Math.min(limits.reviewWords, Math.floor(seconds / 20))
    newWords = Math.min(limits.newWords, Math.floor((seconds - reviewWords * 20) / 60))
  } else {
    newWords = Math.min(limits.newWords, Math.floor(seconds * 0.6 / 60))
    reviewWords = Math.min(limits.reviewWords, Math.floor((seconds - newWords * 60) / 20))
    newWords += Math.min(limits.newWords - newWords, Math.floor((seconds - newWords * 60 - reviewWords * 20) / 60))
  }
  return quantify(base, newWords, reviewWords)
}

export function adjustSessionAdvice(draft, { newWords, reviewWords }) {
  if (draft.status !== 'ready' || !count(newWords) || !count(reviewWords) || newWords > draft.limits.newWords || reviewWords > draft.limits.reviewWords) return { error: '数量需为整数，且不能超过当前可用量。' }
  if (estimate(newWords, reviewWords) > draft.intent.availableMinutes) return { error: '预计用时超过本次时间，请减少数量。' }
  return { draft: { ...quantify(draft, newWords, reviewWords), adjusted: true } }
}

/** Read-only async rule helper; the model provider uses a separate bound response envelope. */
export async function generateRuleAdvice({ facts, settings, intent, signal }) {
  if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
  return buildSessionAdvice({ facts, settings, intent })
}
