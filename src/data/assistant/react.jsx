/* oxlint-disable react/only-export-components -- Provider and context hooks share this task-owned module. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLearningStore } from '../learning'
import { LEARNING_STORAGE_KEY, localDateKey } from '../learning/model'
import { wordBooks } from '../wordBooks'
import { buildLearningFacts } from './facts'
import { createLocalClient } from './localClient'
import { buildFactsRequest, canonicalStringify, isFactsRequestCurrent } from './snapshotToken'
import { appendDiagnosticRecord, createDiagnosticRecord, diagnosticErrorMessage, invalidateDiagnosticRecords } from './diagnostics'

const AssistantContext = createContext(null)
const actualClock = () => new Date()
const changedMessage = '记录或日期已变化，请重新检查'
const failureMessage = '连接失败，检查服务和站点权限。'
const expiredIllegalMessage = '会话过期，本次非法示例检查未完成，请重新连接后检查。'
const permissionQuery = () => navigator.permissions?.query({ name: 'local-network-access' })
const emptyProjectErrors = () => Object.freeze({ connect: null, real: null, illegal: null })

export function useAssistant() { return useContext(AssistantContext) }

// The Date-valued getter lets the digest helpers sample again after each await.
function contextFor(store, clock, books) {
  return {
    get now() { return clock() },
    get selectedWordBookId() { return store.getSnapshot().settings.todayWordBookId },
    get timeZone() { return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null },
    wordBooks: books,
  }
}
export function useLearningFacts({ now, clock = actualClock, books = wordBooks } = {}) {
  const { store, snapshot } = useLearningStore()
  const [, refresh] = useState(0)
  useEffect(() => {
    if (now) return
    const timer = window.setInterval(() => refresh(n => n + 1), 1000)
    return () => window.clearInterval(timer)
  }, [now])
  try {
    const read = store.readAssistantSnapshot()
    return { facts: buildLearningFacts(read.snapshot, { now: now ?? clock(), wordBooks: books, selectedWordBookId: snapshot.settings.todayWordBookId }), error: null }
  } catch { return { facts: null, error: '学习记录已变化或无法读取，请重新载入页面。' } }
}

export function AssistantProvider({ children, client: suppliedClient, clock = actualClock, books = wordBooks, queryPermission = permissionQuery }) {
  const { store } = useLearningStore()
  const [client] = useState(() => suppliedClient ?? createLocalClient({ now: clock }))
  const clientState = useSyncExternalStore(client.subscribe, client.getState)
  const [message, setMessage] = useState('未连接')
  const [connectionMessage, setConnectionMessage] = useState('未连接')
  const [summaryStatus, setSummaryStatus] = useState('not-checked')
  const [illegalMessage, setIllegalMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [checkedAt, setCheckedAt] = useState(null)
  const [diagnostics, setDiagnostics] = useState(() => Object.freeze([]))
  const [projectErrors, setProjectErrors] = useState(emptyProjectErrors)
  const operation = useRef({ generation: 0, nextOperationId: 0, controller: null, basis: null, validated: false, kind: null, pending: null })
  const setProjectError = useCallback((kind, details = null) => {
    const safe = details === null ? null : createDiagnosticRecord({
      errorCode: details.errorCode ?? 'UNKNOWN_ERROR', httpStatus: details.httpStatus,
      retryAfter: details.retryAfter, restartRequired: details.restartRequired,
    })
    const error = safe === null ? null : Object.freeze({
      errorCode: safe.errorCode, httpStatus: safe.httpStatus,
      retryAfter: safe.retryAfter, restartRequired: safe.restartRequired,
    })
    setProjectErrors(previous => Object.freeze({ ...previous, [kind]: error }))
  }, [])
  const expireProjectErrors = useCallback((details = { errorCode: 'SESSION_EXPIRED', restartRequired: true }) => {
    const current = operation.current
    setProjectError('connect', details)
    if (current.basis !== null || current.validated || current.kind === 'real') setProjectError('real', details)
    if (current.kind === 'illegal') setProjectError('illegal', details)
  }, [setProjectError])
  const finishDiagnostic = useCallback((outcome, { httpStatus, requestId, receivedAt, errorCode, retryAfter, restartRequired, basisState } = {}) => {
    const current = operation.current
    const pending = current.pending
    if (!pending) return
    current.pending = null
    const record = createDiagnosticRecord({
      operationId: pending.operationId, kind: pending.kind,
      startedAt: pending.startedAt, finishedAt: clock().toISOString(),
      durationMs: performance.now() - pending.startedTick,
      outcome, httpStatus, requestId, receivedAt, errorCode, retryAfter, restartRequired,
      basisState: basisState ?? (pending.kind === 'real' ? 'stale' : 'not-applicable'),
    })
    if (outcome === 'failure') setProjectError(pending.kind, record)
    else if (outcome === 'cancelled' || outcome === 'invalidated') setProjectError(pending.kind)
    setDiagnostics(records => appendDiagnosticRecord(records, record))
  }, [clock, setProjectError])
  const staleDiagnostics = useCallback(() => setDiagnostics(invalidateDiagnosticRecords), [])
  const clearDiagnostics = () => setDiagnostics(Object.freeze([]))
  const freshContext = useCallback(() => contextFor(store, clock, books), [store, clock, books])
  const readBasis = useCallback(() => {
    const { snapshot, raw } = store.readAssistantSnapshot()
    const context = freshContext()
    const { evidence: _evidence, ...facts } = buildLearningFacts(snapshot, context)
    return canonicalStringify({ raw, snapshot, localDate: localDateKey(context.now), timeZone: context.timeZone, ...facts })
  }, [store, freshContext])
  const invalidate = useCallback(() => {
    const current = operation.current
    staleDiagnostics()
    if (current.basis === null && !current.validated) return
    finishDiagnostic('invalidated')
    setProjectError('real')
    current.generation++
    if (current.kind === 'illegal') setIllegalMessage('检查已取消，请重新检查非法示例。')
    current.kind = null
    current.controller?.abort()
    current.controller = null
    current.basis = null
    current.validated = false
    setBusy(false)
    setCheckedAt(null)
    setSummaryStatus('stale')
    setMessage(changedMessage)
  }, [finishDiagnostic, staleDiagnostics, setProjectError])
  useEffect(() => {
    const current = operation.current
    const unsubscribe = store.subscribe(invalidate)
    const onStorage = event => {
      if (event.key !== null && event.key !== LEARNING_STORAGE_KEY) return
      invalidate()
      // Keep the saved baseline so stale drafts/readers still fail the core guard.
      // Only an explicit user reload may adopt another tab's persisted state.
    }
    window.addEventListener('storage', onStorage)
    const timer = window.setInterval(() => {
      const state = client.getState()
      if (state.expiresAt && clock().getTime() >= new Date(state.expiresAt).getTime()) {
        const illegalWasChecking = operation.current.kind === 'illegal'
        expireProjectErrors()
        finishDiagnostic('failure', { errorCode: 'SESSION_EXPIRED', restartRequired: true })
        staleDiagnostics()
        operation.current.generation++
        operation.current.controller?.abort()
        operation.current.basis = null
        operation.current.validated = false
        client.disconnect()
        operation.current.kind = null
        setSummaryStatus('expired')
        setConnectionMessage('会话过期，请重新启动服务配对。')
        setBusy(false); setCheckedAt(null); setIllegalMessage(illegalWasChecking ? expiredIllegalMessage : null); setMessage('会话过期，请重新启动服务配对。')
        return
      }
      if (operation.current.basis !== null) {
        try { if (operation.current.basis !== readBasis()) invalidate() } catch { invalidate() }
      }
    }, 1000)
    return () => { unsubscribe(); window.removeEventListener('storage', onStorage); window.clearInterval(timer); current.generation++; current.controller?.abort(); client.disconnect() }
  }, [store, client, clock, readBasis, invalidate, finishDiagnostic, staleDiagnostics, expireProjectErrors])
  const begin = (kind = 'real') => {
    const current = operation.current
    finishDiagnostic('cancelled', { errorCode: 'CANCELLED' })
    current.generation++
    current.controller?.abort()
    current.controller = new AbortController()
    current.kind = kind
    current.pending = { operationId: ++current.nextOperationId, kind, startedAt: clock().toISOString(), startedTick: performance.now() }
    if (kind === 'connect') setProjectErrors(emptyProjectErrors())
    else setProjectError(kind)
    if (kind !== 'illegal') {
      staleDiagnostics()
      current.validated = false
      current.basis = null
      setCheckedAt(null)
      setSummaryStatus(kind === 'real' ? 'checking' : 'not-checked')
    }
    setBusy(true)
    return { id: current.generation, signal: current.controller.signal }
  }
  const active = id => operation.current.generation === id
  const preservedBasisIsCurrent = () => {
    if (operation.current.basis === null) return true
    try { return operation.current.basis === readBasis() } catch { return false }
  }
  const disconnect = () => {
    finishDiagnostic('cancelled', { errorCode: 'CANCELLED' })
    staleDiagnostics()
    operation.current.generation++
    operation.current.controller?.abort()
    operation.current.controller = null
    operation.current.basis = null
    operation.current.validated = false
    operation.current.kind = null
    client.disconnect()
    setSummaryStatus('not-checked')
    setConnectionMessage('未连接')
    setProjectErrors(emptyProjectErrors())
    setBusy(false); setCheckedAt(null); setIllegalMessage(null); setMessage('未连接')
  }
  const cancel = () => {
    const current = operation.current
    if (!current.pending) return
    if (current.kind === 'illegal' && !preservedBasisIsCurrent()) { invalidate(); return }
    const kind = current.kind
    finishDiagnostic('cancelled', { errorCode: 'CANCELLED' })
    current.generation++
    current.controller?.abort()
    current.controller = null
    current.kind = null
    setBusy(false)
    if (kind === 'illegal') setIllegalMessage('检查已取消，请重新检查非法示例。')
    else {
      current.basis = null; current.validated = false
      setCheckedAt(null)
      if (kind === 'connect') {
        client.disconnect(); setSummaryStatus('not-checked')
        setConnectionMessage('连接已取消，未连接。'); setMessage('连接已取消，未连接。')
      }
      else { setSummaryStatus('cancelled'); setMessage('检查已取消，请重新检查当前学习摘要。') }
    }
  }
  const connect = async code => {
    const { id, signal } = begin('connect')
    client.disconnect()
    setIllegalMessage(null)
    setMessage('等待权限；浏览器可能提示允许本地网络访问。')
    setConnectionMessage('等待权限；浏览器可能提示允许本地网络访问。')
    const timer = window.setTimeout(() => {
      if (!active(id)) return
      finishDiagnostic('failure', { errorCode: 'TIMEOUT' })
      operation.current.generation++
      operation.current.controller.abort()
      operation.current.controller = null
      operation.current.kind = null
      client.disconnect()
      setConnectionMessage(failureMessage)
      setBusy(false); setMessage(failureMessage)
    }, 60000)
    let onAbort
    try {
      let permission
      try {
        permission = await Promise.race([
          Promise.resolve().then(queryPermission),
          new Promise((_, reject) => { onAbort = () => reject(new Error(failureMessage)); signal.addEventListener('abort', onAbort, { once: true }) }),
        ])
      } catch { /* Unsupported queries do not mean denial. */ }
      if (!active(id)) return false
      if (permission?.state === 'denied') {
        finishDiagnostic('failure', { errorCode: 'PERMISSION_DENIED' })
        setMessage('本地网络访问已拒绝。请在此站点设置中恢复本地网络访问权限，再重新连接。')
        setConnectionMessage('本地网络访问已拒绝。请在此站点设置中恢复本地网络访问权限，再重新连接。')
        return false
      }
      setMessage('正在连接；浏览器可能提示允许本地网络访问。')
      setConnectionMessage('正在连接；浏览器可能提示允许本地网络访问。')
      await client.connect(code, { signal, onHealthChecked: () => {
        if (!active(id)) return
        window.clearTimeout(timer)
        setConnectionMessage('健康检查通过，正在配对。')
      } })
      if (!active(id)) return false
      finishDiagnostic('success')
      setMessage('已连接；尚未检查当前学习摘要。')
      setConnectionMessage('已连接本机后端。')
      return true
    } catch (error) {
      if (active(id)) {
        finishDiagnostic('failure', { errorCode: error?.code ?? 'UNKNOWN_ERROR', httpStatus: error?.httpStatus, retryAfter: error?.retryAfter, restartRequired: error?.restartRequired })
        setMessage(diagnosticErrorMessage(error?.code))
        setConnectionMessage(diagnosticErrorMessage(error?.code))
      }
      return false
    } finally { window.clearTimeout(timer); signal.removeEventListener('abort', onAbort); if (active(id)) { operation.current.kind = null; setBusy(false) } }
  }
  const check = async (illegal = false) => {
    if (illegal && !preservedBasisIsCurrent()) invalidate()
    const { id, signal } = begin(illegal ? 'illegal' : 'real')
    if (illegal) setIllegalMessage('正在检查固定非法测试数据…')
    else setMessage('检查中…')
    let requestBuilt = illegal
    try {
      let request
      if (illegal) request = { contractVersion: 1, invalidSyntheticExample: true }
      else {
        operation.current.basis = readBasis()
        request = await buildFactsRequest(store, freshContext())
        requestBuilt = true
        if (!active(id)) return
        const requestCurrent = await isFactsRequestCurrent(store, freshContext(), request)
        if (!active(id)) return
        if (!requestCurrent) { invalidate(); return }
      }
      const result = await client.check(request, { signal })
      if (!active(id)) return
      if (illegal && !preservedBasisIsCurrent()) { invalidate(); return }
      if (illegal) {
        finishDiagnostic('failure', { errorCode: 'RESPONSE_INVALID' })
        setIllegalMessage('未获得符合约定的拒绝结果，请重新检查。'); return
      }
      const requestCurrent = await isFactsRequestCurrent(store, freshContext(), request)
      if (!active(id)) return
      if (!requestCurrent) { invalidate(); return }
      operation.current.validated = true
      setSummaryStatus('passed')
      finishDiagnostic('success', { httpStatus: 200, requestId: result?.requestId, receivedAt: result?.receivedAt, basisState: 'current' })
      setCheckedAt(clock().toLocaleString('zh-CN'))
      setMessage('连接正常，摘要格式检查通过')
    } catch (error) {
      if (!active(id)) return
      const errorCode = error?.code ?? (requestBuilt ? 'UNKNOWN_ERROR' : 'FACTS_UNAVAILABLE')
      if (client.getState().status === 'expired') {
        expireProjectErrors({ errorCode: 'SESSION_EXPIRED', httpStatus: error?.httpStatus, restartRequired: true })
        staleDiagnostics()
        finishDiagnostic('failure', { errorCode, httpStatus: error?.httpStatus, retryAfter: error?.retryAfter, restartRequired: error?.restartRequired })
        operation.current.basis = null
        operation.current.validated = false
        setSummaryStatus('expired')
        setConnectionMessage('会话过期，请重新启动服务配对。')
        setCheckedAt(null); setIllegalMessage(operation.current.kind === 'illegal' ? expiredIllegalMessage : null); setMessage(diagnosticErrorMessage(errorCode))
      }
      else if (illegal) {
        if (!preservedBasisIsCurrent()) { invalidate(); return }
        const rejected = error?.code === 'FACTS_INVALID' && error?.httpStatus === 422
        finishDiagnostic(rejected ? 'expected-rejection' : 'failure', { errorCode, httpStatus: error?.httpStatus, retryAfter: error?.retryAfter, restartRequired: error?.restartRequired })
        setIllegalMessage(rejected ? '错误输入已被拒绝' : errorCode === 'RESPONSE_INVALID' ? '未获得符合约定的拒绝结果，请重新检查。' : diagnosticErrorMessage(errorCode))
      }
      else {
        let changed = false
        try { changed = operation.current.basis !== null && operation.current.basis !== readBasis() } catch { changed = true }
        if (changed) { invalidate(); return }
        finishDiagnostic('failure', { errorCode, httpStatus: error?.httpStatus, retryAfter: error?.retryAfter, restartRequired: error?.restartRequired })
        setSummaryStatus('failed')
        setMessage(diagnosticErrorMessage(errorCode))
        operation.current.basis = null
      }
    } finally { if (active(id)) { operation.current.kind = null; setBusy(false) } }
  }
  const connected = ['connected', 'checking'].includes(clientState.status)
  const activeOperationKind = operation.current.pending?.kind ?? null
  return <AssistantContext.Provider value={{ connect, check, cancel, disconnect, clearDiagnostics, diagnostics, connected, busy, message, connectionMessage, summaryStatus, activeOperationKind, projectErrors, illegalMessage, checkedAt, clientState }}>{children}</AssistantContext.Provider>
}
