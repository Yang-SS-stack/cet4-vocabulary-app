import { useEffect, useId, useRef, useState } from 'react'
import { buildLearningRecommendation } from '../data/learning/recommendations'
import { wordBooks } from '../data/wordBooks'
import SettingsWheel from './SettingsWheel'
import './LearningSetupModal.css'

const CLOSE_DURATION = 180
const SCROLL_SETTLE_DURATION = 110
const FIELD_SWITCH_DURATION = CLOSE_DURATION + 20
const MODE_FIELDS = {
  learning: ['examDate', 'todayWordBookId', 'dailyNewWords', 'dailyStudyMinutes'],
  review: ['dailyReviewWords'],
  mistakes: ['mistakeStudyWords'],
}

const MODE_COPY = {
  learning: {
    title: '开始前，先设定你的学习计划',
    description: '这些设置随时可以在“设置”页修改',
  },
  review: {
    title: '开始前，先设定你的复习计划',
    description: '先选择每天计划复习的单词数量',
  },
  mistakes: {
    title: '开始前，先设定错题本计划',
    description: '先选择每天计划学习的错题数量',
  },
}

const NUMBER_OPTIONS = Array.from({ length: 100 }, (_, index) => ({
  value: index + 1,
  label: `${index + 1} 词`,
}))
const MINUTE_OPTIONS = Array.from({ length: 48 }, (_, index) => ({
  value: (index + 1) * 5,
  label: `${(index + 1) * 5} 分钟`,
}))

