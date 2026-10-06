import { removeSelectionPreference } from '../../test/legacyLearningSnapshot'
import { expect, test, vi } from 'vitest'
import { createLearningStore } from './store'
import { createBrowserLearningStore } from './browserStore'
import * as data from './index'
import { LEARNING_STORAGE_KEY, localDayStartIso } from './model'

const token = task => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision })
const choices = ['alpha', 'beta', 'gamma', 'delta'].map(word => ({ word, meaning: word }))
function env() {
  let raw = null, date = new Date(2026, 8, 30, 12), fail = false
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw Error('quota'); raw = value } }
  const open = () => createLearningStore({ storage, now: () => new Date(date) })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1, dailyReviewWords: 2 })
  return { store, open, storage, now: () => new Date(date), day: (n = 1) => { date = new Date(2026, 8, 30 + n, 12) }, fail: v => { fail = v } }
}
function ensure(store) {
  expect(typeof store.ensureTodayReview).toBe('function')
  return store.ensureTodayReview()
}
function seed(e, word = 'alpha', book = 'cet4', days = 0) {
  e.store.addToReview(book, word, { nextReviewAt: localDayStartIso(e.now(), days) })
}
function feedback(store, value) { store.submitReviewFeedback(token(store.getTask('review')), value) }
function advance(store) { store.advanceReview(token(store.getTask('review'))) }
function finishLearning(store, get = () => store.getTask('learning')) {
  for (let i = 0; i < 3; i++) {
    const task = get()
    store.submitSelfAssessment({ ...token(task), ...(task.taskId ? { kind: task.kind, taskId: task.taskId } : {}) }, 'known')
    if (i < 2) store.advanceLearning({ ...token(get()), ...(get().taskId ? { kind: get().kind, taskId: get().taskId } : {}) })
  }
}
test('new due review starts at two with no fictional feedback and settles only at four', () => {
  const e = env(); seed(e)
  const task = ensure(e.store)
  expect(task.method).toEqual({ id: 'review-guided-recall', rulesVersion: 1 })
  expect(task.items[task.currentItemId]).toMatchObject({ initialKnownCount: 2, knownCount: 2, lastFeedback: null, settlement: null })
  expect(task.feedbackEvents).toEqual([])
  const original = e.store.getWord('cet4', 'alpha').review
  feedback(e.store, 'known')
  expect(e.store.getWord('cet4', 'alpha').review).toEqual(original)
  advance(e.store); feedback(e.store, 'known')
  expect(e.store.getWord('cet4', 'alpha').review).toMatchObject({ stage: 1, completedReviewCount: 1, nextReviewAt: localDayStartIso(e.now(), 2), mastered: false })
  expect(e.open().getTask('review')).toEqual(e.store.getTask('review'))
})
test.each([[0, 1, 2], [1, 2, 4], [2, 3, 7], [3, 4, 15], [4, 5, 30], [5, 5, 30]])('clean stage %i becomes %i after %i calendar days', (stage, nextStage, days) => {
  const e = env(); seed(e); e.store.updateReview('cet4', 'alpha', { stage }); ensure(e.store)
  feedback(e.store, 'known'); advance(e.store); feedback(e.store, 'known')
  expect(e.store.getWord('cet4', 'alpha').review).toMatchObject({ stage: nextStage, nextReviewAt: localDayStartIso(e.now(), days) })
})
test('unknown uses choices then all four rounds and contributes only self unknowns to mistakes', () => {
  const e = env(); seed(e); ensure(e.store)
  feedback(e.store, 'unknown'); advance(e.store)
  e.store.prepareReviewChoice(token(e.store.getTask('review')), choices)
  e.store.submitReviewChoice(token(e.store.getTask('review')), 'beta')
  expect(e.store.getMistake('alpha').unknownCount).toBe(1)
  expect(() => advance(e.store)).toThrow(/Reveal/)
  e.store.revealReviewDetails(token(e.store.getTask('review'))); advance(e.store)
  e.store.prepareReviewChoice(token(e.store.getTask('review')), choices)
  e.store.submitReviewChoice(token(e.store.getTask('review')), null); advance(e.store)
  e.store.prepareReviewChoice(token(e.store.getTask('review')), choices)
  e.store.submitReviewChoice(token(e.store.getTask('review')), 'alpha')
  e.store.revealReviewDetails(token(e.store.getTask('review'))); advance(e.store)
  for (let i = 1; i < 4; i++) { feedback(e.store, 'known'); if (i < 3) advance(e.store) }
  expect(e.store.getWord('cet4', 'alpha').review).toMatchObject({ stage: 0, completedReviewCount: 1, nextReviewAt: localDayStartIso(e.now(), 1) })
})
test('fuzzy and corrections keep original stage and schedule tomorrow', () => {
  const e = env(); seed(e); e.store.updateReview('cet4', 'alpha', { stage: 3 }); ensure(e.store)
  feedback(e.store, 'fuzzy'); advance(e.store)
  for (let i = 1; i < 4; i++) { feedback(e.store, 'known'); if (i < 3) advance(e.store) }
  expect(e.store.getWord('cet4', 'alpha').review).toMatchObject({ stage: 3, nextReviewAt: localDayStartIso(e.now(), 1) })
})
test('completion correction restores exact review snapshot once and subsequent completion counts once', () => {
  const e = env(); seed(e); ensure(e.store)
  const original = e.store.getWord('cet4', 'alpha').review
  feedback(e.store, 'known'); advance(e.store); feedback(e.store, 'known')
  const completed = e.store.getTask('review')
  expect(data.canCorrectReviewFeedback(completed)).toBe(true)
  e.store.correctReviewFeedback(token(completed))
  expect(e.store.getWord('cet4', 'alpha').review).toEqual(original)
  expect(e.store.getTask('review').items[completed.currentItemId]).toMatchObject({ knownCount: 3, completed: false, fuzzyCount: 1, settlement: null })
  expect(e.store.getTask('review').feedbackEvents.at(-1)).toMatchObject({ source: 'review-feedback-correction', correctedRevision: completed.feedbackEvents.at(-1).revision })
  expect(() => e.store.correctReviewFeedback(token(e.store.getTask('review')))).toThrow()
  advance(e.store); feedback(e.store, 'known')
  expect(e.store.getWord('cet4', 'alpha').review).toMatchObject({ stage: 0, completedReviewCount: 1, nextReviewAt: localDayStartIso(e.now(), 1) })
  expect(e.open().getTask('review')).toEqual(e.store.getTask('review'))
})
test('assignment is book scoped, overdue sorted, capped and preserves empty/completed daily assignments', () => {
  const e = env(); seed(e, 'beta', 'cet4', -1); seed(e, 'alpha', 'cet4', -1); seed(e, 'early', 'cet4', -2)
  seed(e, 'other', 'cet6', -3); seed(e, 'paused'); seed(e, 'mastered'); seed(e, 'null')
  e.store.updateReview('cet4', 'paused', { paused: true }); e.store.updateReview('cet4', 'mastered', { mastered: true }); e.store.updateReview('cet4', 'null', { nextReviewAt: null })
  const task = ensure(e.store)
  expect(task.itemIds.map(id => task.items[id].wordId)).toEqual(['early', 'alpha'])
  expect(e.store.getReviewOverview()).toMatchObject({ bookId: 'cet4', dueCount: 3, taskCount: 2, pendingCount: 2, completedCount: 0, unassignedCount: 1, needsReconciliation: false })
  e.store.updateSettings({ todayWordBookId: 'cet6', dailyReviewWords: 100 })
  const write = vi.spyOn(e.storage, 'setItem'); const existing = e.store.getTask('review')
  expect(ensure(e.store)).toBe(existing); expect(write).not.toHaveBeenCalled()
  expect(e.store.getReviewOverview().bookId).toBe('cet4')
  feedback(e.store, 'known'); advance(e.store); feedback(e.store, 'known'); advance(e.store)
  feedback(e.store, 'known'); advance(e.store); feedback(e.store, 'known')
  expect(e.store.getReviewOverview()).toMatchObject({ dueCount: 1, pendingCount: 0, completedCount: 2, unassignedCount: 1 })
})
test('prior unfinished reviews start at zero without modifying old history; newly due starts at two', () => {
  const e = env(); seed(e); const old = ensure(e.store); feedback(e.store, 'known')
  const history = e.store.getTask('review'); e.day(); seed(e, 'beta'); const next = ensure(e.store)
  expect(next.items[old.currentItemId]).toMatchObject({ initialKnownCount: 0, knownCount: 0, lastFeedback: null })
  expect(next.items[data.wordBookWordId('cet4', 'beta')].initialKnownCount).toBe(2)
  expect(e.store.getTask('review', old.date)).toEqual(history)
})
test('new and extra learning completion adds provenance review atomically and correction withdraws only its own entry', () => {
  const e = env(); e.store.ensureTodayLearning('cet4', ['alpha']); finishLearning(e.store)
  const task = e.store.getTask('learning')
  expect(e.store.getWord('cet4', 'alpha').review).toMatchObject({ enteredAt: e.now().toISOString(), nextReviewAt: localDayStartIso(e.now(), 1), provenance: { source: 'learning', completion: { date: task.date, kind: 'learning', taskId: `${task.date}:learning`, revision: 4 } } })
  e.store.correctLearningFeedback(token(task)); expect(e.store.getWord('cet4', 'alpha').review).toBe(null)
  e.store.advanceLearning(token(e.store.getTask('learning'))); e.store.submitSelfAssessment(token(e.store.getTask('learning')), 'known')
  e.store.advanceLearning(token(e.store.getTask('learning'))); e.store.ensureExtraLearning(['beta'])
  finishLearning(e.store, () => e.store.getExtraLearning())
  const extra = e.store.getExtraLearning()
  expect(e.store.getWord('cet4', 'beta').review.provenance.source).toBe('extra-learning')
  e.store.correctLearningFeedback({ ...token(extra), kind: extra.kind, taskId: extra.taskId })
  expect(e.store.getWord('cet4', 'beta').review).toBe(null)
})
test('learning correction preserves an older seeded review', () => {
  const e = env(); seed(e); const original = e.store.getWord('cet4', 'alpha').review
  e.store.ensureTodayLearning('cet4', ['alpha']); finishLearning(e.store)
  expect(e.store.getWord('cet4', 'alpha').review).toEqual(original)
  e.store.correctLearningFeedback(token(e.store.getTask('learning')))
  expect(e.store.getWord('cet4', 'alpha').review).toEqual(original)
})
test('historical missing review is projected and reconciled once without extending an existing assignment', () => {
  const e = env(); e.store.ensureTodayLearning('cet4', ['alpha']); finishLearning(e.store)
  const raw = JSON.parse(e.storage.getItem()); raw.wordBooks.cet4.words.alpha.review = null
  e.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(raw)); e.store.reload()
  expect(e.store.getReviewOverview()).toMatchObject({ dueCount: 0, needsReconciliation: false })
  e.day(2)
  expect(e.store.getReviewOverview()).toMatchObject({ dueCount: 1, needsReconciliation: true })
  const writes = vi.spyOn(e.storage, 'setItem'); ensure(e.store)
  expect(writes).toHaveBeenCalledTimes(1)
  expect(e.store.getWord('cet4', 'alpha').review).toMatchObject({ enteredAt: raw.wordBooks.cet4.words.alpha.learning.completedAt, nextReviewAt: localDayStartIso(new Date(raw.wordBooks.cet4.words.alpha.learning.completedAt), 1), provenance: { source: 'historical', completion: { revision: 4 } } })
  ensure(e.store); expect(writes).toHaveBeenCalledTimes(1)
})
test('an old unfinished occurrence does not reset a word whose latest review occurrence completed', () => {
  const e = env(); seed(e); ensure(e.store); e.day(); ensure(e.store)
  e.store.prepareReviewChoice(token(e.store.getTask('review')), choices)
  e.store.submitReviewChoice(token(e.store.getTask('review')), 'alpha'); e.store.revealReviewDetails(token(e.store.getTask('review'))); advance(e.store)
  for (let n = 0; n < 3; n++) { feedback(e.store, 'known'); if (n < 2) advance(e.store) }
  e.day(3); const task = ensure(e.store)
  expect(task.items[task.currentItemId].initialKnownCount).toBe(2)
})
test('an empty existing task reconciles new historical entries without changing its assignment', () => {
  const e = env(); const empty = ensure(e.store)
  e.store.ensureTodayLearning('cet4', ['alpha']); finishLearning(e.store)
  const raw = JSON.parse(e.storage.getItem()); raw.wordBooks.cet4.words.alpha.review = null
  raw.days[empty.date].learning.currentItemId = null; raw.days[empty.date].learning.view = 'question'
  e.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(raw)); e.store.reload()
  const writes = vi.spyOn(e.storage, 'setItem'); const task = ensure(e.store)
  expect(task.itemIds).toEqual([]); expect(task).toEqual(empty); expect(writes).toHaveBeenCalledTimes(1)
  expect(e.store.getWord('cet4', 'alpha').review.provenance.source).toBe('historical')
  ensure(e.store); expect(writes).toHaveBeenCalledTimes(1)
})
test('a learning completion still open for correction is excluded even if an older review is due', () => {
  const e = env(); seed(e); e.store.ensureTodayLearning('cet4', ['alpha']); finishLearning(e.store)
  expect(typeof e.store.getReviewOverview).toBe('function')
  expect(e.store.getReviewOverview().dueCount).toBe(0); expect(ensure(e.store).itemIds).toEqual([])
})
test('revealed correct choice correction persists original selection and cannot repeat or follow advancement', () => {
  const e = env(); seed(e); ensure(e.store); feedback(e.store, 'unknown'); advance(e.store)
  e.store.prepareReviewChoice(token(e.store.getTask('review')), choices)
  const savedChoice = e.store.getTask('review')
  expect(e.open().getTask('review')).toEqual(savedChoice)
  expect(e.store.prepareReviewChoice(token(savedChoice), choices)).toBe(savedChoice)
  e.store.submitReviewChoice(token(savedChoice), 'alpha')
  expect(data.canCorrectReviewFeedback(e.store.getTask('review'))).toBe(false)
  e.store.revealReviewDetails(token(e.store.getTask('review')))
  const original = e.store.getTask('review').feedbackEvents.at(-1)
  e.store.correctReviewFeedback(token(e.store.getTask('review')))
  const task = e.store.getTask('review')
  expect(task.choice).toMatchObject({ selectedWord: 'alpha', revealed: true })
  expect(task.items[task.currentItemId]).toMatchObject({ knownCount: 0, fuzzyCount: 1, unknownCount: 1 })
  expect(task.feedbackEvents.at(-2)).toEqual(original); expect(e.open().getTask('review')).toEqual(task)
  expect(data.canCorrectReviewFeedback(task)).toBe(false)
  advance(e.store); expect(() => e.store.correctReviewFeedback(token(e.store.getTask('review')))).toThrow(/turn changed/)
})
test('core prepared review choices reject stale reuse until reload without publishing or writing', () => {
  const e = env(); seed(e); ensure(e.store); feedback(e.store, 'unknown'); advance(e.store)
  const savedOptions = [...choices].reverse()
  const prepared = e.store.prepareReviewChoice(token(e.store.getTask('review')), savedOptions)
  const turn = token(prepared), snapshot = e.store.getSnapshot()
  expect(prepared).toMatchObject({ view: 'question', sessionRevision: 3 })
  const writes = vi.spyOn(e.storage, 'setItem'), listener = vi.fn()
  e.store.subscribe(listener)
  expect(e.store.prepareReviewChoice(turn, choices)).toBe(prepared)
  expect(prepared.choice.options).toEqual(savedOptions)
  expect(writes).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled()
  const other = e.open(); other.submitReviewChoice(turn, 'alpha')
  const raw = e.storage.getItem(LEARNING_STORAGE_KEY)
  expect(other.getTask('review')).toMatchObject({ view: 'feedback', sessionRevision: 4 })
  writes.mockClear()
  for (let attempt = 0; attempt < 2; attempt++) {
    expect(() => e.store.prepareReviewChoice(turn, choices)).toThrow('Learning data changed elsewhere; reopen the store')
  }
  expect(e.store.getSnapshot()).toBe(snapshot); expect(e.store.getTask('review')).toBe(prepared)
  expect(e.storage.getItem(LEARNING_STORAGE_KEY)).toBe(raw)
  expect(writes).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled()
  e.store.reload()
  expect(e.store.getTask('review')).toEqual(other.getTask('review'))
  expect(e.store.getTask('review').choice.options).toEqual(savedOptions)
  expect(() => e.store.prepareReviewChoice(turn, choices)).toThrow(/turn changed/)
})
test('browser prepared review choices reject stale reuse after a queued answer under the shared lock', async () => {
  const e = env(); seed(e)
  let queue = Promise.resolve()
  const locks = { request: vi.fn((_, __, run) => { const result = queue.then(run); queue = result.catch(() => {}); return result }) }
  const open = () => createBrowserLearningStore({ storage: e.storage, now: e.now, locks })
  const a = open(); await a.ensureTodayReview()
  await a.submitReviewFeedback(token(a.getTask('review')), 'unknown'); await a.advanceReview(token(a.getTask('review')))
  const savedOptions = [...choices].reverse()
  const prepared = await a.prepareReviewChoice(token(a.getTask('review')), savedOptions)
  const turn = token(prepared), snapshot = a.getSnapshot()
  const writes = vi.spyOn(e.storage, 'setItem'), listener = vi.fn()
  a.subscribe(listener)
  expect(await a.prepareReviewChoice(turn, choices)).toBe(prepared)
  expect(prepared.choice.options).toEqual(savedOptions)
  expect(writes).not.toHaveBeenCalled(); expect(listener).not.toHaveBeenCalled()
  const b = open(); locks.request.mockClear()
  const answer = b.submitReviewChoice(turn, 'alpha'), reuse = a.prepareReviewChoice(turn, choices)
  await answer
  const raw = JSON.stringify(b.getSnapshot())
  await expect(reuse).rejects.toThrow('Learning data changed elsewhere; reopen the store')
  await expect(a.prepareReviewChoice(turn, choices)).rejects.toThrow('Learning data changed elsewhere; reopen the store')
  expect(locks.request).toHaveBeenCalledTimes(3)
  for (const [name, options] of locks.request.mock.calls) {
    expect(name).toBe(LEARNING_STORAGE_KEY); expect(options).toEqual({ mode: 'exclusive' })
  }
  expect(b.getTask('review')).toMatchObject({ view: 'feedback', sessionRevision: 4 })
  expect(a.getSnapshot()).toBe(snapshot); expect(a.getTask('review')).toBe(prepared)
  expect(e.storage.getItem(LEARNING_STORAGE_KEY)).toBe(raw)
  expect(writes).toHaveBeenCalledTimes(1); expect(listener).not.toHaveBeenCalled()
  a.reload()
  expect(a.getTask('review')).toEqual(b.getTask('review'))
  expect(a.getTask('review').choice.options).toEqual(savedOptions)
  await expect(a.prepareReviewChoice(turn, choices)).rejects.toThrow(/turn changed/)
})
test.each([1, 2, 3, 4, 5])('migrates v%i completely without adding initial feedback or modifying old review', version => {
  const e = env(); seed(e); e.store.ensureTask('learning', ['beta'], 'cet4'); e.store.recordFeedback('learning', 'beta', 'known')
  e.store.ensureTask('review', ['alpha'], 'cet4'); e.store.ensureTask('mistakes', ['alpha'])
  const old = JSON.parse(e.storage.getItem()); old.version = version; removeSelectionPreference(old)
  if (version < 4) delete old.extraLearning
  for (const task of Object.values(old.days[e.store.getToday()])) {
    if (version < 3) delete task.choice
    if (version < 2) { delete task.method; delete task.sessionRevision; delete task.feedbackEvents }
  }
  e.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(old)); const loaded = e.open().getSnapshot()
  expect(loaded.version).toBe(7); expect(loaded.wordBooks).toEqual(old.wordBooks); expect(loaded.mistakes).toEqual(old.mistakes)
  expect(loaded.days[e.store.getToday()].review.method).toBe(null)
  expect(loaded.days[e.store.getToday()].review.items).toEqual(old.days[e.store.getToday()].review.items)
  expect(loaded.days[e.store.getToday()].learning.items).toEqual(old.days[e.store.getToday()].learning.items)
  expect(loaded.days[e.store.getToday()].learning.feedbackEvents).toEqual([])
})
test.each(['initial', 'count', 'settlement', 'method', 'event'])('rejects corrupted v6 %s and preserves raw data', field => {
  const e = env(); seed(e); const task = ensure(e.store); feedback(e.store, 'known')
  const saved = JSON.parse(e.storage.getItem()), t = saved.days[task.date].review, item = t.items[t.currentItemId]
  if (field === 'initial') item.initialKnownCount = 3
  if (field === 'count') item.knownCount = 2
  if (field === 'settlement') item.settlement = { previousReview: {}, revision: 0 }
  if (field === 'method') t.method.id = 'guided-recall'
  if (field === 'event') t.feedbackEvents[0].revision = 99
  const raw = JSON.stringify(saved); e.storage.setItem(LEARNING_STORAGE_KEY, raw)
  expect(() => e.open()).toThrow(); expect(e.storage.getItem()).toBe(raw)
})
test('legacy review is preserved and all new review commands refuse it', () => {
  const e = env(); const legacy = e.store.ensureTask('review', ['alpha'], 'cet4')
  expect(ensure(e.store)).toBe(legacy)
  for (const name of ['submitReviewFeedback', 'correctReviewFeedback', 'advanceReview', 'revealReviewDetails', 'prepareReviewChoice', 'submitReviewChoice']) {
    expect(() => e.store[name](token(legacy), name === 'prepareReviewChoice' ? choices : 'known')).toThrow(/legacy review/i)
  }
})
test('new review rejects generic mutation bypasses and protects original settlement', () => {
  const e = env(); seed(e); const task = ensure(e.store)
  for (const run of [() => e.store.recordFeedback('review', 'alpha', 'known'), () => e.store.setTaskSession('review', { view: 'feedback' }), () => e.store.removeCompletedTaskItem('review', 'alpha'), () => e.store.updateReview('cet4', 'alpha', { stage: 2 })]) expect(run).toThrow(/review/i)
  feedback(e.store, 'known'); advance(e.store); feedback(e.store, 'known')
  expect(() => e.store.updateReview('cet4', 'alpha', { completedReviewCount: 22 })).toThrow(/review/i)
  expect(e.store.getTask('review').itemIds).toEqual(task.itemIds)
})
test('stale turns, cross date, failed storage and conflicts publish no changed snapshot', () => {
  const e = env(); seed(e); ensure(e.store); const before = e.store.getSnapshot()
  e.fail(true); expect(() => feedback(e.store, 'known')).toThrow('quota'); expect(e.store.getSnapshot()).toBe(before)
  e.fail(false); const other = e.open(); feedback(other, 'known')
  expect(() => feedback(e.store, 'known')).toThrow(/changed elsewhere/)
  e.store.reload(); expect(() => e.store.submitReviewFeedback(token(before.days[e.store.getToday()].review), 'known')).toThrow(/turn changed/)
  const turn = token(e.store.getTask('review')); e.day(); expect(() => e.store.advanceReview(turn)).toThrow(/date changed/)
})
test.each([null, 0, 101])('invalid daily review setting %s is refused before creation', count => {
  const e = env(); e.store.updateSettings({ dailyReviewWords: count })
  expect(typeof e.store.ensureTodayReview).toBe('function')
  expect(() => e.store.ensureTodayReview()).toThrow(/review settings/i)
})
test('five self unknowns enter mistakes and removal resets only re-entry evidence', () => {
  const e = env(); seed(e); ensure(e.store)
  for (let n = 0; n < 10; n++) {
    if (e.store.getTask('review').items[e.store.getTask('review').currentItemId].knownCount === 0) {
      e.store.prepareReviewChoice(token(e.store.getTask('review')), choices); e.store.submitReviewChoice(token(e.store.getTask('review')), 'alpha'); e.store.revealReviewDetails(token(e.store.getTask('review'))); advance(e.store)
    }
    feedback(e.store, 'unknown'); advance(e.store)
    if (n === 4) { expect(e.store.getMistake('alpha')).toMatchObject({ entered: true, unknownCount: 5 }); e.store.removeFromMistakes('alpha') }
    if (n === 8) expect(e.store.getMistake('alpha')).toMatchObject({ removed: true, unknownCountSinceRemoval: 4 })
  }
  expect(e.store.getMistake('alpha')).toMatchObject({ removed: false, unknownCount: 10, unknownCountSinceRemoval: 5 })
})
test('browser review commands serialize duplicates and reject queued settings/date changes', async () => {
  const e = env(); seed(e)
  let queue = Promise.resolve()
  const locks = { request: (_, __, run) => { const result = queue.then(run); queue = result.catch(() => {}); return result } }
  const store = createBrowserLearningStore({ storage: e.storage, now: e.now, locks })
  expect(typeof store.ensureTodayReview).toBe('function')
  const expected = store.getSnapshot().settings
  const change = store.updateSettings({ dailyReviewWords: 1 }); const pending = store.ensureTodayReview(store.getToday(), expected)
  await change; await expect(pending).rejects.toThrow(/settings changed/)
  await store.ensureTodayReview()
  const turn = token(store.getTask('review'))
  const results = await Promise.allSettled([store.submitReviewFeedback(turn, 'known'), store.submitReviewFeedback(turn, 'known')])
  expect(results.map(x => x.status)).toEqual(['fulfilled', 'rejected'])
  const advancing = store.advanceReview(token(store.getTask('review'))); e.day()
  await expect(advancing).rejects.toThrow(/date changed/)
})
test.each([4, 5])('real v%i extra batches and correction events migrate unchanged in memory, failed write preserves old raw', version => {
  const e = env(); e.store.ensureTodayLearning('cet4', ['alpha']); finishLearning(e.store)
  e.store.advanceLearning(token(e.store.getTask('learning'))); e.store.ensureExtraLearning(['beta'])
  const extraToken = () => ({ ...token(e.store.getExtraLearning()), kind: 'extra-learning', taskId: e.store.getExtraLearning().taskId })
  e.store.submitSelfAssessment(extraToken(), 'known')
  if (version === 5) e.store.correctLearningFeedback(extraToken())
  const old = JSON.parse(e.storage.getItem()); old.version = version; removeSelectionPreference(old)
  for (const book of Object.values(old.wordBooks)) for (const word of Object.values(book.words)) if (word.review) delete word.review.provenance
  const raw = JSON.stringify(old); e.storage.setItem(LEARNING_STORAGE_KEY, raw)
  const migrated = e.open()
  expect(migrated.getSnapshot().version).toBe(7)
  expect(migrated.getSnapshot().extraLearning).toMatchObject(old.extraLearning)
  expect(migrated.getSnapshot().wordBooks).toEqual(old.wordBooks)
  expect(e.storage.getItem()).toBe(raw)
  if (version === 5) expect(migrated.getExtraLearning().feedbackEvents.at(-1).source).toBe('feedback-correction')
  e.fail(true); expect(() => migrated.advanceLearning(extraToken())).toThrow('quota')
  expect(e.storage.getItem()).toBe(raw); expect(migrated.getSnapshot().extraLearning).toMatchObject(old.extraLearning)
})
test('completion and correction storage failure preserve both review schedule and task progress', () => {
  const e = env(); seed(e); ensure(e.store); feedback(e.store, 'known'); advance(e.store)
  const incomplete = e.store.getSnapshot(); e.fail(true)
  expect(() => feedback(e.store, 'known')).toThrow('quota'); expect(e.store.getSnapshot()).toBe(incomplete)
  e.fail(false); feedback(e.store, 'known'); const completed = e.store.getSnapshot(); e.fail(true)
  expect(() => e.store.correctReviewFeedback(token(e.store.getTask('review')))).toThrow('quota')
  expect(e.store.getSnapshot()).toBe(completed); expect(e.open().getSnapshot()).toEqual(completed)
})
test('cap of 100 includes exactly the first 100 due records', () => {
  const e = env(); e.store.updateSettings({ dailyReviewWords: 100 })
  for (let i = 0; i < 103; i++) seed(e, `word${String(i).padStart(3, '0')}`)
  const task = ensure(e.store); expect(task.itemIds).toHaveLength(100)
  expect(task.items[task.itemIds.at(-1)].wordId).toBe('word099')
  expect(e.store.getReviewOverview().unassignedCount).toBe(3)
})
test('round order is circular and skips words as soon as they complete', () => {
  const e = env(); seed(e, 'alpha'); seed(e, 'beta'); const task = ensure(e.store)
  feedback(e.store, 'known'); advance(e.store)
  expect(e.store.getTask('review').currentItemId).toBe(task.itemIds[1])
  feedback(e.store, 'fuzzy'); advance(e.store)
  expect(e.store.getTask('review').currentItemId).toBe(task.itemIds[0])
  feedback(e.store, 'known'); advance(e.store)
  expect(e.store.getTask('review').currentItemId).toBe(task.itemIds[1])
  feedback(e.store, 'known'); advance(e.store)
  expect(e.store.getTask('review').currentItemId).toBe(task.itemIds[1])
})
test('learning correction preserves its fresh review after reference from a legacy review task', () => {
  const e = env(); e.store.ensureTodayLearning('cet4', ['alpha']); finishLearning(e.store)
  const original = e.store.getWord('cet4', 'alpha').review
  e.store.ensureTask('review', ['alpha'], 'cet4'); e.store.correctLearningFeedback(token(e.store.getTask('learning')))
  expect(e.store.getWord('cet4', 'alpha').review).toEqual(original)
})
test('browser review correction rejects duplicates, stale stores, unavailable locks and queued ensure crossing midnight', async () => {
  const e = env(); seed(e)
  let queue = Promise.resolve()
  const locks = { request: (_, __, run) => { const result = queue.then(run); queue = result.catch(() => {}); return result } }
  const open = () => createBrowserLearningStore({ storage: e.storage, now: e.now, locks })
  const store = open(); await store.ensureTodayReview()
  await store.submitReviewFeedback(token(store.getTask('review')), 'known'); await store.advanceReview(token(store.getTask('review')))
  await store.submitReviewFeedback(token(store.getTask('review')), 'known')
  const other = open(), turn = token(store.getTask('review'))
  const outcomes = await Promise.allSettled([store.correctReviewFeedback(turn), store.correctReviewFeedback(turn), other.correctReviewFeedback(turn)])
  expect(outcomes.map(r => r.status)).toEqual(['fulfilled', 'rejected', 'rejected'])
  expect(other.getWord('cet4', 'alpha').review.completedReviewCount).toBe(1)
  other.reload(); expect(other.getWord('cet4', 'alpha').review.completedReviewCount).toBe(0)
  const noLock = createBrowserLearningStore({ storage: e.storage, now: e.now, locks: null })
  await expect(noLock.correctReviewFeedback(turn)).rejects.toThrow(/lock/)
  await expect(noLock.ensureTodayReview()).rejects.toThrow(/lock/)
  const date = store.getToday(), pending = store.ensureTodayReview(date); e.day()
  await expect(pending).rejects.toThrow(/date changed/)
  expect(store.getTask('review')).toBe(null)
})
test('browser review failed storage publishes no snapshot and two concurrent creators require reload', async () => {
  const e = env(); seed(e)
  let queue = Promise.resolve()
  const locks = { request: (_, __, run) => { const result = queue.then(run); queue = result.catch(() => {}); return result } }
  const open = () => createBrowserLearningStore({ storage: e.storage, now: e.now, locks })
  const a = open(), b = open()
  const results = await Promise.allSettled([a.ensureTodayReview(), b.ensureTodayReview()])
  expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected'])
  expect(b.getTask('review')).toBe(null); b.reload()
  const snapshot = b.getSnapshot(); e.fail(true)
  await expect(b.submitReviewFeedback(token(b.getTask('review')), 'known')).rejects.toThrow('quota')
  expect(b.getSnapshot()).toBe(snapshot)
})
test('legacy v5 review correction event remains unchanged under v6 migration', () => {
  const e = env(); const task = e.store.ensureTask('review', ['alpha'], 'cet4')
  const old = JSON.parse(e.storage.getItem()); old.version = 5; removeSelectionPreference(old)
  const legacy = old.days[task.date].review, item = legacy.items[legacy.currentItemId]
  Object.assign(item, { knownCount: 0, fuzzyCount: 1, lastFeedback: 'fuzzy' })
  legacy.sessionRevision = 2
  legacy.feedbackEvents = [
    { source: 'self-assessment', rulesVersion: 1, itemId: item.id, feedback: 'known', at: e.now().toISOString(), revision: 0 },
    { source: 'feedback-correction', rulesVersion: 1, itemId: item.id, correctedRevision: 0, at: e.now().toISOString(), revision: 1 },
  ]
  e.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(old))
  expect(e.open().getTask('review')).toEqual({ ...legacy, settings: { ...legacy.settings, newWordSelectionMode: 'sequential' } })
})
test('v6 cannot fabricate a completed item and settlement without completion feedback', () => {
  const e = env(); seed(e); const task = ensure(e.store), saved = JSON.parse(e.storage.getItem())
  const item = saved.days[task.date].review.items[task.currentItemId]
  Object.assign(item, { knownCount: 4, lastFeedback: 'known', completed: true, completedAt: e.now().toISOString(),
    settlement: { previousReview: saved.wordBooks.cet4.words.alpha.review, revision: 0 } })
  saved.days[task.date].review.sessionRevision = 1; saved.days[task.date].review.view = 'feedback'
  const raw = JSON.stringify(saved); e.storage.setItem(LEARNING_STORAGE_KEY, raw)
  expect(() => e.open()).toThrow(/history/); expect(e.storage.getItem()).toBe(raw)
})
test('v1 historical completion with no surviving events uses null identity instead of fabricated feedback', () => {
  const e = env(); e.store.ensureTask('learning', ['alpha'], 'cet4')
  for (let n = 0; n < 3; n++) e.store.recordFeedback('learning', 'alpha', 'known')
  const old = JSON.parse(e.storage.getItem()); old.version = 1; removeSelectionPreference(old); delete old.extraLearning
  old.wordBooks.cet4.words.alpha.review = null
  const task = old.days[e.store.getToday()].learning
  delete task.method; delete task.sessionRevision; delete task.feedbackEvents; delete task.choice
  e.storage.setItem(LEARNING_STORAGE_KEY, JSON.stringify(old)); e.day(); e.store.reload(); ensure(e.store)
  expect(e.store.getWord('cet4', 'alpha').review.provenance).toEqual({ source: 'historical', completion: null })
  expect(e.store.getTask('learning', task.date).feedbackEvents).toEqual([])
})
