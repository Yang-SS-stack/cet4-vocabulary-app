import { useEffectEvent, useLayoutEffect, useRef, useState } from 'react'
import { animateAssistant } from './assistantMotion'

export default function AssistantHint({ launcher, onDismiss }) {
  const node = useRef(null), exitOpacity = useRef(1)
  const [leaving, setLeaving] = useState(false)
  const dismiss = useEffectEvent(onDismiss)
  const leave = () => {
    exitOpacity.current = Number(getComputedStyle(node.current).opacity || 1)
    if (node.current.contains(document.activeElement)) launcher.current?.focus({ preventScroll: true })
    setLeaving(true)
  }
  const beginLeaving = useEffectEvent(leave)
  useLayoutEffect(() => {
    const media = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    const duration = leaving ? 180 : 220
    const animation = media?.matches ? null : animateAssistant(node.current, leaving
      ? [{ opacity: exitOpacity.current }, { opacity: 0 }]
      : [{ opacity: 0 }, { opacity: 1 }], { duration, easing: 'cubic-bezier(.16, 1, .3, 1)', fill: leaving ? 'forwards' : 'none' })
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      // Keep the faded result until React removes it and releases the animation.
      if (node.current) node.current.style.opacity = '0'
      dismiss()
    }
    if (leaving && !animation) { finish(); return undefined }
    // Include entry time so the fully visible hint keeps its five-second stay.
    const timer = window.setTimeout(leaving ? finish : beginLeaving, leaving ? duration : 5000 + (animation ? duration : 0))
    if (leaving) animation.onfinish = finish
    const reduce = () => { if (media?.matches) { if (leaving) finish(); animation?.cancel() } }
    media?.addEventListener?.('change', reduce)
    return () => {
      finished = true; window.clearTimeout(timer)
      if (animation) { animation.onfinish = null; animation.cancel() }
      media?.removeEventListener?.('change', reduce)
    }
  }, [leaving])
  return <div ref={node} className="floating-assistant-hint" role="status" aria-hidden={leaving || undefined} inert={leaving}>
    <button type="button" aria-label="关闭助手提示" onClick={leave}>×</button>
    <strong>学习助手提示</strong><p>你可以在这里设置你的学习计划或提出其他学习要求。</p>
  </div>
}
