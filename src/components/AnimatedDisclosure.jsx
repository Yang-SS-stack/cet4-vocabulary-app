import { useEffect, useRef } from 'react'

// Keep native details/summary semantics. Closing remains open until its content
// has collapsed; cancellation always restores an intrinsic, unmeasured layout.
export default function AnimatedDisclosure({ title, children }) {
  const details = useRef(null)
  const body = useRef(null)
  const active = useRef(null)
  const intended = useRef(false)

  function cancel() {
    const animation = active.current
    active.current = null
    if (animation) { animation.onfinish = null; animation.cancel() }
  }

  function settle() {
    cancel()
    if (details.current) details.current.open = intended.current
  }

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const preference = () => { if (media?.matches || document.hidden) settle() }
    media?.addEventListener?.('change', preference)
    document.addEventListener('visibilitychange', preference)
    return () => {
      cancel()
      media?.removeEventListener?.('change', preference)
      document.removeEventListener('visibilitychange', preference)
    }
  }, [])

  function toggle(event) {
    event.preventDefault()
    const node = details.current, content = body.current
    const from = node.open ? content.getBoundingClientRect().height : 0
    const opacity = node.open ? Number(window.getComputedStyle(content).opacity || 1) : 0
    intended.current = !intended.current
    const opening = intended.current
    cancel()
    node.dataset.expanded = String(opening)
    if (document.hidden || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || !content.animate) {
      settle()
      return
    }
    node.open = true
    try {
      const animation = content.animate([
        { height: `${from}px`, opacity },
        { height: `${opening ? content.scrollHeight : 0}px`, opacity: opening ? 1 : 0 },
      ], { duration: opening ? 260 : 200, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' })
      active.current = animation
      animation.onfinish = () => { if (active.current === animation) settle() }
    } catch { settle() }
  }

  return <details ref={details} className="learning-recommendation-disclosure" data-expanded="false">
    <summary onClick={toggle}>{title}<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m4 7 6 6 6-6" /></svg></summary>
    <div ref={body} className="learning-recommendation-disclosure__body">{children}</div>
  </details>
}
