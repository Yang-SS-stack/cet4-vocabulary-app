import { removeSelectionPreference } from '../../test/legacyLearningSnapshot'
import { expect, test } from 'vitest'
import { createLearningStore } from './store'
import { createBrowserLearningStore } from './browserStore'
import { LEARNING_STORAGE_KEY, SCHEMA_VERSION } from './model'

const guided = { id: 'guided-recall', rulesVersion: 1 }
const options = [
  { word: 'beta', meaning: '第二个' },
  { word: 'alpha', meaning: '第一个' },
  { word: 'gamma', meaning: '第三个' },
  { word: 'delta', meaning: '第四个' },
]
const token = (task) => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision })
function environment() {
  let date = new Date(2026, 8, 24, 12)
  let raw = null
  let fail = false
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw new Error('quota'); raw = value } }
  const open = () => createLearningStore({ random: () => 0.999, storage, now: () => date })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 2 })
  const task = store.ensureTodayLearning('cet4', ['alpha', 'beta'], store.getToday(), store.getSnapshot().settings, guided)
  return { store, open, storage, task, nextDay: () => { date = new Date(2026, 8, 25) }, fail: value => { fail = value } }
}

test('prepares stable validated choices and persists correct first answer before revealing details', () => {
  const { store, open, task } = environment()
  expect(task.method).toEqual(guided)
  expect(task.choice).toBe(null)
  expect(() => store.prepareLearningChoice(token(task), options.slice(0, 3))).toThrow()
  expect(() => store.prepareLearningChoice(token(task), [...options.slice(0, 3), options[0]])).toThrow()
  expect(() => store.prepareLearningChoice(token(task), options.map(o => ({ ...o, meaning: 'same' })))).toThrow()
  expect(() => store.prepareLearningChoice(token(task), options.map(o => ({ ...o, word: o.word === 'alpha' ? 'absent' : o.word })))).toThrow()
  store.prepareLearningChoice(token(task), options)
  const prepared = store.getTask('learning')
  expect(prepared.choice).toEqual({ options, selectedWord: null, revealed: false })
  expect(open().getTask('learning').choice).toEqual(prepared.choice)
  expect(store.prepareLearningChoice(token(prepared), [...options].reverse())).toEqual(prepared)
  store.submitLearningChoice(token(prepared), 'alpha')
  const feedback = store.getTask('learning')
  expect(feedback.view).toBe('feedback')
  expect(feedback.choice).toMatchObject({ selectedWord: 'alpha', revealed: false })
  expect(feedback.items[task.currentItemId].knownCount).toBe(1)
  expect(feedback.feedbackEvents.at(-1)).toMatchObject({ source: 'guided-choice', outcome: 'correct', selectedWord: 'alpha' })
  expect(() => store.submitLearningChoice(token(prepared), 'alpha')).toThrow()
  expect(() => store.advanceLearning(token(feedback))).toThrow()
  store.revealLearningDetails(token(feedback))
  expect(open().getTask('learning').choice.revealed).toBe(true)
  store.advanceLearning(token(store.getTask('learning')))
  expect(store.getTask('learning').choice).toBe(null)
})

test('wrong choice and show answer remain at zero with typed evidence outside mistake threshold', () => {
  const { store, task } = environment()
  store.prepareLearningChoice(token(task), options)
  store.submitLearningChoice(token(store.getTask('learning')), 'beta')
  let current = store.getTask('learning')
  expect(current.choice).toMatchObject({ selectedWord: 'beta', revealed: false })
  expect(current.items[task.currentItemId].knownCount).toBe(0)
  expect(current.items[task.currentItemId].unknownCount).toBe(0)
  expect(current.feedbackEvents.at(-1).outcome).toBe('incorrect')
  expect(store.getMistake('alpha').unknownCount).toBe(0)
  store.revealLearningDetails(token(current))
  store.advanceLearning(token(store.getTask('learning')))
  const next = store.getTask('learning')
  store.prepareLearningChoice(token(next), [
    { word: 'alpha', meaning: '第一个' }, ...options.slice(0, 1), ...options.slice(2),
  ])
  store.submitLearningChoice(token(store.getTask('learning')), null)
  current = store.getTask('learning')
  expect(current.choice).toMatchObject({ selectedWord: null, revealed: true })
  expect(current.items[next.currentItemId].knownCount).toBe(0)
  expect(current.feedbackEvents.at(-1).outcome).toBe('show-answer')
  expect(store.getMistake('beta').unknownCount).toBe(0)
})

test('guided self assessment starts after one correct choice; stale, midnight and failed writes do not publish', () => {
  const env = environment()
  const { store, task } = env
  expect(() => store.submitSelfAssessment(token(task), 'known')).toThrow()
  store.prepareLearningChoice(token(task), options)
  const ready = store.getTask('learning')
  env.fail(true)
  expect(() => store.submitLearningChoice(token(ready), 'alpha')).toThrow('quota')
  expect(store.getTask('learning')).toBe(ready)
  env.fail(false)
  store.submitLearningChoice(token(ready), 'alpha')
  store.revealLearningDetails(token(store.getTask('learning')))
  store.advanceLearning(token(store.getTask('learning')))
  store.prepareLearningChoice(token(store.getTask('learning')), [
    { word: 'alpha', meaning: '第一个' }, ...options.slice(0, 1), ...options.slice(2),
  ])
  env.nextDay()
  expect(() => store.submitLearningChoice(token(store.getTask('learning', task.date)), null)).toThrow()
  expect(store.getTask('learning', task.date).feedbackEvents).toHaveLength(1)
})