function LearningSetupModal({ mode, settings, recommendation = {}, onSave, onClose }) {
  const fields = MODE_FIELDS[mode]
  if (!fields) throw new Error(`Unsupported setup mode: ${mode}`)

  const titleId = useId()
  const dialogRef = useRef(null)
  const returnFocusRef = useRef(document.activeElement)
  const closeTimerRef = useRef(null)
  const switchTimerRef = useRef(null)
  const settleTimerRef = useRef(null)
  const wheelSettlingRef = useRef(false)
  const initialDraftRef = useRef(null)
  if (initialDraftRef.current === null) initialDraftRef.current = createDraft(settings, recommendation)
  const [draft, setDraft] = useState(initialDraftRef.current)
  const draftRef = useRef(initialDraftRef.current)
  const [activeField, setActiveField] = useState(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [showOverload, setShowOverload] = useState(false)
  const [error, setError] = useState('')
  const copy = MODE_COPY[mode]

  useEffect(() => {
    const firstControl = focusableElements(dialogRef.current)[0]
    firstControl?.focus()
    return () => {
      window.clearTimeout(closeTimerRef.current)
      window.clearTimeout(switchTimerRef.current)
      window.clearTimeout(settleTimerRef.current)
    }
  }, [])

  const finishClose = () => {
    onClose()
    returnFocusRef.current?.focus?.()
  }

  const requestClose = () => {
    if (isClosing || isSaving) return
    setActiveField(null)
    setShowOverload(false)
    setIsClosing(true)
    if (prefersReducedMotion()) {
      finishClose()
      return
    }
    closeTimerRef.current = window.setTimeout(finishClose, CLOSE_DURATION)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      requestClose()
      return
    }
    if (event.key !== 'Tab') return

    const controls = focusableElements(dialogRef.current)
    if (controls.length === 0) return
    const first = controls[0]
    const last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const changeField = (field, value, columnLabel) => {
    setError('')
    setShowOverload(false)
    setDraft((current) => {
      const next = field === 'examDate'
        ? { ...current, examDate: changeDatePart(current.examDate, columnLabel, value) }
        : { ...current, [field]: value }
      draftRef.current = next
      return next
    })
  }

  const save = async ({ confirmed = false } = {}) => {
    const currentDraft = draftRef.current
    const patch = Object.fromEntries(fields.map((field) => [field, currentDraft[field]]))
    if (Object.values(patch).some((value) => value === null || value === undefined || value === '')) {
      setError('请完成所有设置后再保存。')
      setIsSaving(false)
      return
    }

    const load = calculateDraftLoad(mode, currentDraft, settings, recommendation)
    if (load.overloaded && !confirmed) {
      setShowOverload(true)
      setError('')
      setIsSaving(false)
      return
    }

    setError('')
    try {
      await onSave(patch)
      requestCloseAfterSave(onClose, returnFocusRef, closeTimerRef, setIsClosing)
    } catch {
      setError('保存失败，请重试。你的设置仍保留在这里。')
      setIsSaving(false)
    }
  }

  const requestSave = (options) => {
    if (isSaving) return
    setIsSaving(true)
    window.clearTimeout(switchTimerRef.current)
    const needsWheelSettlement = activeField !== null || wheelSettlingRef.current
    if (!needsWheelSettlement) {
      save(options)
      return
    }

    const reducedMotion = prefersReducedMotion()
    if (!reducedMotion) setActiveField(null)
    window.clearTimeout(settleTimerRef.current)
    switchTimerRef.current = window.setTimeout(() => {
      wheelSettlingRef.current = false
      if (reducedMotion) setActiveField(null)
      save(options)
    }, SCROLL_SETTLE_DURATION)
  }

  const toggleField = (field) => {
    if (isClosing || isSaving) return
    window.clearTimeout(switchTimerRef.current)
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
      if (prefersReducedMotion()) {
        switchTimerRef.current = window.setTimeout(() => setActiveField(null), SCROLL_SETTLE_DURATION)
      } else {
        setActiveField(null)
      }
      return
    }

    if (prefersReducedMotion()) {
      switchTimerRef.current = window.setTimeout(() => setActiveField(field), SCROLL_SETTLE_DURATION)
    } else {
      setActiveField(null)
      switchTimerRef.current = window.setTimeout(() => setActiveField(field), FIELD_SWITCH_DURATION)
    }
  }

  const load = calculateDraftLoad(mode, draft, settings, recommendation)

  return (
    <div className={isClosing ? 'learning-setup-backdrop is-closing' : 'learning-setup-backdrop'}>
      <div
        ref={dialogRef}
        className={isClosing ? 'learning-setup-modal is-closing' : 'learning-setup-modal'}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={isSaving || undefined}
        onKeyDown={handleKeyDown}
      >
        <header className="learning-setup-modal__header">
          <h2 id={titleId}>{copy.title}</h2>
          <p>{copy.description}</p>
        </header>

        <div className="learning-setup-modal__fields">
          {fields.map((field) => (
            <FieldWheel
              key={field}
              field={field}
              draft={draft}
              isOpen={activeField === field}
              onToggle={() => toggleField(field)}
              onChange={(value, columnLabel) => changeField(field, value, columnLabel)}
            />
          ))}
        </div>

        {showOverload && (
          <section className="learning-setup-modal__confirmation" role="alert" aria-live="polite">
            <p>预计约 {load.estimatedMinutes} 分钟，超过你的 {load.dailyStudyMinutes} 分钟计划。要调整吗？</p>
            <div className="learning-setup-modal__confirmation-actions">
              <button type="button" className="learning-setup-modal__text-button" onClick={() => setShowOverload(false)}>返回调整</button>
              <button type="button" className="learning-setup-modal__confirm-button" onClick={() => requestSave({ confirmed: true })}>仍然保存</button>
            </div>
          </section>
        )}

        <p className="learning-setup-modal__status" role="status" aria-live="polite">{error}</p>

        <footer className="learning-setup-modal__footer">
          <button type="button" className="learning-setup-modal__text-button" disabled={isSaving} onClick={requestClose}>暂不开始</button>
          <button type="button" className="learning-setup-modal__save-button" disabled={isSaving} onClick={() => requestSave()}>
            {isSaving ? '正在保存…' : '保存并继续'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function FieldWheel({ field, draft, isOpen, onToggle, onChange }) {
  const props = wheelProps(field, draft)
  return <SettingsWheel {...props} value={draft[field]} isOpen={isOpen} onToggle={onToggle} onChange={onChange} />
}

function wheelProps(field, draft) {
  if (field === 'examDate') {
    const { year, month, day } = dateParts(draft.examDate)
    const currentYear = new Date().getFullYear()
    const firstYear = Math.min(currentYear, year)
    const lastYear = Math.max(currentYear + 5, year)
    return {
      label: '考试日期',
      displayValue: `${year} 年 ${month} 月 ${day} 日`,
      columns: [
        { label: '年', value: year, options: range(firstYear, lastYear).map((value) => ({ value, label: `${value} 年` })) },
        { label: '月', value: month, options: range(1, 12).map((value) => ({ value, label: `${value} 月` })) },
        { label: '日', value: day, options: range(1, daysInMonth(year, month)).map((value) => ({ value, label: `${value} 日` })) },
      ],
    }
  }
  if (field === 'todayWordBookId') {
    const selected = wordBooks.find((book) => book.id === draft[field]) ?? wordBooks[0]
    return {
      label: '学习词表',
      displayValue: selected.label,
      columns: [{ label: '学习词表', value: selected.id, options: wordBooks.map(({ id, label }) => ({ value: id, label })) }],
    }
  }

  const numberFields = {
    dailyNewWords: '每日新词',
    dailyReviewWords: '每日复习数量',
    mistakeStudyWords: '错题本每日学习数量',
  }
  if (numberFields[field]) {
    return {
      label: numberFields[field],
      displayValue: `${draft[field]} 词`,
      columns: [{ label: numberFields[field], value: draft[field], options: NUMBER_OPTIONS }],
    }
  }
  return {
    label: '每日学习时长',
    displayValue: `${draft.dailyStudyMinutes} 分钟`,
    columns: [{ label: '每日学习时长', value: draft.dailyStudyMinutes, options: MINUTE_OPTIONS }],
  }
}

function createDraft(settings, recommendation) {
  return {
    ...settings,
    examDate: settings.examDate ?? futureDateKey(90),
    todayWordBookId: settings.todayWordBookId ?? wordBooks[0].id,
    dailyNewWords: settings.dailyNewWords ?? boundedWordCount(recommendation.deadlineDailyWords, 15),
    dailyReviewWords: settings.dailyReviewWords ?? boundedWordCount(recommendation.dailyReviewWords, 20),
    dailyStudyMinutes: settings.dailyStudyMinutes ?? 30,
    mistakeStudyWords: settings.mistakeStudyWords ?? 20,
  }
}

function calculateDraftLoad(mode, draft, settings, recommendation) {
  const dailyNewWords = mode === 'learning' ? draft.dailyNewWords : settings.dailyNewWords ?? 0
  const dailyReviewWords = mode === 'review'
    ? draft.dailyReviewWords
    : recommendation.dailyReviewWords ?? settings.dailyReviewWords ?? 0
  const dailyStudyMinutes = mode === 'learning' ? draft.dailyStudyMinutes : settings.dailyStudyMinutes ?? 0
  const result = buildLearningRecommendation({
    totalWords: recommendation.totalWords ?? 0,
    completedWords: recommendation.completedWords ?? 0,
    daysRemaining: recommendation.daysRemaining ?? null,
    dailyNewWords,
    dailyReviewWords,
    dailyStudyMinutes,
  })
  return { ...result, dailyStudyMinutes }
}

function requestCloseAfterSave(onClose, returnFocusRef, closeTimerRef, setIsClosing) {
  setIsClosing(true)
  const finish = () => {
    onClose()
    returnFocusRef.current?.focus?.()
  }
  if (prefersReducedMotion()) {
    finish()
    return
  }
  closeTimerRef.current = window.setTimeout(finish, CLOSE_DURATION)
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

function futureDateKey(daysAhead) {
  const date = new Date()
  date.setHours(12, 0, 0, 0)
  date.setDate(date.getDate() + daysAhead)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function boundedWordCount(value, fallback) {
  return Number.isSafeInteger(value) && value > 0 ? Math.min(100, value) : fallback
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

function focusableElements(root) {
  if (!root) return []
  return [...root.querySelectorAll('button:not(:disabled), [href], input:not(:disabled), [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.closest('[inert], [aria-hidden="true"]'))
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default LearningSetupModal
