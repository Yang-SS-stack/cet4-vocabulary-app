import { expect, test } from 'vitest'
import { createLearningStore } from './store'
import { completedWordCount } from './recommendations'
import { LEARNING_STORAGE_KEY } from './model'

const guided = { id: 'guided-recall', rulesVersion: 1 }
const choices = ['alpha', 'beta', 'gamma', 'delta'].map(word => ({ word, meaning: word }))
const token = task => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision,
  ...(task.taskId ? { kind: task.kind, taskId: task.taskId } : {}) })
function setup(method = guided, words = ['alpha']) {
  let raw = null, fail = false, date = new Date(2026, 8, 30, 12)
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw Error('quota'); raw = value } }
  const open = () => createLearningStore({ storage, now: () => date })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: words.length })
  store.ensureTodayLearning('cet4', words, store.getToday(), store.getSnapshot().settings, method)
  return { store, open, storage, fail: value => { fail = value }, nextDay: () => { date = new Date(2026, 9, 1, 12) } }
}
function choiceKnown(store, get = () => store.getTask('learning')) {
  store.prepareLearningChoice(token(get()), choices)
  store.submitLearningChoice(token(get()), get().items[get().currentItemId].wordId)
  store.revealLearningDetails(token(get()))
}

test('corrects a revealed first correct choice once while preserving the original event and valid refresh', () => {
  const { store, open } = setup()
  choiceKnown(store)
  const before = store.getTask('learning')
  store.correctLearningFeedback(token(before))
  const after = store.getTask('learning')
  expect(after.items[after.currentItemId]).toMatchObject({ knownCount: 0, completed: false, lastFeedback: 'fuzzy', fuzzyCount: 1 })
  expect(after.choice).toMatchObject({ selectedWord: 'alpha', revealed: true })
  expect(after.feedbackEvents.map(event => event.source)).toEqual(['guided-choice', 'feedback-correction'])
  expect(open().getTask('learning')).toEqual(after)
  expect(() => store.correctLearningFeedback(token(after))).toThrow()
  expect(() => store.correctLearningFeedback(token(before))).toThrow()
})

test('third known correction revokes item and total completed word without adding unknown evidence', () => {
  const { store, open } = setup({ id: 'self-assessment', rulesVersion: 1 })
  for (let count = 0; count < 3; count++) {
    store.submitSelfAssessment(token(store.getTask('learning')), 'known')
    if (count < 2) store.advanceLearning(token(store.getTask('learning')))
  }
  expect(store.getDailyStats().completedWords).toBe(1)
  expect(completedWordCount(store.getSnapshot(), 'cet4')).toBe(1)
  expect(store.getWord('cet4', 'alpha').learning.completed).toBe(true)
  store.correctLearningFeedback(token(store.getTask('learning')))
  const task = open().getTask('learning')
  expect(task.items[task.currentItemId]).toMatchObject({ knownCount: 2, completed: false, completedAt: null })
  expect(store.getDailyStats().completedWords).toBe(0)
  expect(completedWordCount(store.getSnapshot(), 'cet4')).toBe(0)
  expect(store.getWord('cet4', 'alpha').learning).toEqual({ completed: false, completedAt: null })
  expect(store.getMistake('alpha').unknownCount).toBe(0)
  expect(task.feedbackEvents).toHaveLength(4)
})

test('wrong, show answer, fuzzy, unknown and unrevealed choice cannot be corrected', () => {
  const { store } = setup()
  store.prepareLearningChoice(token(store.getTask('learning')), choices)
  store.submitLearningChoice(token(store.getTask('learning')), 'beta')
  expect(() => store.correctLearningFeedback(token(store.getTask('learning')))).toThrow()
  store.revealLearningDetails(token(store.getTask('learning')))
  expect(() => store.correctLearningFeedback(token(store.getTask('learning')))).toThrow()
  const self = setup({ id: 'self-assessment', rulesVersion: 1 }).store
  self.submitSelfAssessment(token(self.getTask('learning')), 'fuzzy')
  expect(() => self.correctLearningFeedback(token(self.getTask('learning')))).toThrow()
  self.advanceLearning(token(self.getTask('learning')))
  self.submitSelfAssessment(token(self.getTask('learning')), 'unknown')
  expect(() => self.correctLearningFeedback(token(self.getTask('learning')))).toThrow()
  const fresh = setup().store
  fresh.prepareLearningChoice(token(fresh.getTask('learning')), choices)
  fresh.submitLearningChoice(token(fresh.getTask('learning')), 'alpha')
  expect(() => fresh.correctLearningFeedback(token(fresh.getTask('learning')))).toThrow()
})

