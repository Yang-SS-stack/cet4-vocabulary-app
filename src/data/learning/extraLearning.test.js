import { removeSelectionPreference } from '../../test/legacyLearningSnapshot'
import { expect, test } from 'vitest'
import { createLearningStore } from './store'
import { createBrowserLearningStore } from './browserStore'
import { LEARNING_STORAGE_KEY } from './model'
import { completedWordCount } from './recommendations'

function environment() {
  let date = new Date(2026, 8, 29, 23, 59)
  let raw = null
  let failed = false
  const storage = { getItem: () => raw, setItem: (_, value) => { if (failed) throw Error('quota'); raw = value } }
  const open = () => createLearningStore({ storage, now: () => date })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  return { store, storage, open, now: () => date, fail: value => { failed = value }, nextDay: () => { date = new Date(2026, 8, 30) } }
}
const token = task => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision,
  ...(task.kind === 'extra-learning' ? { kind: task.kind, taskId: task.taskId } : {}) })
function finish(store, getTask = () => store.getTask('learning')) {
  while (getTask().currentItemId !== null) {
    store.submitSelfAssessment(token(getTask()), 'known')
    store.advanceLearning(token(getTask()))
  }
}
function finishedDaily(env, method) {
  env.store.ensureTodayLearning('cet4', ['daily'], env.store.getToday(), env.store.getSnapshot().settings, method)
  if (method?.id === 'guided-recall') {
    const options = ['daily', 'a', 'b', 'c'].map(word => ({ word, meaning: word }))
    env.store.prepareLearningChoice(token(env.store.getTask('learning')), options)
    env.store.submitLearningChoice(token(env.store.getTask('learning')), 'daily')
    env.store.revealLearningDetails(token(env.store.getTask('learning')))
    env.store.advanceLearning(token(env.store.getTask('learning')))
  }
  finish(env.store)
}

test('extra learning is rejected until the fixed daily task has finished including its last detail', () => {
  const env = environment()
  expect(() => env.store.ensureExtraLearning(['alpha'])).toThrow(/daily task/)
  env.store.ensureTodayLearning('cet4', ['daily'])
  expect(() => env.store.ensureExtraLearning(['alpha'])).toThrow(/daily task/)
  for (let i = 0; i < 2; i++) { env.store.submitSelfAssessment(token(env.store.getTask('learning')), 'known'); env.store.advanceLearning(token(env.store.getTask('learning'))) }
  env.store.submitSelfAssessment(token(env.store.getTask('learning')), 'known')
  expect(() => env.store.ensureExtraLearning(['alpha'])).toThrow(/daily task/)
  env.store.advanceLearning(token(env.store.getTask('learning')))
  expect(env.store.ensureExtraLearning(['alpha']).kind).toBe('extra-learning')
})

test('extra batches follow book order, exclude finished words, keep daily facts and settings, and resume without new creation', () => {
  const env = environment()
  finishedDaily(env)
  const daily = env.store.getTask('learning')
  env.store.updateSettings({ dailyNewWords: 100, todayWordBookId: 'other', pronunciation: 'en-US' })
  const extra = env.store.ensureExtraLearning(['daily', 'beta', 'beta', 'alpha', 'gamma'])
  expect(Object.values(extra.items).map(item => item.wordId)).toEqual(['beta', 'alpha', 'gamma'])
  expect(extra.wordBookId).toBe(daily.wordBookId)
  expect(extra.settings).toEqual(daily.settings)
  expect(extra.method).toEqual(daily.method)
  expect(env.store.getTask('learning')).toEqual(daily)
  expect(env.store.ensureExtraLearning(['different'])).toBe(extra)
  expect(env.open().getExtraLearning()).toEqual(extra)
  expect(env.store.getExtraLearningProcess().batches).toHaveLength(1)
})

