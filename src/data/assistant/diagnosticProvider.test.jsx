import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../learning'
import { LEARNING_STORAGE_KEY } from '../learning/model'
import { AssistantProvider, useAssistant } from './react'
import { createLocalClient } from './localClient'

const start = new Date('2026-10-05T04:00:00.000Z')
const code = 'c'.repeat(43)
const deferred = () => { let resolve; const promise = new Promise(done => { resolve = done }); return { promise, resolve } }
const response = (body, status = 200) => ({ status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body })
const success = request => response({ contractVersion: 1, requestId: request.requestId, snapshotToken: request.basis.snapshotToken, factsToken: request.basis.factsToken, status: 'validated', receivedAt: start.toISOString() })
const rejection = () => response({ error: { code: 'FACTS_INVALID', message: 'credential-secret snapshot-secret arbitrary-message' } }, 422)
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

function setup({ permission, health, pair, onCheck, suppliedClient, clock = () => start } = {}) {
  let raw = null, value
  const storage = { getItem: () => raw, setItem: vi.fn((_, next) => { raw = next }) }
  const store = createLearningStore({ storage, now: clock })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 2, dailyReviewWords: 3, dailyStudyMinutes: 10 })
  storage.setItem.mockClear()
  const fetchImpl = vi.fn(async (url, options) => {
    if (url.endsWith('/health')) return health ? health() : response({ service: 'linguajet-local', contractVersion: 1 })
    if (url.endsWith('/session')) return pair ? pair() : response({ sessionToken: 'a'.repeat(43), expiresAt: new Date(start.getTime() + 43200000).toISOString() })
    const request = JSON.parse(options.body)
    return onCheck ? onCheck(request) : request.invalidSyntheticExample ? rejection() : success(request)
  })
  const client = suppliedClient ?? createLocalClient({ fetchImpl, now: clock })
  const queryPermission = permission ?? vi.fn(async () => ({ state: 'prompt' }))
  function Probe() { value = useAssistant(); return null }
  const view = render(<LearningStoreProvider store={store}><AssistantProvider client={client} clock={clock} queryPermission={queryPermission}><Probe /></AssistantProvider></LearningStoreProvider>)
  return { get value() { return value }, store, storage, fetchImpl, client, view, queryPermission }
}
async function invoke(ctx, action, ...args) { await act(async () => { await ctx.value[action](...args) }) }
async function pending(ctx, action, ...args) { let result; await act(async () => { result = ctx.value[action](...args); await Promise.resolve() }); return { result } }

test('one connection and one strictly bound real success produce safe terminal rows without storage writes', async () => {
  const ctx = setup()
  expect(ctx.value.diagnostics).toEqual([])
  await invoke(ctx, 'connect', code)
  expect(ctx.value.diagnostics).toHaveLength(1)
  expect(ctx.value.diagnostics[0]).toMatchObject({ operationId: 1, kind: 'connect', outcome: 'success', httpStatus: null, basisState: 'not-applicable', requestId: null })
  await invoke(ctx, 'check')
  const sent = JSON.parse(ctx.fetchImpl.mock.calls.at(-1)[1].body)
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0]).toMatchObject({ operationId: 2, kind: 'real', outcome: 'success', httpStatus: 200, requestId: sent.requestId, receivedAt: start.toISOString(), basisState: 'current' })
  expect(JSON.stringify(ctx.value.diagnostics)).not.toMatch(/snapshotToken|factsToken|sessionToken|Authorization|counts|basis-secret/)
  expect(ctx.value.diagnostics[0].durationMs).toBeGreaterThanOrEqual(0)
  expect(ctx.storage.setItem).not.toHaveBeenCalled()
})

