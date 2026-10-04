import { expect, test } from 'vitest'
import * as diagnostics from './diagnostics'
const api = name => diagnostics[name]
const fields = { operationId: 1, kind: 'real', outcome: 'success', startedAt: '2026-10-05T00:00:00.000Z', finishedAt: '2026-10-05T00:00:01.000Z', durationMs: 1000, basisState: 'current' }
const requestId = '12345678-1234-1234-1234-123456789abc'

test('keeps only the newest twenty terminal records and ignores duplicate operation IDs', () => {
  const create = api('createDiagnosticRecord'), append = api('appendDiagnosticRecord')
  let records = []
  for (let operationId = 1; operationId <= 21; operationId++) records = append(records, create({ ...fields, operationId }))
  expect(records.map(row => row.operationId)).toEqual(Array.from({ length: 20 }, (_, index) => 21 - index))
  expect(append(records, create({ ...fields, operationId: 21, outcome: 'failure' }))).toEqual(records)
})

test('rebuilds rows and reports using safe fields without messages, snapshots, counts or credentials', () => {
  const create = api('createDiagnosticRecord'), report = api('formatDiagnosticReport')
  const injected = { ...fields, sessionToken: 'credential-secret', connectionCode: 'code-secret', message: 'message-secret', snapshot: { private: 'snapshot-secret' }, counts: 7654321, fingerprint: 'basis-secret', errorCode: 'FACTS_INVALID' }
  const record = create(injected)
  expect(Object.isFrozen(record)).toBe(true)
  expect(Object.keys(record).sort()).toEqual(['operationId', 'kind', 'outcome', 'startedAt', 'finishedAt', 'durationMs', 'basisState', 'httpStatus', 'requestId', 'receivedAt', 'errorCode', 'retryAfter', 'restartRequired'].sort())
  const text = report({ ...record, ...injected }, { generatedAt: '2026-10-05T00:00:02.000Z', buildInfo: { branch: 'codex/maintenance', commit: 'a'.repeat(40), builtAt: fields.startedAt, dirty: true, token: 'build-secret', environment: 'env-secret' } })
  expect(JSON.stringify(record) + text).not.toMatch(/secret|snapshot|fingerprint|7654321/)
  expect(text).toContain('请求字段或关系不符合要求。')
  expect(text).toContain('含未提交改动')
  expect(text).toContain('2026-10-05T00:00:02.000Z')
})

test('never manufactures a status, duration, error, identifier or version for missing fields', () => {
  const create = api('createDiagnosticRecord'), report = api('formatDiagnosticReport')
  const record = create({ operationId: 1, kind: 'connect', outcome: 'success' })
  expect(record.httpStatus).toBeNull()
  expect(record.durationMs).toBeNull()
  expect(record.restartRequired).toBeNull()
  const text = report(record, {})
  expect(text).toContain('HTTP 状态：未取得')
  expect(text).toContain('等待耗时：未取得')
  expect(text).toContain('请求编号：未取得')
  expect(text).toContain('未提交改动：未取得')
  expect(text).not.toContain('200')
})

test('rejects unsafe field values and maps an unknown error to fixed Chinese text', () => {
  const create = api('createDiagnosticRecord'), report = api('formatDiagnosticReport')
  const record = create({ operationId: 1, kind: 'secret-kind', outcome: 'secret-outcome', basisState: 'secret-basis', startedAt: 'secret-date', durationMs: Infinity, httpStatus: '200', requestId: 'secret-request', receivedAt: 'secret-time', errorCode: 'secret-code', retryAfter: -1, restartRequired: 'secret-bool' })
  expect(record).toMatchObject({ kind: null, outcome: null, basisState: null, startedAt: null, durationMs: null, httpStatus: null, requestId: null, receivedAt: null, retryAfter: null, restartRequired: null, errorCode: 'UNKNOWN_ERROR' })
  const text = report(record, { generatedAt: 'secret-date', buildInfo: { branch: 'secret\nheader', commit: 'secret-commit', builtAt: 'secret-time', dirty: 'secret-bool' } })
  expect(JSON.stringify(record) + text).not.toContain('secret')
  expect(text).toContain('未取得可确认的错误信息，请重新检查。')
})

test('marks current historical results stale without appending or mutating the source', () => {
  const create = api('createDiagnosticRecord'), invalidate = api('invalidateDiagnosticRecords')
  const records = [create(fields), create({ ...fields, operationId: 2, kind: 'illegal', basisState: 'not-applicable' })]
  const next = invalidate(records)
  expect(next).toHaveLength(2)
  expect(next[0].basisState).toBe('stale')
  expect(next[1].basisState).toBe('not-applicable')
  expect(records[0].basisState).toBe('current')
})

test('only a real successful check can carry verified response identifiers', () => {
  const create = api('createDiagnosticRecord')
  const identifiers = { requestId, receivedAt: fields.finishedAt }
  expect(create({ ...fields, ...identifiers })).toMatchObject(identifiers)
  for (const patch of [{ kind: 'connect' }, { kind: 'illegal' }, { outcome: 'failure' }, { outcome: 'cancelled' }]) {
    expect(create({ ...fields, ...identifiers, ...patch })).toMatchObject({ requestId: null, receivedAt: null })
  }
})

test('reports distinguish a currently applicable result from a stale historical result', () => {
  const create = api('createDiagnosticRecord'), report = api('formatDiagnosticReport')
  expect(report(create(fields), {})).toContain('结果类型：当前依据仍匹配的技术结果')
  expect(report(create({ ...fields, basisState: 'stale' }), {})).toContain('结果类型：历史技术记录')
})

test('reports with an unknown kind or outcome do not invent a historical result type', () => {
  const report = api('formatDiagnosticReport')
  for (const record of [{}, { kind: 'real' }, { outcome: 'success' }, { ...fields, kind: 'unknown' }, { ...fields, outcome: 'unknown' }]) {
    expect(report(record, {})).toContain('结果类型：未取得')
  }
})
