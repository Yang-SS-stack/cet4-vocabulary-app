import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import FadeContent from './FadeContent'

test('renders the content passed into the fade container', () => {
  render(
    <FadeContent>
      <p>今日学习内容</p>
    </FadeContent>,
  )

  expect(screen.getByText('今日学习内容')).toBeInTheDocument()
})