test('continues beyond daily limits in small batches, retains history, counts each book word once and ends idempotently', () => {
  const env = environment()
  finishedDaily(env)
  const words = ['daily', ...Array.from({ length: 25 }, (_, index) => `word${index}`)]
  const daily = env.store.getTask('learning')
  for (const count of [10, 10, 5]) {
    const batch = env.store.ensureExtraLearning(words)
    expect(batch.itemIds).toHaveLength(count)
    finish(env.store, () => env.store.getExtraLearning())
  }
  expect(env.store.getExtraLearningProcess().batches).toHaveLength(3)
  expect(env.store.getExtraLearningProcess().batches.map(batch => batch.taskId)).toEqual([
    '2026-09-29:extra:1', '2026-09-29:extra:2', '2026-09-29:extra:3',
  ])
  expect(env.store.ensureExtraLearning(words)).toBe(null)
  const done = env.store.getSnapshot()
  expect(env.store.getExtraLearningProcess().exhausted).toBe(true)
  expect(env.store.ensureExtraLearning(['newword'])).toBe(null)
  expect(env.store.getSnapshot()).toBe(done)
  expect(completedWordCount(done, 'cet4')).toBe(26)
  expect(env.store.getTask('learning')).toEqual(daily)
})

test('an empty book is saved as exhausted once without creating an invisible empty batch', () => {
  const env = environment()
  finishedDaily(env)
  expect(env.store.ensureExtraLearning(['daily'])).toBe(null)
  expect(env.store.getExtraLearningProcess()).toEqual({ batches: [], exhausted: true })
  const saved = env.storage.getItem()
  env.store.ensureExtraLearning([])
  expect(env.storage.getItem()).toBe(saved)
})

test('extra guided feedback and details restore exactly, duplicate and missing identity tokens cannot write', () => {
  const env = environment()
  finishedDaily(env, { id: 'guided-recall', rulesVersion: 1 })
  env.store.ensureExtraLearning(['alpha'])
  env.store.prepareLearningChoice(token(env.store.getExtraLearning()), ['alpha', 'a', 'b', 'c'].map(word => ({ word, meaning: word })))
  const turn = token(env.store.getExtraLearning())
  env.store.submitLearningChoice(turn, 'alpha')
  const feedback = env.open().getExtraLearning()
  expect(feedback.view).toBe('feedback')
  expect(feedback.choice.revealed).toBe(false)
  expect(() => env.store.submitLearningChoice(turn, 'alpha')).toThrow()
  expect(() => env.store.revealLearningDetails({ ...token(feedback), taskId: undefined })).toThrow()
  env.store.revealLearningDetails(token(feedback))
  expect(env.open().getExtraLearning().choice.revealed).toBe(true)
  expect(env.open().getExtraLearning().feedbackEvents).toHaveLength(1)
})

test('batch identity rejects a prior batch even if word, revision and date match', () => {
  const env = environment()
  finishedDaily(env)
  const old = env.store.ensureExtraLearning(['alpha'])
  finish(env.store, () => env.store.getExtraLearning())
  const next = env.store.ensureExtraLearning(['beta'])
  const stale = { ...token(next), taskId: old.taskId }
  expect(() => env.store.submitSelfAssessment(stale, 'known')).toThrow(/turn changed/)
  expect(() => env.store.submitSelfAssessment({ ...token(next), kind: 'learning' }, 'known')).toThrow()
  expect(env.store.getExtraLearning().feedbackEvents).toHaveLength(0)
})

test('date change rejects extra creation and feedback while keeping yesterday history', () => {
  const env = environment()
  finishedDaily(env)
  const extra = env.store.ensureExtraLearning(['alpha'])
  env.nextDay()
  expect(() => env.store.submitSelfAssessment(token(extra), 'known')).toThrow(/date changed/)
  expect(() => env.store.ensureExtraLearning(['beta'], extra.date)).toThrow(/date changed/)
  expect(env.store.getExtraLearning()).toBe(null)
  expect(env.store.getExtraLearning(extra.date)).toEqual(extra)
})

test('v3 guided choice migration preserves saved options and unrevealed feedback', () => {
  const env = environment()
  env.store.ensureTodayLearning('cet4', ['daily'], env.store.getToday(), env.store.getSnapshot().settings, { id: 'guided-recall', rulesVersion: 1 })
  env.store.prepareLearningChoice(token(env.store.getTask('learning')), ['daily', 'a', 'b', 'c'].map(word => ({ word, meaning: word })))
  env.store.submitLearningChoice(token(env.store.getTask('learning')), 'a')
  const legacy = JSON.parse(JSON.stringify(env.store.getSnapshot()))
  legacy.version = 3; removeSelectionPreference(legacy)
  delete legacy.extraLearning
  env.storage.setItem('', JSON.stringify(legacy))
  expect(env.open().getTask('learning')).toMatchObject(legacy.days[env.store.getToday()].learning)
})