test('failed storage, stale revision, other-tab conflict and date change leave original feedback intact', () => {
  const env = setup()
  choiceKnown(env.store)
  const original = env.store.getTask('learning')
  env.fail(true)
  expect(() => env.store.correctLearningFeedback(token(original))).toThrow('quota')
  expect(env.store.getTask('learning')).toBe(original)
  env.fail(false)
  const other = env.open()
  other.correctLearningFeedback(token(other.getTask('learning')))
  expect(() => env.store.correctLearningFeedback(token(original))).toThrow(/elsewhere/)
  expect(env.open().getTask('learning').feedbackEvents).toHaveLength(2)
  env.nextDay()
  expect(() => other.correctLearningFeedback(token(other.getTask('learning', original.date)))).toThrow(/date changed/)
})

test('legacy v4 feedback history migrates losslessly and correction remains available', () => {
  const env = setup({ id: 'self-assessment', rulesVersion: 1 })
  env.store.submitSelfAssessment(token(env.store.getTask('learning')), 'known')
  const old = JSON.parse(env.storage.getItem(LEARNING_STORAGE_KEY))
  old.version = 4
  env.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(old))
  const reopened = env.open()
  expect(reopened.getTask('learning').feedbackEvents).toEqual(old.days[reopened.getToday()].learning.feedbackEvents)
  reopened.correctLearningFeedback(token(reopened.getTask('learning')))
  expect(env.open().getTask('learning').feedbackEvents).toHaveLength(2)
})


test('extra correction checks batch and word identity, undoes completion and preserves daily history through v4 migration', () => {
  const env = setup({ id: 'self-assessment', rulesVersion: 1 })
  while (env.store.getTask('learning').currentItemId) {
    env.store.submitSelfAssessment(token(env.store.getTask('learning')), 'known')
    env.store.advanceLearning(token(env.store.getTask('learning')))
  }
  const daily = env.store.getTask('learning')
  env.store.ensureExtraLearning(['beta'])
  for (let n = 0; n < 3; n++) {
    env.store.submitSelfAssessment(token(env.store.getExtraLearning()), 'known')
    if (n < 2) env.store.advanceLearning(token(env.store.getExtraLearning()))
  }
  const old = JSON.parse(env.storage.getItem())
  old.version = 4
  for (const book of Object.values(old.wordBooks)) for (const word of Object.values(book.words)) {
    if (word.review) delete word.review.provenance
  }
  env.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(old))
  const store = env.open()
  expect(store.getSnapshot().extraLearning).toEqual(old.extraLearning)
  const extra = store.getExtraLearning()
  for (const bad of [{ taskId: 'wrong' }, { kind: 'learning' }, { itemId: daily.itemIds[0] }, { revision: 0 }]) {
    expect(() => store.correctLearningFeedback({ ...token(extra), ...bad })).toThrow()
  }
  store.correctLearningFeedback(token(extra))
  expect(store.getExtraLearning().items[extra.currentItemId]).toMatchObject({ knownCount: 2, fuzzyCount: 1, completed: false })
  expect(store.getWord('cet4', 'beta').learning.completed).toBe(false)
  expect(store.getTask('learning')).toEqual(daily)
  expect(env.open().getExtraLearning()).toEqual(store.getExtraLearning())
  expect(() => store.correctLearningFeedback(token(store.getExtraLearning()))).toThrow()
})

test('show-answer and advanced details cannot correct; a later positive feedback gets a fresh correction', () => {
  const { store } = setup()
  store.prepareLearningChoice(token(store.getTask('learning')), choices)
  store.submitLearningChoice(token(store.getTask('learning')), null)
  expect(() => store.correctLearningFeedback(token(store.getTask('learning')))).toThrow()
  store.advanceLearning(token(store.getTask('learning')))
  choiceKnown(store)
  const original = store.getTask('learning').feedbackEvents.at(-1)
  store.correctLearningFeedback(token(store.getTask('learning')))
  expect(store.getTask('learning').feedbackEvents.at(-2)).toEqual(original)
  store.advanceLearning(token(store.getTask('learning')))
  expect(() => store.correctLearningFeedback(token(store.getTask('learning')))).toThrow()
  choiceKnown(store)
  store.correctLearningFeedback(token(store.getTask('learning')))
  const item = store.getTask('learning').items[store.getTask('learning').currentItemId]
  expect(item).toMatchObject({ knownCount: 0, fuzzyCount: 2, unknownCount: 0 })
})
