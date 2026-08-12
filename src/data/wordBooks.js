import { words as cet4Words } from './words'
import { highFrequencyWords } from './highFrequencyWords'

export const wordBooks = [
  {
    id: 'cet4',
    label: 'CET-4',
    description: '大学英语四级核心词汇',
    wordListLabel: '四级单词',
    words: cet4Words,
  },
  {
    id: 'cet4-high-frequency',
    label: 'CET-4高频词汇',
    description: '大学英语四级高频词汇',
    wordListLabel: '四级高频单词',
    words: highFrequencyWords,
  },
]
