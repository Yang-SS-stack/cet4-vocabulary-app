import { useEffect, useRef, useState } from 'react'
import LineSidebar from './LineSidebar'
import NavigationIcon from './NavigationIcon'

export default function MobileNavigation({ items, selectedPage, onPageChange, onDestinationFocus, hidden = false, logoRef, isBrandConcealed = false }) {
  const [phase, setPhase] = useState('closed')
  const dialog = useRef(null)
  const menu = useRef(null)
  const closeButton = useRef(null)
  const timer = useRef(null)
  const destination = useRef(null)
  const opened = phase !== 'closed'

  const finishClose = (restore = true) => {
    window.clearTimeout(timer.current)
    dialog.current?.close?.()
    setPhase('closed')
    if (restore && destination.current) {
      destination.current = null
      onDestinationFocus?.()
    } else if (restore) menu.current?.focus({ preventScroll: true })
  }

  const close = (page) => {
    if (phase !== 'open') return
    if (page && page !== selectedPage) {
      destination.current = page
      onPageChange?.(page)
    }
    dialog.current?.focus({ preventScroll: true })
    setPhase('closing')
    if (globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) finishClose()
    else timer.current = window.setTimeout(() => finishClose(), 260)
  }

  useEffect(() => {
    if (!opened) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previousOverflow }
  }, [opened])

  useEffect(() => {
    if (!hidden) return
    window.clearTimeout(timer.current)
    dialog.current?.close?.()
    destination.current = null
    setPhase('closed')
  }, [hidden])

  useEffect(() => () => {
    window.clearTimeout(timer.current)
    dialog.current?.close?.()
  }, [])

  return <>
    <header className="mobile-header" hidden={hidden}>
      <span ref={logoRef} className={isBrandConcealed ? 'brand-name is-brand-concealed' : 'brand-name'}>LinguaJet</span>
      <button ref={menu} type="button" aria-label="打开菜单" aria-expanded={opened} aria-controls="mobile-main-menu" onClick={() => {
        window.clearTimeout(timer.current)
        destination.current = null
        dialog.current.showModal()
        setPhase('open')
        closeButton.current?.focus({ preventScroll: true })
      }}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg></button>
    </header>
    <dialog ref={dialog} id="mobile-main-menu" tabIndex={-1} className={`mobile-drawer ${phase === 'closing' ? 'is-closing' : ''}`} aria-label="主菜单"
      onCancel={event => { event.preventDefault(); close() }}
      onClick={event => { if (event.target === event.currentTarget) close() }}>
      <div className="mobile-drawer__panel" inert={phase === 'closing'} onClick={event => event.stopPropagation()}>
        <div className="mobile-drawer__heading"><span className="brand-name">LinguaJet</span>
          <button ref={closeButton} type="button" aria-label="关闭菜单" onClick={() => close()}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg></button>
        </div>
        <LineSidebar items={items} icons={items.map(name => <NavigationIcon key={name} name={name} />)}
          activeIndex={items.indexOf(selectedPage === '开发验收与维护' ? '设置' : selectedPage)}
          current={selectedPage === '开发验收与维护' ? 'location' : 'page'}
          accentColor="#0b2244" showIndex={false} onItemClick={(_, page) => close(page)} />
        <p className="sidebar-note">今天也向前一步</p>
      </div>
    </dialog>
  </>
}
