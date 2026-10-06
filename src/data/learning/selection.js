import { assert, wordId } from './model'

// The caller persists this result once, after loading matching word details.
export function selectLearningWords({ orderedWords, completedWords = [], count, mode = 'sequential', random = Math.random }) {
  assert(['sequential', 'random'].includes(mode), 'Invalid selection mode')
  assert(Number.isSafeInteger(count) && count >= 0, 'Invalid selection count')
  assert(Array.isArray(orderedWords) && Array.isArray(completedWords), 'Invalid task candidates')
  const completed = new Set(completedWords.map(wordId))
  const candidates = [...new Set(orderedWords.map(wordId))].filter(id => !completed.has(id))
  if (mode === 'random' && count > 0) {
    for (let i = candidates.length - 1; i > 0; i -= 1) {
      const value = random()
      assert(Number.isFinite(value) && value >= 0 && value < 1, 'Invalid random source')
      const j = Math.floor(value * (i + 1))
      ;[candidates[i], candidates[j]] = [candidates[j], candidates[i]]
    }
  }
  return candidates.slice(0, count)
}
