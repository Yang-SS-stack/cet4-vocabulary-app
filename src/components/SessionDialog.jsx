import { useEffect, useId, useRef } from 'react'
import './SessionAdviceModal.css'

export default function SessionDialog({ title, onClose, children, footer, className = '' }) {
  const ref = useRef(null), close = useRef(null)
  const id = useId()
  useEffect(() => {
    const node = ref.current, previous = document.activeElement
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    node.showModal()
    close.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = overflow
      previous?.focus?.({ preventScroll: true })
    }
  }, [])
  return <dialog ref={ref} className={`session-dialog ${className}`} aria-labelledby={id}
    onCancel={event => { event.preventDefault(); onClose() }}>
    <header className="session-dialog__header"><h2 id={id}>{title}</h2>
      <button ref={close} className="session-dialog__close" type="button" aria-label="关闭本次安排" onClick={onClose}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
      </button>
    </header>
    <div className="session-dialog__body">{children}</div>
    {footer && <footer className="session-dialog__footer">{footer}</footer>}
  </dialog>
}
