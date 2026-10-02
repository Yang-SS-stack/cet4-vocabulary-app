import { useState } from 'react'
import { wordBooks } from '../data/wordBooks'
import './LearningFactsPanel.css'

const bookLabel = id => wordBooks.find(book => book.id === id)?.label ?? id ?? '尚未选择'
const count = value => value === null ? '无法计算' : value
const distribution = (value, labels) => value === null ? '记录存在冲突，无法计算' : labels.map(([key, label]) => `${label} ${value[key]}`).join(' · ')
export default function LearningFactsPanel({ facts, error }) {
  const [period, setPeriod] = useState('today')
  if (!facts) return <section className="learning-facts" aria-label="计划依据与已记录反馈"><p>{error}</p></section>
  const history = facts.history[period]
  const evidence = facts.evidence[period]
  return <section className="learning-facts" aria-label="计划依据与已记录反馈">
    <h2>计划依据</h2>
    <p>当前词书：{facts.book.label ?? facts.book.id ?? '尚未选择'}</p>
    <p>累计完成 {facts.book.completedWords} 词；词书总量 {count(facts.book.totalWords)}。</p>
    <TaskProgress label="今日固定学习" task={facts.today.learning} />
    <TaskProgress label="今日额外学习" task={facts.today.extraLearning} />
    <TaskProgress label="今日固定复习" task={facts.today.review} />
    <p>当前词书到期：{count(facts.reviewLoad.dueCount)} 词；任务外积压：{count(facts.reviewLoad.outsideTodayTaskCount)} 词。任务剩余独立计算。</p>
    {facts.reviewLoad.needsReconciliation && <p>包含历史补齐估算；开始复习时核对历史记录。</p>}
    <h3>已记录反馈</h3>
    <div className="learning-facts__tabs" aria-label="反馈日期范围">
      <button type="button" aria-pressed={period === 'today'} onClick={() => setPeriod('today')}>今日</button>
      <button type="button" aria-pressed={period === 'last7Days'} onClick={() => setPeriod('last7Days')}>近 7 天</button>
    </div>
    <p>{history.fromDate} 至 {history.toDate} · 当前词书；按任务日期归属。</p>
    <p>已完成：固定学习 {count(history.completions.learningWords)} · 额外学习 {count(history.completions.extraLearningWords)} · 复习 {count(history.completions.reviewWords)} 词次</p>
    <p>自评：{distribution(history.selfAssessments, [['known', '认识'], ['fuzzy', '模糊'], ['unknown', '不认识']])}</p>
    <p>选择作答：{distribution(history.choices, [['correct', '正确'], ['incorrect', '错误'], ['showAnswer', '看答案']])}</p>
    <p>更正：{distribution(history.corrections, [['fromSelfAssessment', '自评更正'], ['fromChoice', '选择更正']])}</p>
    <p>有效自评：{distribution(history.effectiveSelfAssessments, [['known', '认识'], ['fuzzy', '模糊'], ['unknown', '不认识']])}</p>
    <p>历史反馈完整性无法证明；旧记录可能没有逐次反馈。任务 {history.coverage.taskCount} 个，无事件任务 {history.coverage.tasksWithoutEvents} 个，旧方法任务 {history.coverage.legacyTaskCount} 个。</p>
    {history.issues.length > 0 && <p>记录异常：{history.issues.join('、')}；受影响指标无法计算。</p>}
    <details>
      <summary>查看记录依据</summary>
      <p>仅在浏览器查看，不发送明细。完成包括已移出任务的词；选择后的更正不计入自评。</p>
      <EvidencePages key={`${period}-tasks`} label="任务" rows={evidence.tasks} />
      <EvidencePages key={`${period}-events`} label="事件" rows={evidence.events} />
      <EvidencePages key={`${period}-anomalies`} label="异常" rows={evidence.anomalies} />
    </details>
  </section>
}
function TaskProgress({ label, task }) {
  return <p>{label}：{task === null ? '尚未创建' : `${bookLabel(task.wordBookId)} · 分配 ${task.assignedWords} · 完成 ${task.completedWords} · 剩余 ${task.remainingWords} 词${task.batchCount !== undefined ? ` · ${task.batchCount} 批` : ''}`}</p>
}
function EvidencePages({ label, rows }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(rows.length / 50))
  const current = Math.min(page, pages - 1)
  return <div className="learning-facts__evidence" aria-label={`${label}依据`}>
    <h4>{label}依据 · 共 {rows.length} 条</h4>
    {rows.length === 0 ? <p>已记录 0 条；旧记录可能没有逐次反馈。</p> : <ol start={current * 50 + 1}>{rows.slice(current * 50, current * 50 + 50).map((row, index) => <li key={index}>
      <p>{row.date ?? '异常记录'} · {bookLabel(row.wordBookId)} · {row.kind ?? row.code}</p>
      {label === '任务' ? <p>分配 {row.assignedWords} · 完成 {row.completedWords} · 剩余 {row.remainingWords}；完成词：{row.completedItems.map(item => item.wordId).join('、') || '无'}</p> : <p>来源 {row.source ?? row.code} · 原反馈 {row.feedback ?? row.outcome ?? '无'} · 更正引用 {row.correctedRevision ?? '无'}</p>}
      <details><summary>原始对账字段</summary><pre>{JSON.stringify(row, null, 2)}</pre></details>
    </li>)}</ol>}
    {pages > 1 && <div className="learning-facts__tabs"><button type="button" disabled={current === 0} onClick={() => setPage(current - 1)}>{label}上一页</button><span>第 {current + 1} / {pages} 页，每页 50 条</span><button type="button" disabled={current + 1 === pages} onClick={() => setPage(current + 1)}>{label}下一页</button></div>}
  </div>
}
