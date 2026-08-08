import { useCallback, useEffect, useRef, useState } from 'react'
import './LineSidebar.css'

const falloffCurves = {
  linear: (progress) => progress,
  smooth: (progress) => progress * progress * (3 - 2 * progress),
  sharp: (progress) => progress * progress * progress,
}

function LineSidebar({
  items,
  accentColor,
  textColor,
  markerColor,
  showIndex = false,
  showMarker = true,
  proximityRadius = 96,
  maxShift = 16,
  falloff = 'smooth',
  markerLength = 26,
  markerGap = 8,
  tickScale = 0.5,
  scaleTick = true,
  itemGap = 18,
  fontSize = 1,
  smoothing = 100,
  defaultActive = 0,
  onItemClick,
  ariaHidden = false,
  className = '',
}) {
  const listRef = useRef(null)
  const itemRefs = useRef([])
  const targetsRef = useRef([])
  const currentRef = useRef([])
  const frameRef = useRef(null)
  const lastFrameRef = useRef(0)
  const activeRef = useRef(defaultActive)
  const smoothingRef = useRef(smoothing)
  const [activeIndex, setActiveIndex] = useState(defaultActive)

  activeRef.current = activeIndex
  smoothingRef.current = smoothing

  const runFrame = useCallback((now) => {
    const delta = Math.min((now - lastFrameRef.current) / 1000, 0.05)
    lastFrameRef.current = now
    const smoothingSeconds = Math.max(smoothingRef.current, 1) / 1000
    const amount = 1 - Math.exp(-delta / smoothingSeconds)
    let isMoving = false

    itemRefs.current.forEach((item, index) => {
      if (!item) return

      const target = Math.max(
        targetsRef.current[index] || 0,
        activeRef.current === index ? 1 : 0,
      )
      const current = currentRef.current[index] || 0
      const next = current + (target - current) * amount
      const settled = Math.abs(target - next) < 0.0015
      const effect = settled ? target : next

      currentRef.current[index] = effect
      item.style.setProperty('--effect', effect.toFixed(4))
      isMoving ||= !settled
    })

    frameRef.current = isMoving ? requestAnimationFrame(runFrame) : null
  }, [])

  const startLoop = useCallback(() => {
    if (frameRef.current != null) cancelAnimationFrame(frameRef.current)

    lastFrameRef.current = performance.now()
    frameRef.current = requestAnimationFrame(runFrame)
  }, [runFrame])

  const handlePointerMove = useCallback(
    (event) => {
      const list = listRef.current
      if (!list) return

      const pointerY = event.clientY - list.getBoundingClientRect().top
      const ease = falloffCurves[falloff] ?? falloffCurves.linear

      itemRefs.current.forEach((item, index) => {
        if (!item) return

        const center = item.offsetTop + item.offsetHeight / 2
        const distance = Math.abs(pointerY - center)
        targetsRef.current[index] = ease(
          Math.max(0, 1 - distance / proximityRadius),
        )
      })

      startLoop()
    },
    [falloff, proximityRadius, startLoop],
  )

  const handlePointerLeave = useCallback(() => {
    targetsRef.current = targetsRef.current.map(() => 0)
    startLoop()
  }, [startLoop])

  const handleItemClick = useCallback(
    (index, label) => {
      setActiveIndex(index)
      onItemClick?.(index, label)
    },
    [onItemClick],
  )

  useEffect(() => {
    startLoop()
  }, [activeIndex, startLoop])

  useEffect(
    () => () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    },
    [],
  )

  return (
    <nav
      className={`line-sidebar${showMarker ? ' line-sidebar--markers' : ''}${
        scaleTick ? ' line-sidebar--scale-tick' : ''
      }${className ? ` ${className}` : ''}`}
      aria-label="主导航"
      aria-hidden={ariaHidden}
      style={{
        '--accent-color': accentColor,
        '--text-color': textColor,
        '--marker-color': markerColor,
        '--marker-length': `${markerLength}px`,
        '--marker-gap': `${markerGap}px`,
        '--tick-scale': tickScale,
        '--max-shift': `${maxShift}px`,
        '--item-gap': `${itemGap}px`,
        '--font-size': `${fontSize}rem`,
      }}
    >
      <ul
        className="line-sidebar__list"
        ref={listRef}
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
        {items.map((label, index) => (
          <li
            className="line-sidebar__item"
            key={label}
            ref={(element) => {
              itemRefs.current[index] = element
            }}
          >
            {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
            <button
              className="line-sidebar__button"
              type="button"
              onClick={() => handleItemClick(index, label)}
              aria-current={activeIndex === index ? 'page' : undefined}
            >
              {showIndex && (
                <span className="line-sidebar__index">{String(index + 1).padStart(2, '0')}</span>
              )}
              <span>{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default LineSidebar
