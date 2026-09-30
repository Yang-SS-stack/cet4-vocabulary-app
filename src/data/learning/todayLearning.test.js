import { expect, test } from 'vitest'
import { createLearningStore } from './store'
import { LEARNING_STORAGE_KEY } from './model'

function environment() {
  let date = new Date(2026, 8, 24, 23, 59)
  let raw = null
  let fail = false
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw new Error('quota'); raw = value } }
  const open = () => createLearningStore({ storage, now: () => date })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 2 })
  return { store, open, storage, nextDay: () => { date = new Date(2026, 8, 25) }, fail: (value) => { fail = value } }
}
const token = (task) => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision })
function answer(store, feedback) { store.submitSelfAssessment(token(store.getTask('learning')), feedback) }
function advance(store) { store.advanceLearning(token(store.getTask('learning'))) }

test('creates capped unique candidates in supplied book order, snapshots settings and restores unchanged', () => {
  const { store, open } = environment()
  const task = store.ensureTodayLearning('cet4', ['beta', 'beta', 'alpha', 'gamma'])
  expect(Object.values(task.items).map(x => x.wordId)).toEqual(['beta', 'alpha'])
  expect(task.method).toEqual({ id: 'self-assessment', rulesVersion: 1 })
  store.updateSettings({ dailyNewWords: 1, todayWordBookId: 'other' })
  expect(store.ensureTodayLearning('other', ['different'])).toEqual(task)
  expect(open().getTask('learning')).toEqual(task)
})

test('feedback and detail are one write; rejects replay, wrong item and stale next tokens', () => {
  const { store, open } = environment()
  const task = store.ensureTodayLearning('cet4', ['alpha', 'beta'])
  expect(() => store.submitSelfAssessment({ ...token(task), itemId: task.itemIds[1] }, 'known')).toThrow()
  answer(store, 'known')
  expect(open().getTask('learning')).toMatchObject({ view: 'feedback', currentItemId: task.currentItemId })
  expect(() => store.submitSelfAssessment(token(task), 'known')).toThrow()
  const detail = token(store.getTask('learning'))
  advance(store)
  expect(open().getTask('learning')).toMatchObject({ view: 'question', currentItemId: task.itemIds[1] })
  expect(() => store.advanceLearning(detail)).toThrow()
})

test('self assessment rules, five unknowns and removal re-entry keep typed evidence', () => {
  const { store } = environment()
  store.ensureTodayLearning('cet4', ['alpha'])
  for (const feedback of ['known', 'known', 'fuzzy', 'unknown', 'fuzzy']) { answer(store, feedback); advance(store) }
  expect(Object.values(store.getTask('learning').items)[0].knownCount).toBe(0)
  for (let i = 0; i < 4; i++) { answer(store, 'unknown'); advance(store) }
  expect(store.getMistake('alpha')).toMatchObject({ entered: true, unknownCount: 5 })
  store.removeFromMistakes('alpha')
  for (let i = 0; i < 5; i++) { answer(store, 'unknown'); advance(store) }
  expect(store.getMistake('alpha')).toMatchObject({ removed: false, unknownCount: 10 })
  for (let i = 0; i < 3; i++) { answer(store, 'known'); advance(store) }
  expect(store.getWord('cet4', 'alpha').learning.completed).toBe(true)
  expect(store.getTask('learning').currentItemId).toBe(null)
  expect(store.getTask('learning').feedbackEvents.every(e => e.source === 'self-assessment')).toBe(true)
})

test('midnight rejects old feedback and starts remaining words at zero, excluding completed words', () => {
  const { store, nextDay } = environment()
  store.ensureTodayLearning('cet4', ['alpha'])
  answer(store, 'known'); advance(store)
  const old = store.getTask('learning')
  nextDay()
  expect(() => store.submitSelfAssessment(token(old), 'known')).toThrow()
  store.ensureTodayLearning('cet4', ['alpha'])
  expect(Object.values(store.getTask('learning').items)[0].knownCount).toBe(0)
  expect(store.getTask('learning', old.date)).toEqual(old)
  for (let i = 0; i < 3; i++) { answer(store, 'known'); advance(store) }
  // A different book is independent; the next date still filters this book's completion.
  const raw = JSON.stringify(store.getSnapshot())
  const tomorrow = createLearningStore({ storage: { getItem: () => raw, setItem() {} }, now: () => new Date(2026, 8, 26) })
  expect(tomorrow.ensureTodayLearning('cet4', ['alpha', 'beta']).itemIds).toHaveLength(1)
})

test('failed saves and other instances never publish or overwrite progress; reload recovers', () => {
  const env = environment()
  env.store.ensureTodayLearning('cet4', ['alpha'])
  const before = env.store.getSnapshot()
  env.fail(true)
  expect(() => answer(env.store, 'unknown')).toThrow('quota')
  expect(env.store.getSnapshot()).toBe(before)
  env.fail(false)
  const other = env.open()
  answer(other, 'known')
  expect(() => answer(env.store, 'unknown')).toThrow(/elsewhere/)
  env.store.reload()
  expect(env.store.getSnapshot()).toEqual(other.getSnapshot())
})

