/* oxlint-disable react/only-export-components -- Provider and context hooks share this task-owned module. */
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useLearningStore } from '../learning'
import { LEARNING_STORAGE_KEY, localDateKey } from '../learning/model'
import { wordBooks } from '../wordBooks'
import { buildLearningFacts } from './facts'
import { createLocalClient } from './localClient'
import { buildFactsRequest, canonicalStringify, isFactsRequestCurrent } from './snapshotToken'

const AssistantContext = createContext(null)
const actualClock = () => new Date()
const changedMessage = '记录或日期已变化，请重新检查'
const failureMessage = '连接失败，检查服务和站点权限。'
const permissionQuery = () => navigator.permissions?.query({ name: 'local-network-access' })

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
  const [illegalMessage, setIllegalMessage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [checkedAt, setCheckedAt] = useState(null)
  const operation = useRef({ generation: 0, controller: null, basis: null, validated: false, kind: null })
  const freshContext = useCallback(() => contextFor(store, clock, books), [store, clock, books])
  const readBasis = useCallback(() => {
    const { snapshot, raw } = store.readAssistantSnapshot()
    const context = freshContext()
    const { evidence: _evidence, ...facts } = buildLearningFacts(snapshot, context)
    return canonicalStringify({ raw, snapshot, localDate: localDateKey(context.now), timeZone: context.timeZone, ...facts })
  }, [store, freshContext])
  const invalidate = useCallback(() => {
    const current = operation.current
    if (current.basis === null && !current.validated) return
    current.generation++
    if (current.kind === 'illegal') setIllegalMessage('检查已取消，请重新检查非法示例。')
    current.kind = null
    current.controller?.abort()
    current.controller = null
    current.basis = null
    current.validated = false
    setBusy(false)
    setCheckedAt(null)
    setMessage(changedMessage)
  }, [])
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
        operation.current.generation++
        operation.current.controller?.abort()
        operation.current.basis = null
        operation.current.validated = false
        client.disconnect()
        operation.current.kind = null
        setBusy(false); setCheckedAt(null); setIllegalMessage(null); setMessage('会话过期，请重新启动服务配对。')
        return
      }
      if (operation.current.basis !== null) {
        try { if (operation.current.basis !== readBasis()) invalidate() } catch { invalidate() }
      }
    }, 1000)
    return () => { unsubscribe(); window.removeEventListener('storage', onStorage); window.clearInterval(timer); current.generation++; current.controller?.abort(); client.disconnect() }
  }, [store, client, clock, readBasis, invalidate])
  const begin = (kind = 'real') => {
    const current = operation.current
    current.generation++
    current.controller?.abort()
    current.controller = new AbortController()
    current.kind = kind
    if (kind !== 'illegal') {
      current.validated = false
      current.basis = null
      setCheckedAt(null)
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
    operation.current.generation++
    operation.current.controller?.abort()
    operation.current.controller = null
    operation.current.basis = null
    operation.current.validated = false
    operation.current.kind = null
    client.disconnect()
    setBusy(false); setCheckedAt(null); setIllegalMessage(null); setMessage('未连接')
  }
  const connect = async code => {
    const { id, signal } = begin('connect')
    client.disconnect()
    setIllegalMessage(null)
    setMessage('等待权限；浏览器可能提示允许本地网络访问。')
    const timer = window.setTimeout(() => {
      if (!active(id)) return
      operation.current.generation++
      operation.current.controller.abort()
      client.disconnect()
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
        setMessage('本地网络访问已拒绝。请在此站点设置中恢复本地网络访问权限，再重新连接。')
        return false
      }
      setMessage('正在连接；浏览器可能提示允许本地网络访问。')
      await client.connect(code, { signal, onHealthChecked: () => { if (active(id)) window.clearTimeout(timer) } })
      if (!active(id)) return false
      setMessage('已连接；尚未检查当前学习摘要。')
      return true
    } catch (error) {
      if (active(id)) setMessage(error.message || failureMessage)
      return false
    } finally { window.clearTimeout(timer); signal.removeEventListener('abort', onAbort); if (active(id)) { operation.current.kind = null; setBusy(false) } }
  }
  const check = async (illegal = false) => {
    if (illegal && !preservedBasisIsCurrent()) invalidate()
    const { id, signal } = begin(illegal ? 'illegal' : 'real')
    if (illegal) setIllegalMessage('正在检查固定非法测试数据…')
    else setMessage('检查中…')
    try {
      let request
      if (illegal) request = { contractVersion: 1, invalidSyntheticExample: true }
      else {
        operation.current.basis = readBasis()
        request = await buildFactsRequest(store, freshContext())
        if (!active(id)) return
        if (!await isFactsRequestCurrent(store, freshContext(), request)) { invalidate(); return }
        if (!active(id)) return
      }
      await client.check(request, { signal })
      if (!active(id)) return
      if (illegal && !preservedBasisIsCurrent()) { invalidate(); return }
      if (illegal) { setIllegalMessage('非法示例未按预期被拒绝，请核查服务。'); return }
      if (!await isFactsRequestCurrent(store, freshContext(), request)) { invalidate(); return }
      if (!active(id)) return
      operation.current.validated = true
      setCheckedAt(clock().toLocaleString('zh-CN'))
      setMessage('连接正常，摘要格式检查通过')
    } catch (error) {
      if (!active(id)) return
      if (client.getState().status === 'expired') {
        operation.current.basis = null
        operation.current.validated = false
        setCheckedAt(null); setIllegalMessage(null); setMessage(error.message)
      }
      else if (illegal) {
        if (!preservedBasisIsCurrent()) { invalidate(); return }
        setIllegalMessage(error.code === 'FACTS_INVALID' && error.httpStatus === 422 ? '错误输入已被拒绝' : error.message)
      }
      else {
        let changed = false
        try { changed = operation.current.basis !== null && operation.current.basis !== readBasis() } catch { changed = true }
        setMessage(changed ? changedMessage : error.code ? error.message : '摘要无法生成，请重新载入记录后再检查。')
        operation.current.basis = null
      }
    } finally { if (active(id)) { operation.current.kind = null; setBusy(false) } }
  }
  const connected = ['connected', 'checking'].includes(clientState.status)
  return <AssistantContext.Provider value={{ connect, check, disconnect, connected, busy, message, illegalMessage, checkedAt, clientState }}>{children}</AssistantContext.Provider>
}
