import LearningSession from './LearningSession'
import ReviewSession from './ReviewSession'
import { useEffect, useRef, useState } from 'react'
import { useLearningStore } from '../data/learning'
import { useLearningFacts } from '../data/assistant/react'
import { ProgressRing } from './DataMotion'
import LearningAdviceModal from './LearningAdviceModal'
import { wordBooks } from '../data/wordBooks'
import './TodayLearningPage.css'

function TodayLearningPage({ now, loadBook, onFocusModeChange }) {
  const { store, snapshot } = useLearningStore()
  const { settings } = snapshot
  const selectedWordBook = wordBooks.find(({ id }) => id === settings.todayWordBookId) ?? wordBooks[0]
  const adviceBookLabel = wordBooks.find(({ id }) => id === settings.todayWordBookId)?.label ?? (settings.todayWordBookId ? '无法确认' : '未设置')
  const { facts, error: factsError } = useLearningFacts({ now })
  const recommendation = facts?.ruleRecommendation ?? null
  const date = store.getToday()
  const extraProcess = snapshot.extraLearning[date]
  const currentExtra = extraProcess?.batches.at(-1)
  const extraProgress = currentExtra ? { wordBookId: currentExtra.wordBookId, assignedWords: currentExtra.itemIds.length, completedWords: currentExtra.itemIds.filter(id => currentExtra.items[id].completed).length } : null
  const daysRemaining = recommendation?.daysRemaining ?? null
  const [status, setStatus] = useState('')
  const [learning, setLearning] = useState(false)
  const [confirmExtra, setConfirmExtra] = useState(false)
  const [adviceOpen, setAdviceOpen] = useState(false)
  const adviceEntry = useRef(null)
  const [returned, setReturned] = useState(false)
  const entryButton = useRef(null)
  const reviewButton = useRef(null)
  const returnMode = useRef('learning')
  const [pendingEntry, setPendingEntry] = useState(null)
  const entryRequested = useRef(false)
  const focusCallback = useRef(onFocusModeChange)
  useEffect(() => { focusCallback.current = onFocusModeChange }, [onFocusModeChange])
  useEffect(() => { if (!learning && returned) (returnMode.current === 'review' ? reviewButton : entryButton).current?.focus({ preventScroll: true }) }, [learning, returned])

  useEffect(() => {
    if (!pendingEntry) return
    const timer = window.setTimeout(() => {
      setLearning(pendingEntry === 'extra' && !store.getTask('learning') ? 'learning' : pendingEntry)
      setPendingEntry(null)
      focusCallback.current?.(true)
    }, 180)
    return () => window.clearTimeout(timer)
  }, [pendingEntry, store])
  const enter = mode => {
    if (entryRequested.current) return
    entryRequested.current = true
    returnMode.current = mode
    if (!window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setLearning(mode)
      onFocusModeChange?.(true)
    } else setPendingEntry(mode)
  }

  const start = (mode) => {
    if (entryRequested.current) return
    if (mode === 'learning') {
      const task = store.getTask('learning')
      if (!task && (!settings.todayWordBookId || !settings.dailyNewWords)) {
        setStatus('请先在设置中选择词书和每日新词数量。')
        return
      }
      if (task?.currentItemId === null && task.itemIds.every(id => task.items[id].completed)) {
        if (store.getExtraLearningProcess()) enter('extra')
        else setConfirmExtra(true)
      } else enter('learning')
    } else enter('review')
  }

  const exit = () => { entryRequested.current = false; setReturned(true); setLearning(false); onFocusModeChange?.(false) }
  if (learning === 'learning' || learning === 'extra') return <LearningSession loadBook={loadBook} onExit={exit} initialMode={learning} animateEntry />
  if (learning === 'review') return <ReviewSession loadBook={loadBook} onExit={exit} animateEntry />

  return (
    <section className={`learning-overview ${pendingEntry ? 'is-leaving' : returned ? 'is-entering' : ''}`} inert={Boolean(pendingEntry)} aria-label="今日学习概览">
      <div className="learning-overview__status-strip">
        <StatusMetric label="距离考试" value={formatDays(daysRemaining)} />
        <StatusMetric
          label={`${selectedWordBook.label} 剩余`}
          value={recommendation ? `${formatNumber(recommendation.remainingWords)} / ${formatNumber(selectedWordBook.totalWords)} 词` : '词书资料不完整或不一致，无法计算'}
        />
      </div>

      <section className="today-tasks" aria-label="今日任务进度">
        <h2>今日任务</h2>
        <div className="today-tasks__rings">
          <TaskRing label="今日新词" progress={facts?.today.learning} currentBook={settings.todayWordBookId} error={factsError} empty="本日无新词任务" />
          <TaskRing label="额外学习" progress={factsError ? null : extraProgress} currentBook={settings.todayWordBookId} error={factsError} empty="本轮无额外任务" exhausted={extraProcess?.exhausted} extra />
          <TaskRing label="今日复习" progress={facts?.today.review} currentBook={settings.todayWordBookId} error={factsError} empty="本日无复习任务" />
        </div>
      </section>
      <div className="learning-overview__actions">
        <button ref={entryButton} type="button" onClick={() => start('learning')}>今日学习 <ActionArrow /></button>
        <button ref={reviewButton} type="button" onClick={() => start('review')}>今日复习 <ActionArrow /></button>
      </div>
      <p className="learning-overview__flow-status" role="status" aria-live="polite">{status}</p>
      {factsError && <p className="learning-overview__error">{factsError}</p>}
      <button ref={adviceEntry} type="button" className="learning-advice-entry" aria-haspopup="dialog" onClick={() => setAdviceOpen(true)}>学习建议 <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 7 6 6 6-6" /></svg></button>
      {adviceOpen && <LearningAdviceModal recommendation={recommendation} settings={settings} bookLabel={adviceBookLabel} daysLabel={formatDays(daysRemaining)} planResult={recommendation ? formatPlanResult(recommendation, settings) : null} returnFocus={adviceEntry} onClose={() => setAdviceOpen(false)}>
        {recommendation ? <RecommendationCard recommendation={recommendation} settings={settings} reviewLoad={facts.reviewLoad} /> : <p>规则建议无法计算：请选择词书并核对词书资料。</p>}
      </LearningAdviceModal>}
      {confirmExtra && <ExtraLearningConfirmation onCancel={() => setConfirmExtra(false)} onConfirm={() => {
        setConfirmExtra(false)
        // The date may have changed while the confirmation was open.
        enter(store.getTask('learning')?.currentItemId === null ? 'extra' : 'learning')
      }} />}
    </section>
  )
}