test('illegal expected rejection stays independent of a valid real result and does not leak arbitrary error text', async () => {
  const ctx = setup()
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  const checkedAt = ctx.value.checkedAt
  await invoke(ctx, 'check', true)
  expect(ctx.value.diagnostics[0]).toMatchObject({ kind: 'illegal', outcome: 'expected-rejection', httpStatus: 422, errorCode: 'FACTS_INVALID', requestId: null, receivedAt: null, basisState: 'not-applicable' })
  expect(ctx.value.diagnostics[1].basisState).toBe('current')
  expect(ctx.value.checkedAt).toBe(checkedAt)
  expect(ctx.value.message).toBe('连接正常，摘要格式检查通过')
  expect(ctx.value.illegalMessage).toBe('错误输入已被拒绝')
  expect(JSON.stringify(ctx.value.diagnostics)).not.toMatch(/secret|arbitrary-message/)
})

test('cancelled real check retains session, ignores late response and records only one terminal outcome', async () => {
  const late = deferred()
  let finish
  const ctx = setup({ onCheck: request => { finish = () => late.resolve(success(request)); return late.promise } })
  await invoke(ctx, 'connect', code)
  const { result } = await pending(ctx, 'check')
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  await invoke(ctx, 'cancel')
  await act(async () => { finish(); await result })
  expect(ctx.value.connected).toBe(true)
  expect(ctx.value.busy).toBe(false)
  expect(ctx.value.checkedAt).toBeNull()
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0]).toMatchObject({ kind: 'real', outcome: 'cancelled', requestId: null, httpStatus: null })
  expect(ctx.value.message).not.toBe('连接正常，摘要格式检查通过')
})

test('cancelling illegal example preserves the prior current real result', async () => {
  const late = deferred()
  const ctx = setup({ onCheck: request => request.invalidSyntheticExample ? late.promise : success(request) })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  const checkedAt = ctx.value.checkedAt
  const { result } = await pending(ctx, 'check', true)
  await waitFor(() => expect(ctx.client.getState().status).toBe('checking'))
  await invoke(ctx, 'cancel')
  await act(async () => { late.resolve(rejection()); await result })
  expect(ctx.value.checkedAt).toBe(checkedAt)
  expect(ctx.value.message).toBe('连接正常，摘要格式检查通过')
  expect(ctx.value.diagnostics[0]).toMatchObject({ kind: 'illegal', outcome: 'cancelled' })
  expect(ctx.value.diagnostics[1].basisState).toBe('current')
})

test.each(['permission', 'health', 'pair'])('cancel connection during %s does not send a later phase or revive the session', async phase => {
  const late = deferred()
  const ctx = setup({
    permission: phase === 'permission' ? () => late.promise : undefined,
    health: phase === 'health' ? () => late.promise : undefined,
    pair: phase === 'pair' ? () => late.promise : undefined,
  })
  const { result } = await pending(ctx, 'connect', code)
  await waitFor(() => expect(ctx.fetchImpl).toHaveBeenCalledTimes(phase === 'permission' ? 0 : phase === 'health' ? 1 : 2))
  await invoke(ctx, 'cancel')
  await act(async () => { late.resolve(phase === 'permission' ? { state: 'prompt' } : phase === 'health' ? response({ service: 'linguajet-local', contractVersion: 1 }) : response({ sessionToken: 'a'.repeat(43), expiresAt: new Date(start.getTime() + 43200000).toISOString() })); await result })
  expect(ctx.value.connected).toBe(false)
  expect(ctx.value.busy).toBe(false)
  expect(ctx.value.diagnostics).toHaveLength(1)
  expect(ctx.value.diagnostics[0]).toMatchObject({ kind: 'connect', outcome: 'cancelled', httpStatus: null })
  expect(ctx.fetchImpl).toHaveBeenCalledTimes(phase === 'permission' ? 0 : phase === 'health' ? 1 : 2)
})

test('finished real result changes applicability without adding a record when learning data changes', async () => {
  const ctx = setup()
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  act(() => ctx.store.updateSettings({ dailyNewWords: 3 }))
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0]).toMatchObject({ outcome: 'success', basisState: 'stale' })
  expect(ctx.value.checkedAt).toBeNull()
  expect(ctx.value.message).toBe('记录或日期已变化，请重新检查')
})

