import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { expect, test } from 'vitest'

const loadJson = async (path) => JSON.parse(await readFile(join(process.cwd(), path), 'utf8'))

test('supplemental examples cover every missing example in both CET-4 books', async () => {
  const supplemental = await loadJson('src/data/supplementalExamples.json')
  const books = await Promise.all([
    loadJson('public/data/cet4.json'),
    loadJson('public/data/cet4-high-frequency.json'),
  ])
  const missing = books.map((book) => book.filter((entry) => !entry.example?.trim()))
  expect(missing.map((entries) => entries.length)).toEqual([95, 21])
  const missingWords = new Set(missing.flat().map((entry) => entry.word.toLowerCase()))
  expect(Object.keys(supplemental).sort()).toEqual([...missingWords].sort())
  for (const entries of missing) {
    for (const entry of entries) {
      expect(supplemental[entry.word.toLowerCase()], entry.word).toBeDefined()
    }
  }
})

test('every supplement contains a short English sentence using the word and a Chinese translation', async () => {
  const supplemental = await loadJson('src/data/supplementalExamples.json')
  // The source misspells reservoir as reservior in one entry; teach the correct spelling.
  const spellingCorrections = { reservior: 'reservoir' }
  for (const [word, entry] of Object.entries(supplemental)) {
    expect(word).toBe(word.trim().toLowerCase())
    expect(Object.keys(entry).sort()).toEqual(['example', 'translation'])
    expect(typeof entry.example, word).toBe('string')
    expect(typeof entry.translation, word).toBe('string')
    expect(entry.example, word).toMatch(/[.!?]$/)
    expect(entry.example.trim().split(/\s+/).length, word).toBeLessThanOrEqual(20)
    expect(entry.example, word).toMatch(new RegExp(`\\b${spellingCorrections[word] || word}\\b`, 'i'))
    expect(entry.translation, word).toMatch(/[\u3400-\u9fff]/)
    expect(entry.translation, word).toBe(entry.translation.trim())
    expect(entry.example, word).not.toMatch(/example sentence|means? the word|word means?/i)
  }
})
