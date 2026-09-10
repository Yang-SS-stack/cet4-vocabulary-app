import { expect, test, vi } from 'vitest'
import * as learningData from './index'

const { createLearningStore, DEFAULT_SETTINGS } = learningData

function createMemoryStorage() {
  const values = new Map()
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

function createEnvironment() {
  const storage = createMemoryStorage()
  let current = new Date(2026, 8, 10, 21, 30)
  return {
    storage,
    now: () => new Date(current),
    nextDay: () => { current = new Date(2026, 8, 11, 0, 5) },
    open: () => createLearningStore({ storage, now: () => new Date(current) }),
  }
}

test('stores daily study time only as a planned duration in minutes', () => {
  const store = createLearningStore({ storage: createMemoryStorage() })

  expect(DEFAULT_SETTINGS).toEqual({
    examDate: null,
    todayWordBookId: null,
    dailyNewWords: null,
    dailyReviewWords: null,
    dailyStudyMinutes: null,
    pronunciation: 'en-GB',
    mistakeStudyWords: null,
  })

  store.updateSettings({ dailyStudyMinutes: 30 })
  expect(store.getSnapshot().settings.dailyStudyMinutes).toBe(30)
  expect(() => store.updateSettings({ dailyStudyTime: '20:30' })).toThrow('Invalid update fields')
})

test('uses a word-book scoped learning id and a global mistake-book id', () => {
  expect(typeof learningData.wordBookWordId).toBe('function')
  expect(learningData.wordBookWordId('cet4', ' Apple ')).toBe('["cet4","apple"]')
  expect(learningData.wordBookWordId('cet6', 'apple')).toBe('["cet6","apple"]')
  expect(learningData.wordId(' Apple ')).toBe('apple')
})

test('keeps learning and review records separate for the same word in different books', () => {
  const store = createLearningStore({ storage: createMemoryStorage(), now: () => new Date('2026-09-10T12:00:00.000Z') })

  store.addToReview('cet4', 'apple', { nextReviewAt: '2026-09-11T16:00:00.000Z' })
  store.addToReview('cet6', 'apple', { nextReviewAt: '2026-09-12T16:00:00.000Z' })
  store.updateReview('cet4', 'apple', { stage: 1 })

  expect(store.getWord('cet4', 'apple')).toMatchObject({
    id: '["cet4","apple"]',
    wordBookId: 'cet4',
    wordId: 'apple',
    learning: { completed: false, completedAt: null },
    review: { stage: 1, nextReviewAt: '2026-09-11T16:00:00.000Z' },
  })
  expect(store.getWord('cet6', 'apple').review).toMatchObject({
    stage: 0,
    nextReviewAt: '2026-09-12T16:00:00.000Z',
  })
})

test('restores the fixed task order, current word and view on the same local day', () => {
  const env = createEnvironment()
  const store = env.open()
  const apple = learningData.wordBookWordId('cet4', 'apple')
  const zebra = learningData.wordBookWordId('cet4', 'zebra')

  store.ensureTask('learning', ['apple', 'zebra'], 'cet4')
  store.setTaskSession('learning', { currentItemId: zebra, previousItemId: apple, view: 'feedback' })

  const reopened = env.open()
  const task = reopened.getTask('learning')
  expect(task.itemIds).toEqual([apple, zebra])
  expect(task.currentItemId).toBe(zebra)
  expect(task.previousItemId).toBe(apple)
  expect(task.view).toBe('feedback')
  expect(reopened.ensureTask('learning', ['different'], 'cet6')).toBe(task)
})

test('updates each task word independently for known, fuzzy and unknown feedback', () => {
  const env = createEnvironment()
  const store = env.open()
  const apple = { wordBookId: 'cet4', word: 'apple' }
  const zebra = { wordBookId: 'cet4', word: 'zebra' }
  store.ensureTask('learning', [apple, zebra], 'cet4')

  store.recordFeedback('learning', apple, 'known')
  store.recordFeedback('learning', apple, 'fuzzy')
  store.recordFeedback('learning', apple, 'known')
  store.recordFeedback('learning', apple, 'known')
  store.recordFeedback('learning', apple, 'known')
  store.recordFeedback('learning', apple, 'unknown')
  store.recordFeedback('learning', zebra, 'known')
  store.recordFeedback('learning', zebra, 'known')
  store.recordFeedback('learning', zebra, 'unknown')

  const task = store.getTask('learning')
  expect(task.items[learningData.wordBookWordId('cet4', 'apple')]).toMatchObject({
    knownCount: 3, fuzzyCount: 1, unknownCount: 0, lastFeedback: 'known', completed: true, removed: false,
  })
  expect(task.items[learningData.wordBookWordId('cet4', 'zebra')]).toMatchObject({
    knownCount: 0, fuzzyCount: 0, unknownCount: 1, lastFeedback: 'unknown', completed: false,
  })
  expect(store.getWord('cet4', 'apple').learning.completed).toBe(true)
  expect(store.getWord('cet4', 'zebra').learning.completed).toBe(false)
  expect(store.getMistake('zebra')).toMatchObject({ unknownCount: 1, lastErrorAt: env.now().toISOString() })
})

test('keeps a completed word in the task until it is explicitly removed', () => {
  const env = createEnvironment()
  const store = env.open()
  const apple = { wordBookId: 'cet4', word: 'apple' }
  const itemId = learningData.wordBookWordId('cet4', 'apple')
  store.ensureTask('learning', [apple], 'cet4')
  for (let count = 0; count < 3; count += 1) store.recordFeedback('learning', apple, 'known')

  expect(store.getTask('learning').items[itemId].removed).toBe(false)
  store.removeCompletedTaskItem('learning', apple)
  expect(store.getTask('learning').items[itemId]).toMatchObject({ completed: true, removed: true })
})

test('keeps one global mistake record and resets only the re-entry counter after removal', () => {
  const env = createEnvironment()
  const store = env.open()
  const cet4Apple = { wordBookId: 'cet4', word: 'apple' }
  store.ensureTask('learning', [cet4Apple], 'cet4')
  for (let count = 0; count < 4; count += 1) store.recordFeedback('learning', cet4Apple, 'unknown')

  env.nextDay()
  const cet6Apple = { wordBookId: 'cet6', word: 'apple' }
  store.ensureTask('learning', [cet6Apple], 'cet6')
  store.recordFeedback('learning', cet6Apple, 'unknown')

  expect(learningData.MISTAKE_ENTRY_THRESHOLD).toBe(5)
  expect(store.getMistake('apple')).toMatchObject({
    id: 'apple', unknownCount: 5, unknownCountSinceRemoval: 5,
    entered: false, removed: false,
  })

  store.addToMistakes('apple')
  store.removeFromMistakes('apple')
  expect(store.getMistake('apple')).toMatchObject({
    unknownCount: 5, unknownCountSinceRemoval: 0, entered: true, removed: true,
  })

  store.recordFeedback('learning', cet6Apple, 'unknown')
  expect(store.getMistake('apple')).toMatchObject({
    unknownCount: 6, unknownCountSinceRemoval: 1, entered: true, removed: true,
  })
})

test('stores review stage data and schedules first review at the next local midnight', () => {
  const env = createEnvironment()
  const store = env.open()
  const expectedDueAt = new Date(2026, 8, 11, 0, 0).toISOString()

  expect(learningData.REVIEW_STAGE_DAYS).toEqual([1, 2, 4, 7, 15])
  expect(learningData.localDayStartIso(env.now(), 1)).toBe(expectedDueAt)
  store.addToReview('cet4', 'apple')

  expect(store.getWord('cet4', 'apple').review).toEqual({
    enteredAt: env.now().toISOString(),
    lastReviewedAt: null,
    nextReviewAt: expectedDueAt,
    stage: 0,
    completedReviewCount: 0,
    mastered: false,
    paused: false,
  })

  store.updateReview('cet4', 'apple', {
    lastReviewedAt: env.now().toISOString(), stage: 1, completedReviewCount: 1,
  })
  expect(env.open().getWord('cet4', 'apple').review).toMatchObject({ stage: 1, completedReviewCount: 1 })
})

test('summarizes saved daily task state without counting task clicks as new words', () => {
  const env = createEnvironment()
  const store = env.open()
  const apple = { wordBookId: 'cet4', word: 'apple' }
  const zebra = { wordBookId: 'cet4', word: 'zebra' }
  store.ensureTask('learning', [apple, zebra], 'cet4')
  store.recordFeedback('learning', apple, 'known')
  store.recordFeedback('learning', zebra, 'fuzzy')
  store.recordFeedback('learning', zebra, 'unknown')

  expect(store.getDailyStats()).toEqual({
    date: '2026-09-10', taskCount: 1, totalWords: 2, completedWords: 0,
    knownCount: 1, fuzzyCount: 1, unknownCount: 1, feedbackCount: 3,
  })
})

test('starts a carried word at zero on the next local day and keeps the old day as history', () => {
  const env = createEnvironment()
  const store = env.open()
  const apple = { wordBookId: 'cet4', word: 'apple' }
  const itemId = learningData.wordBookWordId('cet4', 'apple')
  store.ensureTask('learning', [apple], 'cet4')
  store.recordFeedback('learning', apple, 'known')
  store.recordFeedback('learning', apple, 'known')

  env.nextDay()
  expect(store.getTask('learning')).toBeNull()
  store.ensureTask('learning', [apple], 'cet4')

  expect(store.getTask('learning').items[itemId]).toMatchObject({
    knownCount: 0, fuzzyCount: 0, unknownCount: 0, completed: false,
  })
  expect(store.getTask('learning', '2026-09-10').items[itemId].knownCount).toBe(2)
})

test('keeps learning, review and mistake tasks separate and allows review items from multiple books', () => {
  const store = createEnvironment().open()
  store.ensureTask('learning', ['apple'], 'cet4')
  store.ensureTask('review', [
    { wordBookId: 'cet4', word: 'zebra' },
    { wordBookId: 'cet6', word: 'apple' },
  ])
  store.ensureTask('mistakes', ['apple'])

  expect(store.getTask('learning').itemIds).toEqual([learningData.wordBookWordId('cet4', 'apple')])
  expect(store.getTask('review').itemIds).toEqual([
    learningData.wordBookWordId('cet4', 'zebra'),
    learningData.wordBookWordId('cet6', 'apple'),
  ])
  expect(store.getTask('mistakes').itemIds).toEqual(['apple'])
})

test('returns only due active reviews in overdue order', () => {
  const store = createEnvironment().open()
  store.addToReview('cet4', 'apple', { nextReviewAt: '2026-09-09T00:00:00.000Z' })
  store.addToReview('cet6', 'zebra', { nextReviewAt: '2026-09-08T00:00:00.000Z' })
  store.addToReview('cet4', 'future', { nextReviewAt: '2026-09-12T00:00:00.000Z' })
  store.addToReview('cet4', 'paused', { nextReviewAt: '2026-09-07T00:00:00.000Z' })
  store.addToReview('cet4', 'mastered', { nextReviewAt: '2026-09-06T00:00:00.000Z' })
  store.updateReview('cet4', 'paused', { paused: true })
  store.updateReview('cet4', 'mastered', { mastered: true })

  expect(store.getDueReviews({ at: '2026-09-10T00:00:00.000Z' }).map((entry) => entry.wordId))
    .toEqual(['zebra', 'apple'])
  expect(store.getDueReviews({ at: '2026-09-10T00:00:00.000Z', wordBookId: 'cet4' }).map((entry) => entry.wordId))
    .toEqual(['apple'])
})

test('persists settings and freezes the settings snapshot captured by an existing task', () => {
  const env = createEnvironment()
  const store = env.open()
  const settings = {
    examDate: '2026-12-12', todayWordBookId: 'cet4', dailyNewWords: 20,
    dailyReviewWords: 50, dailyStudyMinutes: 30, pronunciation: 'en-US', mistakeStudyWords: 10,
  }
  store.updateSettings(settings)
  store.ensureTask('learning', ['apple'], 'cet4')
  store.updateSettings({ dailyNewWords: 40 })

  expect(env.open().getSnapshot().settings).toEqual({ ...settings, dailyNewWords: 40 })
  expect(store.getTask('learning').settings.dailyNewWords).toBe(20)
  expect(() => { store.getSnapshot().settings.dailyNewWords = 99 }).toThrow()
})

test.each([
  { dailyNewWords: -1 }, { dailyReviewWords: 1.5 }, { dailyStudyMinutes: -2 },
  { pronunciation: 'xx' }, { examDate: '2026-02-30' }, { typo: 1 },
])('rejects invalid settings without changing the snapshot: %j', (patch) => {
  const store = createEnvironment().open()
  const before = store.getSnapshot()
  expect(() => store.updateSettings(patch)).toThrow()
  expect(store.getSnapshot()).toBe(before)
})

test('notifies subscribers only after a successful durable write', () => {
  const env = createEnvironment()
  const store = env.open()
  const listener = vi.fn()
  store.subscribe(listener)
  store.updateSettings({ dailyNewWords: 20 })
  expect(listener).toHaveBeenCalledTimes(1)

  const before = store.getSnapshot()
  env.storage.setItem = () => { throw new Error('quota') }
  expect(() => store.updateSettings({ dailyNewWords: 30 })).toThrow('quota')
  expect(store.getSnapshot()).toBe(before)
  expect(listener).toHaveBeenCalledTimes(1)
})

test.each(['{broken', '{"version":999}', '{"version":1,"settings":{}}'])('preserves invalid saved data: %s', (raw) => {
  const storage = createMemoryStorage()
  storage.values.set(learningData.LEARNING_STORAGE_KEY, raw)
  expect(() => createLearningStore({ storage })).toThrow()
  expect(storage.getItem(learningData.LEARNING_STORAGE_KEY)).toBe(raw)
})

test('prevents an older store instance from overwriting a newer saved snapshot', () => {
  const env = createEnvironment()
  const first = env.open()
  const second = env.open()
  first.updateSettings({ dailyNewWords: 20 })
  expect(() => second.updateSettings({ dailyNewWords: 30 })).toThrow('changed')
  expect(env.open().getSnapshot().settings.dailyNewWords).toBe(20)
})

test('persists the complete snapshot in browser localStorage', () => {
  localStorage.removeItem(learningData.LEARNING_STORAGE_KEY)
  try {
    const store = createLearningStore()
    store.updateSettings({ todayWordBookId: 'cet4', dailyStudyMinutes: 30 })
    store.ensureTask('learning', ['apple', 'zebra'], 'cet4')
    store.setTaskSession('learning', {
      currentItemId: learningData.wordBookWordId('cet4', 'zebra'), view: 'feedback',
    })
    expect(createLearningStore().getSnapshot()).toEqual(store.getSnapshot())
  } finally {
    localStorage.removeItem(learningData.LEARNING_STORAGE_KEY)
  }
})

test('uses local calendar components and handles object-prototype word names safely', () => {
  expect(learningData.localDateKey(new Date(2026, 8, 11, 0, 1))).toBe('2026-09-11')
  expect(learningData.localDateKey(new Date(2026, 8, 10, 23, 59))).toBe('2026-09-10')
  expect(() => learningData.localDateKey(new Date('invalid'))).toThrow()

  const env = createEnvironment()
  const store = env.open()
  const special = { wordBookId: 'cet4', word: '__proto__' }
  store.ensureTask('learning', [special, { wordBookId: 'cet4', word: 'constructor' }], 'cet4')
  store.recordFeedback('learning', special, 'unknown')
  expect(env.open().getMistake('__proto__').unknownCount).toBe(1)
  expect(store.getMistake('constructor').unknownCount).toBe(0)
})

test('filters removed mistakes and can re-add without losing history', () => {
  const env = createEnvironment()
  const store = env.open()
  const apple = { wordBookId: 'cet4', word: 'apple' }
  store.ensureTask('learning', [apple], 'cet4')
  store.recordFeedback('learning', apple, 'unknown')
  store.addToMistakes('apple')
  const enteredAt = store.getMistake('apple').enteredAt
  store.removeFromMistakes('apple')
  expect(store.getMistakes()).toEqual([])
  expect(store.getMistakes({ includeRemoved: true })[0]).toMatchObject({ enteredAt, removed: true })
  store.addToMistakes('apple')
  expect(store.getMistakes()[0]).toMatchObject({ enteredAt, removed: false, unknownCount: 1 })
})

test('rejects invalid task, session, feedback and review updates', () => {
  const store = createEnvironment().open()
  expect(() => store.ensureTask('bad', [])).toThrow()
  expect(() => store.ensureTask('learning', [' '], 'cet4')).toThrow()
  expect(() => store.ensureTask('review', ['apple'])).toThrow('word book')
  store.ensureTask('learning', ['apple'], 'cet4')
  expect(() => store.recordFeedback('learning', { wordBookId: 'cet4', word: 'absent' }, 'known')).toThrow()
  expect(() => store.recordFeedback('learning', { wordBookId: 'cet4', word: 'apple' }, 'bad')).toThrow()
  expect(() => store.setTaskSession('learning', { view: 'bad' })).toThrow()
  expect(() => store.setTaskSession('learning', { currentItemId: 'absent' })).toThrow()
  store.addToReview('cet4', 'apple')
  expect(() => store.updateReview('cet4', 'apple', { stage: -1 })).toThrow()
  expect(() => store.updateReview('cet4', 'apple', { stage: 6 })).toThrow()
})

test('preserves a corrupted nested snapshot instead of silently resetting it', () => {
  const env = createEnvironment()
  const store = env.open()
  store.ensureTask('learning', ['apple'], 'cet4')
  const saved = JSON.parse(env.storage.getItem(learningData.LEARNING_STORAGE_KEY))
  const itemId = learningData.wordBookWordId('cet4', 'apple')
  saved.days['2026-09-10'].learning.items[itemId].knownCount = 7
  const raw = JSON.stringify(saved)
  env.storage.values.set(learningData.LEARNING_STORAGE_KEY, raw)
  expect(() => env.open()).toThrow()
  expect(env.storage.getItem(learningData.LEARNING_STORAGE_KEY)).toBe(raw)
})

test('rejects a task whose referenced word record is missing', () => {
  const env = createEnvironment()
  const store = env.open()
  store.ensureTask('learning', ['apple'], 'cet4')
  const saved = JSON.parse(env.storage.getItem(learningData.LEARNING_STORAGE_KEY))
  delete saved.wordBooks.cet4.words.apple
  env.storage.values.set(learningData.LEARNING_STORAGE_KEY, JSON.stringify(saved))

  expect(() => env.open()).toThrow('reference')
})

test('surfaces unavailable storage and supports unsubscribing', () => {
  expect(() => createLearningStore({ storage: null })).toThrow('unavailable')
  expect(() => createLearningStore({ storage: {
    getItem() { throw new Error('denied') }, setItem() {},
  } })).toThrow('denied')

  const store = createEnvironment().open()
  const listener = vi.fn()
  const unsubscribe = store.subscribe(listener)
  unsubscribe()
  store.updateSettings({ dailyNewWords: 20 })
  expect(listener).not.toHaveBeenCalled()
})