test('basis changes during checking create one invalidated terminal record and ignore the late success', async () => {
  const late = deferred(); let finish
  const ctx = setup({ onCheck: request => { finish = () => late.resolve(success(request)); return late.promise } })
  await invoke(ctx, 'connect', code)
  const { result } = await pending(ctx, 'check')
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  act(() => ctx.store.updateSettings({ dailyNewWords: 3 }))
  await act(async () => { finish(); await result })
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0]).toMatchObject({ outcome: 'invalidated', basisState: 'stale', httpStatus: null })
  expect(ctx.value.checkedAt).toBeNull()
})

test('a storage event invalidates an ended real result but unrelated keys do not', async () => {
  const ctx = setup()
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'other-key' })))
  expect(ctx.value.diagnostics[0].basisState).toBe('current')
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: LEARNING_STORAGE_KEY })))
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0].basisState).toBe('stale')
})

test('new real check, reconnect and disconnect invalidate historical current applicability', async () => {
  const ctx = setup()
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check'); await invoke(ctx, 'check')
  expect(ctx.value.diagnostics[1].basisState).toBe('stale')
  await invoke(ctx, 'connect', code)
  expect(ctx.value.diagnostics.find(row => row.operationId === 3).basisState).toBe('stale')
  await invoke(ctx, 'check'); await invoke(ctx, 'disconnect')
  expect(ctx.value.diagnostics[0].basisState).toBe('stale')
  expect(ctx.value.connected).toBe(false)
})

test('clear affects only diagnostics; new instances start empty and twenty-one operations stay bounded', async () => {
  const ctx = setup()
  await invoke(ctx, 'connect', code)
  for (let index = 0; index < 20; index++) await invoke(ctx, 'check')
  expect(ctx.value.diagnostics).toHaveLength(20)
  expect(ctx.value.diagnostics.map(row => row.operationId)).toEqual(Array.from({ length: 20 }, (_, index) => 21 - index))
  const checkedAt = ctx.value.checkedAt, message = ctx.value.message, calls = ctx.fetchImpl.mock.calls.length
  await invoke(ctx, 'clearDiagnostics')
  expect(ctx.value.diagnostics).toEqual([])
  expect(ctx.value.checkedAt).toBe(checkedAt)
  expect(ctx.value.message).toBe(message)
  expect(ctx.value.connected).toBe(true)
  expect(ctx.fetchImpl).toHaveBeenCalledTimes(calls)
  expect(ctx.storage.setItem).not.toHaveBeenCalled()
  ctx.view.unmount()
  expect(setup().value.diagnostics).toEqual([])
})

test('unexpected illegal 200 is a failed response with no manufactured status or acceptance claim', async () => {
  const ctx = setup({ onCheck: () => response({ status: 'accepted', message: 'arbitrary-secret' }) })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check', true)
  expect(ctx.value.diagnostics[0]).toMatchObject({ kind: 'illegal', outcome: 'failure', errorCode: 'RESPONSE_INVALID', httpStatus: null })
  expect(ctx.value.illegalMessage).toBe('未获得符合约定的拒绝结果，请重新检查。')
  expect(JSON.stringify(ctx.value.diagnostics)).not.toContain('arbitrary-secret')
})

test('unknown thrown errors never copy arbitrary text into provider messages or rows', async () => {
  const ctx = setup()
  await invoke(ctx, 'connect', code)
  ctx.client.check = async () => { throw Object.assign(new Error('credential-secret snapshot-secret'), { code: 'UNKNOWN_SECRET', sessionToken: 'credential-secret', snapshot: 'snapshot-secret' }) }
  await invoke(ctx, 'check')
  expect(ctx.value.diagnostics[0]).toMatchObject({ outcome: 'failure', errorCode: 'UNKNOWN_ERROR', httpStatus: null })
  expect(JSON.stringify(ctx.value.diagnostics) + ctx.value.message).not.toContain('secret')
})

