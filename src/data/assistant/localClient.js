const BASE = 'http://127.0.0.1:5280/api/v1'
const ERROR_DEFINITIONS = {
  SOURCE_FORBIDDEN: [403, '请求来源不允许。'],
  SESSION_REQUIRED: [401, '请先连接本机后端。'],
  SESSION_EXPIRED: [401, '连接已过期，请重新启动服务配对。'],
  CONNECTION_CODE_INVALID: [401, '连接码无效，请重新启动服务配对。'],
  RATE_LIMITED: [429, '请求过于频繁，请稍后再试。'],
  BODY_TOO_LARGE: [413, '请求正文超过限制。'],
  CONTENT_TYPE_UNSUPPORTED: [415, '请使用 JSON 请求。'],
  INVALID_JSON: [400, 'JSON 格式不合法。'],
  FACTS_INVALID: [422, '请求字段或关系不符合要求。'],
  API_NOT_FOUND: [404, '接口不存在。'],
  INTERNAL_ERROR: [500, '服务暂时无法处理请求。'],
  RESPONSE_INVALID: [null, '本机服务响应不符合约定，请重新检查。'],
  CONNECTION_FAILED: [null, '连接失败，检查服务和站点权限。'],
  TIMEOUT: [null, '请求超时，请检查服务和站点权限。'],
  CANCELLED: [null, '操作已取消。'],
}
function failure(code, details = {}) {
  const error = new Error(ERROR_DEFINITIONS[code][1])
  return Object.assign(error, { code, httpStatus: null, retryAfter: null, restartRequired: false }, details)
}
function exact(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key))
}
const credential = value => typeof value === 'string' && value.length === 43 && /^[A-Za-z0-9_-]{43}$/.test(value)
const hash = value => typeof value === 'string' && value.length === 64 && /^[a-f0-9]{64}$/.test(value)
const uuid = value => typeof value === 'string' && value.length === 36 && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value)
function utc(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return false
  const parsed = new Date(value)
  return Number(value.slice(0, 4)) >= 1 && Number.isFinite(parsed.getTime()) && parsed.toISOString() === value
}
function publicError(error) {
  return Object.freeze(Object.fromEntries(['code', 'message', 'httpStatus', 'retryAfter', 'restartRequired'].map(key => [key, error[key]])))
}

