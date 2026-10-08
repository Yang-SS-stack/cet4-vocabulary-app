import { expect, test } from 'vitest'
import { createLearningStore } from './store'
import { migrateState, validateState } from './model'

const token = t => ({ date: t.date, itemId: t.currentItemId, revision: t.sessionRevision,
  ...(t.kind === 'extra-learning' ? { kind: t.kind, taskId: t.taskId } : {}) })
function environment(random = () => 0) {
  let raw = null, fail = false, date = new Date(2026, 9, 8)
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw Error('quota'); raw = value } }
  const open = () => createLearningStore({ storage, now: () => date, random })
  const store = open()
  store.updateSettings({ todayWordBookId: 'book', dailyNewWords: 5 })
  return { store, open, storage, fail: v => { fail = v }, nextDay: () => { date = new Date(2026, 9, 9) } }
}
const task = s => s.getTask('learning')
function turn(s, feedback = 'known') {
  const id = task(s).currentItemId
  s.submitSelfAssessment(token(task(s)), feedback)
  s.advanceLearning(token(task(s)))
  return id
}

test('five words appear exactly once per round and consecutive rounds differ even with repeated RNG', () => {
  const { store, open } = environment()
  store.ensureTodayLearning('book', ['a', 'b', 'c', 'd', 'e'])
  const ids = task(store).itemIds
  expect(task(store).presentation).toEqual({ order: [ids[1], ids[2], ids[3], ids[4], ids[0]], index: 0, round: 1 })
  const first = Array.from({ length: 5 }, () => turn(store))
  const second = Array.from({ length: 5 }, () => turn(store))
  expect(first.toSorted()).toEqual(ids.toSorted())
  expect(second.toSorted()).toEqual(ids.toSorted())
  expect(second).not.toEqual(first)
  expect(task(open())).toEqual(task(store))
  expect(task(store).presentation.round).toBe(3)
})

test('completion, correction and reduced unfinished rounds preserve progress rules', () => {
  const { store } = environment()
  store.ensureTodayLearning('book', ['a', 'b'])
  for (let i = 0; i < 4; i++) turn(store)
  const completed = task(store).currentItemId
  store.submitSelfAssessment(token(task(store)), 'known')
  expect(task(store).items[completed].completed).toBe(true)
  store.correctLearningFeedback(token(task(store)))
  expect(task(store).items[completed]).toMatchObject({ completed: false, knownCount: 2, fuzzyCount: 1 })
  store.advanceLearning(token(task(store)))
  turn(store)
  expect(task(store).presentation.order).toEqual([completed])
  expect(task(store).presentation.round).toBe(4)
  turn(store)
  expect(task(store).currentItemId).toBeNull()
  expect(task(store).presentation.index).toBe(task(store).presentation.order.length)
})

test('round-boundary failed saves, stale tokens, conflicts and date changes preserve the saved queue', () => {
  const e = environment(); e.store.ensureTodayLearning('book', ['a'])
  e.store.submitSelfAssessment(token(task(e.store)), 'known')
  const before = e.store.getSnapshot(), old = token(task(e.store))
  e.fail(true); expect(() => e.store.advanceLearning(old)).toThrow('quota')
  expect(e.store.getSnapshot()).toBe(before); expect(task(e.open())).toEqual(task(e.store))
  e.fail(false); const other = e.open(); other.advanceLearning(old)
  expect(() => e.store.advanceLearning(old)).toThrow(/elsewhere/)
  e.store.reload(); expect(task(e.store).presentation.round).toBe(2)
  expect(() => e.store.advanceLearning(old)).toThrow()
  e.store.submitSelfAssessment(token(task(e.store)), 'known')
  const saved = e.store.getSnapshot(); const current = token(task(e.store)); e.nextDay()
  expect(() => e.store.advanceLearning(current)).toThrow(/date/)
  expect(e.store.getSnapshot()).toBe(saved)
})

test('v8 rejects malformed queue shape, membership, duplicates, unsafe counters and mismatched current', () => {
  const e = environment(); e.store.ensureTodayLearning('book', ['a', 'b'])
  const base = e.store.getSnapshot()
  expect(base.version).toBe(8)
  const corruptions = [p => { delete p.round }, p => { p.extra = true }, p => { p.order = ['foreign'] },
    p => { p.order.push(p.order[0]) }, p => { p.index = -1 }, p => { p.index = 0.5 },
    p => { p.round = 0 }, p => { p.round = Number.MAX_SAFE_INTEGER + 1 }, p => { p.index = p.order.length },
    p => { p.order.reverse() }]
  for (const corrupt of corruptions) {
    const snapshot = structuredClone(base); corrupt(snapshot.days[e.store.getToday()].learning.presentation)
    expect(() => migrateState(snapshot)).toThrow()
  }
  expect(validateState(base)).toBe(base)
})