test('permission wait reaches sixty seconds once, without a fabricated HTTP status', async () => {
  vi.useFakeTimers()
  const ctx = setup({ permission: () => new Promise(() => {}) })
  const { result } = await pending(ctx, 'connect', code)
  await act(async () => { await vi.advanceTimersByTimeAsync(59999) })
  expect(ctx.value.busy).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(1); await result })
  expect(ctx.value.busy).toBe(false)
  expect(ctx.value.diagnostics).toHaveLength(1)
  expect(ctx.value.diagnostics[0]).toMatchObject({ outcome: 'failure', errorCode: 'TIMEOUT', httpStatus: null })
  expect(ctx.fetchImpl).not.toHaveBeenCalled()
})

test('unreadable records before request construction produce one safe failure and no request', async () => {
  const ctx = setup()
  await invoke(ctx, 'connect', code)
  ctx.store.readAssistantSnapshot = () => { throw new Error('snapshot-secret credential-secret') }
  await invoke(ctx, 'check')
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0]).toMatchObject({ kind: 'real', outcome: 'failure', errorCode: 'FACTS_UNAVAILABLE', httpStatus: null })
  expect(ctx.value.message).toBe('摘要无法生成，请重新载入记录后再检查。')
  expect(ctx.fetchImpl).toHaveBeenCalledTimes(2)
  expect(ctx.value.busy).toBe(false)
})

test('disconnect while checking stops waiting, discards the session and cannot append late success', async () => {
  const late = deferred(); let finish
  const ctx = setup({ onCheck: request => { finish = () => late.resolve(success(request)); return late.promise } })
  await invoke(ctx, 'connect', code)
  const { result } = await pending(ctx, 'check')
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  await invoke(ctx, 'disconnect')
  await act(async () => { finish(); await result })
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0].outcome).toBe('cancelled')
  expect(ctx.value.connected).toBe(false)
  expect(ctx.value.message).toBe('未连接')
  expect(ctx.value.checkedAt).toBeNull()
})

test('after cancelling a real check, the retained session can immediately check again', async () => {
  const late = deferred(); let checking = false
  const ctx = setup({ onCheck: request => { if (!checking) { checking = true; return late.promise } return success(request) } })
  await invoke(ctx, 'connect', code)
  const { result } = await pending(ctx, 'check')
  await waitFor(() => expect(checking).toBe(true))
  await invoke(ctx, 'cancel')
  await act(async () => { await result })
  await invoke(ctx, 'check')
  expect(ctx.value.message).toBe('连接正常，摘要格式检查通过')
  expect(ctx.value.diagnostics).toHaveLength(3)
  expect(ctx.value.diagnostics[0]).toMatchObject({ operationId: 3, outcome: 'success', basisState: 'current' })
  expect(ctx.fetchImpl.mock.calls.filter(([url]) => url.endsWith('/session'))).toHaveLength(1)
})

test('clear while waiting removes history without preventing the pending operation from finishing once', async () => {
  const late = deferred(); let finish
  const ctx = setup({ onCheck: request => { finish = () => late.resolve(success(request)); return late.promise } })
  await invoke(ctx, 'connect', code)
  const { result } = await pending(ctx, 'check')
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  await invoke(ctx, 'clearDiagnostics')
  expect(ctx.value.busy).toBe(true)
  expect(ctx.value.diagnostics).toEqual([])
  await act(async () => { finish(); await result })
  expect(ctx.value.diagnostics).toHaveLength(1)
  expect(ctx.value.diagnostics[0]).toMatchObject({ operationId: 2, outcome: 'success' })
})

