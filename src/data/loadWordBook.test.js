import { expect, test, vi } from 'vitest'
import { loadWordBook } from './loadWordBook'

test('returns inline words without requesting a data file', async () => {
  const fetchImpl = vi.fn()

  const words = await loadWordBook({ words: [{ word: 'access' }] }, fetchImpl)

  expect(words).toEqual([{ word: 'access' }])
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('reads and returns a word-book JSON array', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => [{ word: 'access' }],
  })

  await expect(loadWordBook({ dataUrl: '/data/cet4.json' }, fetchImpl)).resolves.toEqual([{ word: 'access' }])
  expect(fetchImpl).toHaveBeenCalledWith('/data/cet4.json')
})

test('rejects a failed or malformed word-book response', async () => {
  await expect(loadWordBook({ dataUrl: '/missing.json' }, async () => ({ ok: false }))).rejects.toThrow('Unable to load word book')
  await expect(loadWordBook({ dataUrl: '/bad.json' }, async () => ({
    ok: true,
    json: async () => ({}),
  }))).rejects.toThrow('Word book data must be an array')
})
