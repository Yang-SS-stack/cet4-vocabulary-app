import { DataReveal } from './DataMotion'
import './DataCharts.css'
const format = value => new Intl.NumberFormat('zh-CN').format(value)
const valid = values => values.every(value => Number.isSafeInteger(value) && value >= 0)
export function DataLegend({ items, percentages = false, className = '' }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  return <ul className={`data-legend ${className}`}>{items.map(item => <li key={item.label}><i aria-hidden="true" style={{ background: item.color }} /><span>{item.label} {format(item.value)}{percentages ? `（${total ? Math.round(item.value / total * 1000) / 10 : 0}%）` : ''}</span></li>)}</ul>
}
export function SegmentedBar({ items, replayKey, label, total: suppliedTotal }) {
  const values = items.map(item => item.value)
  if (!valid(values)) return <p className="data-unavailable">不可计算：记录存在冲突</p>
  const total = suppliedTotal ?? values.reduce((sum, value) => sum + value, 0)
  return <div className="data-bar" role="img" aria-label={label}><DataReveal replayKey={replayKey} dataKey={values.join(',')} enabled={total > 0 && values.some(Boolean)} className="data-bar__segments">{items.map(item => <span key={item.label} style={{ width: `${total ? item.value / total * 100 : 0}%`, background: item.color }} />)}</DataReveal></div>
}
export function FeedbackDonut({ items, replayKey }) {
  const total = items.reduce((sum, item) => sum + item.value, 0)
  let offset = 0
  return <div className="feedback-donut"><DataReveal replayKey={replayKey} dataKey={items.map(item => item.value).join(',')} enabled={total > 0}><svg viewBox="0 0 200 200" aria-hidden="true"><circle className="feedback-donut__track" cx="100" cy="100" r="77" />{items.map(item => {
    const length = total ? item.value / total * 100 : 0
    const circle = <circle key={item.label} cx="100" cy="100" r="77" pathLength="100" fill="none" stroke={item.color} strokeWidth="36" strokeDasharray={`${length} ${100 - length}`} strokeDashoffset={-offset} transform="rotate(-90 100 100)" />
    offset += length
    return length > 0 ? circle : null
  })}</svg></DataReveal><div className="feedback-donut__total"><strong>{format(total)}</strong><span>次反馈</span></div></div>
}
export function CompletionChart({ buckets, granularity, replayKey, colors }) {
  const title = { day: '每日完成', week: '每周完成', month: '每月完成' }[granularity]
  const keys = ['learningWords', 'extraLearningWords', 'reviewWords']
  const sound = buckets.every(bucket => valid(keys.map(key => bucket.completions[key])))
  const maximum = sound ? Math.max(0, ...buckets.map(bucket => keys.reduce((sum, key) => sum + bucket.completions[key], 0))) : 0
  const ceiling = Math.max(4, Math.ceil(maximum / 4) * 4)
  const step = 600 / Math.max(1, buckets.length)
  return <section className="completion-chart" aria-label={title}>
    <header className="statistics-section-heading"><h2>{title}</h2><div className="chart-key">{['新词', '额外', '复习'].map((label, i) => <span key={label}><i style={{ background: colors[i] }} />{label}</span>)}</div></header>
    {!sound ? <p className="data-unavailable">不可计算：记录存在冲突</p> : maximum === 0 ? <div className="chart-empty">这段时间尚无完成记录</div> : <>
      <div className="completion-chart__axis-unit">词次</div>
      <div className="completion-chart__plot"><svg className="completion-chart__grid" viewBox="0 0 660 244" preserveAspectRatio="none" aria-hidden="true">{[0, 1, 2, 3, 4].map(tick => <g key={tick}><line x1="42" x2="656" y1={12 + tick * 51} y2={12 + tick * 51} /><text x="32" y={16 + tick * 51} textAnchor="end">{ceiling * (4 - tick) / 4}</text></g>)}</svg>
      <DataReveal replayKey={replayKey} dataKey={JSON.stringify(buckets)} direction="vertical" className="completion-chart__bars"><svg viewBox="0 0 600 204" preserveAspectRatio="none" aria-hidden="true">{buckets.map((bucket, index) => {
        let y = 204
        return <g key={bucket.fromDate}>{keys.map((key, kind) => { const height = bucket.completions[key] / ceiling * 204; y -= height; return <rect key={key} x={index * step + step * .14} y={y} width={step * .72} height={height} fill={colors[kind]} /> })}</g>
      })}</svg></DataReveal></div>
      <div className="completion-chart__dates"><span>{buckets[0].fromDate}</span><span>{buckets.at(-1).toDate}</span></div>
    </>}
    <details className="chart-values"><summary>查看完成明细</summary><div className="chart-values__scroll"><table><caption>{title}，按任务日期归属</caption><thead><tr><th>日期</th><th>固定新词</th><th>额外学习</th><th>复习</th></tr></thead><tbody>{buckets.map(bucket => <tr key={bucket.fromDate}><th>{bucket.label}</th>{keys.map(key => <td key={key}>{bucket.completions[key] === null ? '不可计算' : format(bucket.completions[key])}</td>)}</tr>)}</tbody></table></div></details>
  </section>
}
