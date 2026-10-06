import { expect, it, vi } from 'vitest'
import { createHash } from 'node:crypto'
import { canonicalStringify, buildFactsRequest, isFactsRequestCurrent } from './snapshotToken'
import { context, setup } from './fixtures'

it('keeps the seven-field service contract but invalidates requests when mode changes', async () => {
  const { store } = setup()
  const request = await buildFactsRequest(store, context)
  expect(Object.keys(request.settings).sort()).toEqual(['examDate', 'todayWordBookId', 'dailyNewWords', 'dailyReviewWords', 'dailyStudyMinutes', 'pronunciation', 'mistakeStudyWords'].sort())
  store.updateSettings({ newWordSelectionMode: 'random' })
  expect(await isFactsRequestCurrent(store, context, request)).toBe(false)
  const next = await buildFactsRequest(store, context)
  expect(next.settings).toEqual(request.settings)
  expect(next.basis.snapshotToken).not.toBe(request.basis.snapshotToken)
})

it('canonicalizes keys but preserves arrays and null', () => {
  expect(canonicalStringify({ z: null, a: [{ b: 2, a: 1 }, 0] })).toBe('{"a":[{"a":1,"b":2},0],"z":null}')
})
it('binds a whitelisted request to storage and semantic facts', async () => {
  const { store, storage } = setup()
  const request = await buildFactsRequest(store, context)
  expect(request.basis.snapshotToken).toMatch(/^[a-f0-9]{64}$/)
  expect(request.basis.factsToken).toMatch(/^[a-f0-9]{64}$/)
  expect(request).not.toHaveProperty('evidence')
  expect(await isFactsRequestCurrent(store, context, request)).toBe(true)
  const again = await buildFactsRequest(store, { ...context, now: new Date(context.now.getTime() + 1000) })
  expect(again.requestId).not.toBe(request.requestId)
  expect(again.basis.factsToken).toBe(request.basis.factsToken)
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(await isFactsRequestCurrent(store, { ...context, selectedWordBookId: 'b' }, request)).toBe(false)
  store.updateSettings({ dailyNewWords: 3 })
  expect(await isFactsRequestCurrent(store, context, request)).toBe(false)
})

it('hashes the canonical snapshot and exactly the approved semantic basis', async () => {
  const { store } = setup()
  const request = await buildFactsRequest(store, context)
  const sha = value => createHash('sha256').update(canonicalStringify(value)).digest('hex')
  expect(request.basis.snapshotToken).toBe(sha(store.getSnapshot()))
  const { basis, book, today, reviewLoad, history, ruleRecommendation } = request
  expect(basis.factsToken).toBe(sha({ snapshotToken: basis.snapshotToken, localDate: basis.localDate,
    timeZone: basis.timeZone, selectedWordBookId: basis.selectedWordBookId, book, today, reviewLoad, history, ruleRecommendation }))
  expect(Object.keys(request).sort()).toEqual(['basis', 'book', 'contractVersion', 'history', 'requestId', 'reviewLoad', 'ruleRecommendation', 'settings', 'today'])
})
it('rejects store mutation during asynchronous hash and false currentness for stale storage', async () => {
  const { store, external } = setup()
  const request = await buildFactsRequest(store, context)
  const digest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)
  const spy = vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
    const result = await digest(...args); store.updateSettings({ dailyNewWords: 4 }); return result
  })
  await expect(buildFactsRequest(store, context)).rejects.toThrow(/changed/)
  spy.mockRestore()
  external('{}')
  expect(await isFactsRequestCurrent(store, context, request)).toBe(false)
})
it('expires semantic facts at arbitrary future review cutoff and on calendar rollover', async () => {
  const { store } = setup()
  store.addToReview('a', 'alpha', { nextReviewAt: new Date(context.now.getTime() + 500).toISOString() })
  const request = await buildFactsRequest(store, context)
  expect(await isFactsRequestCurrent(store, { ...context, now: new Date(context.now.getTime() + 1000) }, request)).toBe(false)
  expect(await isFactsRequestCurrent(store, { ...context, now: new Date(2026, 9, 3) }, request)).toBe(false)
  const beforeMidnight = { ...context, now: new Date(2026, 9, 2, 23, 59, 59, 999) }
  const midnightRequest = await buildFactsRequest(store, beforeMidnight)
  expect(await isFactsRequestCurrent(store, { ...context, now: new Date(2026, 9, 3, 0, 0, 0, 0) }, midnightRequest)).toBe(false)
})
it('rejects unsafe numeric summary values', () => {
  expect(() => canonicalStringify({ count: Number.MAX_SAFE_INTEGER + 1 })).toThrow(/safe/)
  expect(() => canonicalStringify({ count: Infinity })).toThrow(/safe/)
})
