import { afterEach, expect, test, vi } from 'vitest'

afterEach(() => {
  vi.resetModules()
  vi.unstubAllEnvs()
})

test('prefixes generated word-book URLs with a non-root Vite base path', async () => {
  vi.stubEnv('BASE_URL', '/linguajet/')
  const { wordBooks } = await import('./wordBooks')

  expect(wordBooks.map((book) => book.dataUrl)).toEqual([
    '/linguajet/data/word-books/cet4/manifest.json',
    '/linguajet/data/word-books/cet4-high-frequency/manifest.json',
  ])
})
