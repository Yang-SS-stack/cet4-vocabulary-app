import { expect, test } from 'vitest'
import { createBrowserLearningStore } from './browserStore'

function shared() {
  let raw = null
  let queue = Promise.resolve()
  return {
    storage: { getItem: () => raw, setItem: (_, value) => { raw = value } },
    locks: { request: (_, __, work) => {
      const result = queue.then(work)
      queue = result.catch(() => {})
      return result
    } },
    now: () => new Date(2026, 8, 24),
  }
}

test('assistant snapshot is synchronous and read-only without browser locks', () => {
  const env = shared()
  const store = createBrowserLearningStore({ ...env, locks: null })
  expect(store.readAssistantSnapshot()).toEqual({ snapshot: store.getSnapshot(), raw: null })
})

test('concurrent browser writes serialize and stale tab must reload before retrying', async () => {
  const env = shared()
  const a = createBrowserLearningStore(env)
  const b = createBrowserLearningStore(env)
  const results = await Promise.allSettled([a.updateSettings({ dailyNewWords: 1 }), b.updateSettings({ dailyNewWords: 2 })])
  expect(results.map(x => x.status)).toEqual(['fulfilled', 'rejected'])
  expect(b.getSnapshot().settings.dailyNewWords).toBe(null)
  b.reload()
  expect(b.getSnapshot().settings.dailyNewWords).toBe(1)
  await b.updateSettings({ dailyNewWords: 2 })
  expect(createBrowserLearningStore(env).getSnapshot().settings.dailyNewWords).toBe(2)
})

test('queued duplicate submissions count once and queued midnight writes are rejected', async () => {
  const env = shared()
  let date = new Date(2026, 8, 24)
  const store = createBrowserLearningStore({ ...env, now: () => date })
  await store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  const task = await store.ensureTodayLearning('cet4', ['alpha'])
  const turn = { date: task.date, itemId: task.currentItemId, revision: task.sessionRevision }
  const results = await Promise.allSettled([store.submitSelfAssessment(turn, 'known'), store.submitSelfAssessment(turn, 'known')])
  expect(results.map(x => x.status)).toEqual(['fulfilled', 'rejected'])
  expect(store.getTask('learning').feedbackEvents).toHaveLength(1)
  const pending = store.advanceLearning({ ...turn, revision: 1 })
  date = new Date(2026, 8, 25)
  await expect(pending).rejects.toThrow()
  expect(store.getTask('learning', turn.date).view).toBe('feedback')
})

test('no safe browser lock means no write', async () => {
  const env = shared()
  const store = createBrowserLearningStore({ ...env, locks: null })
  await expect(store.updateSettings({ dailyNewWords: 1 })).rejects.toThrow(/lock/)
  expect(env.storage.getItem()).toBe(null)
})

test('rejects generated-answer feedback and exposes no unguarded legacy browser mutations', async () => {
  const store = createBrowserLearningStore(shared())
  expect(store.recordFeedback).toBeUndefined()
  expect(store.setTaskSession).toBeUndefined()
  await store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  const task = await store.ensureTodayLearning('cet4', ['alpha'])
  await expect(store.submitSelfAssessment({ date: task.date, itemId: task.currentItemId, revision: 0 }, 'incorrect')).rejects.toThrow()
  expect(store.getTask('learning').feedbackEvents).toHaveLength(0)
})

test('queued task creation rejects settings changed since loading instead of creating a different plan', async () => {
  const store = createBrowserLearningStore(shared())
  await store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 2 })
  const expectedSettings = store.getSnapshot().settings
  const change = store.updateSettings({ dailyNewWords: 1 })
  const create = store.ensureTodayLearning('cet4', ['alpha', 'beta'], store.getToday(), expectedSettings)
  await change
  await expect(create).rejects.toThrow(/settings changed/)
  expect(store.getTask('learning')).toBe(null)
})

test('two prepared random selections competing for the write lock create only one stable task', async () => {
  const store = createBrowserLearningStore(shared())
  await store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1, newWordSelectionMode: 'random' })
  const initial = store.getSnapshot()
  const args = [store.getToday(), initial.settings, { id: 'guided-recall', rulesVersion: 1 }, initial]
  const results = await Promise.allSettled([
    store.ensureTodayLearning('cet4', ['alpha'], ...args),
    store.ensureTodayLearning('cet4', ['beta'], ...args),
  ])
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected'])
  expect(results[1].reason.message).toMatch(/candidates changed/)
  const task = store.getTask('learning')
  expect(task.itemIds.map(id => task.items[id].wordId)).toEqual(['alpha'])
})


test('corrections use the browser lock, reject duplicates and stale tabs, and check the date after waiting', async () => {
  const env = shared()
  let date = new Date(2026, 8, 24)
  const options = { ...env, now: () => date }
  const store = createBrowserLearningStore(options)
  const token = task => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision })
  await store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  await store.ensureTodayLearning('cet4', ['alpha'])
  await store.submitSelfAssessment(token(store.getTask('learning')), 'known')
  const other = createBrowserLearningStore(options)
  const turn = token(store.getTask('learning'))
  const results = await Promise.allSettled([store.correctLearningFeedback(turn), store.correctLearningFeedback(turn), other.correctLearningFeedback(turn)])
  expect(results.map(result => result.status)).toEqual(['fulfilled', 'rejected', 'rejected'])
  expect(store.getTask('learning').feedbackEvents).toHaveLength(2)
  expect(createBrowserLearningStore(options).getTask('learning')).toEqual(store.getTask('learning'))
  await store.advanceLearning(token(store.getTask('learning')))
  await store.submitSelfAssessment(token(store.getTask('learning')), 'known')
  const before = store.getTask('learning')
  const pending = store.correctLearningFeedback(token(before))
  date = new Date(2026, 8, 25)
  await expect(pending).rejects.toThrow(/date changed/)
  expect(store.getTask('learning', before.date)).toBe(before)
  const withoutLock = createBrowserLearningStore({ ...options, locks: null })
  await expect(withoutLock.correctLearningFeedback(token(before))).rejects.toThrow(/lock/)
})
