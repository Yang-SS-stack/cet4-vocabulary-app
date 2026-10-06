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
  activeIndex: controlledIndex,
  current = 'page',
  onItemClick,
  ariaHidden = false,
  icons = [],
  collapsed = false,
  className = '',
}) {
  const [localActiveIndex, setActiveIndex] = useState(defaultActive)
  const activeIndex = controlledIndex ?? localActiveIndex

  const handleItemClick = (index, label) => {
    setActiveIndex(index)
    onItemClick?.(index, label)
  }

  const navigationClassName = [
    'line-sidebar',
    showMarker && 'line-sidebar--markers',
    icons.length > 0 && 'line-sidebar--icons',
    collapsed && 'line-sidebar--collapsed',
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
        '--active-index': activeIndex,
      }}
    >
      <ul className="line-sidebar__list">
        {items.map((label, index) => (
          <li className="line-sidebar__item" key={label}>
            {showMarker && <span className="line-sidebar__marker" aria-hidden="true" />}
            <button
              className={`line-sidebar__button${
                activeIndex === index ? ' line-sidebar__button--active' : ''
              }`}
              type="button"
              onClick={() => handleItemClick(index, label)}
              aria-current={activeIndex === index ? current : undefined}
              aria-label={icons.length ? label : undefined}
              title={collapsed ? label : undefined}
            >
              {showIndex && (
                <span className="line-sidebar__index">{String(index + 1).padStart(2, '0')}</span>
              )}
              {icons[index] && <span className="line-sidebar__icon" aria-hidden="true">{icons[index]}</span>}
              <span className="line-sidebar__label">{label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

export default LineSidebar
