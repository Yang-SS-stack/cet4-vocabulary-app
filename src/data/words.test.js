import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { wordBooks } from './wordBooks'
import { words } from './words'

test('contains the complete CET-4 vocabulary list', () => {
  expect(words).toHaveLength(4544)
  expect(new Set(words.map((word) => word.word)).size).toBe(words.length)
  expect(words.every((word) => word.word && word.meaning)).toBe(true)
  expect(words.every((word) => word.partOfSpeech && word.phonetic && Array.isArray(word.phrases))).toBe(true)
})

test('keeps production word books as data-file references', () => {
  expect(wordBooks).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'cet4', dataUrl: '/data/word-books/cet4/manifest.json' }),
    expect.objectContaining({ id: 'cet4-high-frequency', dataUrl: '/data/word-books/cet4-high-frequency/manifest.json' }),
  ]))
  expect(wordBooks.every((book) => !('words' in book))).toBe(true)
})

async function readGeneratedWords(bookId) {
  const directory = join(process.cwd(), 'public', 'data', 'word-books', bookId)
  const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'))
  const chunks = await Promise.all(manifest.chunks.map(async (chunkId) => (
    JSON.parse(await readFile(join(directory, chunkId), 'utf8'))
  )))
  return chunks.flat()
}

test('keeps generated word-book details aligned with the complete source data', async () => {
  const [generatedCet4, generatedHighFrequency] = await Promise.all([
    readGeneratedWords('cet4'),
    readGeneratedWords('cet4-high-frequency'),
  ])
  const sourceHighFrequency = JSON.parse(await readFile(join(process.cwd(), 'public', 'data', 'cet4-high-frequency.json'), 'utf8'))

  expect(generatedCet4).toHaveLength(words.length)
  expect(new Set(generatedCet4.map((word) => word.word))).toEqual(new Set(words.map((word) => word.word)))
  expect(generatedHighFrequency).toHaveLength(sourceHighFrequency.length)
  expect(new Set(generatedHighFrequency.map((word) => word.word))).toEqual(new Set(sourceHighFrequency.map((word) => word.word)))
})

test('keeps high-frequency words in descending order in a separate data file', async () => {
  const dataFile = join(process.cwd(), 'public', 'data', 'cet4-high-frequency.json')
  const highFrequencyWords = JSON.parse(await readFile(dataFile, 'utf8'))

  expect(highFrequencyWords).toHaveLength(2000)
  expect(new Set(highFrequencyWords.map((word) => word.word)).size).toBe(2000)
  expect(highFrequencyWords.every((word) => Number.isInteger(word.frequency) && word.frequency > 0)).toBe(true)
  expect(highFrequencyWords.every((word, index) => (
    index === 0 || highFrequencyWords[index - 1].frequency >= word.frequency
  ))).toBe(true)
  const cet4Words = new Set(words.map((word) => word.word))
  expect(highFrequencyWords.every((word) => cet4Words.has(word.word))).toBe(true)
})
