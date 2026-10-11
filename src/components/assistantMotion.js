import { useEffect, useLayoutEffect, useRef } from 'react'

// Content stays visible if animation support is absent or the browser rejects it.
export function animateAssistant(element, frames, options) {
  try { return element?.animate?.(frames, options) ?? null } catch { return null }
}

export function revealAssistant(element, block = 'nearest') {
  if (!element?.scrollIntoView) return
  const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  try { element.scrollIntoView({ block, behavior: reduced ? 'auto' : 'smooth' }) } catch { /* The visible default stays usable in older browsers. */ }
}

// Follow only the assistant's own scroll area; streaming must never scroll the page.
export function followAssistant(element) {
  const body = element?.closest('.assistant-stage') ?? element?.closest('.floating-assistant__body')
  if (body) body.scrollTop = Math.max(0, body.scrollHeight - body.clientHeight)
}

export function useAssistantSendMotion(ref, originRect, active, kind = 'input') {
  const attempted = useRef(false)
  useLayoutEffect(() => {
    if (!active) { if (originRect) attempted.current = true; return undefined }
    if (attempted.current || !originRect) return undefined
    attempted.current = true
    const element = ref.current, motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    followAssistant(element)
    const destination = element?.getBoundingClientRect()
    if (motion?.matches || !destination?.width || !destination.height || !originRect.width || !originRect.height) return undefined
    // The composer is outside the scrollport: a flight inside it would be clipped.
    const layer = element.closest('.assistant-layout')?.querySelector('.assistant-send-layer')
    if (!layer) return undefined
    const origin = layer.getBoundingClientRect(), flight = element.cloneNode(true)
    flight.classList.replace('assistant-message--user', 'assistant-message--flight')
    Object.assign(flight.style, { left: `${destination.left - origin.left}px`, top: `${destination.top - origin.top}px`, width: `${destination.width}px`, height: `${destination.height}px` })
    if (kind === 'shortcut') flight.style.transformOrigin = 'center center'
    layer.append(flight)
    const arrival = { transform: 'translate(0px, 0px) scale(1, 1)', opacity: 1, borderRadius: '12px', background: 'var(--ink)', color: 'var(--white)' }
    const frames = kind === 'shortcut' ? [
      { transform: `translate(${originRect.left + originRect.width / 2 - destination.left - destination.width / 2}px, ${originRect.top + originRect.height / 2 - destination.top - destination.height / 2}px) scale(.72)`, opacity: .45, borderRadius: '16px', background: '#f2e6ca', color: 'var(--ink)' },
      { offset: .4, opacity: 1, borderRadius: '12px', background: 'var(--ink)', color: 'var(--white)' },
      arrival,
    ] : [
      { transform: `translate(${originRect.left - destination.left}px, ${originRect.top - destination.top}px) scale(${originRect.width / destination.width}, ${originRect.height / destination.height})`, borderRadius: '24px', background: 'var(--white)', color: 'var(--ink)' },
      { transform: 'translate(0px, 0px) scale(1, 1)', borderRadius: '12px', background: 'var(--ink)', color: 'var(--white)' },
    ]
    const animation = animateAssistant(flight, frames, { duration: kind === 'shortcut' ? 300 : 350, easing: 'cubic-bezier(.16, 1, .3, 1)' })
    const land = () => { element.classList.remove('is-sending'); flight.remove() }
    if (!animation) { land(); return undefined }
    element.classList.add('is-sending'); animation.onfinish = land; animation.oncancel = land
    const reduce = () => { if (motion?.matches) { animation?.cancel(); land() } }
    motion?.addEventListener?.('change', reduce)
    return () => { animation.cancel(); land(); attempted.current = false; motion?.removeEventListener?.('change', reduce) }
  }, [ref, originRect, active, kind])
}

export function useAssistantMotion(ref, change, active = true) {
  useEffect(() => {
    if (!active) return undefined
    const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    const animation = motion?.matches ? null : animateAssistant(ref.current, [
      { opacity: .7, transform: 'translateY(8px)' },
      { opacity: 1, transform: 'translateY(0)' },
    ], { duration: 280, easing: 'cubic-bezier(.16, 1, .3, 1)' })
    const reduce = () => { if (motion?.matches) animation?.cancel() }
    motion?.addEventListener?.('change', reduce)
    return () => { animation?.cancel(); motion?.removeEventListener?.('change', reduce) }
  }, [ref, change, active])
}
