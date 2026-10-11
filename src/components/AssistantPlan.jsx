import { useEffect, useImperativeHandle, useRef, useState } from 'react'
import { localDateKey, useLearningStore } from '../data/learning'
import { useLearningFacts } from '../data/assistant/react'
import { buildLearningFacts } from '../data/assistant/facts'
import { adviceAvailability, adjustSessionAdvice, buildSessionAdvice } from '../data/assistant/sessionAdvice'
import { wordBooks } from '../data/wordBooks'
import SessionIntentControls from './SessionIntentControls'
import { revealAssistant, useAssistantMotion } from './assistantMotion'

const orders = { 'review-first': '先复习，再学新词', 'new-first': '先学新词', balanced: '新词与复习交替', none: '本次无需安排' }
const demonstrations = { success: '演示：规则草稿可用。未调用模型，未应用计划。', timeout: '演示：等待超时。可重新生成本地规则草稿，或按原设置学习。', quota: '演示：额度耗尽。可按原设置学习。' }

export default function AssistantPlan({ ref, now, onBack, onStart, onMinutesChange, active = true }) {
  const { store, snapshot } = useLearningStore()
  const { facts, error } = useLearningFacts({ now })
  const [intent, setIntent] = useState({ availableMinutes: 30, goal: 'progress' })
  const basisFor = (data, reviewLoad, failure = null) => JSON.stringify([data, localDateKey(now ?? new Date()), failure, reviewLoad])
  const basis = basisFor(snapshot, facts?.reviewLoad, error)
  const inputKey = JSON.stringify(intent)
  const limits = adviceAvailability(facts, snapshot.settings)
  const [result, setResult] = useState(null), [showBasis, setShowBasis] = useState(false), [adjustment, setAdjustment] = useState(null), [adjustError, setAdjustError] = useState('')
  const [confirm, setConfirm] = useState(false), [demo, setDemo] = useState(''), [demoMessage, setDemoMessage] = useState('')
  const [fallbackError, setFallbackError] = useState('')
  const failure = demoMessage && ['timeout', 'quota'].includes(demo) ? demo : null
  const resultElement = useRef(null)
  useAssistantMotion(resultElement, JSON.stringify([result, showBasis, adjustment !== null, confirm, demoMessage]), active)
  useEffect(() => { if (active) revealAssistant(resultElement.current) }, [active])
  useImperativeHandle(ref, () => ({ prepare(goal, availableMinutes) {
    if (!Number.isInteger(availableMinutes) || availableMinutes < 5 || availableMinutes > 60) return 'unavailable'
    setFallbackError('')
    const nextIntent = { availableMinutes, goal }
    try {
      const read = store.readAssistantSnapshot()
      const fresh = buildLearningFacts(read.snapshot, { now: now ?? new Date(), wordBooks, selectedWordBookId: read.snapshot.settings.todayWordBookId })
      const draft = buildSessionAdvice({ facts: fresh, settings: read.snapshot.settings, intent: nextIntent })
      setResult({ draft, basis: basisFor(read.snapshot, fresh.reviewLoad), inputKey: JSON.stringify(nextIntent) })
      setIntent(nextIntent); setConfirm(false); setAdjustment(null); setAdjustError(''); setDemoMessage('')
      return draft.status
    } catch { setResult(null) }
    setIntent(nextIntent); setConfirm(false); setAdjustment(null); setAdjustError(''); setDemoMessage('')
    return 'unavailable'
  } }))
  const stale = Boolean(result && (result.basis !== basis || result.inputKey !== inputKey))
  const draft = result?.draft
  const ready = Boolean(draft?.status === 'ready' && !stale && !error)
  const checkCurrent = () => {
    try {
      const read = store.readAssistantSnapshot()
      const fresh = buildLearningFacts(read.snapshot, { now: now ?? new Date(), wordBooks, selectedWordBookId: read.snapshot.settings.todayWordBookId })
      if (basisFor(read.snapshot, fresh.reviewLoad) === basis) return true
    } catch { /* The existing read guard owns storage validation. */ }
    setResult(current => current ? { ...current, basis: null } : null)
    return false
  }
  const generate = () => {
    if (!checkCurrent()) return
    setFallbackError('')
    setResult({ draft: buildSessionAdvice({ facts, settings: snapshot.settings, intent }), basis, inputKey })
    setConfirm(false); setAdjustment(null); setAdjustError(''); setDemoMessage('')
  }
  const retry = () => {
    try {
      const read = store.readAssistantSnapshot()
      const fresh = buildLearningFacts(read.snapshot, { now: now ?? new Date(), wordBooks, selectedWordBookId: read.snapshot.settings.todayWordBookId })
      const draft = buildSessionAdvice({ facts: fresh, settings: read.snapshot.settings, intent })
      if (draft.status !== 'ready') { setFallbackError(draft.message); return }
      setResult({ draft, basis: basisFor(read.snapshot, fresh.reviewLoad), inputKey })
      setDemoMessage(''); setFallbackError(''); setConfirm(false); setAdjustment(null); setAdjustError('')
    } catch { setFallbackError('学习记录已变化或无法读取，暂时不能生成规则建议。请检查学习资料，仍可按原设置学习。') }
  }
  const saveAdjustment = () => {
    if (!ready || !checkCurrent()) return
    const checked = adjustSessionAdvice(draft, { newWords: Number(adjustment.newWords), reviewWords: Number(adjustment.reviewWords) })
    if (checked.error) { setAdjustError(checked.error); return }
    setResult({ ...result, draft: checked.draft }); setAdjustment(null); setAdjustError('')
  }
  return <div className="assistant-plan">
    <div className="assistant-plan__heading"><h3>{confirm && !stale && !failure ? '确认学习草稿' : '特殊学习计划'}</h3><button type="button" data-assistant-focus-target onClick={onBack}>返回对话</button></div>
    <dl className="assistant-plan__facts"><div><dt>今日剩余新词</dt><dd>{limits.newWords ?? '未知'}</dd></div><div><dt>今日待复习</dt><dd>{limits.reviewWords ?? '未知'}</dd></div></dl>
    <p className="assistant-note">{facts?.today.learning ? '新词：今日冻结任务剩余' : '新词任务尚未创建 · 按每日设置与词书剩余估算'}；{facts?.today.review ? '复习：今日冻结任务剩余' : '复习任务尚未创建 · 按每日设置与当前到期量估算'}{facts?.reviewLoad.needsReconciliation ? '；历史复习记录待核对' : ''}</p>
    {failure && <section className="assistant-plan__failure" aria-label="建议异常提示">
      <svg viewBox="0 0 48 48" aria-hidden="true">{failure === 'timeout' ? <><circle cx="24" cy="24" r="17" /><path d="M24 13v12l8 5" /></> : <><rect x="8" y="13" width="29" height="22" rx="4" /><path d="M40 20v8M14 19v10" /></>}</svg>
      <h4>{failure === 'timeout' ? '生成建议超时' : '免费额度耗尽'}</h4>
      <p>{failure === 'timeout' ? '本次模拟建议未能及时生成。' : '本次演示模拟免费额度耗尽。'}</p>
      <p>{failure === 'timeout' ? '你的时间、目标设置和草稿已保留。重试会读取最新学习资料，重新生成本地规则草稿。' : '你的时间、目标设置和草稿已保留，可以按原设置继续学习。'}</p>
      <p className="assistant-note">模拟状态 · 未接入模型</p>
      {fallbackError && <p role="alert">{fallbackError}</p>}
      <div className="assistant-plan__actions"><button type="button" className="assistant-primary" onClick={onStart}>按原设置开始学习</button>{failure === 'timeout' && <button type="button" onClick={retry}>重试</button>}</div>
    </section>}
    {!failure && <SessionIntentControls intent={intent} onChange={next => { setIntent(next); onMinutesChange?.(next.availableMinutes) }} goalDescriptions />}
    {!failure && <><button type="button" className="assistant-primary" disabled={Boolean(error)} onClick={generate}>生成规则建议</button><p className="assistant-note">仅生成草稿，不自动应用</p></>}
    {error && !fallbackError && <p role="alert">{error}</p>}
    {!result && limits.status !== 'ready' && <p className="assistant-note">{limits.message}</p>}
    {result && !failure && <article ref={resultElement} className={`assistant-plan__result ${stale ? 'is-stale' : ''}`} aria-label="本次建议草稿">
      <h4>规则推荐 · 草稿{draft.adjusted ? ' · 已微调' : ''}</h4>
      {draft.status === 'ready' ? <>
        <dl className="assistant-plan__numbers"><div><dt>新词</dt><dd>{draft.newWords}<small> 词</small></dd></div><div><dt>复习</dt><dd>{draft.reviewWords}<small> 词</small></dd></div><div><dt>预计用时</dt><dd>{draft.estimatedMinutes}<small> 分钟</small></dd></div></dl>
        <div className="assistant-allocation" role="img" aria-label={`时间分配：新词 ${draft.newSeconds} 秒，复习 ${draft.reviewSeconds} 秒；剩余为留白时间`}><span style={{ width: `${draft.newSeconds / (draft.intent.availableMinutes * 60) * 100}%` }} /><span style={{ width: `${draft.reviewSeconds / (draft.intent.availableMinutes * 60) * 100}%` }} /></div>
        <p className="assistant-note">海军蓝：新词 · 柔金：复习 · 暖灰：留白</p><p>{orders[draft.order]}</p>
      </> : <p>{draft.message}</p>}
      {stale && <p role="status">依据或输入已变化，草稿已过期，请重新生成规则建议。</p>}
      <button type="button" className="assistant-plan__basis" aria-expanded={showBasis} onClick={() => setShowBasis(value => !value)}>查看依据 <span aria-hidden="true">{showBasis ? '−' : '+'}</span></button>
      <div className="assistant-plan__actions"><button type="button" disabled={!ready} onClick={() => { if (checkCurrent()) { setAdjustment({ newWords: draft.newWords, reviewWords: draft.reviewWords }); setAdjustError('') } }}>微调计划</button><button type="button" className="assistant-plan__adopt" disabled={!ready} onClick={() => { if (checkCurrent()) setConfirm(true) }}>采用此计划<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h16m-6-6 6 6-6 6" /></svg></button></div>
      {showBasis && <section aria-label="数量与估时依据"><p>新词上限 {draft.limits.newWords ?? '未知'} 词（{draft.limits.newBasis ?? '待核对'}）；复习上限 {draft.limits.reviewWords ?? '未知'} 词（{draft.limits.reviewBasis ?? '待核对'}）。</p><p>新词每词 60 秒，复习每词 20 秒；总用时向上取整 5 分钟，不超可用时间或真实上限。这是估算，原有冻结任务保持。</p><p>{draft.intent.goal === 'review' ? '先安排复习，再以剩余时间安排新词。' : draft.intent.goal === 'lighter' ? '只使用可安排时间的六成，兼顾新词与复习。' : '先分六成时间给新词，其余安排复习；不足时再补另一项。'}</p></section>}
      {adjustment && !stale && <section aria-label="微调草稿"><label>草稿新词数量<input type="number" min="0" max={draft.limits.newWords} value={adjustment.newWords} onChange={event => setAdjustment({ ...adjustment, newWords: event.target.value })} /></label><label>草稿复习数量<input type="number" min="0" max={draft.limits.reviewWords} value={adjustment.reviewWords} onChange={event => setAdjustment({ ...adjustment, reviewWords: event.target.value })} /></label>{adjustError && <p role="alert">{adjustError}</p>}<div className="assistant-plan__actions"><button type="button" onClick={saveAdjustment}>保存草稿微调</button><button type="button" onClick={() => setAdjustment(null)}>取消微调</button></div></section>}
      {confirm && ready && <section className="assistant-plan__confirmation" aria-label="草稿确认"><h4>确认前请核对</h4><p>新词 {draft.newWords} 词，复习 {draft.reviewWords} 词，预计 {draft.estimatedMinutes} 分钟。每日设置与冻结任务未更改。</p><button type="button" className="assistant-primary" disabled>确认应用计划</button><p className="assistant-note">真实应用尚未开放。采用仅进入确认；当前仍按原设置学习。</p><button type="button" onClick={() => setConfirm(false)}>返回草稿</button></section>}
    </article>}
    {!failure && <button type="button" className="assistant-primary" onClick={onStart}>按原设置开始学习</button>}
    <section className="assistant-plan__demo" aria-label="建议状态演示"><h4>建议状态演示</h4><p className="assistant-note">手动选择演示；不请求服务，不表示真实错误。</p><label>演示状态<select value={demo} onChange={event => { setDemo(event.target.value); setDemoMessage(''); setFallbackError('') }}><option value="">请选择</option><option value="success">演示成功</option><option value="timeout">演示超时</option><option value="quota">演示额度耗尽</option></select></label><button type="button" disabled={!demo} onClick={() => { setDemoMessage(demonstrations[demo]); setFallbackError('') }}>运行演示</button>{demoMessage && <p role="status" aria-label="建议演示结果">{demoMessage}</p>}</section>
  </div>
}
