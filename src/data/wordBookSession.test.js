import { expect, test, vi } from 'vitest'
import { createInlineWordBookSession, createRemoteWordBookSession } from './wordBookSession'

const words = [
  { word: 'zebra', meaning: '斑马', partOfSpeech: 'n', frequency: 1 },
  { word: 'apple', meaning: '苹果', partOfSpeech: 'n', frequency: 3 },
  { word: 'carry', meaning: '携带', partOfSpeech: 'v', frequency: 2 },
]

const manifest = {
  total: 1,
  defaultSort: 'alphabetical',
  indexUrl: 'search-index.json',
  chunks: ['chunks/00.json'],
  initialPage: { ids: ['apple'], chunkIds: ['chunks/00.json'] },
}

const index = {
  entries: [{ word: 'apple', meaning: '苹果', partOfSpeech: 'n', frequency: null, chunkId: 'chunks/00.json' }],
  orders: { alphabetical: ['apple'], frequency: ['apple'] },
}

function jsonResponse(value) {
  return { ok: true, json: async () => value }
}

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

test('clears a malformed detail chunk so a later corrected response can retry', async () => {
  let detailCalls = 0
  const fetchImpl = vi.fn(async (url) => {
    if (url.endsWith('search-index.json')) return jsonResponse(index)
    detailCalls += 1
    return jsonResponse(detailCalls === 1 ? [] : [{ word: 'apple', meaning: '苹果', partOfSpeech: 'n' }])
  })
  const session = createRemoteWordBookSession(manifest, '/data/word-books/test/manifest.json', fetchImpl)

  await expect(session.loadPage({ sort: 'alphabetical', page: 1, query: '' })).rejects.toThrow('missing apple')
  await expect(session.loadPage({ sort: 'alphabetical', page: 1, query: '' })).resolves.toMatchObject({
    words: [{ word: 'apple', meaning: '苹果' }],
  })
  expect(detailCalls).toBe(2)
})

test('retries a failed remote index and exposes a ready index after recovery', async () => {
  let indexCalls = 0
  const fetchImpl = vi.fn(async (url) => {
    if (url.endsWith('search-index.json')) {
      indexCalls += 1
      if (indexCalls === 1) return { ok: false, json: async () => index }
      return jsonResponse(index)
    }
    return jsonResponse([{ word: 'apple', meaning: '苹果', partOfSpeech: 'n' }])
  })
  const session = createRemoteWordBookSession(manifest, '/data/word-books/test/manifest.json', fetchImpl)

  await expect(session.loadIndex()).rejects.toThrow('Unable to load word book search index')
  await expect(session.loadIndex()).resolves.toEqual(index)
  await expect(session.indexReady).resolves.toBeUndefined()
  expect(indexCalls).toBe(2)
})
