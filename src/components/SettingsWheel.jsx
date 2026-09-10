import { useEffect, useId, useRef } from 'react'
import './SettingsWheel.css'

const OPTION_HEIGHT = 48

function WheelColumn({ label, value, options, onChange }) {
  const labelId = useId()
  const listRef = useRef(null)
  const optionRefs = useRef([])
  const scrollTimer = useRef(null)
  const selectedIndex = Math.max(0, options.findIndex((option) => Object.is(option.value, value)))

  useEffect(() => {
    const selectedOption = optionRefs.current[selectedIndex]
    selectedOption?.scrollIntoView?.({ block: 'center', behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }, [selectedIndex])

  useEffect(() => () => window.clearTimeout(scrollTimer.current), [])

  const selectOption = (option, index) => {
    onChange(option.value, label)
    optionRefs.current[index]?.focus()
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
    scrollTimer.current = window.setTimeout(() => {
      const index = Math.min(options.length - 1, Math.max(0, Math.round(scrollTop / OPTION_HEIGHT)))
      const option = options[index]
      if (option && !Object.is(option.value, value)) onChange(option.value, label)
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

function SettingsWheel({ label, value, displayValue, isOpen, onToggle, onChange, columns }) {
  return (
    <section className="settings-wheel" data-value={String(value)}>
      <button type="button" className="settings-wheel__summary" aria-label={`${label} ${displayValue}`} aria-expanded={isOpen} onClick={onToggle}>
        <span>{label}</span>
        <strong>{displayValue}</strong>
      </button>
      {isOpen && (
        <div className="settings-wheel__tray">
          {columns.map((column) => <WheelColumn key={column.label} {...column} onChange={onChange} />)}
        </div>
      )}
    </section>
  )
}

function prefersReducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
}

export default SettingsWheel
