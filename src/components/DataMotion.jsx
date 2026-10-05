import { useEffect, useRef } from 'react'
import './DataCharts.css'

const format = value => new Intl.NumberFormat('zh-CN').format(value)
// Each effect owns its cancellation, including preference changes after mount.
// Final content is the DOM default; animation support is only an enhancement.
function useManagedMotion(start, identity) {
  const latest = useRef(start)
  latest.current = start
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let cancel = () => {}
    const stop = (settle = false) => { cancel(settle); cancel = () => {} }
    const preference = () => { if (media?.matches || document.hidden) stop(true) }
    try { cancel = latest.current(!media?.matches && !document.hidden) ?? (() => {}) } catch { stop(true) }
    media?.addEventListener?.('change', preference)
    document.addEventListener('visibilitychange', preference)
    return () => { stop(); media?.removeEventListener?.('change', preference); document.removeEventListener('visibilitychange', preference) }
  }, [identity])
}

export function AnimatedCount({ value, label, replayKey }) {
  const element = useRef(null)
  const previous = useRef({ key: undefined, value: 0 })
  const valid = Number.isSafeInteger(value) && value >= 0
  const finalValue = useRef('')
  finalValue.current = valid ? format(value) : '不可计算'
  useManagedMotion(animate => {
    if (!animate || !valid || value === 0 || !window.requestAnimationFrame) {
      previous.current = { key: replayKey, value: valid ? value : 0 }
      if (element.current) element.current.textContent = finalValue.current
      return
    }
    const node = element.current
    const from = previous.current.key === replayKey ? previous.current.value : 0
    previous.current.key = replayKey
    let id, started
    const duration = Math.min(1100, Math.max(600, 250 + Math.log10(value + 1) * 190))
    const finish = (settle = false) => {
      if (id !== undefined) cancelAnimationFrame(id)
      node.textContent = finalValue.current
      if (settle) previous.current.value = Number(finalValue.current.replaceAll(',', '')) || 0
    }
    const frame = time => {
      try {
        started ??= time
        const progress = Math.min(1, (time - started) / duration)
        const current = Math.round(from + (value - from) * (1 - (1 - progress) ** 3))
        previous.current.value = current
        node.textContent = format(current)
        if (progress < 1) id = requestAnimationFrame(frame)
      } catch { finish() }
    }
    node.textContent = format(from)
    try { id = requestAnimationFrame(frame) } catch { finish() }
    return finish
  }, JSON.stringify([valid, value, replayKey]))
  return <span className="data-count" aria-label={label}><span ref={element} className="data-count__value" aria-hidden="true">{valid ? format(value) : '不可计算'}</span><span className="data-count__measure" aria-hidden="true">{valid ? format(value) : '不可计算'}</span><span className="data-sr-only">{valid ? format(value) : '不可计算'}</span></span>
}

export function DataReveal({ children, replayKey, dataKey = '', direction = 'horizontal', enabled = true, className = '' }) {
  const element = useRef(null)
  const previous = useRef(null)
  useManagedMotion(animate => {
    const liveUpdate = previous.current === replayKey
    previous.current = replayKey
    if (!animate || !enabled) return
    const keyframes = liveUpdate ? [{ opacity: .65 }, { opacity: 1 }] : direction === 'vertical' ? [
      { transform: 'scaleY(0)', transformOrigin: 'bottom' },
      { transform: 'scaleY(1)', transformOrigin: 'bottom' },
    ] : [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }]
    const animation = element.current?.animate?.(keyframes, { duration: 800, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
    return () => animation?.cancel()
  }, JSON.stringify([replayKey, dataKey, direction, enabled]))
  return <div ref={element} className={className}>{children}</div>
}

export function ProgressRing({ value, total, label, state, accent = false }) {
  const stroke = useRef(null)
  const previous = useRef(null)
  const valid = Number.isSafeInteger(value) && Number.isSafeInteger(total) && total > 0 && value >= 0 && value <= total
  const ratio = valid ? value / total : 0
  const percentage = Math.round(ratio * 100)
  useManagedMotion(animate => {
    const from = previous.current ?? 0
    previous.current = ratio
    if (!animate || !valid || !ratio) return
    const animation = stroke.current?.animate?.([{ strokeDashoffset: 100 * (1 - from) }, { strokeDashoffset: 100 * (1 - ratio) }], { duration: 700, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' })
    return () => animation?.cancel()
  }, JSON.stringify([valid, ratio]))
  return <div className={`progress-ring ${accent ? 'progress-ring--gold' : ''}`} role="img" aria-label={valid ? `${label}：已完成 ${value} / ${total} 词，${percentage}%` : `${label}：${state}`}>
    <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="progress-ring__track" cx="100" cy="100" r="86" /><circle ref={stroke} className="progress-ring__fill" cx="100" cy="100" r="86" pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - ratio)} style={{ visibility: valid && value > 0 ? 'visible' : 'hidden' }} /></svg>
    <div className="progress-ring__center" aria-hidden="true">{valid ? <><div><strong>{format(value)}</strong><span> / {format(total)}</span></div><small>{percentage}%</small></> : <span className="progress-ring__state">{state}</span>}</div>
  </div>
}
