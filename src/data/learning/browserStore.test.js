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
