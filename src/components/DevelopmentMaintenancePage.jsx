import { useId, useRef, useState } from 'react'
import { useAssistant, useLearningFacts } from '../data/assistant/react'
import { diagnosticErrorMessage, formatDiagnosticReport } from '../data/assistant/diagnostics'
import { getBuildInfo } from '../data/buildInfo'
import { LearningFactsEvidence } from './LearningFactsPanel'
import LocalBackendCheckPanel from './LocalBackendCheckPanel'
import MaintenanceConfirmation from './MaintenanceConfirmation'
import './DevelopmentMaintenancePage.css'

const views = [['checks', '连接与检查'], ['evidence', '记录依据'], ['history', '检查记录']]
const projects = [['connect', '连接本机'], ['real', '当前摘要'], ['illegal', '非法示例']]
const kindLabels = { connect: '连接本机', real: '当前摘要', illegal: '非法示例' }
const outcomeLabels = { success: '当时通过', 'expected-rejection': '按预期拒绝', failure: '未通过', cancelled: '已取消', invalidated: '已失效' }
const basisLabels = { current: '依据仍适用', stale: '依据已变化', 'not-applicable': '不适用学习依据' }
const summaryLabels = { 'not-checked': '尚未检查', checking: '检查中', passed: '检查通过', failed: '检查失败', stale: '依据已变化，请重新检查', cancelled: '检查已取消', expired: '会话已过期，请重新连接' }
const value = item => item === null || item === undefined ? '未取得' : String(item)

