import { render, screen } from '@testing-library/react'
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
