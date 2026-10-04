const KINDS = { connect: '连接', real: '当前真实摘要', illegal: '固定合成非法示例' }
const OUTCOMES = { success: '成功', 'expected-rejection': '按预期拒绝', failure: '失败', cancelled: '取消', invalidated: '依据变化' }
const BASIS_STATES = { current: '当前仍匹配', stale: '已失效（历史结果）', 'not-applicable': '不适用' }
const ERRORS = {
  SOURCE_FORBIDDEN: '请求来源不允许。',
  SESSION_REQUIRED: '请先连接本机后端。',
  SESSION_EXPIRED: '连接已过期，请重新启动服务配对。',
  CONNECTION_CODE_INVALID: '连接码无效，请重新启动服务配对。',
  RATE_LIMITED: '请求过于频繁，请稍后再试。',
  BODY_TOO_LARGE: '请求正文超过限制。',
  CONTENT_TYPE_UNSUPPORTED: '请使用 JSON 请求。',
  INVALID_JSON: 'JSON 格式不合法。',
  FACTS_INVALID: '请求字段或关系不符合要求。',
  API_NOT_FOUND: '接口不存在。',
  INTERNAL_ERROR: '服务暂时无法处理请求。',
  RESPONSE_INVALID: '本机服务响应不符合约定，请重新检查。',
  CONNECTION_FAILED: '连接失败，检查服务和站点权限。',
  TIMEOUT: '请求超时，请检查服务和站点权限。',
  CANCELLED: '操作已取消。',
  PERMISSION_DENIED: '本地网络访问已拒绝，请在站点设置中恢复权限。',
  FACTS_UNAVAILABLE: '摘要无法生成，请重新载入记录后再检查。',
  UNKNOWN_ERROR: '未取得可确认的错误信息，请重新检查。',
}
const enumeration = (values, value) => typeof value === 'string' && Object.hasOwn(values, value) ? value : null
function timestamp(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null
  const parsed = new Date(value)
  return Number(value.slice(0, 4)) >= 1 && Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : null
}
const positiveInteger = value => Number.isSafeInteger(value) && value > 0 ? value : null
const identifier = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value) ? value : null

export function diagnosticErrorMessage(errorCode) {
  return ERRORS[enumeration(ERRORS, errorCode)] ?? ERRORS.UNKNOWN_ERROR
}

// Reconstruct at each boundary: never retain a request, response, exception or free text.
export function createDiagnosticRecord(input = {}) {
  const kind = enumeration(KINDS, input.kind)
  const outcome = enumeration(OUTCOMES, input.outcome)
  const verifiedReal = kind === 'real' && outcome === 'success'
  return Object.freeze({
    operationId: positiveInteger(input.operationId),
    kind,
    startedAt: timestamp(input.startedAt),
    finishedAt: timestamp(input.finishedAt),
    durationMs: typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0 ? input.durationMs : null,
    outcome,
    httpStatus: Number.isInteger(input.httpStatus) && input.httpStatus >= 100 && input.httpStatus <= 599 ? input.httpStatus : null,
    requestId: verifiedReal ? identifier(input.requestId) : null,
    receivedAt: verifiedReal ? timestamp(input.receivedAt) : null,
    errorCode: input.errorCode == null ? null : enumeration(ERRORS, input.errorCode) ?? 'UNKNOWN_ERROR',
    retryAfter: positiveInteger(input.retryAfter),
    restartRequired: typeof input.restartRequired === 'boolean' ? input.restartRequired : null,
    basisState: enumeration(BASIS_STATES, input.basisState),
  })
}

export function appendDiagnosticRecord(records, record) {
  const safe = createDiagnosticRecord(record)
  const unique = []
  const seen = new Set()
  for (const input of records) {
    const row = createDiagnosticRecord(input)
    if (row.operationId === null || seen.has(row.operationId)) continue
    seen.add(row.operationId); unique.push(row)
  }
  if (safe.operationId !== null && !seen.has(safe.operationId)) unique.unshift(safe)
  return Object.freeze(unique.slice(0, 20))
}

export function invalidateDiagnosticRecords(records) {
  return Object.freeze(records.map(input => createDiagnosticRecord({
    ...createDiagnosticRecord(input),
    basisState: input.basisState === 'current' ? 'stale' : input.basisState,
  })))
}

export function formatDiagnosticReport(input, { buildInfo = {}, generatedAt } = {}) {
  const record = createDiagnosticRecord(input)
  const unknown = '未取得'
  const show = value => value ?? unknown
  const info = buildInfo ?? {}
  const branch = typeof info.branch === 'string' && /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(info.branch) ? info.branch : null
  const commit = typeof info.commit === 'string' && /^[a-f0-9]{7,64}$/.test(info.commit) ? info.commit : null
  const resultType = record.kind === null || record.outcome === null ? unknown
    : record.basisState === 'current' ? '当前依据仍匹配的技术结果' : '历史技术记录'
  return [
    'LinguaJet 临时检查报告',
    '此报告记录当时的技术操作，不表示人工验收通过。',
    `报告生成时间：${show(timestamp(generatedAt))}`,
    `临时操作编号：${show(record.operationId)}`,
    `项目/样本：${KINDS[record.kind] ?? unknown}`,
    `浏览器开始时间（本机）：${show(record.startedAt)}`,
    `浏览器结束时间（本机）：${show(record.finishedAt)}`,
    `等待耗时：${record.durationMs === null ? unknown : `${record.durationMs} 毫秒（前端等待）`}`,
    `技术结果：${OUTCOMES[record.outcome] ?? unknown}`,
    `结果类型：${resultType}`,
    `HTTP 状态：${show(record.httpStatus)}`,
    `请求编号：${show(record.requestId)}`,
    `服务接收时间：${show(record.receivedAt)}`,
    `安全错误码：${show(record.errorCode)}`,
    `固定错误说明：${record.errorCode === null ? unknown : diagnosticErrorMessage(record.errorCode)}`,
    `重试等待秒数：${show(record.retryAfter)}`,
    `需重新启动服务：${record.restartRequired === null ? unknown : record.restartRequired ? '是' : '否'}`,
    `依据适用性：${BASIS_STATES[record.basisState] ?? unknown}`,
    `前端分支：${show(branch)}`,
    `前端提交：${show(commit)}`,
    `构建时间：${show(timestamp(info.builtAt))}`,
    `未提交改动：${typeof info.dirty !== 'boolean' ? unknown : info.dirty ? '含未提交改动' : '无未提交改动'}`,
  ].join('\n')
}
