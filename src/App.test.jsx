import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import App from './App'

test('clicking vocabulary navigation shows the vocabulary page', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(screen.getByRole('heading', { name: '词表' })).toBeInTheDocument()
})

test('hiding navigation keeps a control for showing it again', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: '隐藏导航栏' }))

  expect(screen.getByRole('navigation', { hidden: true })).toHaveAttribute(
    'aria-hidden',
    'true',
  )
  expect(screen.getByRole('button', { name: '显示导航栏' })).toBeVisible()
})
