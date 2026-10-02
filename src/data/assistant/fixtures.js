import { vi } from 'vitest'
import { createLearningStore } from '../learning/store'

export const context = { now: new Date(2026, 9, 2, 12), timeZone: 'Asia/Shanghai', wordBooks: [{ id: 'a', label: 'A', totalWords: 10 }], selectedWordBookId: 'a' }
export function setup() {
  let raw = null
  const storage = { getItem: () => raw, setItem: vi.fn((key, value) => { raw = value }) }
  return { store: createLearningStore({ storage, now: () => context.now }), storage, external: value => { raw = value } }
}
export const token = task => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision,
  ...(task.taskId ? { kind: task.kind, taskId: task.taskId } : {}) })
export function finish(store, getTask = () => store.getTask('learning')) {
  while (getTask().currentItemId !== null) {
    store.submitSelfAssessment(token(getTask()), 'known')
    store.advanceLearning(token(getTask()))
  }
}
// Anomalies are projection-only copies, never persisted through model validation.
export function anomalousTask() {
  const { store } = setup()
  store.ensureTask('learning', ['alpha'], 'a')
  store.submitSelfAssessment(token(store.getTask('learning')), 'known')
  return JSON.parse(JSON.stringify(store.getSnapshot()))
}
