import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import MobileNavigation from './MobileNavigation'

beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); this.dispatchEvent(new Event('close')) }
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
})

function show(props = {}) {
  return render(<MobileNavigation items={['今日学习', '设置']} selectedPage="今日学习" onPageChange={vi.fn()} onDestinationFocus={vi.fn()} {...props} />)
}

test('opens a modal, locks scrolling, and cancels back to the menu', async () => {
  document.body.style.overflow = 'auto'
  show()
  const user = userEvent.setup()
  const menu = screen.getByRole('button', { name: '打开菜单' })
  await user.click(menu)
  const dialog = screen.getByRole('dialog', { name: '主菜单' })
  expect(dialog).toHaveAttribute('open')
  expect(document.body.style.overflow).toBe('hidden')
  expect(screen.getByRole('button', { name: '关闭菜单' })).toHaveFocus()
  fireEvent(dialog, new Event('cancel', { cancelable: true }))
  await waitFor(() => expect(menu).toHaveFocus())
  expect(document.body.style.overflow).toBe('auto')
})

test('current page only closes, while a destination changes page and focuses its title', async () => {
  const change = vi.fn(), focus = vi.fn()
  show({ onPageChange: change, onDestinationFocus: focus })
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '打开菜单' }))
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(change).not.toHaveBeenCalled()
  expect(focus).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '打开菜单' }))
  await user.click(screen.getByRole('button', { name: '设置' }))
  expect(change).toHaveBeenCalledWith('设置')
  await waitFor(() => expect(focus).toHaveBeenCalledOnce())
})

test('backdrop and hiding the mobile surface release its modal and scroll lock', async () => {
  const result = show()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '打开菜单' }))
  fireEvent.click(screen.getByRole('dialog', { name: '主菜单' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await user.click(screen.getByRole('button', { name: '打开菜单' }))
  result.rerender(<MobileNavigation items={['今日学习', '设置']} selectedPage="今日学习" hidden />)
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(document.body.style.overflow).not.toBe('hidden')
})
