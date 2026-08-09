import { useState } from 'react'
import './LineSidebar.css'

function LineSidebar({
  items,
  accentColor,
  textColor,
  markerColor,
  showIndex = false,
  showMarker = true,
  markerLength = 26,
  markerGap = 8,
  tickScale = 0.5,
  itemGap = 18,
  fontSize = 1,
  defaultActive = 0,
  onItemClick,
  ariaHidden = false,
  className = '',
}) {
  const [activeIndex, setActiveIndex] = useState(defaultActive)

  const handleItemClick = (index, label) => {
    setActiveIndex(index)
    onItemClick?.(index, label)
  }

  const navigationClassName = [
    'line-sidebar',
    showMarker && 'line-sidebar--markers',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <nav
      className={navigationClassName}
      aria-label="主导航"
      aria-hidden={ariaHidden}
      style={{
        '--accent-color': accentColor,
        '--text-color': textColor,
        '--marker-color': markerColor,
        '--marker-length': markerLength + 'px',
        '--marker-gap': markerGap + 'px',
        '--tick-scale': tickScale,
        '--item-gap': itemGap + 'px',
        '--font-size': fontSize + 'rem',
      }}
    >
      <ul className="line-sidebar__list">
        {items.map((label, index) => (
          <li className="line-sidebar__item" key={label}>
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