test('guided later encounters use self assessment and a wrong first pick cannot call it', () => {
  const { store, task } = environment()
  store.prepareLearningChoice(token(task), options)
  expect(() => store.submitLearningChoice(token(store.getTask('learning')), 'absent')).toThrow()
  store.submitLearningChoice(token(store.getTask('learning')), 'alpha')
  store.revealLearningDetails(token(store.getTask('learning')))
  store.advanceLearning(token(store.getTask('learning')))
  const beta = store.getTask('learning')
  store.prepareLearningChoice(token(beta), [{ word: 'alpha', meaning: '第一个' }, ...options.slice(0, 1), ...options.slice(2)])
  store.submitLearningChoice(token(store.getTask('learning')), null)
  store.advanceLearning(token(store.getTask('learning')))
  // The next round reverses the two-word order; beta still needs its first recall.
  expect(store.getTask('learning').currentItemId).toBe(beta.currentItemId)
  expect(() => store.submitSelfAssessment(token(store.getTask('learning')), 'known')).toThrow()
  store.prepareLearningChoice(token(store.getTask('learning')), options)
  store.submitLearningChoice(token(store.getTask('learning')), null)
  store.advanceLearning(token(store.getTask('learning')))
  expect(store.getTask('learning').currentItemId).toBe(task.currentItemId)
  expect(store.getTask('learning').choice).toBe(null)
  store.submitSelfAssessment(token(store.getTask('learning')), 'known')
  expect(store.getTask('learning').items[task.currentItemId].knownCount).toBe(2)
  expect(store.getTask('learning').feedbackEvents.map(event => event.source)).toEqual([
    'guided-choice', 'guided-choice', 'guided-choice', 'self-assessment',
  ])
})

test('v2 migration adds choice without changing legacy method and persists only after successful write', () => {
  const env = environment()
  const old = JSON.parse(JSON.stringify(env.store.getSnapshot()))
  old.version = 2; removeSelectionPreference(old)
  delete old.extraLearning
  for (const tasks of Object.values(old.days)) for (const task of Object.values(tasks)) {
    task.method = { id: 'self-assessment', rulesVersion: 1 }
    delete task.choice
  }
  const raw = JSON.stringify(old)
  env.storage.setItem(LEARNING_STORAGE_KEY, raw)
  const migrated = env.open()
  expect(migrated.getSnapshot().version).toBe(SCHEMA_VERSION)
  expect(migrated.getTask('learning').method.id).toBe('self-assessment')
  expect(migrated.getTask('learning').choice).toBe(null)
  expect(env.storage.getItem(LEARNING_STORAGE_KEY)).toBe(raw)
  migrated.updateSettings({ dailyNewWords: 3 })
  expect(env.open().getTask('learning').choice).toBe(null)
})

test('browser wrapper serializes guided commands and rejects duplicate submissions', async () => {
  let raw = null
  let queue = Promise.resolve()
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  const locks = { request: (_, __, work) => { const result = queue.then(work); queue = result.catch(() => {}); return result } }
  const store = createBrowserLearningStore({ storage, locks, now: () => new Date(2026, 8, 24, 12) })
  await store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  const task = await store.ensureTodayLearning('cet4', ['alpha'], store.getToday(), store.getSnapshot().settings, guided)
  await store.prepareLearningChoice(token(task), options)
  const current = store.getTask('learning')
  const results = await Promise.allSettled([
    store.submitLearningChoice(token(current), 'alpha'), store.submitLearningChoice(token(current), 'alpha'),
  ])
  expect(results.map(x => x.status)).toEqual(['fulfilled', 'rejected'])
  expect(store.getTask('learning').feedbackEvents).toHaveLength(1)
})

test('rejects a saved guided choice that disagrees with its progress or event', () => {
  const env = environment()
  env.store.prepareLearningChoice(token(env.task), options)
  env.store.submitLearningChoice(token(env.store.getTask('learning')), 'alpha')
  const valid = JSON.parse(env.storage.getItem(LEARNING_STORAGE_KEY))
  const task = valid.days[env.task.date].learning
  const altered = JSON.parse(JSON.stringify(valid))
  altered.days[env.task.date].learning.items[task.currentItemId].knownCount = 0
  altered.days[env.task.date].learning.items[task.currentItemId].lastFeedback = null
  env.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(altered))
  expect(() => env.open()).toThrow()
  altered.days[env.task.date].learning.items[task.currentItemId] = task.items[task.currentItemId]
  altered.days[env.task.date].learning.feedbackEvents[0].outcome = 'incorrect'
  env.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(altered))
  expect(() => env.open()).toThrow()
})
