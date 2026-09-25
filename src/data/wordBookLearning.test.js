import { expect, test } from 'vitest'
import { createInlineWordBookSession, createRemoteWordBookSession } from './wordBookSession'

test('inline learning uses requested default order and retrieves fixed ids', async () => {
  const session = createInlineWordBookSession([{ word: 'beta', frequency: 10 }, { word: 'alpha', frequency: 1 }])
  expect(await session.loadLearningOrder('frequency')).toEqual(['beta', 'alpha'])
  expect(await session.loadLearningOrder('alphabetical')).toEqual(['alpha', 'beta'])
  expect(await session.loadWords(['beta'])).toEqual([{ word: 'beta', frequency: 10 }])
  await expect(session.loadWords(['missing'])).rejects.toThrow()
})

test('remote learning uses manifest default order, fetches only requested chunks and retries missing details', async () => {
  const manifest = { total: 2, defaultSort: 'frequency', indexUrl: 'index.json', chunks: ['a.json', 'b.json'], initialPage: { ids: ['beta', 'alpha'], chunkIds: ['b.json', 'a.json'] } }
  const index = { entries: [
    { word: 'alpha', meaning: 'a', partOfSpeech: 'n.', frequency: 1, chunkId: 'a.json' },
    { word: 'beta', meaning: 'b', partOfSpeech: 'n.', frequency: 10, chunkId: 'b.json' },
  ], orders: { alphabetical: ['alpha', 'beta'], frequency: ['beta', 'alpha'] } }
  const requests = []
  let broken = true
  const session = createRemoteWordBookSession(manifest, '/book/manifest.json', async url => {
    requests.push(url)
    return { ok: true, json: async () => url.endsWith('index.json') ? index : broken ? [] : [{ word: 'beta' }] }
  })
  expect(await session.loadLearningOrder()).toEqual(['beta', 'alpha'])
  await expect(session.loadWords(['beta'])).rejects.toThrow()
  broken = false
  expect(await session.loadWords(['beta'])).toEqual([{ word: 'beta' }])
  expect(requests).not.toContain('/book/a.json')
})
