import { expect, test } from 'vitest'
import { resolveAssistantRequest } from './assistantMockConversation'

const currentLesson = { source: 'today-learning', word: 'exhibit', wordId: 'exhibit', wordBookId: 'cet4', example: 'An exhibit.' }
test('explicit word outranks explicit selection which outranks the actual current lesson', () => {
  expect(resolveAssistantRequest('帮我记住 banana', { intent: 'memory', currentLesson, selection: { word: 'apple' } }).target.word).toBe('banana')
  expect(resolveAssistantRequest('单词记忆', { intent: 'memory', currentLesson, selection: { word: 'apple' } }).target.word).toBe('apple')
  expect(resolveAssistantRequest('单词记忆', { intent: 'memory', currentLesson }).target.word).toBe('exhibit')
})

test.each(['学习计划', '安排复习 90分钟'])('explicit memory request supersedes time clarification from %s', request => {
  const waiting = resolveAssistantRequest(request).session
  const result = resolveAssistantRequest('帮我记住 banana', { currentLesson, selection: { word: 'apple' } }, waiting)
  expect(result.stage).toBe('conversation')
  expect(result.target).toEqual({ source: 'explicit', word: 'banana' })
  expect(result.session.pending).toBeNull()
  expect(result.session.minutes).toBeUndefined()
  expect(result.text).toContain('尚未接入模型')
  // A later bare word cannot accidentally answer the superseded clarification.
  expect(resolveAssistantRequest('apple', {}, result.session).target).toBeUndefined()
})

test('switching from invalid time to explicit memory retains only the previously confirmed minutes', () => {
  const confirmed = resolveAssistantRequest('学习计划 15分钟').session
  const waiting = resolveAssistantRequest('安排复习 90分钟', {}, confirmed).session
  const result = resolveAssistantRequest('帮我记住 banana', {}, waiting)
  expect(result.target.word).toBe('banana')
  expect(result.session.pending).toBeNull()
  expect(result.session.minutes).toBe(15)
  const resumed = resolveAssistantRequest('学习计划', {}, result.session)
  expect(resumed.stage).toBe('plan')
  expect(resumed.availableMinutes).toBe(15)
})

test('explicit review draft outranks the plan chip fallback', () => {
  const result = resolveAssistantRequest('安排复习 20分钟', { intent: 'plan' })
  expect(result.goal).toBe('review')
  expect(result.availableMinutes).toBe(20)
  expect(result.userText).toBe('安排复习 20分钟')
})

test('explicit memory draft outranks a different chip fallback', () => {
  const result = resolveAssistantRequest('帮我记住 banana', { intent: 'plan', currentLesson }, { minutes: 15 })
  expect(result.target).toEqual({ source: 'explicit', word: 'banana' })
  expect(result.stage).toBe('conversation')
  expect(result.session.minutes).toBe(15)
})

test.each([
  ['单词记忆', 'memory', '你想记住哪个单词呢？'],
  ['专属练习', 'exercise', '你想练习哪个单词或知识点？请告诉我练习范围。'],
  ['学习答疑', 'question', '你遇到了什么问题呢？'],
])('explicit %s replaces an older time clarification without guessing a target', (request, pending, message) => {
  const waiting = resolveAssistantRequest('学习计划').session
  const result = resolveAssistantRequest(request, {}, waiting)
  expect(result.stage).toBe('conversation')
  expect(result.session.pending).toBe(pending)
  expect(result.target).toBeUndefined()
  expect(result.text).toBe(message)
})

test('ambiguous explicit memory interrupts old time but never falls back to the actual lesson', () => {
  const waiting = resolveAssistantRequest('学习计划').session
  const result = resolveAssistantRequest('帮我记住 banana apple', { currentLesson }, waiting)
  expect(result.session.pending).toBe('memory')
  expect(result.target).toBeUndefined()
  expect(result.text).toContain('一个单词')
  expect(result.session.minutes).toBeUndefined()
})

test('unknown input during old time clarification continues to ask for explicit minutes', () => {
  const waiting = resolveAssistantRequest('学习计划').session
  const result = resolveAssistantRequest('帮我订机票', {}, waiting)
  expect(result.stage).toBe('time')
  expect(result.session.pending).toBe('time')
  expect(result.target).toBeUndefined()
  expect(result.text).toContain('明确告诉我本次学习多少分钟')
})
test('ambiguous selected words and missing actual lesson identity clarify rather than falling back', () => {
  const selection = resolveAssistantRequest('单词记忆', { intent: 'memory', currentLesson, selection: { word: 'apple banana' } })
  expect(selection.target).toBeUndefined()
  const missing = resolveAssistantRequest('单词记忆', { intent: 'memory', currentLesson: { source: 'today-learning', word: 'exhibit' } })
  expect(missing.text).toBe('你想记住哪个单词呢？')
})
test('answer chip uses only supplied explicit selected text, with no inferred current-word question', () => {
  expect(resolveAssistantRequest('学习答疑', { intent: 'question', currentLesson }).text).toBe('你遇到了什么问题呢？')
  const supplied = resolveAssistantRequest('学习答疑', { intent: 'question', selection: { text: 'Why has he left?' } })
  expect(supplied.target.question).toBe('Why has he left?')
})
test('explicit draft rejected by plan action remains visible and cannot silently trigger prior time', () => {
  const result = resolveAssistantRequest('帮我订机票', { intent: 'plan' }, { minutes: 15 })
  expect(result.stage).not.toBe('plan')
  expect(result.userText).toBe('帮我订机票')
  expect(result.text).toContain('明确')
})
test('review and extra contexts cannot supply a current memory target', () => {
  for (const source of ['today-review', 'extra-learning']) expect(resolveAssistantRequest('单词记忆', { intent: 'memory', currentLesson: { ...currentLesson, source } }).target).toBeUndefined()
})
