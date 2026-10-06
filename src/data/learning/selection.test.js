import { expect, test } from 'vitest'
import { selectLearningWords } from './selection'

test('sequential normalizes, deduplicates and excludes only completed words', () => {
  expect(selectLearningWords({ orderedWords: [' Alpha ', 'ALPHA', 'beta', 'gamma'], completedWords: ['BETA'], count: 4 })).toEqual(['alpha', 'gamma'])
})
test('random samples the entire remaining book and saves the drawn order without replacement', () => {
  expect(selectLearningWords({ orderedWords: ['a', 'b', 'c', 'd', 'e'], completedWords: ['b'], count: 2, mode: 'random', random: () => 0 })).toEqual(['c', 'd'])
})
test.each(['sequential', 'random'])('%s handles short and empty candidates', mode => {
  expect(selectLearningWords({ orderedWords: ['a', 'a'], count: 10, mode })).toEqual(['a'])
  expect(selectLearningWords({ orderedWords: [], count: 10, mode })).toEqual([])
  expect(selectLearningWords({ orderedWords: ['a'], count: 0, mode })).toEqual([])
})
test.each(['bad', null, 1])('rejects invalid mode %s', mode => {
  expect(() => selectLearningWords({ orderedWords: ['a'], count: 1, mode })).toThrow(/mode/)
})
test.each([-1, 1.5, null])('rejects invalid count %s', count => {
  expect(() => selectLearningWords({ orderedWords: ['a'], count })).toThrow(/count/)
})
test.each([-0.1, 1, NaN])('rejects invalid random result %s', value => {
  expect(() => selectLearningWords({ orderedWords: ['a', 'b'], count: 1, mode: 'random', random: () => value })).toThrow(/random/)
})
