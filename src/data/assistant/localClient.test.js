import { afterEach, expect, it, vi } from 'vitest'
import { createLocalClient } from './localClient'

const code = 'a'.repeat(43)
const token = 'b'.repeat(43)
const instant = new Date('2026-10-02T01:00:00.000Z')
const expiresAt = '2026-10-02T13:00:00.000Z'
const request = { contractVersion: 1, requestId: '12345678-1234-1234-1234-123456789abc', basis: { snapshotToken: 'a'.repeat(64), factsToken: 'b'.repeat(64) } }
const success = (req = request) => ({ contractVersion: 1, requestId: req.requestId, snapshotToken: req.basis.snapshotToken, factsToken: req.basis.factsToken, status: 'validated', receivedAt: instant.toISOString() })
const response = (body, status = 200, headers = {}) => ({ status, headers: new Headers({ 'Content-Type': 'application/json', ...headers }), json: async () => body })
const health = () => response({ service: 'linguajet-local', contractVersion: 1 })
const pair = () => response({ sessionToken: token, expiresAt })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
function setup(...replies) {
  const fetchImpl = vi.fn()
  for (const reply of replies) fetchImpl.mockImplementationOnce(() => typeof reply === 'function' ? reply() : Promise.resolve(reply))
  return { fetchImpl, client: createLocalClient({ fetchImpl, now: () => instant }) }
}
afterEach(() => vi.useRealTimers())

