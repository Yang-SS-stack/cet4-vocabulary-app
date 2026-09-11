import { useEffect, useRef, useState } from 'react'

import { useLearningStore } from '../data/learning'
import { wordBooks } from '../data/wordBooks'
import SettingsWheel from './SettingsWheel'
import './SettingsPage.css'

const CLOSE_DURATION = 180
const FIELD_SWITCH_DURATION = CLOSE_DURATION + 20
const SCROLL_SETTLE_DURATION = 110

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

function SettingsPage() {
  const { store, snapshot } = useLearningStore()
  const initialDraftRef = useRef(null)
  if (initialDraftRef.current === null) initialDraftRef.current = createDraft(snapshot.settings)

  const [draft, setDraft] = useState(initialDraftRef.current)
  const draftRef = useRef(initialDraftRef.current)
  const [activeField, setActiveField] = useState(null)
  const [status, setStatus] = useState('')
  const [showOverload, setShowOverload] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const switchTimerRef = useRef(null)
  const settleTimerRef = useRef(null)
  const wheelSettlingRef = useRef(false)
  const isSwitchingRef = useRef(false)

  useEffect(() => () => {
    window.clearTimeout(switchTimerRef.current)
    window.clearTimeout(settleTimerRef.current)
  }, [])

  const changeField = (field, value, columnLabel) => {
    setStatus('')
    setShowOverload(false)
    setDraft((current) => {
      const next = field === 'examDate'
        ? { ...current, examDate: changeDatePart(current.examDate, columnLabel, value) }
        : { ...current, [field]: value }
      draftRef.current = next
      return next
    })
  }

  const toggleField = (field) => {
    if (isSaving) return
    window.clearTimeout(switchTimerRef.current)

    if (isSwitchingRef.current) {
      scheduleFieldOpen(field, switchTimerRef, isSwitchingRef, setActiveField)
      return
    }

    if (activeField === null) {
      setActiveField(field)
      return
    }

    wheelSettlingRef.current = true
    window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => {
      wheelSettlingRef.current = false
    }, SCROLL_SETTLE_DURATION)

    if (activeField === field) {
      setActiveField(null)
      scheduleFieldOpen(null, switchTimerRef, isSwitchingRef, setActiveField)
      return
    }

    setActiveField(null)
    scheduleFieldOpen(field, switchTimerRef, isSwitchingRef, setActiveField)
  }

  const persist = (confirmed) => {
    const currentDraft = draftRef.current
    const estimatedMinutes = currentDraft.dailyNewWords * 3 + currentDraft.dailyReviewWords
    if (!confirmed && estimatedMinutes > currentDraft.dailyStudyMinutes) {
      setShowOverload(true)
      setIsSaving(false)
      return
    }

    try {
      store.updateSettings(Object.fromEntries(FIELDS.map((field) => [field, currentDraft[field]])))
      setShowOverload(false)
      setStatus('设置已保存。已开始的今日任务保持原计划。')
    } catch {
      setStatus('保存失败，请重试。你的修改仍保留在这里。')
    } finally {
      setIsSaving(false)
    }
  }

  const requestSave = (confirmed = false) => {
    if (isSaving) return
    setIsSaving(true)
    const wasSwitching = isSwitchingRef.current
    window.clearTimeout(switchTimerRef.current)
    isSwitchingRef.current = false
    const needsSettlement = activeField !== null || wheelSettlingRef.current || wasSwitching
    if (!needsSettlement) {
      persist(confirmed)
      return
    }

    setActiveField(null)
    window.clearTimeout(settleTimerRef.current)
    settleTimerRef.current = window.setTimeout(() => {
      wheelSettlingRef.current = false
      persist(confirmed)
    }, SCROLL_SETTLE_DURATION)
  }

  const estimatedMinutes = draft.dailyNewWords * 3 + draft.dailyReviewWords

  return (
    <section className="settings-page" aria-label="学习设置">
      <header className="settings-page__header">
        <h2>调整学习计划</h2>
        <p>新的设置用于之后创建的任务；今天已经开始的任务不会被改写。</p>
      </header>

      <div className="settings-page__panel">
        {FIELDS.map((field) => {
          const props = wheelProps(field, draft)
          return (
            <SettingsWheel
              key={field}
              {...props}
              value={draft[field]}
              isOpen={activeField === field}
              onToggle={() => toggleField(field)}
              onChange={(value, columnLabel) => changeField(field, value, columnLabel)}
            />
          )
        })}
      </div>

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
        <p role="status" aria-live="polite">{status}</p>
        <button type="button" className="settings-page__save-button" disabled={isSaving} onClick={() => requestSave(false)}>
          {isSaving ? '正在保存…' : '保存设置'}
        </button>
      </footer>
    </section>
  )
}

function wheelProps(field, draft) {
  if (field === 'examDate') {
    const { year, month, day } = dateParts(draft.examDate)
    const currentYear = new Date().getFullYear()
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

function createDraft(settings) {
  return {
    ...settings,
    examDate: normalizeExamDate(settings.examDate),
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

function normalizeExamDate(value) {
  if (validDateKey(value)) return value
  const date = new Date()
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

function changeDatePart(dateKey, label, value) {
  const parts = dateParts(dateKey)
  if (label === '年') parts.year = value
  if (label === '月') parts.month = value
  if (label === '日') parts.day = value
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

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

function scheduleFieldOpen(field, timerRef, switchingRef, setActiveField) {
  switchingRef.current = true
  const delay = prefersReducedMotion() ? SCROLL_SETTLE_DURATION : FIELD_SWITCH_DURATION
  timerRef.current = window.setTimeout(() => {
    switchingRef.current = false
    setActiveField(field)
  }, delay)
}

export default SettingsPage
