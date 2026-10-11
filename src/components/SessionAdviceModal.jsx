import { useEffect, useRef, useState } from 'react'
import { useLearningStore, localDateKey } from '../data/learning'
import { useLearningFacts } from '../data/assistant/react'
import { buildLearningFacts } from '../data/assistant/facts'
import { wordBooks } from '../data/wordBooks'
import { adjustSessionAdvice, buildSessionAdvice, SESSION_GOALS } from '../data/assistant/sessionAdvice'
import { modelErrorMessage, modelPresentation } from './sessionAdvicePresentation'
import SessionDialog from './SessionDialog'
import SessionIntentControls from './SessionIntentControls'

const orderLabels = { 'review-first': '先复习，再学新词', 'new-first': '先学新词', balanced: '新词与复习交替', none: '本次无需安排' }
export default function SessionAdviceModal({ now, initialIntent, onClose, onStart, generate, modelState }) {
  const { store, snapshot } = useLearningStore()
  const { facts, error: factsError } = useLearningFacts({ now })
  const [intent, setIntent] = useState(initialIntent ?? { availableMinutes: Math.max(5, Math.min(60, snapshot.settings.dailyStudyMinutes ?? 30)), goal: 'progress' })
  const basis = JSON.stringify([snapshot, localDateKey(now ?? new Date()), factsError, facts?.reviewLoad])
  const inputKey = JSON.stringify(intent)
  const rule = () => buildSessionAdvice({ facts, settings: snapshot.settings, intent })
  const [result, setResult] = useState(() => ({ draft: rule(), basis, inputKey }))
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [showBasis, setShowBasis] = useState(false)
  const [adjustment, setAdjustment] = useState(null), [adjustError, setAdjustError] = useState('')
  const operation = useRef({ generation: 0, controller: null, revision: null })
  const [blockedRevision, setBlockedRevision] = useState(null)
  const binding = useRef(null)
  if (!binding.current || binding.current.basis !== basis) binding.current = { basis, version: crypto.randomUUID() }
  const model = modelPresentation(modelState, typeof generate === 'function')
  const current = useRef(null)
  current.current = { basis, inputKey, modelRevision: model.revision }
  const stale = result.basis !== basis ? '依据已变化，请重新计算规则或生成 AI 建议。' : result.inputKey !== inputKey ? '输入已变化，请重新计算规则或生成 AI 建议。' : ''
  useEffect(() => {
    const active = operation.current
    active.generation++
    if (active.controller) setBlockedRevision(current.current.modelRevision ?? active.revision)
    active.controller?.abort()
    active.controller = null
    setBusy(false)
    setAdjustment(null)
    setMessage('')
    return () => { active.generation++; active.controller?.abort() }
  }, [basis, inputKey])

  const cancel = () => {
    if (operation.current.controller) setBlockedRevision(current.current.modelRevision ?? operation.current.revision)
    operation.current.generation++
    operation.current.controller?.abort()
    operation.current.controller = null
    setBusy(false)
    setMessage('已停止等待。已发出的请求可能仍消耗额度；核查服务状态后再生成。当前保留规则推荐。')
  }
  const basisIsCurrent = () => {
    try {
      const read = store.readAssistantSnapshot()
      const date = now ?? new Date()
      const fresh = buildLearningFacts(read.snapshot, { now: date, wordBooks, selectedWordBookId: read.snapshot.settings.todayWordBookId })
      return JSON.stringify([read.snapshot, localDateKey(date), null, fresh.reviewLoad]) === basis
    } catch { return false }
  }
  const recalculateRules = () => {
    if (operation.current.controller) cancel()
    else setMessage('')
    if (!basisIsCurrent()) { setResult(previous => ({ ...previous, basis: null })); return }
    setResult({ draft: rule(), basis, inputKey })
    setAdjustment(null)
  }
  const generateModel = async () => {
    if (operation.current.controller || !model.ready || blockedRevision === model.revision) return
    if (!basisIsCurrent()) { setResult(previous => ({ ...previous, basis: null })); return }
    const fallback = rule()
    setResult({ draft: fallback, basis, inputKey })
    setMessage('')
    setAdjustment(null)
    if (fallback.status !== 'ready' || (!fallback.newWords && !fallback.reviewWords)) return
    const generation = ++operation.current.generation
    const controller = new AbortController()
    operation.current.controller = controller
    operation.current.revision = model.revision
    const requestId = crypto.randomUUID()
    const basisVersion = binding.current.version
    setBusy(true)
    try {
      const { evidence: _evidence, ...summary } = facts
      const permittedSettings = Object.fromEntries(['examDate', 'todayWordBookId', 'dailyNewWords', 'dailyReviewWords', 'dailyStudyMinutes'].map(field => [field, snapshot.settings[field]]))
      const response = await generate({ facts: summary, settings: permittedSettings, intent: { ...intent }, signal: controller.signal, requestId, basisVersion })
      if (generation !== operation.current.generation || controller.signal.aborted || current.current.basis !== basis || current.current.inputKey !== inputKey) return
      if (!basisIsCurrent()) { setBlockedRevision(current.current.modelRevision ?? model.revision); setResult(previous => ({ ...previous, basis: null })); return }
      if (response?.requestId !== requestId || response?.basisVersion !== basisVersion || typeof response?.cacheHit !== 'boolean') throw { code: 'RESPONSE_INVALID' }
      const draft = response.draft
      // UI bounds are computed locally; a provider cannot broaden them.
      const checked = adjustSessionAdvice(fallback, draft ?? {})
      if (checked.error || draft?.source !== 'model' || !Object.hasOwn(orderLabels, draft?.order)) throw { code: 'RESPONSE_INVALID' }
      if (!Array.isArray(draft.reasons) || draft.reasons.length < 1 || draft.reasons.length > 3 || draft.reasons.some(reason => typeof reason !== 'string' || !reason.trim() || reason.length > 240)) throw { code: 'RESPONSE_INVALID' }
      setResult({ draft: { ...checked.draft, source: draft.source, order: draft.order, adjusted: false, reasons: draft.reasons }, basis, inputKey, cacheHit: response.cacheHit })
    } catch (error) {
      if (generation === operation.current.generation && !controller.signal.aborted) {
        setBlockedRevision(current.current.modelRevision ?? model.revision)
        setMessage(modelErrorMessage(error?.code))
      }
    } finally {
      if (generation === operation.current.generation) {
        operation.current.controller = null
        setBusy(false)
      }
    }
  }
  const saveAdjustment = () => {
    const checked = adjustSessionAdvice(result.draft, { newWords: Number(adjustment.newWords), reviewWords: Number(adjustment.reviewWords) })
    if (checked.error) { setAdjustError(checked.error); return }
    setResult({ ...result, draft: checked.draft })
    setAdjustment(null)
    setAdjustError('')
  }
  const draft = result.draft
  const ready = draft.status === 'ready' && !stale && !busy
  const total = draft.intent.availableMinutes * 60
  const modelDisabled = busy || Boolean(factsError) || !model.ready || blockedRevision === model.revision || draft.status !== 'ready' || (!draft.limits.newWords && !draft.limits.reviewWords)
  const recovered = model.ready && blockedRevision && blockedRevision !== model.revision
  return <SessionDialog title="安排这一次学习" onClose={onClose} footer={<>
    <button type="button" className="session-primary" onClick={onStart}>按原设置开始学习</button>
    <button type="button" className="session-text" onClick={onClose}>返回</button>
  </>}>
    <SessionIntentControls intent={intent} onChange={setIntent} />
    <article className={`session-plan ${stale ? 'is-stale' : ''}`} aria-label="本次建议草稿" aria-busy={busy}>
      <div className="session-plan__source"><span>{draft.source === 'model' ? '模型建议 · 草稿' : '规则推荐 · 草稿'}</span>{draft.adjusted && <span>已微调</span>}</div>
      <p className="session-plan__context">{facts?.book.label ?? '词书待核对'} · {localDateKey(now ?? new Date())}</p>
      {draft.status === 'ready' ? <>
        <dl className="session-plan__numbers">
          <div><dt>新词</dt><dd>{draft.newWords}<small> 词</small></dd></div>
          <div><dt>复习</dt><dd>{draft.reviewWords}<small> 词</small></dd></div>
          <div><dt>预计用时</dt><dd>{draft.estimatedMinutes}<small> 分钟</small></dd></div>
        </dl>
        <div className="session-allocation" role="img" aria-label={`时间分配：新词 ${draft.newSeconds} 秒，复习 ${draft.reviewSeconds} 秒；剩余为留白时间`}>
          <span style={{ width: `${draft.newSeconds / total * 100}%` }} /><span style={{ width: `${draft.reviewSeconds / total * 100}%` }} />
        </div>
        <div className="session-allocation__legend"><span>新词 {draft.newWords} 分钟</span><span>复习 {formatMinutes(draft.reviewSeconds)} 分钟</span><span>留白 {formatMinutes(Math.max(0, total - draft.newSeconds - draft.reviewSeconds))} 分钟</span></div>
        <p className="session-plan__order">{orderLabels[draft.order]}</p>
        {draft.source === 'model' && <ul className="session-model-reasons">{draft.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>}
        {!draft.newWords && !draft.reviewWords && <p className="session-note">当前可安排任务已完成或没有到期复习。若继续额外学习，请使用原学习入口。</p>}
      </> : <p role="status">{draft.message}</p>}
      <div className="session-plan__actions">
        <button type="button" className="session-text" aria-expanded={showBasis} onClick={() => setShowBasis(value => !value)}>查看依据</button>
        <button type="button" className="session-text" disabled={!ready} onClick={() => { setAdjustment({ newWords: draft.newWords, reviewWords: draft.reviewWords }); setAdjustError('') }}>微调计划</button>
        <button type="button" className="session-text" disabled={Boolean(factsError)} onClick={recalculateRules}>重新计算规则</button>
      </div>
      {showBasis && <section className="session-basis" aria-label="数量与估时依据">
        <p>本次目标：{SESSION_GOALS.find(goal => goal.id === draft.intent.goal)?.label}。{draft.source === 'rules' ? goalReason(draft.intent.goal) : '生成者提供建议，由程序核对数量与估时。'}</p>
        <p>新词上限 {draft.limits.newWords ?? '未知'} 词（{draft.limits.newBasis ?? '待核对'}）；复习上限 {draft.limits.reviewWords ?? '未知'} 词（{draft.limits.reviewBasis ?? '待核对'}）。</p>
        <p>新词每词 60 秒，复习每词 20 秒；合计向上取整至 5 分钟。可用时间先向下取整为 5 分钟整段；这是估算，不是实际计时。</p>
        <p>{draft.adjusted ? '当前数量来自你的草稿微调。' : '建议受本次时间与真实上限约束，不额外创建学习批次。'}原有冻结任务保持。</p>
      </section>}
    </article>
    <section className="session-model" aria-label="AI 建议生成">
      <div className="session-plan__actions">
        <button type="button" className="session-secondary" disabled={modelDisabled} aria-describedby="session-model-state" onClick={generateModel}>{draft.source === 'model' ? '重新生成 AI 建议' : '生成 AI 建议'}</button>
        {busy && <button type="button" className="session-text" onClick={cancel}>取消生成</button>}
      </div>
      <p id="session-model-state" className="session-note" role="status">{busy ? '正在请求 AI 建议…' : blockedRevision && blockedRevision === model.revision ? '请先核对服务状态与免费额度，再恢复 AI 请求。' : model.message}</p>
      {model.details.length > 0 && <p className="session-note">{model.details.join('；')}。这是请求次数与等待提示，不是免费额度余额。</p>}
      {result.cacheHit && !stale && <p className="session-note">本次复用有效缓存，未新增上游模型调用。</p>}
    </section>
    <p className="session-status" role="status" aria-live="polite">{stale || (recovered ? '' : message)}</p>
    {adjustment && !stale && <section className="session-adjustment" aria-label="微调草稿">
      <h3>微调本次草稿</h3>
      <div><label>草稿新词数量<input type="number" min="0" max={draft.limits.newWords} step="1" value={adjustment.newWords} onChange={event => setAdjustment({ ...adjustment, newWords: event.target.value })} /></label>
        <label>草稿复习数量<input type="number" min="0" max={draft.limits.reviewWords} step="1" value={adjustment.reviewWords} onChange={event => setAdjustment({ ...adjustment, reviewWords: event.target.value })} /></label></div>
      {adjustError && <p role="alert">{adjustError}</p>}
      <div className="session-plan__actions"><button type="button" className="session-secondary" onClick={saveAdjustment}>保存草稿微调</button><button type="button" className="session-text" onClick={() => setAdjustment(null)}>取消微调</button></div>
    </section>}
    <section className="session-application" aria-label="计划应用尚未开放">
      <button type="button" className="session-secondary" disabled>采用此计划</button>
      <p className="session-note">采用后将先进入确认，再应用计划；此功能尚未开放。微调仅改草稿，开始学习仍使用原设置和已冻结任务。</p>
    </section>
  </SessionDialog>
}

function formatMinutes(seconds) { return (seconds / 60).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) }
function goalReason(goal) {
  return goal === 'review' ? '先安排待复习量，剩余时间用于新词。' : goal === 'lighter' ? '只使用可安排时间的六成，再兼顾新词与复习，主动减少负担。' : '先分六成时间给新词，其余分给复习；某项不足时再用剩余时间补另一项。'
}
