import { expect, test } from 'vitest'
import { createLearningStore } from './store'
import { createState, migrateState, validateState } from './model'

function fixture(version) {
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, v) => { raw = v } }, now: () => new Date(2026, 9, 6, 12) })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 2 })
  store.ensureTodayLearning('cet4', ['a', 'b'])
  const old = JSON.parse(raw)
  old.version = version
  delete old.settings.newWordSelectionMode
  for (const tasks of Object.values(old.days)) for (const task of Object.values(tasks)) {
    delete task.presentation
    delete task.settings.newWordSelectionMode
    if (version === 1) { delete task.method; delete task.sessionRevision; delete task.feedbackEvents }
    if (version < 3) delete task.choice
  }
  if (version < 4) delete old.extraLearning
  return old
}
test.each([1, 2, 3, 4, 5, 6])('v%s migrates global and task preferences after validating the original', version => {
  const old = fixture(version), before = structuredClone(old)
  const migrated = migrateState(old)
  expect(migrated.version).toBe(8)
  expect(migrated.settings.newWordSelectionMode).toBe('sequential')
  const daily = Object.values(migrated.days)[0].learning
  expect(daily.settings.newWordSelectionMode).toBe('sequential')
  expect(daily.itemIds).toEqual(Object.values(old.days)[0].learning.itemIds)
  expect(daily.items).toEqual(Object.values(old.days)[0].learning.items)
  expect(old).toEqual(before)
  expect(validateState(migrated)).toBe(migrated)
})
test('rejects corrupt legacy and v7 modes without hiding damage', () => {
  const old = fixture(6)
  old.settings.pronunciation = 'invalid'
  expect(() => migrateState(old)).toThrow()
  const state = createState()
  state.settings.newWordSelectionMode = 'invalid'
  expect(() => migrateState(state)).toThrow()
  delete state.settings.newWordSelectionMode
  expect(() => migrateState(state)).toThrow()
})