test.each(['finished', 'pending'])('session expiry marks history stale and records no extra terminal for %s checks', async phase => {
  vi.useFakeTimers()
  let now = start
  const late = deferred(), started = deferred()
  let pendingResult
  const ctx = setup({ clock: () => now, onCheck: request => { started.resolve(); return phase === 'pending' ? late.promise : success(request) } })
  await invoke(ctx, 'connect', code)
  if (phase === 'finished') await invoke(ctx, 'check')
  else {
    const operation = await pending(ctx, 'check')
    pendingResult = operation.result
    await act(async () => { await started.promise })
  }
  now = new Date(start.getTime() + 43200000)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); await pendingResult })
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0]).toMatchObject(phase === 'finished' ? { outcome: 'success', basisState: 'stale' } : { outcome: 'failure', errorCode: 'SESSION_EXPIRED', httpStatus: null })
  expect(ctx.value.connected).toBe(false)
  expect(ctx.value.checkedAt).toBeNull()
})

test('date rollover marks ended real success stale without creating a second row', async () => {
  vi.useFakeTimers()
  let now = start
  const ctx = setup({ clock: () => now, pair: () => response({ sessionToken: 'a'.repeat(43), expiresAt: new Date(start.getTime() + 172800000).toISOString() }) })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  now = new Date(start.getTime() + 86400000)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(ctx.value.diagnostics).toHaveLength(2)
  expect(ctx.value.diagnostics[0]).toMatchObject({ outcome: 'success', basisState: 'stale' })
  expect(ctx.value.connected).toBe(true)
})

test('a known server error copies only verified status and safe retry metadata', async () => {
  const ctx = setup({ onCheck: () => ({ status: 429, headers: new Headers({ 'content-type': 'application/json', 'retry-after': '27' }), json: async () => ({ error: { code: 'RATE_LIMITED', message: 'credential-secret' } }) }) })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  expect(ctx.value.diagnostics[0]).toMatchObject({ outcome: 'failure', httpStatus: 429, errorCode: 'RATE_LIMITED', retryAfter: 27, restartRequired: false, requestId: null })
  expect(ctx.value.message).toBe('请求过于频繁，请稍后再试。')
})

test('permission denial creates one explicit failure with no status or request', async () => {
  const ctx = setup({ permission: () => ({ state: 'denied' }) })
  await invoke(ctx, 'connect', code)
  expect(ctx.value.diagnostics).toHaveLength(1)
  expect(ctx.value.diagnostics[0]).toMatchObject({ outcome: 'failure', errorCode: 'PERMISSION_DENIED', httpStatus: null })
  expect(ctx.fetchImpl).not.toHaveBeenCalled()
})

test.each([3, 5])('cancelled basis validation at digest %s cannot invalidate a newer completed check', async gatedCall => {
  const reached = deferred(), release = deferred()
  const nativeDigest = globalThis.crypto.subtle.digest.bind(globalThis.crypto.subtle)
  let calls = 0
  vi.spyOn(globalThis.crypto.subtle, 'digest').mockImplementation(async (...args) => {
    if (++calls === gatedCall) { reached.resolve(); await release.promise }
    return nativeDigest(...args)
  })
  const ctx = setup()
  await invoke(ctx, 'connect', code)
  const first = await pending(ctx, 'check')
  await act(async () => { await reached.promise })
  await invoke(ctx, 'cancel')
  act(() => ctx.store.updateSettings({ dailyNewWords: 3 }))
  await invoke(ctx, 'check')
  expect(ctx.value.diagnostics[0]).toMatchObject({ operationId: 3, outcome: 'success', basisState: 'current' })
  await act(async () => { release.resolve(); await first.result })
  expect(ctx.value.diagnostics).toHaveLength(3)
  expect(ctx.value.diagnostics[0]).toMatchObject({ operationId: 3, outcome: 'success', basisState: 'current' })
  expect(ctx.value.message).toBe('连接正常，摘要格式检查通过')
})

