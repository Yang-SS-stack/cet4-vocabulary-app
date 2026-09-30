import { useEffect, useRef, useState } from 'react'

// Keep the saved previous frame for the exit animation. Incoming controls are
// not interactive until the new frame is displayed; storage never waits on motion.
export default function StudyTransition({ transitionKey, children, content = false, onReady, waitForEntry = false }) {
  const [frame, setFrame] = useState({ key: transitionKey, children })
  const latest = useRef(children)
  const root = useRef(null)
  const displayed = useRef(children)
  const ready = useRef(onReady)
  useEffect(() => { ready.current = onReady })
  useEffect(() => { latest.current = children })
  const leaving = frame.key !== transitionKey
  useEffect(() => { if (!leaving) displayed.current = children }, [children, leaving])
  useEffect(() => {
    if (!leaving) return
    const reduced = !window.matchMedia || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(() => setFrame({ key: transitionKey, children: latest.current }), reduced ? 0 : 160)
    return () => window.clearTimeout(timer)
  }, [transitionKey, leaving])
  useEffect(() => {
    if (leaving) return
    if (!content) root.current?.querySelector('h2')?.focus({ preventScroll: true })
    const reduced = !window.matchMedia || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!waitForEntry || reduced) { ready.current?.(frame.key); return }
    const timer = window.setTimeout(() => ready.current?.(frame.key), 240)
    return () => window.clearTimeout(timer)
  }, [frame.key, leaving, content, waitForEntry])
  return <div ref={root} className={`study-transition ${content ? 'study-transition--content' : ''} ${leaving ? 'is-leaving' : ''}`} inert={leaving} aria-hidden={leaving || undefined}>
    <div key={frame.key} className="study-transition__frame">{leaving ? displayed.current : children}</div>
  </div>
}