function ActionArrow() { return <svg className="learning-action-arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg> }

function TaskRing({ label, progress, currentBook, error, empty, extra = false, exhausted = false }) {
  const valid = progress && Number.isSafeInteger(progress.assignedWords) && Number.isSafeInteger(progress.completedWords) && progress.assignedWords >= 0 && progress.completedWords >= 0 && progress.completedWords <= progress.assignedWords
  const state = error || (progress && !valid) ? '资料异常' : !progress ? (exhausted ? '词书已无剩余新词' : '尚未创建') : progress.assignedWords === 0 ? empty : null
  const book = wordBooks.find(book => book.id === progress?.wordBookId)
  return <section className="today-task" aria-label={label}>
    <h3>{label}</h3>
    <ProgressRing label={label} value={state ? null : progress.completedWords} total={state ? null : progress.assignedWords} state={state} accent={extra} />
    <div className="today-task__note">{extra && <span>本轮进度</span>}{progress && progress.wordBookId !== currentBook && <span>已保存词书：{book?.label ?? progress.wordBookId}</span>}{valid && progress.assignedWords > 0 && progress.completedWords === progress.assignedWords && <span>已完成</span>}</div>
  </section>
}

function ExtraLearningConfirmation({ onConfirm, onCancel }) {
  const dialog = useRef(null)
  useEffect(() => {
    const previous = document.activeElement
    dialog.current.showModal()
    return () => previous?.focus()
  }, [])
  return <dialog ref={dialog} className="learning-extra-confirmation" aria-labelledby="learning-extra-title" onCancel={onCancel}>
    <h2 id="learning-extra-title">继续学习更多单词？</h2>
    <p>今日任务已完成。继续学习同一本词书的未完成新词，进度会自动保存。</p>
    <div className="learning-overview__actions">
      <button type="button" onClick={onCancel} autoFocus>暂不继续</button>
      <button type="button" onClick={onConfirm}>继续学习更多单词</button>
    </div>
  </dialog>
}

function StatusMetric({ label, value }) {
  return (
    <div className="learning-overview__metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  )
}

function RecommendationCard({ recommendation, settings, reviewLoad }) {
  const unavailableDeadline = recommendation.daysRemaining !== null && recommendation.daysRemaining <= 0 ? '不适用：考试日期为今天或已过去' : '设置未来考试日期后计算'
  const deadlinePlan = recommendation.remainingWords === 0 ? '当前词书新词已完成' : recommendation.deadlineDailyWords === null
    ? unavailableDeadline
    : `每天 ${formatNumber(recommendation.deadlineDailyWords)} 词`
  const systemPlan = recommendation.remainingWords === 0 ? '当前词书新词已完成' : recommendation.recommendedDailyWords === null
    ? unavailableDeadline
    : `每天 ${formatNumber(recommendation.recommendedDailyWords)} 词`
  const current = settings.dailyNewWords === null
    && settings.dailyReviewWords === null
    && settings.dailyStudyMinutes === null
    ? '尚未设置'
    : `新词 ${settings.dailyNewWords ?? '未设置'} · 复习 ${settings.dailyReviewWords ?? '未设置'} · 计划 ${settings.dailyStudyMinutes ?? '未设置'} 分钟`
  const planResult = formatPlanResult(recommendation, settings)

  return (
    <article className="learning-recommendation" aria-labelledby="learning-recommendation-title">
      <header className="learning-recommendation__header">
        <p id="learning-recommendation-title">规则建议、计划估算和你的选择分别呈现</p>
      </header>

      <dl className="learning-recommendation__rows">
        <RecommendationRow label="学习方法建议" value="使用间隔学习与主动回忆；在设定数量内优先复习逾期词" note={`${reviewLoad.needsReconciliation ? '预计' : '当前'}到期 ${reviewLoad.dueCount ?? '无法计算'} 词${reviewLoad.needsReconciliation ? '；开始复习时核对历史记录' : ''}；当前词书任务外积压 ${reviewLoad.outsideTodayTaskCount ?? '无法计算'} 词`} />
        <RecommendationRow label="考试目标需要" value={deadlinePlan} />
        <RecommendationRow label="系统建议" value={systemPlan} />
        <RecommendationRow label="用户当前设置" value={current} />
        <RecommendationRow label="预计每日学习时间" value={recommendation.estimatedMinutes === null ? '无法估算：每日新词或复习数量未设置' : `约 ${formatNumber(recommendation.estimatedMinutes)} 分钟`} note="按当前设置估算，新词每词 60 秒、复习每词 20 秒；不含额外学习，不是实际计时。" />
        <RecommendationRow label="计划结果" value={planResult} />
      </dl>

      {recommendation.exceedsDailyWordLimit && (
        <p role="status">按当前日期和剩余词量，考试前可能无法完成，请调整考试日期或学习计划。</p>
      )}

      <section className="learning-recommendation__evidence" aria-label="研究依据">
        <h3>研究依据</h3>
        <div>
          <p>间隔学习与主动回忆是学习方法证据，不是固定每日词数的研究处方。</p>
          <ul>
            <li><a href="https://pubmed.ncbi.nlm.nih.gov/16719566/" target="_blank" rel="noreferrer">分散练习综述</a></li>
            <li><a href="https://doi.org/10.1126/science.1152408" target="_blank" rel="noreferrer">主动回忆研究</a></li>
            <li><a href="https://pubmed.ncbi.nlm.nih.gov/35303977/" target="_blank" rel="noreferrer">词汇间隔研究</a></li>
          </ul>
        </div>
      </section>
    </article>
  )
}

function formatPlanResult(recommendation, settings) {
  if (recommendation.remainingWords === 0) return '当前词书新词已完成。'
  const required = recommendation.deadlineDailyWords
  if (required === null) return '请先设置未来的考试日期。'
  if (settings.dailyNewWords === null) return '每日新词数量尚未设置，无法判断计划结果。'
  if (settings.dailyNewWords >= required) return '当前设置可以在考试前完成。'
  return `当前设置可能无法在考试前完成，建议每天至少学习 ${formatNumber(required)} 个新词。`
}

function RecommendationRow({ label, value, note }) {
  return (
    <div className="learning-recommendation__row">
      <dt>{label}</dt>
      <dd>
        <strong>{value}</strong>
        {note && <small>{note}</small>}
      </dd>
    </div>
  )
}

function formatDays(days) {
  if (days === null) return '尚未设置'
  if (days < 0) return `已过去 ${Math.abs(days)} 天`
  if (days === 0) return '就是今天'
  return `${days} 天`
}

function formatNumber(value) {
  return new Intl.NumberFormat('zh-CN').format(value)
}

export default TodayLearningPage
