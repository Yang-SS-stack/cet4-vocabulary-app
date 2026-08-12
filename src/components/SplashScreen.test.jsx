import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import SplashScreen from './SplashScreen'

vi.mock('./TextType', () => ({
  default: ({ onComplete }) => (
    <button type="button" onClick={onComplete}>
      完成文字动画
    </button>
  ),
}))

test('shows the brand above the message after the second sentence finishes', async () => {
  const user = userEvent.setup()
  render(<SplashScreen onComplete={vi.fn()} />)

  await user.click(screen.getByRole('button', { name: '完成文字动画' }))

  expect(screen.getByText('捷语 · LinguaJet')).toHaveClass('is-visible')
})