test('status interface treats a successful connection as not checked and keeps connection hints separate', async () => {
  const ctx = setup()
  expect(ctx.value.summaryStatus).toBe('not-checked')
  expect(ctx.value.connectionMessage).toBe('未连接')
  expect(ctx.value.activeOperationKind).toBeNull()
  await invoke(ctx, 'connect', code)
  expect(ctx.value.summaryStatus).toBe('not-checked')
  expect(ctx.value.connectionMessage).toBe('已连接本机后端。')
  expect(ctx.value.activeOperationKind).toBeNull()
  await invoke(ctx, 'check')
  expect(ctx.value.summaryStatus).toBe('passed')
  expect(ctx.value.connectionMessage).toBe('已连接本机后端。')
  expect(ctx.value.message).toBe('连接正常，摘要格式检查通过')
  await invoke(ctx, 'disconnect')
  expect(ctx.value.summaryStatus).toBe('not-checked')
  expect(ctx.value.connectionMessage).toBe('未连接')
})

test('status interface distinguishes real checking, failed and stale results without changing connection hints', async () => {
  const late = deferred(); let finish, fail = false
  const ctx = setup({ onCheck: request => {
    if (fail) return rejection()
    finish = () => late.resolve(success(request)); return late.promise
  } })
  await invoke(ctx, 'connect', code)
  const first = await pending(ctx, 'check')
  expect(ctx.value.summaryStatus).toBe('checking')
  expect(ctx.value.activeOperationKind).toBe('real')
  expect(ctx.value.connectionMessage).toBe('已连接本机后端。')
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  await act(async () => { finish(); await first.result })
  expect(ctx.value.summaryStatus).toBe('passed')
  act(() => ctx.store.updateSettings({ dailyNewWords: 3 }))
  expect(ctx.value.summaryStatus).toBe('stale')
  fail = true
  await invoke(ctx, 'check')
  expect(ctx.value.summaryStatus).toBe('failed')
  expect(ctx.value.activeOperationKind).toBeNull()
  expect(ctx.value.connectionMessage).toBe('已连接本机后端。')
})

test.each(['passed', 'failed'])('status interface preserves the prior %s real conclusion during and after illegal cancellation', async previous => {
  const late = deferred()
  const ctx = setup({ onCheck: request => request.invalidSyntheticExample ? late.promise : previous === 'passed' ? success(request) : rejection() })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  const first = await pending(ctx, 'check', true)
  expect(ctx.value.summaryStatus).toBe(previous)
  expect(ctx.value.activeOperationKind).toBe('illegal')
  expect(ctx.value.connectionMessage).toBe('已连接本机后端。')
  await invoke(ctx, 'cancel')
  await act(async () => { late.resolve(rejection()); await first.result })
  expect(ctx.value.summaryStatus).toBe(previous)
  expect(ctx.value.activeOperationKind).toBeNull()
  expect(ctx.value.connectionMessage).toBe('已连接本机后端。')
})

test('status interface exposes connection phases and cancellation without producing a summary result', async () => {
  const permission = deferred(), pair = deferred()
  const ctx = setup({ permission: () => permission.promise, pair: () => pair.promise })
  const first = await pending(ctx, 'connect', code)
  expect(ctx.value.summaryStatus).toBe('not-checked')
  expect(ctx.value.activeOperationKind).toBe('connect')
  expect(ctx.value.connectionMessage).toContain('等待权限')
  await act(async () => { permission.resolve({ state: 'prompt' }) })
  await waitFor(() => expect(ctx.value.connectionMessage).toBe('健康检查通过，正在配对。'))
  await invoke(ctx, 'cancel')
  await act(async () => { await first.result })
  expect(ctx.value.summaryStatus).toBe('not-checked')
  expect(ctx.value.activeOperationKind).toBeNull()
  expect(ctx.value.connectionMessage).toBe('连接已取消，未连接。')
})

test('status interface distinguishes real cancellation from an expired connection', async () => {
  vi.useFakeTimers()
  let now = start
  const reached = deferred()
  const ctx = setup({ clock: () => now, onCheck: () => { reached.resolve(); return new Promise(() => {}) } })
  await invoke(ctx, 'connect', code)
  const first = await pending(ctx, 'check')
  await act(async () => { await reached.promise })
  await invoke(ctx, 'cancel')
  await act(async () => { await first.result })
  expect(ctx.value.summaryStatus).toBe('cancelled')
  expect(ctx.value.connectionMessage).toBe('已连接本机后端。')
  now = new Date(start.getTime() + 43200000)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(ctx.value.summaryStatus).toBe('expired')
  expect(ctx.value.connectionMessage).toBe('会话过期，请重新启动服务配对。')
  expect(ctx.value.activeOperationKind).toBeNull()
})

