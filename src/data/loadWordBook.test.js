import { afterEach, expect, test, vi } from 'vitest'
import { clearWordBookCache, loadWordBook } from './loadWordBook'

const book = { id: 'test-book', dataUrl: '/data/word-books/test/manifest.json' }
const manifest = {
  total: 3,
  defaultSort: 'alphabetical',
  initialPage: { ids: ['abruptly'], chunkIds: ['chunks/00.json'] },
  indexUrl: 'search-index.json',
  chunks: ['chunks/00.json', 'chunks/01.json', 'chunks/02.json'],
}
const index = {
  entries: [
    { word: 'abruptly', meaning: '突然地', partOfSpeech: 'adv', frequency: null, chunkId: 'chunks/00.json' },
    { word: 'apple', meaning: '苹果', partOfSpeech: 'n', frequency: 2, chunkId: 'chunks/00.json' },
    { word: 'banana', meaning: '香蕉', partOfSpeech: 'n', frequency: 1, chunkId: 'chunks/01.json' },
  ],
  orders: { alphabetical: ['abruptly', 'apple', 'banana'], frequency: ['apple', 'banana', 'abruptly'] },
}
const chunks = {
  'chunks/00.json': [
    { word: 'abruptly', meaning: '突然地', partOfSpeech: 'adv', phonetic: '/a/', example: '', translation: '', phrases: [] },
    { word: 'apple', meaning: '苹果', partOfSpeech: 'n', phonetic: '/a/', example: '', translation: '', phrases: [], frequency: 2 },
  ],
  'chunks/01.json': [
    { word: 'banana', meaning: '香蕉', partOfSpeech: 'n', phonetic: '/b/', example: '', translation: '', phrases: [], frequency: 1 },
  ],
  'chunks/02.json': [
    { word: 'zulu', meaning: '祖鲁', partOfSpeech: 'n', phonetic: '/z/', example: '', translation: '', phrases: [] },
  ],
}

function jsonResponse(value) { return { ok: true, json: async () => value } }

function createFetch() {
  return vi.fn(async (url) => {
    if (url.endsWith('/manifest.json')) return jsonResponse(manifest)
    if (url.endsWith('/search-index.json')) return jsonResponse(index)
    const chunkId = Object.keys(chunks).find((candidate) => url.endsWith(`/${candidate}`))
    if (chunkId) return jsonResponse(chunks[chunkId])
    throw new Error(`Unexpected URL: ${url}`)
  })
}

afterEach(() => clearWordBookCache())

test('returns the first page before the background search index resolves', async () => {
  let resolveIndex
  const fetchImpl = vi.fn(async (url) => {
    if (url.endsWith('/manifest.json')) return jsonResponse(manifest)
    if (url.endsWith('/chunks/00.json')) return jsonResponse(chunks['chunks/00.json'])
    if (url.endsWith('/search-index.json')) return new Promise((resolve) => { resolveIndex = () => resolve(jsonResponse(index)) })
    throw new Error(`Unexpected URL: ${url}`)
  })

  const session = await loadWordBook(book, fetchImpl)
  await expect(session.loadPage({ sort: 'alphabetical', page: 1, query: '' }))
    .resolves.toMatchObject({ words: [expect.objectContaining({ word: 'abruptly' })] })
  expect(resolveIndex).toBeTypeOf('function')
  resolveIndex()
  await session.indexReady
})

test('reuses a session and does not refetch a completed detail chunk', async () => {
  const fetchImpl = createFetch()
  const first = await loadWordBook(book, fetchImpl)
  const second = await loadWordBook(book, fetchImpl)
  expect(second).toBe(first)
  await first.loadPage({ sort: 'alphabetical', page: 1, query: '' })
  await first.loadPage({ sort: 'alphabetical', page: 1, query: '' })
  expect(fetchImpl).toHaveBeenCalledTimes(3)
})

test('searches the complete index and loads only matching result page details', async () => {
  const fetchImpl = createFetch()
  const session = await loadWordBook(book, fetchImpl)
  const result = await session.loadPage({ sort: 'alphabetical', page: 1, query: '名词' })
  expect(result.total).toBe(2)
  expect(result.words).toEqual(expect.arrayContaining([expect.objectContaining({ word: 'apple' })]))
  expect(fetchImpl).not.toHaveBeenCalledWith('/data/word-books/test/chunks/02.json')
})

test('removes a failed manifest request from the cache so it can be retried', async () => {
  const fetchImpl = vi.fn()
    .mockResolvedValueOnce({ ok: false })
    .mockResolvedValueOnce(jsonResponse(manifest))
    .mockResolvedValueOnce(jsonResponse(index))
  await expect(loadWordBook(book, fetchImpl)).rejects.toThrow('Unable to load word book manifest')
  await expect(loadWordBook(book, fetchImpl)).resolves.toMatchObject({ loadPage: expect.any(Function) })
})
