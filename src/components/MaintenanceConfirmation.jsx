import { useEffect, useId, useRef } from 'react'

export default function MaintenanceConfirmation({ title, children, confirmLabel, onCancel, onConfirm }) {
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const titleId = useId()
  useEffect(() => {
    const previous = document.activeElement
    const dialog = dialogRef.current
    if (dialog.showModal) dialog.showModal()
    else dialog.setAttribute('open', '')
    cancelRef.current?.focus()
    return () => { if (previous?.isConnected) previous.focus() }
  }, [])
  return <dialog ref={dialogRef} className="maintenance-confirmation" aria-labelledby={titleId}
    onCancel={event => { event.preventDefault(); onCancel() }}
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); onCancel() } }}>
    <h2 id={titleId}>{title}</h2>
    {children}
    <div className="maintenance-confirmation__actions">
      <button ref={cancelRef} type="button" onClick={onCancel}>{title === '设置尚未保存' ? '留在设置' : '保留记录'}</button>
      <button type="button" onClick={onConfirm}>{confirmLabel}</button>
    </div>
  </dialog>
}