test('status interface keeps a connection failure outside the summary status and rejects arbitrary error text', async () => {
  const ctx = setup()
  ctx.client.connect = async () => { throw Object.assign(new Error('credential-secret'), { code: 'arbitrary-secret' }) }
  await invoke(ctx, 'connect', code)
  expect(ctx.value.summaryStatus).toBe('not-checked')
  expect(ctx.value.connectionMessage).toBe('未取得可确认的错误信息，请重新检查。')
  expect(ctx.value.connectionMessage).not.toContain('secret')
  expect(ctx.value.activeOperationKind).toBeNull()
})

test('project errors preserve current real retry metadata after clearing diagnostics and checking illegal data', async () => {
  const ctx = setup({ onCheck: request => request.invalidSyntheticExample ? rejection() : ({ status: 429, headers: new Headers({ 'content-type': 'application/json', 'retry-after': '27' }), json: async () => ({ error: { code: 'RATE_LIMITED', message: 'credential-secret' } }) }) })
  expect(ctx.value.projectErrors).toEqual({ connect: null, real: null, illegal: null })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  const error = { errorCode: 'RATE_LIMITED', httpStatus: 429, retryAfter: 27, restartRequired: false }
  expect(ctx.value.projectErrors).toEqual({ connect: null, real: error, illegal: null })
  await invoke(ctx, 'clearDiagnostics')
  expect(ctx.value.projectErrors.real).toEqual(error)
  expect(ctx.value.diagnostics).toEqual([])
  await invoke(ctx, 'check', true)
  expect(ctx.value.projectErrors.real).toEqual(error)
  expect(ctx.value.projectErrors.illegal).toBeNull()
  expect(ctx.value.summaryStatus).toBe('failed')
})

test('project errors remain independent and clear only the project that starts again', async () => {
  const ctx = setup({ onCheck: request => request.invalidSyntheticExample ? response({ error: { code: 'INTERNAL_ERROR', message: 'arbitrary-secret' } }, 500) : rejection() })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check'); await invoke(ctx, 'check', true)
  expect(ctx.value.projectErrors?.real).toMatchObject({ errorCode: 'FACTS_INVALID', httpStatus: 422 })
  expect(ctx.value.projectErrors.illegal).toMatchObject({ errorCode: 'INTERNAL_ERROR', httpStatus: 500 })
  const late = deferred(), reached = deferred()
  ctx.client.check = () => { reached.resolve(); return late.promise }
  const first = await pending(ctx, 'check')
  await act(async () => { await reached.promise })
  expect(ctx.value.projectErrors.real).toBeNull()
  expect(ctx.value.projectErrors.illegal).toMatchObject({ errorCode: 'INTERNAL_ERROR', httpStatus: 500 })
  await invoke(ctx, 'cancel')
  await act(async () => { late.resolve(); await first.result })
  expect(ctx.value.projectErrors.real).toBeNull()
  await invoke(ctx, 'disconnect')
  expect(ctx.value.projectErrors).toEqual({ connect: null, real: null, illegal: null })
})

test('project errors rebuild exactly four safe fields and do not retain messages or credentials', async () => {
  const ctx = setup()
  await invoke(ctx, 'connect', code)
  ctx.client.check = async () => { throw { code: 'arbitrary-secret', message: 'message-secret', httpStatus: '429', retryAfter: '27', restartRequired: 'yes', sessionToken: 'credential-secret', snapshot: { private: true } } }
  await invoke(ctx, 'check')
  expect(ctx.value.projectErrors?.real).toEqual({ errorCode: 'UNKNOWN_ERROR', httpStatus: null, retryAfter: null, restartRequired: null })
  expect(Object.keys(ctx.value.projectErrors.real).sort()).toEqual(['errorCode', 'httpStatus', 'retryAfter', 'restartRequired'].sort())
  expect(Object.isFrozen(ctx.value.projectErrors.real)).toBe(true)
  expect(JSON.stringify(ctx.value.projectErrors)).not.toMatch(/secret|snapshot|sessionToken/)
})

