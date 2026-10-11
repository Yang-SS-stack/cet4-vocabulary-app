import { useEffect, useEffectEvent, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { assistantViewport, clampLauncher, clampWindow, resizeWindow, shouldDismissMobile } from './floatingAssistantGeometry'
import { animateAssistant } from './assistantMotion'

export default function FloatingAssistantWindow({ ref, open, onClose, onClosing, launcherRect, children }) {
  const [viewport, setViewport] = useState(assistantViewport)
  const [rect, setRect] = useState(() => clampWindow({ x: window.innerWidth - 444, y: window.innerHeight - 584, width: 420, height: 560 }, assistantViewport()))
  const [pull, setPull] = useState(0)
  const dialog = useRef(null), gesture = useRef(null), previousFocus = useRef(null), entryAnimation = useRef(null)
  const exitAnimation = useRef(null), exitTimer = useRef(null), closing = useRef(false), closeCallback = useRef(onClose)
  const exitLifecycle = useRef({ version: 0 })
  const lastWindowFocus = useRef(null)
  closeCallback.current = onClose
  const mobile = viewport.width <= 640
  const origin = () => {
    const viewport = assistantViewport()
    const size = { width: launcherRect?.width || 150, height: launcherRect?.height || 48 }
    const resizedDefault = launcherRect && !launcherRect.moved && (launcherRect.viewport.width !== viewport.width || launcherRect.viewport.height !== viewport.height)
    const defaultPoint = { x: viewport.width - size.width - (viewport.width <= 640 ? 16 : 24), y: viewport.height - size.height - (viewport.width <= 640 ? 12 : 20) }
    const point = clampLauncher(resizedDefault ? defaultPoint : launcherRect ?? defaultPoint, viewport, size)
    return { transform: `translate(${point.x - rect.x}px, ${point.y - rect.y}px) scale(${size.width / rect.width}, ${size.height / rect.height})`, opacity: .25, borderRadius: '28px' }
  }
  const entryOrigin = useEffectEvent(origin)
  const finishClose = epoch => {
    const lifecycle = exitLifecycle.current
    if (!closing.current || lifecycle.version !== epoch) return
    closing.current = false; lifecycle.version++
    window.clearTimeout(exitTimer.current); exitTimer.current = null
    // Removing a filled animation exposes the base window until React hides it.
    // Hide synchronously before releasing either animation or calling the parent.
    if (dialog.current) dialog.current.style.visibility = 'hidden'
    entryAnimation.current?.cancel(); entryAnimation.current = null
    exitAnimation.current?.cancel(); exitAnimation.current = null
    closeCallback.current()
  }
  useLayoutEffect(() => {
    if (!open || !dialog.current) return
    dialog.current.style.visibility = ''
    dialog.current.style.transition = ''
  }, [open])
  useEffect(() => {
    if (!open) return undefined
    const panel = dialog.current
    let active = true
    // Child components can remove focused controls without rendering this window.
    // Observe the window's DOM, but never replace a still-valid current focus.
    const observer = new MutationObserver(() => {
      if (!active || closing.current || availableFocus(document.activeElement)) return
      if (!lastWindowFocus.current || availableFocus(lastWindowFocus.current)) return
      const target = [...panel.querySelectorAll('[data-assistant-focus-target]')].find(availableFocus)
      target?.focus({ preventScroll: true })
    })
    observer.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['hidden', 'disabled', 'inert', 'aria-hidden'] })
    return () => { active = false; observer.disconnect() }
  }, [open])
  useEffect(() => {
    const resize = () => {
      // Finish the existing close before a breakpoint effect can tear it down.
      // A new viewport invalidates its old geometry, never the user's action.
      if (closing.current) finishClose(exitLifecycle.current.version)
      const next = assistantViewport(); setViewport(next); setRect(current => clampWindow(current, next)); gesture.current = null; setPull(0)
    }
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => {
    if (!open) return undefined
    const lifecycle = exitLifecycle.current
    previousFocus.current = document.activeElement
    dialog.current?.querySelector('button')?.focus({ preventScroll: true })
    const shell = document.querySelector('.app-shell')
    const overflow = document.body.style.overflow
    const hadInert = shell?.hasAttribute('inert'), oldAria = shell?.getAttribute('aria-hidden')
    if (mobile) { document.body.style.overflow = 'hidden'; shell?.setAttribute('inert', ''); shell?.setAttribute('aria-hidden', 'true') }
    const motion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!motion?.matches) entryAnimation.current = animateAssistant(dialog.current, mobile ? [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }] : [entryOrigin(), { transform: 'translate(0, 0) scale(1, 1)', opacity: 1, borderRadius: '16px' }], { duration: mobile ? 320 : 420, easing: 'cubic-bezier(.16, 1, .3, 1)' })
    const reduce = () => {
      if (!motion?.matches) return
      if (closing.current) finishClose(lifecycle.version)
      else { entryAnimation.current?.cancel(); entryAnimation.current = null }
    }
    motion?.addEventListener?.('change', reduce)
    return () => {
      entryAnimation.current?.cancel(); entryAnimation.current = null
      exitAnimation.current?.cancel(); exitAnimation.current = null
      window.clearTimeout(exitTimer.current); closing.current = false
      lifecycle.version++
      motion?.removeEventListener?.('change', reduce)
      if (mobile) { document.body.style.overflow = overflow; if (!hadInert) shell?.removeAttribute('inert'); if (oldAria == null) shell?.removeAttribute('aria-hidden'); else shell?.setAttribute('aria-hidden', oldAria) }
      gesture.current = null
      previousFocus.current?.focus({ preventScroll: true })
    }
  }, [open, mobile])
  const requestClose = () => {
    if (closing.current) return
    onClosing?.()
    closing.current = true
    const lifecycle = exitLifecycle.current
    const epoch = ++lifecycle.version
    const finish = () => finishClose(epoch)
    const panel = dialog.current
    const reduced = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || typeof panel?.animate !== 'function') { finish(); return }
    // Copy the current animated values before replacing an unfinished opening.
    const rendered = getComputedStyle(panel)
    const start = { transform: rendered.transform && rendered.transform !== 'none' ? rendered.transform : mobile ? `translateY(${pull}px)` : 'translate(0, 0) scale(1, 1)' }
    if (!mobile) { start.opacity = rendered.opacity || 1; start.borderRadius = rendered.borderRadius || '16px' }
    // Pull release resets the underlying transform; its CSS rebound must not
    // compete with the downward exit animation after is-pulling is removed.
    if (mobile) panel.style.transition = 'none'
    exitAnimation.current = animateAssistant(panel, [start, mobile ? { transform: 'translateY(100%)' } : origin()], { duration: mobile ? 220 : 260, easing: 'cubic-bezier(.4, 0, 1, 1)', fill: 'forwards' })
    if (!exitAnimation.current) { finish(); return }
    entryAnimation.current?.cancel(); entryAnimation.current = null
    exitAnimation.current.onfinish = finish
    // A bounded fallback also completes when an animation callback is lost.
    exitTimer.current = window.setTimeout(finish, mobile ? 250 : 290)
  }
  const begin = (event, kind) => {
    if (closing.current || event.button !== 0 || (kind === 'move' && event.target.closest('button'))) return
    gesture.current = { kind, x: event.clientX, y: event.clientY, rect, height: dialog.current.getBoundingClientRect().height, pointerId: event.pointerId }
    if (kind === 'pull') entryAnimation.current?.cancel()
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const move = event => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    const dx = event.clientX - active.x, dy = event.clientY - active.y
    if (active.kind === 'pull') setPull(Math.min(active.height, Math.max(0, dy)))
    else setRect(active.kind === 'resize' ? resizeWindow(active.rect, dx, dy, assistantViewport()) : clampWindow({ ...active.rect, x: active.rect.x + dx, y: active.rect.y + dy }, assistantViewport()))
  }
  const end = (event, cancelled = false) => {
    const active = gesture.current
    if (!active || active.pointerId !== event.pointerId) return
    if (active.kind === 'pull' && !cancelled && shouldDismissMobile(event.clientY - active.y, active.height)) requestClose()
    gesture.current = null; setPull(0)
  }
  const handlers = kind => ({ onPointerDown: event => begin(event, kind), onPointerMove: move, onPointerUp: event => end(event), onPointerCancel: event => end(event, true) })
  const keyDown = event => {
    if (event.key === 'Escape') { event.preventDefault(); requestClose(); return }
    if (!mobile || event.key !== 'Tab') return
    const controls = [...dialog.current.querySelectorAll('button:not([disabled]), input:not([disabled]), select, [tabindex="0"]')].filter(node => !node.closest('[hidden]'))
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  useImperativeHandle(ref, () => ({ close: requestClose }))
  return <div className={`floating-assistant-layer ${mobile ? 'is-mobile' : ''}`} hidden={!open}>
    {mobile && <div className="floating-assistant__backdrop" onClick={requestClose} aria-hidden="true" />}
    <section ref={dialog} className={`floating-assistant ${pull > 0 ? 'is-pulling' : ''}`} role="dialog" aria-modal={mobile ? 'true' : undefined} aria-labelledby="floating-assistant-title" onFocusCapture={event => { lastWindowFocus.current = event.target }} onKeyDown={keyDown} style={mobile ? { transform: `translateY(${pull}px)` } : { left: rect.x, top: rect.y, width: rect.width, height: rect.height }}>
      {mobile && <button type="button" className="floating-assistant__grab" aria-label="下拉收起学习助手" {...handlers('pull')} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); requestClose() } }}><span /></button>}
      <header className="floating-assistant__header" aria-label="移动学习助手窗口" {...(!mobile ? handlers('move') : {})}><AssistantSymbol /><div><h2 id="floating-assistant-title">LinguaJet 学习助手</h2><p>模拟对话 · 未接入 Qwen</p></div>{!mobile && <button type="button" aria-label="关闭学习助手" onClick={requestClose}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>}</header>
      <div className="floating-assistant__body">{children}</div>
      {!mobile && <button className="floating-assistant__resize" type="button" aria-label="调整学习助手窗口大小" {...handlers('resize')} onKeyDown={event => {
        const directions = { ArrowRight: [20, 0], ArrowLeft: [-20, 0], ArrowDown: [0, 20], ArrowUp: [0, -20] }
        if (directions[event.key]) { event.preventDefault(); setRect(current => resizeWindow(current, ...directions[event.key], assistantViewport())) }
      }}><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 16 11-11m-5 11 5-5" /></svg></button>}
    </section>
  </div>
}
function availableFocus(element) {
  return element instanceof HTMLElement && element !== document.body && element !== document.documentElement && element.isConnected && !element.disabled && !element.closest('[hidden], [inert], [aria-hidden="true"]')
}
function AssistantSymbol() { return <svg className="assistant-symbol" viewBox="0 0 32 32" aria-hidden="true"><path d="M16 3v4M7 10h18a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V13a3 3 0 0 1 3-3Z" /><circle cx="11" cy="18" r="2" /><circle cx="21" cy="18" r="2" /><path d="M12 24h8" /></svg> }
