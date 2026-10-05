import { useRef, useState } from 'react'

import { useLearningStore } from '../data/learning'
import { estimateDailyStudyMinutes } from '../data/learning/recommendations'
import { wordBooks } from '../data/wordBooks'
import { setupPlanStatus, synchronizeSetupDraft } from './setupDraft'
import SettingsWheel from './SettingsWheel'
import MaintenanceConfirmation from './MaintenanceConfirmation'
import './SettingsPage.css'

const FIELDS = [
  'examDate',
  'todayWordBookId',
  'dailyNewWords',
  'dailyReviewWords',
  'dailyStudyMinutes',
  'pronunciation',
  'mistakeStudyWords',
]

const NUMBER_OPTIONS = Array.from({ length: 100 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 词`,
}))

const MINUTE_OPTIONS = Array.from({ length: 48 }, (_, index) => ({
  value: (index + 1) * 5,
  label: `${(index + 1) * 5} 分钟`,
}))

function SettingsPage({ now = new Date(), onOpenMaintenance, maintenanceEntryRef }) {
  const { store, snapshot } = useLearningStore()
  const initialDraftRef = useRef(null)
  if (initialDraftRef.current === null) initialDraftRef.current = createDraft(snapshot.settings, now)

  const [draft, setDraft] = useState(initialDraftRef.current)
  const draftRef = useRef(initialDraftRef.current)
  const baselineRef = useRef(draftValue(initialDraftRef.current))
  const [showMaintenanceConfirmation, setShowMaintenanceConfirmation] = useState(false)
  const [isWheelSettling, setIsWheelSettling] = useState(false)
  const [activeField, setActiveField] = useState(null)
  const [status, setStatus] = useState('')
  const [showOverload, setShowOverload] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const wheelRefs = useRef({})
  const settlementRef = useRef({})
  const savingRef = useRef(false)

  const reportSettlement = (field, pending) => {
    settlementRef.current[field] = pending
    setIsWheelSettling(Object.values(settlementRef.current).some(Boolean))
  }

  const changeField = (field, value, columnLabel) => {
    setStatus('')
    setShowOverload(false)
    const current = draftRef.current
    const changed = field === 'examDate'
      ? { ...current, examDate: changeDateParts(current.examDate, Array.isArray(value) ? value : [{ label: columnLabel, value }]) }
      : { ...current, [field]: value }
    const next = synchronizeSetupDraft({ draft: changed, changedField: field, snapshot, now })
    draftRef.current = next
    setDraft(next)
  }

  const toggleField = (field) => {
    if (savingRef.current) return
    wheelRefs.current[activeField]?.flush()
    setActiveField(activeField === field ? null : field)
  }

  const persist = async (confirmed) => {
    const currentDraft = draftRef.current
    const currentPlanStatus = setupPlanStatus({ draft: currentDraft, snapshot, now })
    if (currentPlanStatus.invalidExamDate) {
      setStatus('请选择未来的考试日期。')
      savingRef.current = false
      setIsSaving(false)
      return
    }

    const estimatedMinutes = estimateDailyStudyMinutes(currentDraft.dailyNewWords, currentDraft.dailyReviewWords)
    if (!confirmed && estimatedMinutes > currentDraft.dailyStudyMinutes) {
      setShowOverload(true)
      savingRef.current = false
      setIsSaving(false)
      return
    }

    try {
      await store.updateSettings(Object.fromEntries(FIELDS.map((field) => [field, currentDraft[field]])))
      baselineRef.current = draftValue(currentDraft)
      setConflict(false)
      setShowOverload(false)
      setStatus('设置已保存。已开始的今日任务保持原计划。')
    } catch (error) {
      const changed = /elsewhere/.test(error.message)
      setConflict(changed)
      setStatus(changed ? '记录已在其他页面更新。重新读取会以最新已保存设置替换当前草稿，请核对后再保存。'
        : /lock unavailable/.test(error.message) ? '当前浏览器无法安全保存，请使用支持 Web Locks 的浏览器本机地址或 HTTPS 页面。'
          : '保存失败，请重试。你的修改仍保留在这里。')
    } finally {
      savingRef.current = false
      setIsSaving(false)
    }
  }

  const requestSave = (confirmed = false) => {
    if (savingRef.current) return
    wheelRefs.current[activeField]?.flush()
    savingRef.current = true
    setIsSaving(true)
    setActiveField(null)
    persist(confirmed)
  }

  const estimatedMinutes = estimateDailyStudyMinutes(draft.dailyNewWords, draft.dailyReviewWords)
  const planStatus = setupPlanStatus({ draft, snapshot, now })

  return (
    <section className="settings-page" aria-label="学习设置">
      <div className="settings-page__panel">
        {[
          { title: '学习目标', kind: 'goals', fields: ['examDate', 'todayWordBookId', 'pronunciation'] },
          { title: '每日计划', kind: 'plan', fields: ['dailyNewWords', 'dailyReviewWords', 'dailyStudyMinutes', 'mistakeStudyWords'] },
        ].map(group => (
          <section key={group.kind} className={`settings-page__group settings-page__group--${group.kind}`} aria-label={group.title}>
            <h3>{group.title}</h3>
            <div className="settings-page__fields">
              {group.fields.map(field => (
                <SettingsWheel
                  key={field}
                  ref={wheel => { wheelRefs.current[field] = wheel }}
                  {...wheelProps(field, draft, now)}
                  variant={field === 'examDate' ? 'date' : field === 'todayWordBookId' ? 'book' : group.kind === 'plan' ? 'number' : 'short'}
                  value={draft[field]}
                  disabled={isSaving}
                  isOpen={activeField === field}
                  isAnotherOpen={activeField !== null && activeField !== field}
                  onToggle={() => toggleField(field)}
                  onChange={(value, columnLabel) => changeField(field, value, columnLabel)}
                  onColumnsChange={field === 'examDate' ? changes => changeField(field, changes) : undefined}
                  onSettlingChange={pending => reportSettlement(field, pending)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {planStatus.exceedsDailyWordLimit && (
        <section className="settings-page__confirmation" role="status">
          <p>按当前日期和剩余词量，考试前可能无法完成，请调整考试日期或学习计划。</p>
        </section>
      )}

      {showOverload && (
        <section className="settings-page__confirmation" role="alert" aria-live="polite">
          <p>预计约 {estimatedMinutes} 分钟，超过你的 {draft.dailyStudyMinutes} 分钟计划。要调整吗？</p>
          <div>
            <button type="button" className="settings-page__text-button" onClick={() => setShowOverload(false)}>返回调整</button>
            <button type="button" className="settings-page__confirm-button" onClick={() => requestSave(true)}>仍然保存</button>
          </div>
        </section>
      )}

      <footer className="settings-page__footer">
        <p role="status" aria-live="polite">{status || '新设置用于之后创建的任务；今天已经开始的任务不会被改写。'}</p>
        {conflict && <button type="button" disabled={isSaving} onClick={() => {
          try {
            store.reload()
            const latest = createDraft(store.getSnapshot().settings, now)
            draftRef.current = latest
            baselineRef.current = draftValue(latest)
            setDraft(latest)
            setActiveField(null)
            setShowOverload(false)
            setConflict(false)
            setStatus('已读取最新设置，请核对后再保存。')
          } catch { setStatus('读取失败，原始记录保持不变，请检查存储权限后重试。') }
        }}>重新读取已保存设置</button>}
        <button type="button" className="settings-page__save-button" disabled={isSaving} onClick={() => requestSave(false)}>
          {isSaving ? '正在保存…' : '保存设置'}
        </button>
      </footer>
      <section className="settings-page__maintenance-entry">
        <h2>开发验收与维护</h2>
        <p>连接与检查、记录依据和本标签页的检查记录。</p>
        <button ref={maintenanceEntryRef} type="button" disabled={isSaving || isWheelSettling || !onOpenMaintenance}
          onClick={() => {
            if (draftValue(draftRef.current) !== baselineRef.current) setShowMaintenanceConfirmation(true)
            else onOpenMaintenance()
          }}>开发验收与维护</button>
      </section>
      {showMaintenanceConfirmation && <MaintenanceConfirmation title="设置尚未保存" confirmLabel="放弃修改并进入"
        onCancel={() => setShowMaintenanceConfirmation(false)}
        onConfirm={() => { setShowMaintenanceConfirmation(false); onOpenMaintenance() }}>
        <p>进入维护页面会放弃这里尚未保存的修改。已保存设置保持不变。</p>
      </MaintenanceConfirmation>}
    </section>
  )
}

function draftValue(draft) {
  return JSON.stringify(FIELDS.map(field => draft[field]))
}

function wheelProps(field, draft, now) {
  if (field === 'examDate') {
    const { year, month, day } = dateParts(draft.examDate)
    const currentYear = now.getFullYear()
    return {
      label: '考试日期',
      displayValue: `${year} 年 ${month} 月 ${day} 日`,
      columns: [
        { label: '年', value: year, options: range(Math.min(currentYear, year), Math.max(currentYear + 5, year)).map((value) => ({ value, label: `${value} 年` })) },
        { label: '月', value: month, options: range(1, 12).map((value) => ({ value, label: `${value} 月` })) },
        { label: '日', value: day, options: range(1, daysInMonth(year, month)).map((value) => ({ value, label: `${value} 日` })) },
      ],
    }
  }

  if (field === 'todayWordBookId') {
    const selected = wordBooks.find(({ id }) => id === draft.todayWordBookId) ?? wordBooks[0]
    return {
      label: '今日学习词表',
      displayValue: selected.label,
      columns: [{ label: '今日学习词表', value: selected.id, options: wordBooks.map(({ id, label }) => ({ value: id, label })) }],
    }
  }

  const countLabels = {
    dailyNewWords: '每日新词数量',
    dailyReviewWords: '每日复习数量',
    mistakeStudyWords: '错题本每日学习数量',
  }
  if (countLabels[field]) {
    return {
      label: countLabels[field],
      displayValue: `${draft[field]} 词`,
      columns: [{ label: countLabels[field], value: draft[field], options: NUMBER_OPTIONS }],
    }
  }

  if (field === 'dailyStudyMinutes') {
    return {
      label: '每日学习时长',
      displayValue: `${draft.dailyStudyMinutes} 分钟`,
      columns: [{ label: '每日学习时长', value: draft.dailyStudyMinutes, options: MINUTE_OPTIONS }],
    }
  }

  const pronunciation = draft.pronunciation === 'en-US' ? '美音' : '英音'
  return {
    label: '发音偏好',
    displayValue: pronunciation,
    columns: [{
      label: '发音偏好',
      value: draft.pronunciation,
      options: [
        { value: 'en-GB', label: '英音' },
        { value: 'en-US', label: '美音' },
      ],
    }],
  }
}

function createDraft(settings, now) {
  return {
    ...settings,
    examDate: normalizeExamDate(settings.examDate, now),
    todayWordBookId: wordBooks.some(({ id }) => id === settings.todayWordBookId) ? settings.todayWordBookId : wordBooks[0].id,
    dailyNewWords: normalizeWordCount(settings.dailyNewWords, 15),
    dailyReviewWords: normalizeWordCount(settings.dailyReviewWords, 20),
    dailyStudyMinutes: normalizeStudyMinutes(settings.dailyStudyMinutes),
    pronunciation: settings.pronunciation === 'en-US' ? 'en-US' : 'en-GB',
    mistakeStudyWords: normalizeWordCount(settings.mistakeStudyWords, 20),
  }
}

function normalizeWordCount(value, fallback) {
  if (!Number.isSafeInteger(value)) return fallback
  return Math.min(100, Math.max(1, value))
}

function normalizeStudyMinutes(value) {
  if (!Number.isSafeInteger(value)) return 30
  return Math.min(240, Math.max(5, Math.round(value / 5) * 5))
}

function normalizeExamDate(value, now) {
  if (validDateKey(value)) return value
  const date = new Date(now)
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + 90)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function validDateKey(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function changeDateParts(dateKey, changes) {
  const parts = dateParts(dateKey)
  for (const { label, value } of changes) {
    if (label === '年') parts.year = value
    if (label === '月') parts.month = value
    if (label === '日') parts.day = value
  }
  parts.day = Math.min(parts.day, daysInMonth(parts.year, parts.month))
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

function dateParts(dateKey) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return { year, month, day }
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate()
}

function range(first, last) {
  return Array.from({ length: last - first + 1 }, (_, index) => first + index)
}

function pad(value) {
  return String(value).padStart(2, '0')
}


export default SettingsPage
