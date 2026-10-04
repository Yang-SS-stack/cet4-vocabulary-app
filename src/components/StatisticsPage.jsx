import { useLearningFacts } from '../data/assistant/react'
import { LearningFactsSummary } from './LearningFactsPanel'
import './StatisticsPage.css'

export default function StatisticsPage({ now }) {
  const { facts, error } = useLearningFacts({ now })
  return <section className="learning-statistics" aria-label="学习统计">
    <p className="learning-statistics__intro">查看当前词书的已有汇总。今日与近 7 天按任务日期归属；到期与积压反映当前负担。</p>
    <LearningFactsSummary facts={facts} error={error} />
    <p className="learning-statistics__note">详细对账记录可从设置中的“开发验收与维护”查看。</p>
  </section>
}