test('invalid extra batch identity, duplicate batch words, unfinished history and mismatched daily facts stay untouched', () => {
  const env = environment()
  finishedDaily(env)
  env.store.ensureExtraLearning(['alpha'])
  const original = env.store.getSnapshot()
  const mutations = [
    state => { state.extraLearning['2026-09-29'].batches[0].taskId = 'wrong' },
    state => { state.extraLearning['2026-09-29'].batches.push(state.extraLearning['2026-09-29'].batches[0]) },
    state => { state.extraLearning['2026-09-29'].exhausted = true },
    state => { state.extraLearning['2026-09-29'].batches[0].settings.pronunciation = 'en-US' },
    state => { state.extraLearning['2026-09-29'] = { batches: [], exhausted: false } },
  ]
  for (const mutate of mutations) {
    const value = JSON.parse(JSON.stringify(original))
    mutate(value)
    const raw = JSON.stringify(value)
    env.storage.setItem('', raw)
    expect(() => env.open()).toThrow()
    expect(env.storage.getItem()).toBe(raw)
  }
})

test('failed batch creation, failed next and other pages do not overwrite extra progress', () => {
  const env = environment()
  finishedDaily(env)
  const before = env.store.getSnapshot()
  env.fail(true)
  expect(() => env.store.ensureExtraLearning(['alpha'])).toThrow('quota')
  expect(env.store.getSnapshot()).toBe(before)
  env.fail(false)
  env.store.ensureExtraLearning(['alpha'])
  env.store.submitSelfAssessment(token(env.store.getExtraLearning()), 'known')
  const details = env.store.getExtraLearning()
  env.fail(true)
  expect(() => env.store.advanceLearning(token(details))).toThrow('quota')
  expect(env.open().getExtraLearning()).toEqual(details)
  env.fail(false)
  const other = env.open()
  other.advanceLearning(token(details))
  expect(() => env.store.advanceLearning(token(details))).toThrow(/elsewhere/)
  env.store.reload()
  expect(env.store.getExtraLearning()).toEqual(other.getExtraLearning())
})

test.each([1, 2, 3])('v%s migration preserves records and only adds empty extra history in memory until saved', version => {
  const env = environment()
  finishedDaily(env)
  const legacy = JSON.parse(JSON.stringify(env.store.getSnapshot()))
  legacy.version = version; removeSelectionPreference(legacy)
  for (const book of Object.values(legacy.wordBooks)) for (const word of Object.values(book.words)) {
    if (word.review) delete word.review.provenance
  }
  delete legacy.extraLearning
  for (const day of Object.values(legacy.days)) for (const task of Object.values(day)) {
    if (version === 1) { delete task.method; delete task.sessionRevision; delete task.feedbackEvents }
    if (version < 3) delete task.choice
  }
  const raw = JSON.stringify(legacy)
  env.storage.setItem(LEARNING_STORAGE_KEY, raw)
  const migrated = env.open()
  expect(migrated.getSnapshot().version).toBe(7)
  expect(migrated.getSnapshot().extraLearning).toEqual({})
  expect(migrated.getSnapshot().wordBooks).toEqual(legacy.wordBooks)
  expect(migrated.getSnapshot().mistakes).toEqual(legacy.mistakes)
  expect(migrated.getTask('learning').items).toEqual(legacy.days[env.store.getToday()].learning.items)
  expect(env.storage.getItem()).toBe(raw)
  migrated.ensureExtraLearning(['alpha'])
  expect(env.open().getExtraLearning().items).toEqual(migrated.getExtraLearning().items)
})

test('browser extra writes use the shared lock, rejecting simultaneous stale creators and queued duplicate feedback', async () => {
  const env = environment()
  finishedDaily(env)
  let queue = Promise.resolve()
  const locks = { request: (_, __, work) => { const result = queue.then(work); queue = result.catch(() => {}); return result } }
  const open = () => createBrowserLearningStore({ storage: env.storage, now: env.now, locks })
  const a = open(), b = open()
  const creates = await Promise.allSettled([a.ensureExtraLearning(['alpha']), b.ensureExtraLearning(['alpha'])])
  expect(creates.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  b.reload()
  const turn = token(b.getExtraLearning())
  const answers = await Promise.allSettled([b.submitSelfAssessment(turn, 'known'), b.submitSelfAssessment(turn, 'known')])
  expect(answers.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(b.getExtraLearning().feedbackEvents).toHaveLength(1)
})