// No React, storage, permission inference or network work during construction.
export function createLocalClient({ fetchImpl = globalThis.fetch, now = () => new Date() } = {}) {
  let sessionToken = null
  let state = Object.freeze({ status: 'disconnected', expiresAt: null, error: null })
  let generation = 0
  let active = null
  const listeners = new Set()
  function update(status, expiresAt = state.expiresAt, error = null) {
    if (state.status === status && state.expiresAt === expiresAt && state.error === error) return
    state = Object.freeze({ status, expiresAt, error })
    for (const listener of listeners) listener()
  }
  function cancelActive() {
    generation += 1
    active?.controller.abort()
    active = null
  }
  function begin(signal) {
    cancelActive()
    const controller = new AbortController()
    const onAbort = () => controller.abort()
    signal?.addEventListener('abort', onAbort, { once: true })
    if (signal?.aborted) controller.abort()
    const operation = { controller, generation, cleanup: () => signal?.removeEventListener('abort', onAbort) }
    active = operation
    return operation
  }
  function current(operation) { return operation.generation === generation }
  function assertActive(operation) {
    if (!current(operation) || operation.controller.signal.aborted) throw failure('CANCELLED')
  }
  function finish(operation) {
    operation.cleanup()
    if (active === operation) active = null
  }
  // Race the entire fetch + parsing, not just abort the transport: custom/browser
  // implementations may ignore AbortSignal or leave body parsing pending.
  async function send(operation, path, options, waitMs) {
    assertActive(operation)
    const signal = operation.controller.signal
    let timer
    let onAbort
    const interruption = new Promise((_, reject) => {
      onAbort = () => reject(failure('CANCELLED'))
      signal.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => {
        reject(failure('TIMEOUT'))
        operation.controller.abort()
      }, waitMs)
    })
    const network = (async () => {
      let response
      try {
        response = await fetchImpl(`${BASE}${path}`, { ...options, credentials: 'omit', cache: 'no-store', signal, redirect: 'error' })
      } catch { throw failure('CONNECTION_FAILED') }
      if (typeof response?.headers?.get !== 'function' || response.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw failure('RESPONSE_INVALID')
      let body
      try { body = await response.json() } catch { throw failure('RESPONSE_INVALID') }
      if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) throw failure('RESPONSE_INVALID')
      if (response.status !== 200) {
        if (!exact(body, ['error']) || !exact(body.error, ['code', 'message']) || typeof body.error.message !== 'string' || typeof body.error.code !== 'string'
          || !Object.hasOwn(ERROR_DEFINITIONS, body.error.code) || ERROR_DEFINITIONS[body.error.code][0] !== response.status) throw failure('RESPONSE_INVALID')
        let retryAfter = null
        if (body.error.code === 'RATE_LIMITED') {
          const value = response.headers.get('Retry-After')
          if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value))) throw failure('RESPONSE_INVALID')
          retryAfter = Number(value)
        }
        throw failure(body.error.code, { httpStatus: response.status, retryAfter })
      }
      return body
    })()
    try {
      const body = await Promise.race([network, interruption])
      assertActive(operation)
      return body
    } finally {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
    }
  }
  async function connect(connectionCode, { signal, onHealthChecked } = {}) {
    const operation = begin(signal)
    sessionToken = null
    update('connecting', null)
    let pairingStarted = false
    try {
      const health = await send(operation, '/health', { method: 'GET' }, 60000)
      if (!exact(health, ['service', 'contractVersion']) || health.service !== 'linguajet-local' || health.contractVersion !== 1) throw failure('RESPONSE_INVALID')
      assertActive(operation)
      // Trusted synchronous phase notification: no credentials or response data.
      try { onHealthChecked?.() } catch { throw failure('CONNECTION_FAILED') }
      assertActive(operation)
      if (!credential(connectionCode)) throw failure('CONNECTION_CODE_INVALID')
      pairingStarted = true
      const pair = await send(operation, '/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ connectionCode }) }, 5000)
      if (!exact(pair, ['sessionToken', 'expiresAt']) || !credential(pair.sessionToken) || !utc(pair.expiresAt) || Date.parse(pair.expiresAt) <= now().getTime()) throw failure('RESPONSE_INVALID')
      assertActive(operation)
      sessionToken = pair.sessionToken
      update('connected', pair.expiresAt)
    } catch (error) {
      if (pairingStarted || error.code === 'CONNECTION_CODE_INVALID') error.restartRequired = true
      if (current(operation)) { sessionToken = null; update('error', null, publicError(error)) }
      throw error
    } finally { finish(operation) }
  }
  async function check(request, { signal } = {}) {
    if (!sessionToken) throw failure('SESSION_REQUIRED')
    if (Date.parse(state.expiresAt) <= now().getTime()) {
      cancelActive(); sessionToken = null
      const error = failure('SESSION_EXPIRED', { restartRequired: true })
      update('expired', null, publicError(error)); throw error
    }
    const operation = begin(signal)
    update('checking')
    try {
      // Bind to the serialized request, never to the caller's mutable object.
      const body = JSON.stringify(request)
      const sent = JSON.parse(body)
      const result = await send(operation, '/facts/check', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` }, body }, 5000)
      if (!exact(result, ['contractVersion', 'requestId', 'snapshotToken', 'factsToken', 'status', 'receivedAt'])
        || result.contractVersion !== 1 || result.contractVersion !== sent?.contractVersion || !uuid(result.requestId) || result.requestId !== sent?.requestId
        || !hash(result.snapshotToken) || result.snapshotToken !== sent?.basis?.snapshotToken || !hash(result.factsToken) || result.factsToken !== sent?.basis?.factsToken
        || result.status !== 'validated' || !utc(result.receivedAt)) throw failure('RESPONSE_INVALID')
      assertActive(operation)
      if (Date.parse(state.expiresAt) <= now().getTime()) throw failure('SESSION_EXPIRED', { restartRequired: true })
      update('connected')
      return result
    } catch (caught) {
      const error = Object.hasOwn(ERROR_DEFINITIONS, caught?.code) ? caught : failure('INVALID_JSON')
      if (current(operation)) {
        if (['SESSION_REQUIRED', 'SESSION_EXPIRED'].includes(error.code)) {
          sessionToken = null; error.restartRequired = true
          update('expired', null, publicError(error))
        } else update('connected', state.expiresAt, publicError(error))
      }
      throw error
    } finally { finish(operation) }
  }
  function disconnect() { cancelActive(); sessionToken = null; update('disconnected', null) }
  return {
    connect, check, disconnect,
    getState: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
  }
}