test('project errors expose expiry for the connection and applicable real summary without manufacturing a status', async () => {
  vi.useFakeTimers()
  let now = start
  const ctx = setup({ clock: () => now })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  now = new Date(start.getTime() + 43200000)
  await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
  expect(ctx.value.projectErrors?.connect).toEqual({ errorCode: 'SESSION_EXPIRED', httpStatus: null, retryAfter: null, restartRequired: true })
  expect(ctx.value.projectErrors.real).toEqual(ctx.value.projectErrors.connect)
  expect(ctx.value.projectErrors.illegal).toBeNull()
})

test.each(['timer', 'service'])('illegal expiry from %s keeps an explicit unfinished conclusion for the operation that ran', async source => {
  if (source === 'timer') vi.useFakeTimers()
  let now = start
  const reached = deferred()
  const ctx = setup({ clock: () => now, onCheck: request => {
    if (!request.invalidSyntheticExample) return success(request)
    reached.resolve()
    return source === 'timer' ? new Promise(() => {}) : response({ error: { code: 'SESSION_EXPIRED', message: 'credential-secret' } }, 401)
  } })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  if (source === 'timer') {
    const first = await pending(ctx, 'check', true)
    await act(async () => { await reached.promise })
    now = new Date(start.getTime() + 43200000)
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); await first.result })
  } else await invoke(ctx, 'check', true)
  expect(ctx.value.illegalMessage).toBe('会话过期，本次非法示例检查未完成，请重新连接后检查。')
  expect(ctx.value.diagnostics[0]).toMatchObject({ kind: 'illegal', outcome: 'failure', errorCode: 'SESSION_EXPIRED' })
  expect(ctx.value.projectErrors.illegal.errorCode).toBe('SESSION_EXPIRED')
  expect(ctx.value.summaryStatus).toBe('expired')
  expect(ctx.value.activeOperationKind).toBeNull()
  expect(ctx.value.illegalMessage).not.toContain('secret')
})

test.each(['expired', 'rate-limited'])('new pairing removes all project errors from the prior %s session while retaining stale history', async prior => {
  let oldSession = false
  const limited = () => ({ status: 429, headers: new Headers({ 'content-type': 'application/json', 'retry-after': '27' }), json: async () => ({ error: { code: 'RATE_LIMITED', message: 'credential-secret' } }) })
  const ctx = setup({ onCheck: request => {
    if (!oldSession) return success(request)
    return prior === 'expired' ? response({ error: { code: 'SESSION_EXPIRED', message: 'credential-secret' } }, 401) : limited()
  } })
  await invoke(ctx, 'connect', code); await invoke(ctx, 'check')
  oldSession = true
  if (prior === 'rate-limited') await invoke(ctx, 'check')
  await invoke(ctx, 'check', true)
  expect(ctx.value.projectErrors.real).not.toBeNull()
  expect(ctx.value.projectErrors.illegal).not.toBeNull()
  const previous = ctx.value.diagnostics
  await invoke(ctx, 'connect', code)
  expect(ctx.value.projectErrors).toEqual({ connect: null, real: null, illegal: null })
  expect(ctx.value.summaryStatus).toBe('not-checked')
  expect(ctx.value.connectionMessage).toBe('已连接本机后端。')
  expect(ctx.value.diagnostics).toHaveLength(previous.length + 1)
  expect(ctx.value.diagnostics.find(row => row.operationId === 2)).toMatchObject({ outcome: 'success', basisState: 'stale' })
})
