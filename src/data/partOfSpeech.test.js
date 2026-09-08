import { expect, test } from 'vitest'
import { describePartOfSpeech, matchesWordQuery } from './partOfSpeech'

test('explains mixed and legacy part-of-speech abbreviations in Chinese without duplicates', () => {
  expect(describePartOfSpeech('v/n/vt')).toBe('动词 · 名词 · 及物动词')
  expect(describePartOfSpeech('n & a/n/adj')).toBe('名词 · 形容词')
  expect(describePartOfSpeech('(缩作OK)a&ad')).toBe('形容词 · 副词')
  expect(describePartOfSpeech('vi&vt&aux')).toBe('不及物动词 · 及物动词 · 助动词')
  expect(describePartOfSpeech('')).toBe('暂无词性')
})

test('searches Chinese and English POS labels exactly and keeps transitive and intransitive distinct', () => {
  const noun = { word: 'apple', meaning: '苹果', partOfSpeech: 'n' }
  const verb = { word: 'listen', meaning: '听', partOfSpeech: 'vi' }
  expect(matchesWordQuery(noun, '名词')).toBe(true)
  expect(matchesWordQuery(noun, 'N.')).toBe(true)
  expect(matchesWordQuery(noun, 'noun')).toBe(true)
  expect(matchesWordQuery(verb, '动词')).toBe(true)
  expect(matchesWordQuery(verb, '不及物动词')).toBe(true)
  expect(matchesWordQuery(verb, '及物动词')).toBe(false)
  expect(matchesWordQuery(verb, 'vt.')).toBe(false)
  expect(matchesWordQuery(noun, '动词')).toBe(false)
  expect(matchesWordQuery(noun, ' APP ')).toBe(true)
  expect(matchesWordQuery(noun, '苹果')).toBe(true)
  expect(matchesWordQuery(noun, '不存在')).toBe(false)
  expect(matchesWordQuery(noun, '')).toBe(true)
  expect(matchesWordQuery({ word: 'art', partOfSpeech: 'n' }, 'art')).toBe(true)
  expect(matchesWordQuery({ word: 'article', partOfSpeech: 'n' }, 'article')).toBe(true)
  expect(matchesWordQuery({ word: 'kind', partOfSpeech: 'adj' }, 'a.')).toBe(true)
  expect(matchesWordQuery({ word: 'slowly', partOfSpeech: 'ad' }, 'ad.')).toBe(true)
})