test('version one records migrate without changing old progress or overwriting until a write succeeds', () => {
  const env = environment()
  env.store.ensureTask('learning', ['alpha'], 'cet4')
  env.store.recordFeedback('learning', 'alpha', 'known')
  const legacy = JSON.parse(JSON.stringify(env.store.getSnapshot()))
  legacy.version = 1
  delete legacy.extraLearning
  for (const tasks of Object.values(legacy.days)) for (const task of Object.values(tasks)) {
    delete task.method; delete task.sessionRevision; delete task.feedbackEvents; delete task.choice
  }
  const raw = JSON.stringify(legacy)
  env.storage.setItem(LEARNING_STORAGE_KEY, raw)
  const migrated = env.open()
  expect(migrated.getSnapshot().version).toBe(6)
  expect(migrated.getTask('learning').items).toEqual(legacy.days['2026-09-24'].learning.items)
  expect(env.storage.getItem(LEARNING_STORAGE_KEY)).toBe(raw)
  migrated.updateSettings({ dailyNewWords: 3 })
  expect(env.open().getTask('learning').items).toEqual(migrated.getTask('learning').items)
})

test('empty candidates create one stable empty task; invalid quantity and changed loading date do not create', () => {
  const { store, nextDay } = environment()
  const date = store.getToday()
  store.updateSettings({ dailyNewWords: 0 })
  expect(() => store.ensureTodayLearning('cet4', ['alpha'])).toThrow()
  expect(store.getTask('learning')).toBe(null)
  store.updateSettings({ dailyNewWords: 2 })
  nextDay()
  expect(() => store.ensureTodayLearning('cet4', ['alpha'], date)).toThrow()
  const empty = store.ensureTodayLearning('cet4', [])
  expect(empty.itemIds).toEqual([])
  expect(store.ensureTodayLearning('cet4', ['alpha'])).toEqual(empty)
})

test('a failed next write leaves details intact, and old tokens cannot answer a later occurrence of the same word', () => {
  const env = environment()
  const task = env.store.ensureTodayLearning('cet4', ['alpha'])
  answer(env.store, 'known')
  const details = env.store.getTask('learning')
  env.fail(true)
  expect(() => advance(env.store)).toThrow('quota')
  expect(env.open().getTask('learning')).toEqual(details)
  env.fail(false)
  advance(env.store)
  expect(() => env.store.submitSelfAssessment(token(task), 'unknown')).toThrow()
  expect(env.store.getTask('learning').feedbackEvents).toHaveLength(1)
})

test('migration preserves review/mistake records and history, corrupt versions stay untouched', () => {
  const env = environment()
  env.store.ensureTask('learning', ['alpha'], 'cet4')
  env.store.recordFeedback('learning', 'alpha', 'unknown')
  env.store.addToReview('cet4', 'alpha')
  env.store.addToMistakes('alpha')
  const legacy = JSON.parse(JSON.stringify(env.store.getSnapshot()))
  legacy.version = 1
  delete legacy.extraLearning
  for (const tasks of Object.values(legacy.days)) for (const task of Object.values(tasks)) {
    delete task.method; delete task.sessionRevision; delete task.feedbackEvents; delete task.choice
  }
  env.storage.setItem('', JSON.stringify(legacy))
  const migrated = env.open().getSnapshot()
  expect(migrated.wordBooks).toEqual(legacy.wordBooks)
  expect(migrated.mistakes).toEqual(legacy.mistakes)
  expect(migrated.days['2026-09-24'].learning.items).toEqual(legacy.days['2026-09-24'].learning.items)
  for (const raw of ['{bad', JSON.stringify({ version: 999 }), JSON.stringify({ ...legacy, mistakes: {} })]) {
    env.storage.setItem('', raw)
    expect(() => env.open()).toThrow()
    expect(env.storage.getItem()).toBe(raw)
  }
})

test('legacy completed question resumes in details and can advance without losing completion', () => {
  const env = environment()
  env.store.ensureTask('learning', ['alpha', 'beta'], 'cet4')
  for (let i = 0; i < 3; i++) env.store.recordFeedback('learning', 'alpha', 'known')
  const legacy = JSON.parse(JSON.stringify(env.store.getSnapshot()))
  legacy.version = 1
  for (const book of Object.values(legacy.wordBooks)) for (const word of Object.values(book.words)) {
    if (word.review) delete word.review.provenance
  }
  delete legacy.extraLearning
  const task = legacy.days['2026-09-24'].learning
  delete task.method; delete task.sessionRevision; delete task.feedbackEvents; delete task.choice
  env.storage.setItem('', JSON.stringify(legacy))
  const migrated = env.open()
  expect(migrated.getTask('learning').view).toBe('feedback')
  advance(migrated)
  expect(migrated.getTask('learning').currentItemId).toBe(task.itemIds[1])
  expect(migrated.getWord('cet4', 'alpha').learning.completed).toBe(true)
})

test('legacy null position resumes the first unfinished word without changing counters', () => {
  const env = environment()
  env.store.ensureTask('learning', ['alpha'], 'cet4')
  env.store.setTaskSession('learning', { currentItemId: null })
  const legacy = JSON.parse(JSON.stringify(env.store.getSnapshot()))
  legacy.version = 1
  delete legacy.extraLearning
  const task = legacy.days['2026-09-24'].learning
  delete task.method; delete task.sessionRevision; delete task.feedbackEvents; delete task.choice
  env.storage.setItem('', JSON.stringify(legacy))
  const migrated = env.open().getTask('learning')
  expect(migrated.currentItemId).toBe(task.itemIds[0])
  expect(migrated.items).toEqual(task.items)
})
