import { expect, test, vi } from 'vitest'
import { createInlineWordBookSession } from './wordBookSession'

const words = [
  { word: 'zebra', meaning: '斑马', partOfSpeech: 'n', frequency: 1 },
  { word: 'apple', meaning: '苹果', partOfSpeech: 'n', frequency: 3 },
  { word: 'carry', meaning: '携带', partOfSpeech: 'v', frequency: 2 },
]

test('provides the same paged filtering and sorting interface for inline words without fetching', async () => {
  const fetchImpl = vi.fn()
  const session = createInlineWordBookSession(words, fetchImpl)
  await expect(session.indexReady).resolves.toBeUndefined()
  await expect(session.loadPage({ sort: 'frequency', page: 1, query: '名词' })).resolves.toEqual({
    words: [words[1], words[0]], total: 2, totalPages: 1,
  })
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('reports at least one page when an inline search has no matches', async () => {
  const session = createInlineWordBookSession(words)
  await expect(session.loadPage({ sort: 'alphabetical', page: 1, query: '不存在' })).resolves.toEqual({
    words: [], total: 0, totalPages: 1,
  })
})
