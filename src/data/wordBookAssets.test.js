import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public')

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, 'utf8'))
}

async function readWordBookAssets(bookId) {
  const directory = path.join(publicDirectory, 'data', 'word-books', bookId)
  const manifest = await readJson(path.join(directory, 'manifest.json'))
  const index = await readJson(path.join(directory, 'search-index.json'))
  const chunks = await Promise.all(
    manifest.chunks.map(async (chunkUrl) => ({
      chunkUrl,
      words: await readJson(path.join(directory, chunkUrl)),
    })),
  )

  return { directory, manifest, index, chunks }
}

test('generated assets cover both production word books', async () => {
  const cet4 = await readWordBookAssets('cet4')
  const highFrequency = await readWordBookAssets('cet4-high-frequency')

  expect(cet4.manifest.total).toBe(4544)
  expect(highFrequency.manifest.total).toBe(2000)

  for (const assets of [cet4, highFrequency]) {
    const { manifest, index, chunks } = assets
    const entriesByWord = new Map(index.entries.map((entry) => [entry.word, entry]))
    const wordsByChunk = new Map(chunks.map(({ chunkUrl, words }) => [chunkUrl, words]))
    const allWords = chunks.flatMap(({ words }) => words)

    expect(index.entries).toHaveLength(manifest.total)
    expect(allWords).toHaveLength(manifest.total)
    expect(new Set(index.entries.map((entry) => entry.word)).size).toBe(manifest.total)
    expect(new Set(allWords.map((word) => word.word)).size).toBe(manifest.total)
    expect(manifest.initialPage.ids).toHaveLength(Math.min(21, manifest.total))
    expect(manifest.initialPage.chunkIds).toEqual(
      manifest.initialPage.ids.map((id) => entriesByWord.get(id)?.chunkId),
    )
    expect(manifest.initialPage.ids).toEqual(
      index.orders[manifest.defaultSort].slice(0, 21),
    )

    for (const entry of index.entries) {
      expect(entry).toMatchObject({
        word: expect.any(String),
        meaning: expect.any(String),
        partOfSpeech: expect.any(String),
        chunkId: expect.any(String),
      })
      expect(entry.frequency === null || (typeof entry.frequency === 'number' && entry.frequency >= 0)).toBe(true)
      expect(manifest.chunks).toContain(entry.chunkId)
      expect(wordsByChunk.get(entry.chunkId).some((word) => word.word === entry.word)).toBe(true)
    }

    for (const sort of ['alphabetical', 'frequency']) {
      expect(index.orders[sort]).toHaveLength(manifest.total)
      expect(new Set(index.orders[sort]).size).toBe(manifest.total)
      expect(index.orders[sort].every((id) => entriesByWord.has(id))).toBe(true)
    }

    for (const word of allWords) {
      expect(word).toMatchObject({
        word: expect.any(String),
        phonetic: expect.any(String),
        partOfSpeech: expect.any(String),
        meaning: expect.any(String),
        example: expect.any(String),
        translation: expect.any(String),
        phrases: expect.any(Array),
      })
    }
  }

  expect(highFrequency.chunks.flatMap(({ words }) => words).every((word) => typeof word.frequency === 'number')).toBe(true)
})
