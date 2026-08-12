import { expect, test } from 'vitest'
import { wordBooks } from './wordBooks'
import { words } from './words'

test('contains eighteen sample CET-4 words', () => {
  expect(words).toHaveLength(18)
})

test('keeps six CET-4 high-frequency test words in descending frequency order', () => {
  const highFrequencyBook = wordBooks.find((book) => book.id === 'cet4-high-frequency')

  expect(highFrequencyBook.words).toHaveLength(6)
  expect(highFrequencyBook.words.map((word) => word.frequency)).toEqual([46, 30, 25, 14, 12, 9])
})
