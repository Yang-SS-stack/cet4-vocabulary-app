import { expect, test, vi } from 'vitest'
import { learningChoices } from './learningChoices'

const target = { word: 'target', meaning: '目标；对象' }
const pool = [
  { word: 'alpha', meaning: '苹果' },
  { word: 'beta', meaning: '香蕉' },
  { word: 'gamma', meaning: '葡萄' },
  { word: 'delta', meaning: '枣子' },
  { word: 'epsilon', meaning: '梨子' },
]

test('fresh questions sample beyond the first three valid distractors as randomness changes', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0)
  const first = learningChoices(target, pool)
  expect(first).toHaveLength(4)
  expect(first.filter(option => option.word === target.word)).toEqual([target])
  expect(first.some(option => ['delta', 'epsilon'].includes(option.word))).toBe(true)
  random.mockReturnValue(.999)
  const second = learningChoices(target, pool)
  expect(new Set(first.map(option => option.word))).not.toEqual(new Set(second.map(option => option.word)))
})

test('random ordering can place the correct answer in every position', () => {
  const random = vi.spyOn(Math, 'random')
  const positions = [
    [.999, .999, .999],
    [.999, .999, 0],
    [.999, 0, .999],
    [0, .999, .999],
  ].map(order => {
    random.mockReset().mockReturnValue(.999)
    // Leave the three-candidate pool unchanged, then vary answer ordering.
    for (const value of [.999, .999, ...order]) random.mockReturnValueOnce(value)
    return learningChoices(target, pool.slice(0, 3)).findIndex(option => option.word === target.word)
  })
  expect(new Set(positions)).toEqual(new Set([0, 1, 2, 3]))
})

test('excludes duplicate words, duplicate meanings and senses shared with the correct answer', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.999)
  const options = learningChoices(target, [
    { word: 'TARGET', meaning: '不同词义' },
    { word: 'same', meaning: '目标；对象' },
    { word: 'overlap', meaning: '事物，对象' },
    pool[0], { word: 'ALPHA', meaning: '杏子' },
    { word: 'duplicate', meaning: ' 苹果 ' },
    pool[1], pool[2],
  ])
  expect(new Set(options.map(option => option.word))).toEqual(new Set(['target', 'alpha', 'beta', 'gamma']))
  expect(new Set(options.map(option => option.meaning)).size).toBe(4)
})

test('excludes equivalent reordered senses and overlap between distractors', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.999)
  const options = learningChoices(target, [
    { word: 'alpha', meaning: '苹果；水果' },
    { word: 'reordered', meaning: '水果，苹果' },
    { word: 'overlap', meaning: '水果、果实' },
    pool[1], pool[2],
  ])
  expect(new Set(options.map(option => option.word))).toEqual(new Set(['target', 'alpha', 'beta', 'gamma']))
})

test('finds a valid trio when an earlier multi-sense distractor blocks the later candidates', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.999)
  const options = learningChoices(target, [
    { word: 'blocking', meaning: '苹果；香蕉；葡萄' },
    ...pool.slice(0, 3),
  ])
  expect(new Set(options.map(option => option.word))).toEqual(new Set(['target', 'alpha', 'beta', 'gamma']))
})

test('skips missing, non-text and empty choice content without changing the supplied pool', () => {
  vi.spyOn(Math, 'random').mockReturnValue(.999)
  const candidates = [
    null, {}, { word: 'blank', meaning: '  ' },
    { word: 'separators', meaning: '；, 、\n' },
    { word: 'number', meaning: 42 }, { meaning: '缺少单词' },
    { word: '', meaning: '空单词' }, { word: 42, meaning: '数字单词' },
    ...pool.slice(0, 3),
  ]
  const before = structuredClone(candidates)
  const options = learningChoices(target, candidates)
  expect(new Set(options.map(option => option.word))).toEqual(new Set(['target', 'alpha', 'beta', 'gamma']))
  expect(candidates).toEqual(before)
  expect(target).toEqual({ word: 'target', meaning: '目标；对象' })
})

test.each([[], pool.slice(0, 1), pool.slice(0, 2), [pool[0], pool[0], pool[1]]].map(candidates => ({ candidates })))(
  'preserves the unavailable-content error when fewer than three valid distractors exist: $candidates', ({ candidates }) => {
    expect(() => learningChoices(target, candidates)).toThrow('choice content unavailable')
  },
)

test('reports unavailable content when pairwise overlaps leave no valid trio', () => {
  expect(() => learningChoices(target, [
    { word: 'apple', meaning: '苹果；水果' },
    { word: 'fruit', meaning: '水果' },
    { word: 'banana', meaning: '香蕉；水果' },
    { word: 'cherry', meaning: '樱桃' },
  ])).toThrow('choice content unavailable')
})

test.each([undefined, { word: 'target' }, { word: 'target', meaning: '  ' }, { word: 'target', meaning: '；,' }])(
  'reports unavailable content for an invalid correct answer: %j', item => {
    expect(() => learningChoices(item, pool)).toThrow('choice content unavailable')
  },
)