export default function DevelopmentMaintenancePage({ onReturnSettings, onReturnToday }) {
  const assistant = useAssistant()
  const { facts, error } = useLearningFacts()
  const [view, setView] = useState('checks')
  const [project, setProject] = useState(() => assistant.activeOperationKind ?? (assistant.connected ? 'real' : 'connect'))
  const [selection, setSelection] = useState(null)
  const [reportPreview, setReportPreview] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [generatedAt, setGeneratedAt] = useState(null)
  const [confirmClear, setConfirmClear] = useState(false)
  const buildInfo = getBuildInfo()
  const records = assistant.diagnostics
  const selectedRecord = records.find(record => record.operationId === selection)
  // Generate from the latest safe row: a later invalidation must appear in a copied report.
  const report = reportPreview === 'demo'
    ? `演示报告（未执行请求）\n这份示例没有对应检查记录，不表示连接或摘要检查通过。\n${formatDiagnosticReport({}, { buildInfo, generatedAt })}`
    : selectedRecord && reportPreview === selection
      ? formatDiagnosticReport(selectedRecord, { buildInfo, generatedAt }) : null

  const preview = record => {
    setSelection(record.operationId)
    setReportPreview(record.operationId)
    setCopyStatus('')
    setGeneratedAt(new Date().toISOString())
  }
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw Error('Clipboard unavailable')
      await navigator.clipboard.writeText(report)
      setCopyStatus('已复制这份诊断报告。')
    } catch { setCopyStatus('复制未完成，请选择下方文本手动复制。') }
  }

  return <section className="development-maintenance" aria-label="开发验收与维护内容">
    <div className="development-maintenance__return">
      <button type="button" onClick={onReturnSettings}>返回设置</button>
      <button type="button" onClick={onReturnToday}>返回今日学习</button>
    </div>
    <section className="development-maintenance__overview" aria-label="当前状态">
      <div><h2>当前状态</h2>
        <p>连接：{assistant.connected ? '已建立临时会话' : '未连接'}</p>
        <p>临时会话不代表服务此刻仍在线；只有你主动检查时才验证。</p>
        <p aria-live="polite">当前摘要：{summaryLabels[assistant.summaryStatus] ?? '尚未检查'}{assistant.checkedAt && ` · ${assistant.checkedAt}`}</p>
      </div>
      <dl aria-label="版本信息">
        <div><dt>分支</dt><dd>{value(buildInfo.branch)}</dd></div>
        <div><dt>提交</dt><dd>{value(buildInfo.commit)}</dd></div>
        <div><dt>构建时间</dt><dd>{value(buildInfo.builtAt)}</dd></div>
        <div><dt>未提交改动</dt><dd>{buildInfo.dirty === null ? '未取得' : buildInfo.dirty ? '有' : '无'}</dd></div>
      </dl>
    </section>
    <ChoiceTabs items={views} selected={view} onChange={next => { setView(next); setCopyStatus('') }} label="维护页面视图">
      {view === 'checks' ? <div>
        <h2>连接与检查</h2>
        <p>先选项目，再手动执行。切换项目不会发送请求。</p>
        <ChoiceTabs items={projects} selected={project} onChange={setProject} label="检查项目" busy={assistant.busy}>
          <LocalBackendCheckPanel project={project} expanded />
        </ChoiceTabs>
      </div> : view === 'evidence' ? <div>
        <p>这里查看学习记录的对账明细；学习汇总在“统计”中。</p>
        <LearningFactsEvidence facts={facts} error={error} />
      </div> : <div>
        <h2>检查记录</h2>
        <p>本标签页内保留最近 20 条，刷新或关闭后清除。当时通过不代表当前摘要通过。</p>
        {records.length === 0 ? <div>
          <p>本标签页还没有检查记录。</p>
          <button type="button" onClick={() => { setSelection(null); setReportPreview('demo'); setCopyStatus(''); setGeneratedAt(new Date().toISOString()) }}>预览演示报告</button>
        </div> : <>
          <ol className="development-maintenance__records" aria-label="最近检查记录">
            {records.map(record => <li key={record.operationId}>
              <div><h3>{kindLabels[record.kind] ?? '未知项目'} · {outcomeLabels[record.outcome] ?? '未取得结果'}</h3>
                <p>{value(record.finishedAt)} · {value(record.durationMs)} 毫秒</p>
                <p>{basisLabels[record.basisState] ?? '未取得适用性'}</p>
                {record.errorCode && <p>{diagnosticErrorMessage(record.errorCode)}</p>}
              </div>
              <button type="button" aria-pressed={selection === record.operationId} onClick={() => preview(record)}>预览记录 {record.operationId}</button>
            </li>)}
          </ol>
          <button type="button" onClick={() => setConfirmClear(true)}>清空检查记录</button>
        </>}
        {report && <section className="development-maintenance__report" aria-label="诊断报告">
          <h3>{reportPreview === 'demo' ? '演示报告，未执行请求' : '诊断报告预览'}</h3>
          <p>报告只含检查结果与公共版本信息；复制前请核对下方预览。</p>
          <textarea readOnly aria-label="诊断报告预览" value={report} rows={16} spellCheck={false} />
          <button type="button" onClick={copy}>复制这份报告</button>
          <p role="status" aria-live="polite">{copyStatus}</p>
        </section>}
      </div>}
    </ChoiceTabs>
    {confirmClear && <MaintenanceConfirmation title="清空检查记录？" confirmLabel="确认清空"
      onCancel={() => setConfirmClear(false)} onConfirm={() => {
        assistant.clearDiagnostics()
        setSelection(null); setReportPreview(null); setCopyStatus(''); setConfirmClear(false)
      }}><p>只清除本标签页的检查历史。连接、当前检查结论和学习记录保持不变。</p></MaintenanceConfirmation>}
  </section>
}

function ChoiceTabs({ items, selected, onChange, label, busy = false, children }) {
  const id = useId()
  const refs = useRef([])
  const change = index => { if (busy) return; onChange(items[index][0]); refs.current[index]?.focus() }
  return <div className="development-maintenance__view">
    <div className="development-maintenance__tabs" role="tablist" aria-label={label}>
      {items.map(([key, title], index) => <button key={key} ref={element => { refs.current[index] = element }}
        type="button" role="tab" id={`${id}-${key}`} aria-controls={`${id}-panel`} aria-selected={key === selected}
        disabled={busy && key !== selected} tabIndex={key === selected ? 0 : -1} onClick={() => onChange(key)}
        onKeyDown={event => {
          const target = event.key === 'ArrowRight' ? (index + 1) % items.length : event.key === 'ArrowLeft'
            ? (index + items.length - 1) % items.length : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : null
          if (target !== null) { event.preventDefault(); change(target) }
        }}>{title}</button>)}
    </div>
    <section id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${selected}`}>{children}</section>
  </div>
}
