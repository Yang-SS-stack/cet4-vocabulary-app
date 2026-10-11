import { useRef, useState } from 'react'
import { ASSISTANT_CAPABILITIES } from './assistantMockConversation'

export default function AssistantComposer({ onRequest, busy }) {
  const [input, setInput] = useState('')
  const inputElement = useRef(null)
  const send = (fallback, intent, shortcut) => {
    if (busy) return
    const text = input.trim(), rect = (text ? inputElement.current : shortcut)?.getBoundingClientRect()
    const originRect = rect ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height } : undefined
    if (onRequest(text || fallback, { intent, inputRect: text ? originRect : undefined, shortcutRect: text ? undefined : originRect }) !== false) setInput('')
  }
  return <div className="assistant-conversation__composer">
    <div className="assistant-conversation__suggestions" aria-label="学习助手能力">{ASSISTANT_CAPABILITIES.map(({ id, request, icon }) => <button type="button" key={id} disabled={busy} onClick={event => send(request, id, event.currentTarget)}><CapabilityIcon kind={icon} />{request}</button>)}</div>
    <form onSubmit={event => { event.preventDefault(); if (input.trim()) send() }}>
      <label className="data-sr-only" htmlFor="assistant-learning-request">学习要求</label>
      <input ref={inputElement} id="assistant-learning-request" data-assistant-focus-target value={input} onChange={event => setInput(event.target.value)} placeholder={busy ? '助手正在准备回复…' : '输入你的学习要求…'} maxLength={1000} />
      <button type="submit" disabled={busy || !input.trim()} aria-label="发送学习要求"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5m-6 6 6-6 6 6" /></svg></button>
    </form>
  </div>
}

function CapabilityIcon({ kind }) {
  const paths = { plan: 'M5 5h14v15H5ZM9 3v4m6-4v4M9 11h6m-6 4h4', memory: 'M9 4a4 4 0 0 0-4 4v1a4 4 0 0 0 0 7 4 4 0 0 0 7 3V5a3 3 0 0 0-3-1Zm6 0a4 4 0 0 1 4 4v1a4 4 0 0 1 0 7 4 4 0 0 1-7 3M5 10h3m8 0h3M8 15h4m0-8h3', exercise: 'M5 4h10v4H5Zm-1 3v13h15V7M7 12h6m-6 4h4m4-1 5-5 2 2-5 5-3 1Z', question: 'M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-8l-5 3v-3H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Zm5 5a2 2 0 1 1 3 2c-1 0-1 1-1 2m0 2h.1' }
  return <svg className="assistant-capability-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[kind]} /></svg>
}
