import { forwardRef, useEffect, useId, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import './SettingsWheel.css'

const OPTION_HEIGHT = 48
const WHEEL_STEP_DELTA = 48
const CLOSE_DURATION = 220

const WheelColumn = forwardRef(function WheelColumn({ label, value, options, active, disabled, onChange, onSettlingChange }, ref) {
  const labelId = useId()
  const listRef = useRef(null)
  const optionRefs = useRef([])
  const scrollTimer = useRef(null)
  const pendingScrollRef = useRef(false)
  const animationRef = useRef(null)
  const initializedRef = useRef(false)
  const selectedIndex = Math.max(0, options.findIndex(option => Object.is(option.value, value)))
  const selectedIndexRef = useRef(selectedIndex)
  const programmaticTopRef = useRef(null)
  const wheelDeltaRef = useRef(0)
  const callbacksRef = useRef({ onChange, onSettlingChange, options, label, disabled, active })
  callbacksRef.current = { onChange, onSettlingChange, options, label, disabled, active }
  selectedIndexRef.current = selectedIndex

  const stopAnimation = () => {
    if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current)
    animationRef.current = null
  }

  const position = top => {
    programmaticTopRef.current = top
    if (listRef.current) listRef.current.scrollTop = top
  }

  const animateTo = target => {
    stopAnimation()
    const list = listRef.current
    if (!list) return
    if (prefersReducedMotion() || document.hidden || !callbacksRef.current.active || callbacksRef.current.disabled) {
      position(target)
      return
    }
    const startTop = list.scrollTop
    if (Math.abs(startTop - target) < 0.5) { position(target); return }
    let startTime
    const tick = time => {
      startTime ??= time
      const progress = Math.min(1, (time - startTime) / 180)
      position(startTop + (target - startTop) * (1 - (1 - progress) ** 3))
      if (progress < 1) animationRef.current = window.requestAnimationFrame(tick)
      else { animationRef.current = null; position(target) }
    }
    animationRef.current = window.requestAnimationFrame(tick)
  }

  const takePendingSelection = () => {
    if (!pendingScrollRef.current || !listRef.current) return null
    window.clearTimeout(scrollTimer.current)
    const current = callbacksRef.current
    pendingScrollRef.current = false
    const index = Math.min(current.options.length - 1, Math.max(0, Math.round(listRef.current.scrollTop / OPTION_HEIGHT)))
    const changed = index !== selectedIndexRef.current
    selectedIndexRef.current = index
    animateTo(index * OPTION_HEIGHT)
    current.onSettlingChange?.(false)
    return changed ? { value: current.options[index].value, label: current.label } : null
  }

  const finishScroll = () => {
    const selection = takePendingSelection()
    if (selection) callbacksRef.current.onChange(selection.value, selection.label)
  }

  const flush = () => {
    finishScroll()
    stopAnimation()
    position(selectedIndexRef.current * OPTION_HEIGHT)
  }
  useImperativeHandle(ref, () => ({ flush, takePendingSelection }))

  useLayoutEffect(() => {
    stopAnimation()
    const list = listRef.current
    if (!list) return undefined
    if (!active || disabled) { flush(); return undefined }
    const target = selectedIndex * OPTION_HEIGHT
    if (!initializedRef.current || prefersReducedMotion() || document.hidden) {
      initializedRef.current = true
      position(target)
      return undefined
    }
    animateTo(target)
    return stopAnimation
  }, [selectedIndex, active, disabled])

  useLayoutEffect(() => {
    if (!active || disabled) flush()
  }, [active, disabled])

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const finishWhenHidden = () => { if (document.hidden) flush() }
    const finishWhenReduced = () => { if (media?.matches) flush() }
    document.addEventListener('visibilitychange', finishWhenHidden)
    media?.addEventListener?.('change', finishWhenReduced)
    return () => {
      document.removeEventListener('visibilitychange', finishWhenHidden)
      media?.removeEventListener?.('change', finishWhenReduced)
      window.clearTimeout(scrollTimer.current)
      stopAnimation()
      callbacksRef.current.onSettlingChange?.(false)
    }
  }, [])

  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined
    const handleWheel = event => {
      if (event.deltaY === 0) return
      event.preventDefault()
      const current = callbacksRef.current
      if (current.disabled || !current.active) return
      finishScroll()
      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 180 : 1
      wheelDeltaRef.current += event.deltaY * deltaScale
      if (Math.abs(wheelDeltaRef.current) < WHEEL_STEP_DELTA) return
      const direction = Math.sign(wheelDeltaRef.current)
      wheelDeltaRef.current = 0
      const nextIndex = Math.min(current.options.length - 1, Math.max(0, selectedIndexRef.current + direction))
      if (nextIndex === selectedIndexRef.current) return
      selectedIndexRef.current = nextIndex
      current.onChange(current.options[nextIndex].value, current.label)
    }
    list.addEventListener('wheel', handleWheel, { passive: false })
    return () => list.removeEventListener('wheel', handleWheel)
  }, [])

  const selectOption = (option, index) => {
    if (disabled || !active) return
    window.clearTimeout(scrollTimer.current)
    pendingScrollRef.current = false
    onSettlingChange?.(false)
    wheelDeltaRef.current = 0
    selectedIndexRef.current = index
    animateTo(index * OPTION_HEIGHT)
    onChange(option.value, label)
    optionRefs.current[index]?.focus({ preventScroll: true })
  }

  const handleKeyDown = (event, index) => {
    const nextIndex = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: options.length - 1 }[event.key]
    if (nextIndex === undefined) return
    event.preventDefault()
    const boundedIndex = Math.min(options.length - 1, Math.max(0, nextIndex))
    selectOption(options[boundedIndex], boundedIndex)
  }

  const handleScroll = event => {
    const scrollTop = event.currentTarget.scrollTop
    if (programmaticTopRef.current !== null && Math.abs(scrollTop - programmaticTopRef.current) < 1) {
      if (pendingScrollRef.current) {
        pendingScrollRef.current = false
        window.clearTimeout(scrollTimer.current)
        onSettlingChange?.(false)
      }
      return
    }
    if (disabled || !active) return
    stopAnimation()
    window.clearTimeout(scrollTimer.current)
    wheelDeltaRef.current = 0
    pendingScrollRef.current = true
    onSettlingChange?.(true)
    scrollTimer.current = window.setTimeout(finishScroll, 100)
  }

  return (
    <div className="settings-wheel__column">
      <span id={labelId} className="settings-wheel__column-label">{label}</span>
      <div ref={listRef} className="settings-wheel__options" role="listbox" aria-labelledby={labelId} aria-disabled={disabled || undefined}
        onScroll={handleScroll} onPointerDown={() => { if (!disabled && active) { stopAnimation(); programmaticTopRef.current = null } }}>
        {options.map((option, index) => (
          <button key={String(option.value)} ref={element => { optionRefs.current[index] = element }} type="button"
            className="settings-wheel__option" role="option" aria-selected={Object.is(option.value, value)}
            disabled={disabled || !active} tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => selectOption(option, index)} onKeyDown={event => handleKeyDown(event, index)}>
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
})

const SettingsWheel = forwardRef(function SettingsWheel({ label, value, displayValue, variant = 'number', disabled = false, isOpen, isAnotherOpen = false, onToggle, onChange, onColumnsChange, onSettlingChange, columns }, ref) {
  const [isTrayMounted, setIsTrayMounted] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const columnRefs = useRef({})
  const columnSettlementRef = useRef({})
  const reportSettlement = (label, pending) => {
    columnSettlementRef.current[label] = pending
    onSettlingChange?.(Object.values(columnSettlementRef.current).some(Boolean))
  }
  const takePendingColumns = () => {
    // Capture every offset before a callback can change another column's range.
    return columns
      .map(column => columnRefs.current[column.label]?.takePendingSelection()).filter(Boolean)
  }
  const commitColumns = changes => {
    if (!changes.length) return
    if (onColumnsChange) onColumnsChange(changes)
    else changes.forEach(selection => onChange(selection.value, selection.label))
  }
  const changeColumn = (value, columnLabel) => {
    commitColumns([...takePendingColumns(), { value, label: columnLabel }])
  }
  useImperativeHandle(ref, () => ({ flush: () => {
    commitColumns(takePendingColumns())
    Object.values(columnRefs.current).forEach(column => column?.flush())
  } }))

  useLayoutEffect(() => {
    if (isOpen) { setIsTrayMounted(true); setIsClosing(false); return undefined }
    if (!isTrayMounted) return undefined
    if (prefersReducedMotion() || isAnotherOpen) {
      setIsTrayMounted(false); setIsClosing(false); return undefined
    }
    setIsClosing(true)
    const closeTimer = window.setTimeout(() => { setIsTrayMounted(false); setIsClosing(false) }, CLOSE_DURATION)
    return () => window.clearTimeout(closeTimer)
  }, [isOpen, isTrayMounted, isAnotherOpen])

  const shortLabel = { '今日学习词表': '学习词书', '每日新词数量': '每日新词', '每日复习数量': '每日复习', '错题本每日学习数量': '错题本每日学习' }[label] ?? label
  const numeric = variant === 'number' ? /^(\d+)\s(.+)$/.exec(displayValue) : null
  return (
    <section className={`settings-wheel settings-wheel--${variant}`} data-value={String(value)} data-open={isOpen}>
      <div className="settings-wheel__surface">
        <button type="button" className="settings-wheel__summary" aria-label={`${label} ${displayValue}`} aria-expanded={isOpen} disabled={disabled} onClick={onToggle}>
          <span className="settings-wheel__label">{shortLabel}</span>
          <strong>{variant !== 'number' && <SettingsIcon name={variant === 'date' ? 'calendar' : variant === 'book' ? 'book' : 'headphones'} />}{numeric ? <>{numeric[1]} <small>{numeric[2]}</small></> : displayValue}</strong>
          <span className="settings-wheel__chevron" aria-hidden="true" />
        </button>
        {isTrayMounted && (isOpen || !isAnotherOpen) && (
          <div className={isClosing ? 'settings-wheel__tray is-closing' : 'settings-wheel__tray'} aria-hidden={isClosing || undefined} inert={isClosing || undefined}>
            {columns.map(column => <WheelColumn key={column.label} ref={instance => { columnRefs.current[column.label] = instance }} {...column}
              active={isOpen} disabled={disabled} onChange={changeColumn} onSettlingChange={pending => reportSettlement(column.label, pending)} />)}
          </div>
        )}
      </div>
    </section>
  )
})

export function SettingsIcon({ name }) {
  const paths = {
    calendar: 'M8 3v4m8-4v4M4 10h16M5 5h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
    book: 'M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1m0-15c3-2 6-2 9-1v15c-3-1-6-1-9 1V5',
    headphones: 'M4 15v-3a8 8 0 0 1 16 0v3M4 13H3v7h4v-7H4Zm16 0h1v7h-4v-7h3Z',
    wrench: 'M14 6a5 5 0 0 0-6 6L3 17a2.8 2.8 0 0 0 4 4l5-5a5 5 0 0 0 6-6l-3 3-4-4 3-3Z',
    arrow: 'M4 12h15m-6-6 6 6-6 6',
  }
  return <svg className="settings-icon" viewBox="0 0 24 24" aria-hidden="true"><path d={paths[name]} /></svg>
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default SettingsWheel
