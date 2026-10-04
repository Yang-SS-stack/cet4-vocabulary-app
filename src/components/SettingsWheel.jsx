import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import './SettingsWheel.css'

const OPTION_HEIGHT = 48
const WHEEL_STEP_DELTA = 48
const CLOSE_DURATION = 220

function WheelColumn({ label, value, options, onChange, onSettlingChange }) {
  const labelId = useId()
  const listRef = useRef(null)
  const optionRefs = useRef([])
  const scrollTimer = useRef(null)
  const selectedIndex = Math.max(0, options.findIndex((option) => Object.is(option.value, value)))
  const selectedIndexRef = useRef(selectedIndex)
  const programmaticTopRef = useRef(null)
  const wheelDeltaRef = useRef(0)
  const settlingCallbackRef = useRef(onSettlingChange)
  settlingCallbackRef.current = onSettlingChange
  selectedIndexRef.current = selectedIndex

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list) return
    const target = selectedIndex * OPTION_HEIGHT
    programmaticTopRef.current = target
    list.scrollTop = target
  }, [selectedIndex])

  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined
    const handleWheel = (event) => {
      if (event.deltaY === 0) return
      event.preventDefault()
      window.clearTimeout(scrollTimer.current)
      settlingCallbackRef.current?.(false)
      const deltaScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 180 : 1
      wheelDeltaRef.current += event.deltaY * deltaScale
      if (Math.abs(wheelDeltaRef.current) < WHEEL_STEP_DELTA) return
      const direction = Math.sign(wheelDeltaRef.current)
      wheelDeltaRef.current = 0
      const nextIndex = Math.min(options.length - 1, Math.max(0, selectedIndexRef.current + direction))
      if (nextIndex === selectedIndexRef.current) return
      selectedIndexRef.current = nextIndex
      onChange(options[nextIndex].value, label)
    }
    list.addEventListener('wheel', handleWheel, { passive: false })
    return () => list.removeEventListener('wheel', handleWheel)
  }, [label, onChange, options])

  useEffect(() => () => {
    window.clearTimeout(scrollTimer.current)
    settlingCallbackRef.current?.(false)
  }, [])

  const selectOption = (option, index) => {
    window.clearTimeout(scrollTimer.current)
    settlingCallbackRef.current?.(false)
    wheelDeltaRef.current = 0
    selectedIndexRef.current = index
    onChange(option.value, label)
    optionRefs.current[index]?.focus({ preventScroll: true })
  }

  const handleKeyDown = (event, index) => {
    const shortcutIndexes = {
      ArrowUp: index - 1,
      ArrowDown: index + 1,
      Home: 0,
      End: options.length - 1,
    }
    const nextIndex = shortcutIndexes[event.key]
    if (nextIndex === undefined) return

    event.preventDefault()
    const boundedIndex = Math.min(options.length - 1, Math.max(0, nextIndex))
    selectOption(options[boundedIndex], boundedIndex)
  }

  const handleScroll = (event) => {
    const scrollTop = event.currentTarget.scrollTop
    window.clearTimeout(scrollTimer.current)
    if (scrollTop === programmaticTopRef.current) { settlingCallbackRef.current?.(false); return }
    settlingCallbackRef.current?.(true)
    wheelDeltaRef.current = 0
    scrollTimer.current = window.setTimeout(() => {
      const index = Math.min(options.length - 1, Math.max(0, Math.round(scrollTop / OPTION_HEIGHT)))
      const option = options[index]
      if (option && !Object.is(option.value, value)) {
        selectedIndexRef.current = index
        onChange(option.value, label)
      }
      settlingCallbackRef.current?.(false)
    }, 100)
  }

  return (
    <div className="settings-wheel__column">
      <span id={labelId} className="settings-wheel__column-label">{label}</span>
      <div ref={listRef} className="settings-wheel__options" role="listbox" aria-labelledby={labelId} onScroll={handleScroll}>
        {options.map((option, index) => (
          <button
            key={String(option.value)}
            ref={(element) => { optionRefs.current[index] = element }}
            type="button"
            className="settings-wheel__option"
            role="option"
            aria-selected={Object.is(option.value, value)}
            tabIndex={index === selectedIndex ? 0 : -1}
            onClick={() => selectOption(option, index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function SettingsWheel({ label, value, displayValue, isOpen, isAnotherOpen = false, onToggle, onChange, onSettlingChange, columns }) {
  const [isTrayMounted, setIsTrayMounted] = useState(isOpen)
  const [isClosing, setIsClosing] = useState(false)
  const trayRef = useRef(null)
  const columnSettlementRef = useRef({})
  const reportSettlement = (label, pending) => {
    columnSettlementRef.current[label] = pending
    onSettlingChange?.(Object.values(columnSettlementRef.current).some(Boolean))
  }

  useLayoutEffect(() => {
    if (isOpen) {
      setIsTrayMounted(true)
      setIsClosing(false)
      return undefined
    }

    if (!isTrayMounted) return undefined
    if (prefersReducedMotion() || isAnotherOpen) {
      setIsTrayMounted(false)
      setIsClosing(false)
      return undefined
    }

    const tray = trayRef.current
    if (tray) {
      tray.style.setProperty('--wheel-close-from', `${tray.getBoundingClientRect().height}px`)
      tray.style.setProperty('--wheel-close-opacity', window.getComputedStyle(tray).opacity)
    }
    setIsClosing(true)
    const closeTimer = window.setTimeout(() => {
      setIsTrayMounted(false)
      setIsClosing(false)
    }, CLOSE_DURATION)
    return () => window.clearTimeout(closeTimer)
  }, [isOpen, isTrayMounted, isAnotherOpen])

  return (
    <section className="settings-wheel" data-value={String(value)}>
      <button type="button" className="settings-wheel__summary" aria-label={`${label} ${displayValue}`} aria-expanded={isOpen} onClick={onToggle}>
        <span>{label}</span>
        <strong>{displayValue}</strong>
        <span className="settings-wheel__chevron" aria-hidden="true" />
      </button>
      {isTrayMounted && (isOpen || !isAnotherOpen) && (
        <div ref={trayRef} className={isClosing ? 'settings-wheel__tray is-closing' : 'settings-wheel__tray'} aria-hidden={isClosing || undefined} inert={isClosing || undefined}>
          {columns.map((column) => <WheelColumn key={column.label} {...column} onChange={onChange} onSettlingChange={pending => reportSettlement(column.label, pending)} />)}
        </div>
      )}
    </section>
  )
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default SettingsWheel
