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
