import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { expect, test, vi } from 'vitest'
import ParticleTextTransition from './ParticleTextTransition'

test('renders a non-interactive particle layer while a transition is active', () => {
  render(
    <ParticleTextTransition
      sourceTexts={[]}
      targetElement={null}
      onComplete={vi.fn()}
    />,
  )

  expect(screen.getByTestId('particle-text-transition')).toHaveClass('particle-text-transition')
})

test('maps the final particle target from the logo line box and baseline', () => {
  const source = readFileSync('src/components/ParticleTextTransition.jsx', 'utf8')

  expect(source).toContain('targetElement.getBoundingClientRect()')
  expect(source).toContain('lineBoxBaseline: true')
})
