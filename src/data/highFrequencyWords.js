import { words as cet4Words } from './words'

const frequencyByWord = {
  access: 46,
  ability: 30,
  academic: 25,
  anxiety: 14,
  affect: 12,
  achieve: 9,
}

export const highFrequencyWords = Object.entries(frequencyByWord)
  .map(([word, frequency]) => ({
    ...cet4Words.find((item) => item.word === word),
    frequency,
  }))
  .sort((first, second) => second.frequency - first.frequency)
