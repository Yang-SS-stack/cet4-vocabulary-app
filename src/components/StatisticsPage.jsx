import { useEffect, useRef, useState } from 'react'
import { useLearningStore } from '../data/learning'
import { localDateKey } from '../data/learning/model'
import { wordBooks } from '../data/wordBooks'
import { buildStatisticsFacts } from '../data/assistant/facts'
import { AnimatedCount } from './DataMotion'
import { CompletionChart, DataLegend, FeedbackDonut, SegmentedBar } from './DataCharts'
import './StatisticsPage.css'

const colors = ['#123e68', '#b89647', '#589bd0']
const feedbackColors = ['#3f938b', '#b89647', '#df8175']
const format = value => value === null ? '不可计算' : new Intl.NumberFormat('zh-CN').format(value)
const sum = values => values.every(value => Number.isSafeInteger(value) && value >= 0) ? values.reduce((total, value) => total + value, 0) : null
function StatisticsPage({ now }) {
  const { store, snapshot } = useLearningStore()
  const [bookId, setBookId] = useState(() => snapshot.settings.todayWordBookId ?? wordBooks[0].id)
  const [period, setPeriod] = useState('all')
  const [feedback, setFeedback] = useState('effective')
  const [, refresh] = useState(0)
  const projection = useRef(null)
  useEffect(() => {
    if (now) return
    const timer = window.setInterval(() => { if (!document.hidden) refresh(value => value + 1) }, 1000)
    const visible = () => { if (!document.hidden) refresh(value => value + 1) }
    document.addEventListener('visibilitychange', visible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [now])
  const at = now ?? new Date()
  const dateKey = localDateKey(at)
  let readable = null
  try { readable = store.readAssistantSnapshot().snapshot } catch { /* Do not display a cached result after a failed consistent read. */ }
  // Clock refreshes only invalidate projection when a saved review becomes due.
  const dueClockKey = Object.values(readable?.wordBooks[bookId]?.words ?? {}).filter(word => word.review?.nextReviewAt && Date.parse(word.review.nextReviewAt) <= at.getTime()).length
  const projectionKey = `${dateKey}:${bookId}:${period}:${dueClockKey}`
  if (readable && (projection.current?.snapshot !== readable || projection.current?.key !== projectionKey)) {
    let value = null
    try { value = buildStatisticsFacts(readable, { now: at, wordBooks, selectedWordBookId: bookId, period }) } catch { /* Unavailable values must not become zero. */ }
    projection.current = { snapshot: readable, key: projectionKey, value }
  }
  const facts = readable ? projection.current?.value : null
  const history = facts?.history
  const book = facts?.book
  const progressValid = book && Number.isSafeInteger(book.totalWords) && book.totalWords > 0 && book.completedWords >= 0 && book.completedWords <= book.totalWords
  const completions = history ? [history.completions.learningWords, history.completions.extraLearningWords, history.completions.reviewWords] : []
  const completed = history ? sum(completions) : null
  const activity = completions.map((value, index) => ({ value, label: ['新词', '额外', '复习'][index], color: colors[index] }))
  const assessment = feedback === 'effective' ? history?.effectiveSelfAssessments : history?.selfAssessments
  const selfItems = assessment ? ['known', 'fuzzy', 'unknown'].map((key, i) => ({ label: ['认识', '模糊', '不认识'][i], value: assessment[key], color: feedbackColors[i] })) : null
  const choiceItems = history?.choices ? ['correct', 'incorrect', 'showAnswer'].map((key, i) => ({ label: ['正确', '错误', '看答案'][i], value: history.choices[key], color: ['#3f938b', '#df8175', '#b6b5b1'][i] })) : null
  const corrections = history?.corrections ? [{ label: '自评', value: history.corrections.fromSelfAssessment, color: '#3f938b' }, { label: '选择', value: history.corrections.fromChoice, color: '#b89647' }] : null
  const rangeKey = `${bookId}:${period}`
  const coverage = history?.coverage
  const missingFeedback = coverage?.tasksWithoutEvents > 0 || coverage?.legacyTaskCount > 0
  const hasConflict = history?.issues.some(issue => issue !== 'duplicate-event')
  return (
    <section className="learning-statistics" aria-label="学习统计">
      <div className="statistics-filters">
        <ToggleGroup
          label="统计词书"
          options={wordBooks.map(book => [book.id, book.id === 'cet4' ? 'CET-4' : 'CET-4 高频'])}
          selected={bookId}
          onChange={setBookId}
        />
        <div className="statistics-filters__period">
          <ToggleGroup
            label="统计时间"
            options={[[ 'all', '全部' ], [ 'last7Days', '近7天' ], [ 'today', '今日' ]]}
            selected={period}
            onChange={setPeriod}
          />
          {history && <span className="statistics-date">{history.fromDate} 至 {history.toDate}</span>}
        </div>
      </div>
      {!facts ? (
        <p role="alert" className="statistics-error">学习记录已变化或无法读取，请重新载入页面。</p>
      ) : (
        <>
          <div className="statistics-primary">
            <section aria-label="词书进度">
              <h2>词书进度</h2>
              <p className="statistics-primary__value">
                {progressValid ? (
                  <AnimatedCount value={book.completedWords} label={`已学 ${book.completedWords} 词`} replayKey={bookId} />
                ) : (
                  <strong className="statistics-unknown">不可计算</strong>
                )}
                <span> / {format(book.totalWords)} 词</span>
              </p>
              <div className="statistics-progress-label">
                <span>已学</span>
                <strong>{progressValid ? `${Math.round(book.completedWords / book.totalWords * 100)}%` : '资料异常'}</strong>
              </div>
              {progressValid && (
                <SegmentedBar
                  items={[{ label: '已学', value: book.completedWords, color: '#b89647' }]}
                  total={book.totalWords}
                  replayKey={bookId}
                  label={`词书累计进度 ${book.completedWords} / ${book.totalWords} 词`}
                />
              )}
              <p className="statistics-remaining">
                剩余 {progressValid ? format(book.totalWords - book.completedWords) : '不可计算'} 词 <small>词书累计，不随时间筛选</small>
              </p>
            </section>
            <section aria-label="累计完成">
              <h2>累计完成</h2>
              <p className="statistics-primary__value">
                <AnimatedCount
                  value={completed}
                  label={completed === null ? '累计完成不可计算' : `累计完成 ${completed} 词次`}
                  replayKey={rangeKey}
                />
                <span>词次</span>
              </p>
              <div className="statistics-activity">
                <SegmentedBar items={activity} replayKey={rangeKey} label="固定新词、额外学习与复习完成比例" />
                {completed !== null && <DataLegend items={activity} />}
              </div>
            </section>
          </div>
          <div className="statistics-middle">
            <CompletionChart buckets={facts.buckets} granularity={facts.granularity} replayKey={rangeKey} colors={colors} />
            <section className="statistics-feedback" aria-label="自评反馈">
              <header className="statistics-section-heading">
                <h2>自评反馈</h2>
                <ToggleGroup
                  label="自评记录口径"
                  options={[[ 'effective', '更正后' ], [ 'raw', '原记录' ]]}
                  selected={feedback}
                  onChange={setFeedback}
                />
              </header>
              {selfItems ? (
                <>
                  <div className="statistics-feedback__body">
                    <FeedbackDonut items={selfItems} replayKey={`${rangeKey}:${feedback}`} />
                    <DataLegend items={selfItems} percentages className="data-legend--vertical" />
                  </div>
                  {sum(selfItems.map(item => item.value)) === 0 && <p className="statistics-empty-note">尚无自评反馈</p>}
                </>
              ) : (
                <p className="data-unavailable">不可计算：自评记录存在冲突</p>
              )}
              <p className="statistics-subnote">自评次数，不代表客观掌握率</p>
            </section>
          </div>
          <div className="statistics-secondary">
            <section aria-label="选择作答（原记录）">
              <h2>选择作答 <small>（原记录）</small></h2>
              {choiceItems ? (
                <>
                  <SegmentedBar items={choiceItems} replayKey={rangeKey} label="选择作答原记录分布" />
                  <DataLegend items={choiceItems} percentages />
                  {sum(choiceItems.map(item => item.value)) === 0 && <p className="statistics-empty-note">尚无选择作答</p>}
                </>
              ) : (
                <p className="data-unavailable">不可计算：选择记录存在冲突</p>
              )}
            </section>
            <section aria-label="反馈更正">
              <h2>
                反馈更正 <span>{corrections ? format(sum(corrections.map(item => item.value))) : '不可计算'} <small>次</small></span>
              </h2>
              {corrections ? (
                <>
                  <SegmentedBar items={corrections} replayKey={rangeKey} label="自评与选择更正来源" />
                  <DataLegend items={corrections} />
                </>
              ) : (
                <p className="data-unavailable">不可计算：更正记录存在冲突</p>
              )}
            </section>
          </div>
          <footer className="statistics-footer">
            <section aria-label="当前复习负担" className="statistics-burden">
              <span>{facts.reviewLoad.needsReconciliation ? '预计到期' : '当前到期'} <strong>{format(facts.reviewLoad.dueCount)}</strong> 词</span>
              <span>任务外 <strong>{format(facts.reviewLoad.outsideTodayTaskCount)}</strong> 词</span>
            </section>
            <div className="statistics-footer__notes">
              {hasConflict ? (
                <span className="statistics-warning">部分记录不可计算</span>
              ) : missingFeedback ? (
                <span className="statistics-warning">部分反馈缺失</span>
              ) : null}
              <details className="statistics-notes">
                <summary>数据说明</summary>
                <div>
                  <p>当前词书：{book.label}。完成学习不等于已经掌握；词书进度按唯一单词计，历史完成按词次计。</p>
                  <p>历史数据按任务日期归属，并按原有规则去重；时间筛选只影响历史完成、反馈、作答及更正。当前复习负担和词书累计进度不随时间筛选。</p>
                  <p>历史反馈完整性无法证明；没有反馈的记录不计作错误或不认识。无反馈任务 {coverage.tasksWithoutEvents} 个，旧版任务 {coverage.legacyTaskCount} 个。</p>
                  {facts.reviewLoad.needsReconciliation && <p>包含历史补齐估算；开始复习时核对历史记录。</p>}
                  {hasConflict && <p>发现冲突或资料不一致，受影响的数字标为不可计算。</p>}
                  <p>选择作答保留原记录，更正按自评与选择来源分别计数。详细对账记录可从设置中的“开发验收与维护”查看。</p>
                </div>
              </details>
            </div>
          </footer>
        </>
      )}
    </section>
  )
}
function ToggleGroup({ label, options, selected, onChange }) {
  return (
    <div className="statistics-toggle" role="group" aria-label={label}>
      {options.map(([value, text]) => (
        <button type="button" key={value} aria-pressed={selected === value} onClick={() => onChange(value)}>{text}</button>
      ))}
    </div>
  )
}
export default StatisticsPage
