import { useLayoutEffect, useRef } from 'react'
import { useLearningFacts } from '../data/assistant/react'
import { followAssistant, useAssistantSendMotion } from './assistantMotion'

export default function AssistantConversation({ messages, completedReply = '', now, showTasks, waiting = false, active = true }) {
  const end = useRef(null)
  useLayoutEffect(() => { if (active) followAssistant(end.current) }, [messages, waiting, showTasks, active])
  const { facts, error } = useLearningFacts({ now })
  return <div className="assistant-conversation">
    <div className="assistant-conversation__messages" role="log" aria-label="模拟学习对话" aria-live="off">
      {messages.map((message, index) => <Message key={message.id ?? index} message={message} active={active} />)}
      {waiting && <p className="assistant-pending" role="status" aria-label="助手正在回复"><span aria-hidden="true"><i /><i /><i /></span>正在准备模拟回复…</p>}
      {showTasks && <section className="assistant-task-summary" aria-label="助手今日任务摘要"><h3>今日任务</h3>{error ? <p>{error}</p> : <><p>{taskSummary('新词', facts?.today.learning)}</p><p>{taskSummary('复习', facts?.today.review)}</p><p>查看摘要不会创建或更改冻结任务。</p></>}</section>}
      <span ref={end} className="assistant-conversation__end" aria-hidden="true" />
    </div>
    <p className="data-sr-only" role="status" aria-label="助手完整回复" aria-live="polite" aria-atomic="true">{completedReply}</p>
  </div>
}
function Message({ message, active }) {
  const bubble = useRef(null)
  useAssistantSendMotion(bubble, message.inputRect ?? message.shortcutRect, active, message.inputRect ? 'input' : 'shortcut')
  return <p ref={bubble} className={`assistant-message assistant-message--${message.role}`}><span className="assistant-message__label">{message.role === 'user' ? '你' : '助手 · 模拟'}</span><span className="assistant-message__text">{message.text}</span></p>
}
function taskSummary(label, task) {
  return task ? `${label}冻结任务：已完成 ${task.completedWords} / ${task.assignedWords} 词，剩余 ${task.remainingWords} 词` : `${label}任务尚未创建`
}
