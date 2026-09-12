import { useState } from 'react'
import { useLearningStore } from '../data/learning'
import {
  buildLearningRecommendation,
  completedWordCount,
  daysUntilExam,
} from '../data/learning/recommendations'
import { wordBooks } from '../data/wordBooks'
import LearningSetupModal from './LearningSetupModal'
import './TodayLearningPage.css'

const LEARNING_FIELDS = ['examDate', 'todayWordBookId', 'dailyNewWords', 'dailyStudyMinutes']
const validWordCount = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 100
const validStudyMinutes = (value) => Number.isSafeInteger(value)
  && value >= 5 && value <= 240 && value % 5 === 0

function validExamDate(value) {
  const match = typeof value === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return false
  const [year, month, day] = match.slice(1).map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

const LEARNING_FIELD_VALIDATORS = {
  examDate: validExamDate,
  todayWordBookId: (value) => wordBooks.some(({ id }) => id === value),
  dailyNewWords: validWordCount,
  dailyStudyMinutes: validStudyMinutes,
}

function TodayLearningPage({ now = new Date() }) {
  const { store, snapshot } = useLearningStore()
  const { settings } = snapshot
  const selectedWordBook = wordBooks.find(({ id }) => id === settings.todayWordBookId) ?? wordBooks[0]
  const completedWords = completedWordCount(snapshot, selectedWordBook.id)
  const daysRemaining = validExamDate(settings.examDate) ? daysUntilExam(settings.examDate, now) : null
  const recommendation = buildLearningRecommendation({
    totalWords: selectedWordBook.totalWords,
    completedWords,
    daysRemaining,
    dailyNewWords: settings.dailyNewWords ?? 0,
    dailyReviewWords: settings.dailyReviewWords ?? 0,
    dailyStudyMinutes: settings.dailyStudyMinutes ?? 0,
  })
  const [setupMode, setSetupMode] = useState(null)
  const [status, setStatus] = useState('')

  const start = (mode) => {
    setStatus('')
    const needsSetup = mode === 'learning'
      ? LEARNING_FIELDS.some((field) => !LEARNING_FIELD_VALIDATORS[field](settings[field]))
      : !validWordCount(settings.dailyReviewWords)
    if (needsSetup) {
      setSetupMode(mode)
      return
    }
    setStatus(mode === 'learning'
      ? '设置已保存，学习流程将在下一阶段启用。'
      : '设置已保存，复习流程将在下一阶段启用。')
  }

  const saveSetup = (patch) => {
    store.updateSettings(patch)
    setStatus(setupMode === 'learning'
      ? '设置已保存，学习流程将在下一阶段启用。'
      : '设置已保存，复习流程将在下一阶段启用。')
  }

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

      {setupMode && (
        <LearningSetupModal
          mode={setupMode}
          settings={settings}
          recommendation={{
            ...recommendation,
            totalWords: selectedWordBook.totalWords,
            completedWords,
            dailyReviewWords: settings.dailyReviewWords,
          }}
          onSave={saveSetup}
          onClose={() => setSetupMode(null)}
        />
      )}
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
  const plan = recommendation.deadlineDailyWords === null
    ? '设置未来考试日期后计算'
    : `每天 ${formatNumber(recommendation.deadlineDailyWords)} 词`
  const current = settings.dailyNewWords === null && settings.dailyReviewWords === null
    ? '尚未设置'
    : `新词 ${settings.dailyNewWords ?? '未设置'} · 复习 ${settings.dailyReviewWords ?? '未设置'}`

  return (
    <article className="learning-recommendation" aria-labelledby="learning-recommendation-title">
      <header className="learning-recommendation__header">
        <h2 id="learning-recommendation-title">学习建议</h2>
        <p>研究原则、计划估算和你的选择分别呈现</p>
      </header>

      <dl className="learning-recommendation__rows">
        <RecommendationRow label="研究建议：新词" value="研究未给出通用固定数量" />
        <RecommendationRow label="研究建议：复习" value="优先完成全部到期词" note="尚无到期复习；开始复习后按当天到期词更新" />
        <RecommendationRow label="考试计划计算" value={plan} />
        <RecommendationRow label="系统最终建议" value={plan} />
        <RecommendationRow label="用户当前设置" value={current} />
        <RecommendationRow label="预计每日学习时间" value={`约 ${formatNumber(recommendation.estimatedMinutes)} 分钟`} />
      </dl>

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
