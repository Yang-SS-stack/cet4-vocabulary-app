import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import LineSidebar from './LineSidebar'

test('selecting an item reports its index and label', async () => {
  const user = userEvent.setup()
  const onItemClick = vi.fn()

  render(
    <LineSidebar items={['今日学习', '词表']} onItemClick={onItemClick} />,
  )

  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(onItemClick).toHaveBeenCalledWith(1, '词表')
})

test('pointer movement does not start a navigation motion loop', () => {
  const requestFrame = vi.fn(() => 1)
  vi.stubGlobal('requestAnimationFrame', requestFrame)

  try {
    render(<LineSidebar items={['今日学习', '词表']} />)
    requestFrame.mockClear()

    fireEvent.pointerMove(screen.getByRole('list'), { clientY: 48 })

    expect(requestFrame).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
  }
})

test('the selected navigation item exposes the current page state', async () => {
  const user = userEvent.setup()

  render(<LineSidebar items={['今日学习', '词表']} />)
  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(screen.getByRole('button', { name: '词表' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})

test('the selected navigation item gets the quiet stretch state', async () => {
  const user = userEvent.setup()

  render(<LineSidebar items={['今日学习', '词表']} />)
  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(screen.getByRole('button', { name: '词表' })).toHaveClass(
    'line-sidebar__button--active',
  )
  expect(screen.getByRole('button', { name: '今日学习' })).not.toHaveClass(
    'line-sidebar__button--active',
  )
})
