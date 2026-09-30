import { useEffect, useState } from 'react'
import './LoadingIndicator.css'

export default function LoadingIndicator({ active = true, label = '加载中', compact = false }) {
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    setVisible(false)
    if (!active) return
    const timer = window.setTimeout(() => setVisible(true), 200)
    return () => window.clearTimeout(timer)
  }, [active])
  if (!active || !visible) return null
  return <div className={`loading-indicator${compact ? ' loading-indicator--compact' : ''}`} role="status" aria-label={label}>
    <span className="loading-indicator__dots" aria-hidden="true">
      {[0, 1, 2].map(index => <span className="loading-indicator__pair" key={index} style={{ '--dot-delay': `${[0, .2, .3][index]}s` }}>
        <span className="loading-indicator__dot" /><span className="loading-indicator__shadow" />
      </span>)}
    </span>
    {label}
  </div>
}