test.each([1, 2, 3, 4, 5, 6, 7])('v%s validates before migration and retains nonfirst current, feedback and old suffix', version => {
  const e = environment(() => 0.999); e.store.ensureTodayLearning('book', ['a', 'b', 'c', 'd', 'e'])
  turn(e.store); turn(e.store); e.store.submitSelfAssessment(token(task(e.store)), 'known')
  const old = structuredClone(e.store.getSnapshot()), t = old.days[e.store.getToday()].learning
  old.version = version; delete t.presentation
  if (version < 7) { delete old.settings.newWordSelectionMode; delete t.settings.newWordSelectionMode }
  else { old.settings.newWordSelectionMode = 'random'; t.settings.newWordSelectionMode = 'random' }
  if (version < 4) delete old.extraLearning
  if (version < 3) delete t.choice
  if (version < 2) { delete t.method; delete t.sessionRevision; delete t.feedbackEvents }
  const raw = JSON.stringify(old); e.storage.setItem('', raw)
  const loaded = e.open(), restored = task(loaded)
  expect(restored.currentItemId).toBe(t.currentItemId)
  expect(restored.items).toEqual(t.items); expect(restored.view).toBe('feedback')
  expect(restored.presentation).toEqual({ order: t.itemIds, index: 2, round: 1 })
  if (version > 1) expect(restored.feedbackEvents).toEqual(t.feedbackEvents)
  if (version === 7) expect(loaded.getSnapshot().settings.newWordSelectionMode).toBe('random')
  expect(e.storage.getItem()).toBe(raw)
  loaded.advanceLearning(token(restored)); expect(turn(loaded)).toBe(t.itemIds[3]); expect(turn(loaded)).toBe(t.itemIds[4])
  expect(task(loaded).presentation.round).toBe(2)
  t.unknown = true; expect(() => migrateState(old)).toThrow()
})

test('extra learning gets its own shuffled rounds, restores mid-round and retains finished daily history', () => {
  const e = environment(); e.store.ensureTodayLearning('book', ['a'])
  for (let i = 0; i < 3; i++) turn(e.store)
  const daily = task(e.store)
  const get = () => e.store.getExtraLearning()
  e.store.ensureExtraLearning(['b', 'c', 'd', 'e', 'f'])
  const ids = get().itemIds, rounds = []
  for (let round = 0; round < 2; round++) {
    const seen = []
    for (let i = 0; i < 5; i++) {
      seen.push(get().currentItemId)
      e.store.submitSelfAssessment(token(get()), 'known')
      expect(e.open().getExtraLearning()).toEqual(get())
      e.store.advanceLearning(token(get()))
    }
    expect(seen.toSorted()).toEqual(ids.toSorted()); rounds.push(seen)
  }
  expect(rounds[0]).not.toEqual(rounds[1]); expect(task(e.store)).toEqual(daily)
})

test('guided choices, reveal state and mid-round cursor survive reload without consuming RNG', () => {
  let calls = 0
  const e = environment(() => { calls++; return 0.999 })
  e.store.ensureTodayLearning('book', ['a', 'b'], undefined, undefined, { id: 'guided-recall', rulesVersion: 1 })
  const options = ['a', 'b', 'c', 'd'].map(word => ({ word, meaning: word.toUpperCase() }))
  e.store.prepareLearningChoice(token(task(e.store)), options)
  const before = calls
  expect(task(e.open())).toEqual(task(e.store)); expect(calls).toBe(before)
  e.store.submitLearningChoice(token(task(e.store)), 'a')
  expect(task(e.open())).toEqual(task(e.store))
  e.store.revealLearningDetails(token(task(e.store)))
  e.store.advanceLearning(token(task(e.store)))
  expect(task(e.open())).toEqual(task(e.store)); expect(task(e.store).presentation.index).toBe(1)
  expect(calls).toBe(before)
})

test('legacy generic session jumps synchronize the queue, including words absent from the current round', () => {
  const e = environment(); e.store.ensureTodayLearning('book', ['a', 'b'])
  const ids = task(e.store).itemIds
  for (let i = 0; i < 3; i++) e.store.recordFeedback('learning', 'a', 'known')
  // Advance from completed a at the end of this queue; the next round contains only b.
  e.store.setTaskSession('learning', { currentItemId: ids[0], view: 'feedback' })
  e.store.advanceLearning(token(task(e.store)))
  expect(task(e.store).presentation.order).toEqual([ids[1]])
  e.store.setTaskSession('learning', { currentItemId: ids[0], view: 'feedback' })
  expect(task(e.store).presentation.order[task(e.store).presentation.index]).toBe(ids[0])
  expect(task(e.open())).toEqual(task(e.store))
  e.store.setTaskSession('learning', { currentItemId: null })
  expect(task(e.store).presentation.index).toBe(task(e.store).presentation.order.length)
})

test('v7 extra feedback migration preserves batches, random settings, feedback and current suffix', () => {
  const e = environment(() => 0.999); e.store.ensureTodayLearning('book', ['a'])
  for (let i = 0; i < 3; i++) turn(e.store)
  e.store.ensureExtraLearning(['b', 'c', 'd'])
  const get = () => e.store.getExtraLearning()
  e.store.submitSelfAssessment(token(get()), 'known'); e.store.advanceLearning(token(get()))
  e.store.submitSelfAssessment(token(get()), 'fuzzy')
  const old = structuredClone(e.store.getSnapshot()); old.version = 7
  delete old.days[e.store.getToday()].learning.presentation
  for (const batch of old.extraLearning[e.store.getToday()].batches) delete batch.presentation
  old.settings.newWordSelectionMode = 'random'
  const before = structuredClone(old)
  e.storage.setItem('', JSON.stringify(old)); const loaded = e.open()
  const extra = loaded.getExtraLearning(), original = old.extraLearning[e.store.getToday()].batches[0]
  expect(extra).toEqual({ ...original, presentation: { order: original.itemIds, index: 1, round: 1 } })
  expect(loaded.getSnapshot().settings.newWordSelectionMode).toBe('random')
  expect(old).toEqual(before)
  loaded.advanceLearning(token(extra)); expect(loaded.getExtraLearning().currentItemId).toBe(original.itemIds[2])
})