it('constructs and subscribes without network and uses stable immutable public state', () => {
  const { client, fetchImpl } = setup()
  const initial = client.getState()
  expect(initial).toEqual({ status: 'disconnected', expiresAt: null, error: null })
  expect(client.getState()).toBe(initial)
  expect(Object.isFrozen(initial)).toBe(true)
  const listener = vi.fn(); const unsubscribe = client.subscribe(listener)
  client.disconnect(); expect(listener).not.toHaveBeenCalled()
  unsubscribe(); expect(fetchImpl).not.toHaveBeenCalled()
})
it('pairs explicitly and reuses a private Bearer with omit and no-store at the fixed address', async () => {
  const { client, fetchImpl } = setup(health(), pair(), response(success()), response(success()))
  const listener = vi.fn(); client.subscribe(listener)
  await client.connect(code)
  expect(client.getState()).toEqual({ status: 'connected', expiresAt, error: null })
  expect(await client.check(request)).toEqual(success())
  await client.check(request)
  expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual(['/health', '/session', '/facts/check', '/facts/check'].map(path => `http://127.0.0.1:5280/api/v1${path}`))
  for (const [, options] of fetchImpl.mock.calls) expect(options).toMatchObject({ credentials: 'omit', cache: 'no-store' })
  expect(fetchImpl.mock.calls[1][1].body).toBe(JSON.stringify({ connectionCode: code }))
  for (const [, options] of fetchImpl.mock.calls.slice(2)) expect(options.headers.Authorization).toBe(`Bearer ${token}`)
  expect(JSON.stringify(client.getState())).not.toContain(token)
  expect(listener).toHaveBeenCalled()
  client.disconnect()
  await expect(client.check(request)).rejects.toMatchObject({ code: 'SESSION_REQUIRED' })
  expect(fetchImpl).toHaveBeenCalledTimes(4)
})
it.each([
  { service: 'wrong', contractVersion: 1 }, { service: 'linguajet-local', contractVersion: '1' },
  { service: 'linguajet-local', contractVersion: 1, extra: true }, null,
])('rejects strict invalid health %j before sending code', async body => {
  const { client, fetchImpl } = setup(response(body))
  await expect(client.connect(code)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})
it.each([
  { sessionToken: 'x', expiresAt }, { sessionToken: token, expiresAt: '2026-10-02T13:00:00Z' },
  { sessionToken: token, expiresAt: '2026-02-30T13:00:00.000Z' },
  { sessionToken: token, expiresAt: '2026-10-02T01:00:00.000Z' },
  { sessionToken: token, expiresAt, extra: true },
])('rejects invalid pairing %j and requires restart', async body => {
  const { client } = setup(health(), response(body))
  await expect(client.connect(code)).rejects.toMatchObject({ code: 'RESPONSE_INVALID', restartRequired: true })
  expect(client.getState().status).toBe('error')
})
it.each([
  { contractVersion: '1' }, { requestId: 'bad' }, { requestId: request.requestId.toUpperCase() },
  { snapshotToken: 'A'.repeat(64) }, { factsToken: 'c'.repeat(64) }, { status: 'ok' },
  { receivedAt: '2026-02-30T01:00:00.000Z' }, { receivedAt: '2026-10-02T01:00:00Z' }, { extra: true },
])('rejects malformed or mismatched check response %j', async patch => {
  const { client } = setup(health(), pair(), response({ ...success(), ...patch }))
  await client.connect(code)
  await expect(client.check(request)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
})
it('binds response to the sent identity even if caller mutates the request', async () => {
  const late = deferred(); const { client } = setup(health(), pair(), () => late.promise)
  await client.connect(code)
  const mutable = structuredClone(request); const pending = client.check(mutable)
  mutable.requestId = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
  late.resolve(response(success(mutable)))
  await expect(pending).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
})
it.each([
  [422, 'FACTS_INVALID'], [500, 'INTERNAL_ERROR'], [400, 'INVALID_JSON'], [415, 'CONTENT_TYPE_UNSUPPORTED'],
  [413, 'BODY_TOO_LARGE'], [403, 'SOURCE_FORBIDDEN'], [404, 'API_NOT_FOUND'],
])('maps approved HTTP %i %s without displaying service text', async (status, errorCode) => {
  const { client, fetchImpl } = setup(health(), pair(), response({ error: { code: errorCode, message: 'secret from service' } }, status))
  await client.connect(code)
  await expect(client.check({ syntheticInvalid: true })).rejects.toMatchObject({ code: errorCode, httpStatus: status })
  expect(client.getState().error.message).not.toContain('secret')
  expect(fetchImpl).toHaveBeenCalledTimes(3)
  expect(client.getState().status).toBe('connected')
})
it.each([[401, 'SESSION_REQUIRED'], [401, 'SESSION_EXPIRED']])('clears credentials on %i %s', async (status, errorCode) => {
  const { client, fetchImpl } = setup(health(), pair(), response({ error: { code: errorCode, message: 'ignored' } }, status))
  await client.connect(code); await expect(client.check(request)).rejects.toMatchObject({ code: errorCode })
  await expect(client.check(request)).rejects.toMatchObject({ code: 'SESSION_REQUIRED' })
  expect(fetchImpl).toHaveBeenCalledTimes(3)
})
it.each([
  [422, { error: { code: 'INTERNAL_ERROR', message: 'secret' } }],
  [500, { error: { code: 'INTERNAL_ERROR', message: 9 } }],
  [401, { error: { code: 'UNKNOWN', message: 'secret' } }],
  [422, { error: { code: 'FACTS_INVALID', message: 'secret', extra: true } }],
  [201, success()],
])('rejects unapproved status/error combinations %i', async (status, body) => {
  const { client } = setup(health(), pair(), response(body, status))
  await client.connect(code); await expect(client.check(request)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
})
it('reports rate limit with validated retry delay and no retry', async () => {
  const { client, fetchImpl } = setup(health(), pair(), response({ error: { code: 'RATE_LIMITED', message: 'ignore' } }, 429, { 'Retry-After': '27' }))
  await client.connect(code); await expect(client.check(request)).rejects.toMatchObject({ code: 'RATE_LIMITED', retryAfter: 27 })
  expect(fetchImpl).toHaveBeenCalledTimes(3)
})
it.each(['', '-1', 'NaN', '1.2', '999999999999999999999'])('rejects invalid Retry-After %j', async retry => {
  const { client } = setup(health(), pair(), response({ error: { code: 'RATE_LIMITED', message: 'ignore' } }, 429, { 'Retry-After': retry }))
  await client.connect(code); await expect(client.check(request)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
})
it('rejects invalid JSON and non JSON responses', async () => {
  const { client } = setup({ ...health(), json: async () => { throw new SyntaxError('secret') } })
  await expect(client.connect(code)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
  const other = setup(response({}, 200, { 'Content-Type': 'text/html' }))
  await expect(other.client.connect(code)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
})
it('maps network failure without claiming permission was denied', async () => {
  const { client } = setup(() => Promise.reject(new TypeError('secret')))
  await expect(client.connect(code)).rejects.toMatchObject({ code: 'CONNECTION_FAILED', message: '连接失败，检查服务和站点权限。' })
})
it('uses a cancellable 60 second health bound even when fetch ignores signal', async () => {
  vi.useFakeTimers(); const late = deferred(); const { client, fetchImpl } = setup(() => late.promise)
  const pending = client.connect(code); const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT', restartRequired: false })
  await vi.advanceTimersByTimeAsync(59999); expect(client.getState().status).toBe('connecting')
  await vi.advanceTimersByTimeAsync(1); await assertion
  late.resolve(health()); await Promise.resolve()
  expect(fetchImpl).toHaveBeenCalledTimes(1); expect(client.getState().status).toBe('error')
})
it('bounds pairing and requires restart after uncertain consumption', async () => {
  vi.useFakeTimers(); const late = deferred(); const { client } = setup(health(), () => late.promise)
  const pending = client.connect(code); const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT', restartRequired: true })
  await vi.advanceTimersByTimeAsync(5000); await assertion
  late.resolve(pair()); await Promise.resolve(); expect(client.getState().status).toBe('error')
})
it('bounds response JSON parsing as part of the ordinary five second request', async () => {
  vi.useFakeTimers(); const { client } = setup(health(), pair(), { ...response(success()), json: () => new Promise(() => {}) })
  await client.connect(code)
  const pending = client.check(request); const assertion = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' })
  await vi.advanceTimersByTimeAsync(5000); await assertion
})
it('active cancel settles even if health ignores signal and never pairs', async () => {
  const late = deferred(); const { client, fetchImpl } = setup(() => late.promise); const controller = new AbortController()
  const pending = client.connect(code, { signal: controller.signal }); controller.abort()
  await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
  late.resolve(health()); await Promise.resolve(); expect(fetchImpl).toHaveBeenCalledTimes(1)
})
it('disconnect settles pending pairing and ignores late credentials', async () => {
  const late = deferred(); const { client, fetchImpl } = setup(health(), () => late.promise)
  const pending = client.connect(code)
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
  client.disconnect(); await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
  late.resolve(pair()); await Promise.resolve(); expect(client.getState().status).toBe('disconnected')
})
it('a new connect supersedes old pairing without old state updates', async () => {
  const late = deferred(); const { client, fetchImpl } = setup(health(), () => late.promise, health(), pair())
  const first = client.connect(code); const assertion = expect(first).rejects.toMatchObject({ code: 'CANCELLED' })
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
  await client.connect(code); await assertion
  const state = client.getState(); late.resolve(pair()); await Promise.resolve(); expect(client.getState()).toBe(state)
})
it('a second check supersedes the first and late first success never updates state', async () => {
  const late = deferred(); const { client } = setup(health(), pair(), () => late.promise, response(success()))
  await client.connect(code)
  const first = client.check(request); const assertion = expect(first).rejects.toMatchObject({ code: 'CANCELLED' })
  await client.check(request); await assertion
  const state = client.getState(); late.resolve(response(success())); await Promise.resolve(); expect(client.getState()).toBe(state)
})
it('disconnect cancels checking and prevents token reuse', async () => {
  const late = deferred(); const { client } = setup(health(), pair(), () => late.promise)
  await client.connect(code); const pending = client.check(request); client.disconnect()
  await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
  late.resolve(response(success())); await Promise.resolve()
  await expect(client.check(request)).rejects.toMatchObject({ code: 'SESSION_REQUIRED' })
})
it('pre-aborted connect never sends anything', async () => {
  const { client, fetchImpl } = setup(); const controller = new AbortController(); controller.abort()
  await expect(client.connect(code, { signal: controller.signal })).rejects.toMatchObject({ code: 'CANCELLED' })
  expect(fetchImpl).not.toHaveBeenCalled()
})
it('detects local expiry before sending and does not slide the deadline', async () => {
  let clock = instant; const fetchImpl = vi.fn().mockResolvedValueOnce(health()).mockResolvedValueOnce(pair()).mockResolvedValueOnce(response(success()))
  const client = createLocalClient({ fetchImpl, now: () => clock }); await client.connect(code)
  await client.check(request); expect(client.getState().expiresAt).toBe(expiresAt)
  clock = new Date(expiresAt)
  await expect(client.check(request)).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  expect(fetchImpl).toHaveBeenCalledTimes(3); expect(client.getState().expiresAt).toBe(null)
})
it.each([
  { sessionToken: token + '\n', expiresAt },
  { sessionToken: token, expiresAt: '0000-10-02T13:00:00.000Z' },
])('rejects noncanonical credential/year %j', async body => {
  const { client } = setup(health(), response(body))
  await expect(client.connect(code)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
})
it('requires error code to be a string instead of coercing an array', async () => {
  const { client } = setup(health(), pair(), response({ error: { code: ['FACTS_INVALID'], message: 'ignored' } }, 422))
  await client.connect(code)
  await expect(client.check(request)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
})
it('rejects an invalid HTTP status instead of accepting a local error as service error', async () => {
  const { client } = setup(response({ error: { code: 'TIMEOUT', message: 'ignored' } }, null))
  await expect(client.connect(code)).rejects.toMatchObject({ code: 'RESPONSE_INVALID' })
})
it('default options construct without contacting the service', () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  const client = createLocalClient(); expect(client.getState().status).toBe('disconnected')
  expect(fetchSpy).not.toHaveBeenCalled(); fetchSpy.mockRestore()
})
it('unsubscribe stops notifications', async () => {
  const { client } = setup(health(), pair()); const listener = vi.fn()
  client.subscribe(listener)(); await client.connect(code); expect(listener).not.toHaveBeenCalled()
})
it('active cancellation of checking settles despite ignored AbortSignal', async () => {
  const late = deferred(); const { client } = setup(health(), pair(), () => late.promise)
  await client.connect(code); const controller = new AbortController()
  const pending = client.check(request, { signal: controller.signal }); controller.abort()
  await expect(pending).rejects.toMatchObject({ code: 'CANCELLED' })
  const state = client.getState(); expect(state.status).toBe('connected')
  late.resolve(response(success())); await Promise.resolve(); expect(client.getState()).toBe(state)
})
it('cancelled pairing requires restart and never accepts late credentials', async () => {
  const late = deferred(); const { client, fetchImpl } = setup(health(), () => late.promise)
  const controller = new AbortController(); const pending = client.connect(code, { signal: controller.signal })
  await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2)); controller.abort()
  await expect(pending).rejects.toMatchObject({ code: 'CANCELLED', restartRequired: true })
  late.resolve(pair()); await Promise.resolve(); expect(client.getState().status).toBe('error')
})
it('rejects invalid connection code locally without sending it', async () => {
  const { client, fetchImpl } = setup(health())
  await expect(client.connect('secret')).rejects.toMatchObject({ code: 'CONNECTION_CODE_INVALID', restartRequired: true })
  expect(fetchImpl).toHaveBeenCalledTimes(1)
})
it('rejects revoked pairing code and does not retry', async () => {
  const { client, fetchImpl } = setup(health(), response({ error: { code: 'CONNECTION_CODE_INVALID', message: 'untrusted' } }, 401))
  await expect(client.connect(code)).rejects.toMatchObject({ code: 'CONNECTION_CODE_INVALID', restartRequired: true })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
it('does not accept a success when the session expires while response is pending', async () => {
  const late = deferred(); let clock = instant
  const fetchImpl = vi.fn().mockResolvedValueOnce(health()).mockResolvedValueOnce(pair()).mockImplementationOnce(() => late.promise)
  const client = createLocalClient({ fetchImpl, now: () => clock }); await client.connect(code)
  const pending = client.check(request); clock = new Date(expiresAt); late.resolve(response(success()))
  await expect(pending).rejects.toMatchObject({ code: 'SESSION_EXPIRED' })
  expect(client.getState().status).toBe('expired')
})
it('handles a nonserializable request without network or secret error text', async () => {
  const { client, fetchImpl } = setup(health(), pair()); await client.connect(code)
  const cyclic = {}; cyclic.self = cyclic
  await expect(client.check(cyclic)).rejects.toMatchObject({ code: 'INVALID_JSON' })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
