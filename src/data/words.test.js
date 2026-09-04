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
    expect.objectContaining({ id: 'cet4', dataUrl: '/data/cet4.json' }),
    expect.objectContaining({ id: 'cet4-high-frequency', dataUrl: '/data/cet4-high-frequency.json' }),
  ]))
  expect(wordBooks.every((book) => !('words' in book))).toBe(true)
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
