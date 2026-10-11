import { useEffect, useEffectEvent, useRef, useState } from 'react'
import AssistantConversation from './AssistantConversation'
import AssistantComposer from './AssistantComposer'
import AssistantPlan from './AssistantPlan'
import AssistantHint from './AssistantHint'
import FloatingAssistantWindow from './FloatingAssistantWindow'
import { assistantViewport, clampLauncher } from './floatingAssistantGeometry'
import { mockAssistantReply, resolveAssistantRequest } from './assistantMockConversation'
import { useAssistantMotion } from './assistantMotion'
import './FloatingLearningAssistant.css'

const replyCharacters = text => typeof Intl.Segmenter === 'function' ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text), value => value.segment) : Array.from(text)

export default function FloatingLearningAssistant({ enabled, hintReady = true, selectedPage, onStartLearning, now, learningContext = null, selection = null }) {
  const [open, setOpen] = useState(false), [stage, setStage] = useState('conversation')
  const [messages, setMessages] = useState([]), [busy, setBusy] = useState(false), [waiting, setWaiting] = useState(false)
  const [completedReply, setCompletedReply] = useState(''), [requestActive, setRequestActive] = useState(false)
  const [launcherRect, setLauncherRect] = useState(null)
  const [timeChoice, setTimeChoice] = useState(30)
  const session = useRef({ minutes: null, pending: null })
  const [hint, setHint] = useState(false), [position, setPosition] = useState(null)
  const seenHint = useRef(false), launcher = useRef(null), gesture = useRef(null), suppressClick = useRef(false)
  const wasOpen = useRef(false)
  const plan = useRef(null), conversationView = useRef(null), planView = useRef(null), windowControls = useRef(null), afterClose = useRef(null)
  const lifecycle = useRef({ version: 0, busy: false, timer: null, greeted: false, accepting: false, request: null, nextId: 0 })
  useAssistantMotion(conversationView, stage, enabled && open && stage !== 'plan')
  useAssistantMotion(planView, stage, enabled && open && stage === 'plan')
  const cancelRequest = () => {
    const current = lifecycle.current
    if (current.timer !== null && current.request) current.request.remaining = Math.max(0, current.deadline - Date.now())
    current.version++; window.clearTimeout(current.timer); current.timer = null; current.busy = false; current.accepting = false
    setBusy(false); setWaiting(false); setRequestActive(false)
  }
  const resumeRequest = useEffectEvent(() => {
    const current = lifecycle.current
    current.accepting = true; setRequestActive(true)
    if (current.request) {
      current.busy = current.request.phase !== 'read'
      setBusy(current.busy); setWaiting(current.busy)
      schedule(current.request.remaining)
    } else if (!current.greeted) request('greeting')
  })
  useEffect(() => {
    if (!enabled || !open) {
      cancelRequest()
      if (!enabled) {
        const current = lifecycle.current
        if (current.request?.greeting && !current.request.cursor) current.greeted = false
        current.request = null; afterClose.current = null; setOpen(false)
      }
      return undefined
    }
    resumeRequest()
    const current = lifecycle.current
    const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    const reduce = () => {
      if (motion?.matches && current.accepting && current.request?.phase === 'typing') {
        window.clearTimeout(current.timer); current.timer = null; advance(current.version)
      }
    }
    motion?.addEventListener?.('change', reduce)
    return () => {
      if (current.timer !== null && current.request) current.request.remaining = Math.max(0, current.deadline - Date.now())
      current.version++; window.clearTimeout(current.timer); current.timer = null; current.busy = false; current.accepting = false
      motion?.removeEventListener?.('change', reduce)
    }
  }, [enabled, open])
  useEffect(() => {
    if (wasOpen.current && !open) launcher.current?.focus({ preventScroll: true })
    wasOpen.current = open
  }, [open])
  useEffect(() => {
    if (open) { seenHint.current = true; setHint(false); return undefined }
    if (!enabled || !hintReady || selectedPage !== '今日学习') { setHint(false); return undefined }
    if (seenHint.current) return undefined
    const timer = window.setTimeout(() => { seenHint.current = true; setHint(true) }, 250)
    return () => window.clearTimeout(timer)
  }, [enabled, hintReady, selectedPage, open])
  useEffect(() => {
    const resize = () => {
      const measured = launcher.current?.getBoundingClientRect()
      const size = { width: measured?.width || 150, height: measured?.height || 48 }
      setPosition(point => point ? clampLauncher(point, assistantViewport(), size) : point)
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  const schedule = delay => {
    const current = lifecycle.current, version = current.version
    current.request.remaining = delay; current.deadline = Date.now() + delay
    current.timer = window.setTimeout(() => advance(version), delay)
  }
  const advance = version => {
    const current = lifecycle.current, response = current.request
    if (current.version !== version || !current.accepting || !response) return
    current.timer = null
    if (response.phase === 'read') {
      // Completion is the only path to entry, and the current store is re-read here.
      plan.current?.prepare(response.reply.goal, response.reply.availableMinutes)
      setStage(response.reply.stage); current.request = null
      return
    }
    if (response.phase === 'waiting' && response.reply.stage === 'plan' && plan.current?.prepare(response.reply.goal, response.reply.availableMinutes) !== 'ready') {
      response.reply.text = '当前资料不足以安排可采用的计划。接下来查看原因，你仍可按原设置学习。'
      response.units = replyCharacters(response.reply.text)
    }
    response.phase = 'typing'
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    response.cursor = reduced ? response.units.length : Math.min(response.units.length, response.cursor + 1)
    const text = response.units.slice(0, response.cursor).join(''), complete = response.cursor === response.units.length
    setMessages(messages => {
      const existing = messages.some(message => message.id === response.id)
      const message = { id: response.id, role: 'assistant', text, complete, target: response.reply.target }
      return existing ? messages.map(value => value.id === response.id ? message : value) : [...messages, message]
    })
    if (!complete) { schedule(25); return }
    setCompletedReply(text); setWaiting(false); setBusy(false); current.busy = false
    if (response.reply.stage === 'plan') { response.phase = 'read'; schedule(900) }
    else { setStage(response.reply.stage); current.request = null }
  }
  const request = (text, metadata) => {
    const current = lifecycle.current
    if (!enabled || !open || !current.accepting || current.busy) return false
    window.clearTimeout(current.timer); current.timer = null; current.version++
    current.busy = true
    setBusy(true); setWaiting(true); setCompletedReply('')
    const reply = text === 'greeting' ? { ...mockAssistantReply(), session: session.current } : resolveAssistantRequest(text, { ...metadata, currentLesson: selectedPage === '今日学习' ? learningContext : null, selection }, session.current)
    session.current = reply.session
    if (Number.isInteger(session.current.minutes)) setTimeChoice(session.current.minutes)
    if (stage === 'plan' && text !== 'greeting') setStage('conversation')
    if (text !== 'greeting') setMessages(messages => [...messages, { id: ++current.nextId, role: 'user', text: reply.userText, target: reply.target, inputRect: metadata?.inputRect, shortcutRect: metadata?.shortcutRect }])
    else current.greeted = true
    const units = replyCharacters(reply.text)
    current.request = { id: ++current.nextId, reply, units, cursor: 0, phase: 'waiting', remaining: 450, greeting: text === 'greeting' }
    schedule(450)
    return true
  }
  const close = () => {
    cancelRequest(); setOpen(false); setHint(false)
    const action = afterClose.current; afterClose.current = null; action?.()
  }
  const startOriginal = () => {
    if (!lifecycle.current.accepting) return
    afterClose.current = onStartLearning
    windowControls.current?.close()
  }
  if (!enabled) return null
  return <>
    <div className="floating-launcher-zone" style={position ? { left: position.x, top: position.y, right: 'auto', bottom: 'auto' } : undefined}>
      {hint && <AssistantHint launcher={launcher} onDismiss={() => setHint(false)} />}
      <button ref={launcher} type="button" className="floating-assistant-launcher" aria-label="学习助手" aria-haspopup="dialog" aria-expanded={open} hidden={open} onClick={() => {
        if (suppressClick.current) { suppressClick.current = false; return }
        const measured = launcher.current.getBoundingClientRect()
        setLauncherRect({ x: position?.x ?? measured.left, y: position?.y ?? measured.top, width: measured.width || 150, height: measured.height || 48, moved: Boolean(position), viewport: assistantViewport() })
        setHint(false); setOpen(true)
      }} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') suppressClick.current = false }} onPointerDown={event => {
        if (event.button !== 0) return
        const rect = event.currentTarget.getBoundingClientRect()
        gesture.current = { x: event.clientX, y: event.clientY, point: position ?? { x: rect.left, y: rect.top }, size: { width: rect.width || 150, height: rect.height || 48 }, pointerId: event.pointerId }
        suppressClick.current = false
        event.currentTarget.setPointerCapture?.(event.pointerId)
      }} onPointerMove={event => {
        const active = gesture.current
        if (!active || active.pointerId !== event.pointerId) return
        const dx = event.clientX - active.x, dy = event.clientY - active.y
        if (Math.hypot(dx, dy) < 5) return
        suppressClick.current = true; setHint(false)
        setPosition(clampLauncher({ x: active.point.x + dx, y: active.point.y + dy }, assistantViewport(), active.size))
      }} onPointerUp={() => { gesture.current = null }} onPointerCancel={() => { gesture.current = null }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12a3 3 0 0 1 3 3v9a3 3 0 0 1-3 3h-6l-5 3v-3H6a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z" /><path d="M8 10h.1m3.9 0h.1m3.9 0h.1" /></svg><span>学习助手</span></button>
    </div>
    <FloatingAssistantWindow ref={windowControls} open={open} onClose={close} onClosing={cancelRequest} launcherRect={launcherRect}>
      <div className="assistant-layout">
        <div className="assistant-stage">
          <div ref={conversationView} hidden={stage === 'plan'}><AssistantConversation messages={messages} completedReply={completedReply} now={now} showTasks={stage === 'tasks'} waiting={waiting} active={open && requestActive && stage !== 'plan'} />
            {stage === 'time' && <section className="assistant-time-choice" aria-label="确认本次学习时间"><label htmlFor="assistant-time">本次可用时间</label><output htmlFor="assistant-time">{timeChoice} 分钟</output><input id="assistant-time" type="range" min="5" max="60" step="1" value={timeChoice} disabled={busy} onChange={event => setTimeChoice(Number(event.target.value))} /><button type="button" className="assistant-primary" disabled={busy} onClick={() => request(`${timeChoice}分钟`)}>确认本次时间</button></section>}
          </div>
          <div ref={planView} hidden={stage !== 'plan'}><AssistantPlan ref={plan} now={now} onBack={() => setStage('conversation')} onStart={startOriginal} onMinutesChange={minutes => { session.current.minutes = minutes; setTimeChoice(minutes) }} active={open && stage === 'plan'} /></div>
        </div>
        <AssistantComposer onRequest={request} busy={busy} />
        <div className="assistant-send-layer" aria-hidden="true" inert />
      </div>
    </FloatingAssistantWindow>
  </>
}
