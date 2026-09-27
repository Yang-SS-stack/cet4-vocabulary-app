import LearningSession from './LearningSession'
import { useState } from 'react'
import { useLearningStore } from '../data/learning'
import {
  buildLearningRecommendation,
  completedWordCount,
  daysUntilExam,
} from '../data/learning/recommendations'
import { wordBooks } from '../data/wordBooks'
import './TodayLearningPage.css'

function TodayLearningPage({ now = new Date(), loadBook, onFocusModeChange }) {
  const { store, snapshot } = useLearningStore()
  const { settings } = snapshot
  const selectedWordBook = wordBooks.find(({ id }) => id === settings.todayWordBookId) ?? wordBooks[0]
  const completedWords = completedWordCount(snapshot, selectedWordBook.id)
  const daysRemaining = daysUntilExam(settings.examDate, now)
  const recommendation = buildLearningRecommendation({
    totalWords: selectedWordBook.totalWords,
    completedWords,
    daysRemaining,
    dailyNewWords: settings.dailyNewWords ?? 0,
    dailyReviewWords: settings.dailyReviewWords ?? 0,
    dailyStudyMinutes: settings.dailyStudyMinutes ?? 0,
  })
  const [status, setStatus] = useState('')
  const [learning, setLearning] = useState(false)

  const start = (mode) => {
    if (mode === 'learning') {
      if (!store.getTask('learning') && (!settings.todayWordBookId || !settings.dailyNewWords)) {
        setStatus('请先在设置中选择词书和每日新词数量。')
        return
      }
      setLearning('learning')
      onFocusModeChange?.(true)
    } else { setLearning('review'); onFocusModeChange?.(true) }
  }

  const exit = () => { setLearning(false); onFocusModeChange?.(false) }
  if (learning === 'learning') return <LearningSession loadBook={loadBook} onExit={exit} />
  if (learning === 'review') return <section className="learning-session" aria-label="今日复习">
    <header className="learning-session__header"><button type="button" onClick={exit}>返回主界面</button><p>今日复习</p></header>
    <div className="learning-session__empty"><h2>复习尚未启用</h2><p role="status">复习流程将在下一阶段启用。</p></div>
  </section>

  return (
    <section className="learning-overview" aria-label="今日学习概览">
      <div className="learning-overview__status-strip">
        <StatusMetric label="距离考试" value={formatDays(daysRemaining)} />
        <StatusMetric
          label={`${selectedWordBook.label} 剩余`}
          value={`${formatNumber(recommendation.remainingWords)} / ${formatNumber(selectedWordBook.totalWords)} 词`}
        />
      </div>

      <div className="learning-overview__actions">
        <button type="button" onClick={() => start('learning')}>今日学习</button>
        <button type="button" onClick={() => start('review')}>今日复习</button>
      </div>

      <p className="learning-overview__flow-status" role="status" aria-live="polite">{status}</p>

      <RecommendationCard recommendation={recommendation} settings={settings} />
    </section>
  )
}

function StatusMetric({ label, value }) {
  return (
    <div className="learning-overview__metric">
      <p>{label}</p>
      <strong>{value}</strong>
    </div>
  )
}

function RecommendationCard({ recommendation, settings }) {
  const deadlinePlan = recommendation.deadlineDailyWords === null
    ? '设置未来考试日期后计算'
    : `每天 ${formatNumber(recommendation.deadlineDailyWords)} 词`
  const systemPlan = recommendation.recommendedDailyWords === null
    ? '设置未来考试日期后计算'
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
        <h2 id="learning-recommendation-title">学习建议</h2>
        <p>研究原则、计划估算和你的选择分别呈现</p>
      </header>

      <dl className="learning-recommendation__rows">
        <RecommendationRow label="学习方法建议" value="使用间隔学习与主动回忆；复习时优先完成全部到期词" note="尚无到期复习；开始复习后按当天到期词更新" />
        <RecommendationRow label="考试目标需要" value={deadlinePlan} />
        <RecommendationRow label="系统建议" value={systemPlan} />
        <RecommendationRow label="用户当前设置" value={current} />
        <RecommendationRow label="预计每日学习时间" value={`约 ${formatNumber(recommendation.estimatedMinutes)} 分钟`} />
        <RecommendationRow label="计划结果" value={planResult} />
      </dl>

      {recommendation.exceedsDailyWordLimit && (
        <p role="status">按当前日期和剩余词量，考试前可能无法完成，请调整考试日期或学习计划。</p>
      )}

      <details className="learning-recommendation__evidence">
        <summary>查看依据</summary>
        <div>
          <p>间隔学习与主动回忆是学习方法证据，不是固定每日词数的研究处方。</p>
          <ul>
            <li><a href="https://pubmed.ncbi.nlm.nih.gov/16719566/" target="_blank" rel="noreferrer">分散练习综述</a></li>
            <li><a href="https://doi.org/10.1126/science.1152408" target="_blank" rel="noreferrer">主动回忆研究</a></li>
            <li><a href="https://pubmed.ncbi.nlm.nih.gov/35303977/" target="_blank" rel="noreferrer">词汇间隔研究</a></li>
          </ul>
        </div>
      </details>
    </article>
  )
}

function formatPlanResult(recommendation, settings) {
  const required = recommendation.deadlineDailyWords
  if (required === null) return '请先设置未来的考试日期。'
  if ((settings.dailyNewWords ?? 0) >= required) return '当前设置可以在考试前完成。'
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
