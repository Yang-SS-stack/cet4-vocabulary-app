import { useLayoutEffect, useRef } from 'react'
import './DataCharts.css'

const format = value => new Intl.NumberFormat('zh-CN').format(value)
// Each effect owns its cancellation, including preference changes after mount.
// Final content is the DOM default; animation support is only an enhancement.
function useManagedMotion(start, identity) {
  const latest = useRef(start)
  latest.current = start
  useLayoutEffect(() => {
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

const chartTiming = { duration: 800, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }

// Read animated styles before canceling: React's underlying DOM already holds
// the final data, while computed styles still describe the visible animation.
function visibleProperties(node, animation, fallback) {
  if (!animation || !['running', 'pending', 'paused'].includes(animation.playState)) return fallback
  try {
    const style = window.getComputedStyle(node)
    return Object.fromEntries(Object.entries(fallback).map(([property, value]) => [property, style[property] || value]))
  } catch {
    return fallback
  }
}

export function DataReveal({ children, replayKey, dataKey = '', geometry = [], direction = 'horizontal', enabled = true, className = '' }) {
  const element = useRef(null)
  const previous = useRef(null)
  useManagedMotion(animate => {
    const old = previous.current
    const liveUpdate = old?.key === replayKey
    const current = { key: replayKey, geometry: new Map(geometry.map(item => [item.key, item.properties])), reveal: null }
    previous.current = current
    if (!animate || !enabled) return
    const reveal = direction === 'vertical' ? [
      { transform: 'scaleY(0)', transformOrigin: 'bottom' },
      { transform: 'scaleY(1)', transformOrigin: 'bottom' },
    ] : [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }]
    const running = []
    const startTime = document.timeline?.currentTime
    const start = (node, from, to, key) => {
      const animation = node?.animate?.([from, to], chartTiming)
      if (!animation) return
      running.push({ node, animation, to, key })
      // All parts use one browser timeline and easing, so adjoining stack edges
      // and donut arcs stay aligned throughout the transition. No React frames.
      if (typeof startTime === 'number') animation.startTime = startTime
    }
    const stop = (settle = false) => {
      for (const { node, animation, to, key } of running) {
        const visible = settle ? to : visibleProperties(node, animation, to)
        if (key === null) current.reveal = settle || animation.playState === 'finished' ? null : visible
        else current.geometry.set(key, visible)
        animation.cancel()
      }
    }
    try {
      if (liveUpdate) {
        const nodes = new Map([...element.current.querySelectorAll('[data-motion-key]')].map(node => [node.dataset.motionKey, node]))
        for (const item of geometry) {
          const from = old.geometry.get(item.key) ?? item.empty ?? item.properties
          if (JSON.stringify(from) !== JSON.stringify(item.properties)) start(nodes.get(item.key), from, item.properties, item.key)
        }
        if (old.reveal) start(element.current, old.reveal, reveal[1], null)
      } else {
        start(element.current, reveal[0], reveal[1], null)
      }
    } catch {
      stop(true)
    }
    return stop
  }, JSON.stringify([replayKey, dataKey, geometry, direction, enabled]))
  return <div ref={element} className={className}>{children}</div>
}

export function ProgressRing({ value, total, label, state, accent = false }) {
  const stroke = useRef(null)
  const previous = useRef(null)
  const valid = Number.isSafeInteger(value) && Number.isSafeInteger(total) && total > 0 && value >= 0 && value <= total
  const ratio = valid ? value / total : 0
  const percentage = Math.round(ratio * 100)
  useManagedMotion(animate => {
    const from = previous.current ?? { strokeDashoffset: 100 }
    const to = { strokeDashoffset: 100 * (1 - ratio) }
    previous.current = to
    if (!animate || !valid || !ratio) return
    const node = stroke.current
    const animation = node?.animate?.([from, to], { ...chartTiming, duration: 700 })
    return (settle = false) => {
      previous.current = settle ? to : visibleProperties(node, animation, to)
      animation?.cancel()
    }
  }, JSON.stringify([valid, ratio]))
  return <div className={`progress-ring ${accent ? 'progress-ring--gold' : ''}`} role="img" aria-label={valid ? `${label}：已完成 ${value} / ${total} 词，${percentage}%` : `${label}：${state}`}>
    <svg viewBox="0 0 200 200" aria-hidden="true"><circle className="progress-ring__track" cx="100" cy="100" r="86" /><circle ref={stroke} className="progress-ring__fill" cx="100" cy="100" r="86" pathLength="100" strokeDasharray="100" strokeDashoffset={100 * (1 - ratio)} style={{ visibility: valid && value > 0 ? 'visible' : 'hidden' }} /></svg>
    <div className="progress-ring__center" aria-hidden="true">{valid ? <><div><strong>{format(value)}</strong><span> / {format(total)}</span></div><small>{percentage}%</small></> : <span className="progress-ring__state">{state}</span>}</div>
  </div>
}
