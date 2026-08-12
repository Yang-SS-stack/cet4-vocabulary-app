import { render, screen, waitFor } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import TextType from './TextType'

test('types a sentence and reports when it is complete', async () => {
  const onSentenceComplete = vi.fn()

  render(
    <TextType
      text="LinguaJet"
      typingSpeed={1}
      loop={false}
      onSentenceComplete={onSentenceComplete}
    />,
  )

  await waitFor(() => expect(screen.getByText('LinguaJet')).toBeInTheDocument())
  expect(onSentenceComplete).toHaveBeenCalledWith('LinguaJet', 0)
})

test('deletes the first sentence before typing the next one', async () => {
  const onComplete = vi.fn()

  render(
    <TextType
      text={['欢迎', '继续学习']}
      typingSpeed={1}
      pauseDuration={1}
      deletingSpeed={1}
      loop={false}
      onComplete={onComplete}
    />,
  )

  await waitFor(() => expect(screen.getByText('继续学习')).toBeInTheDocument())
  await waitFor(() => expect(onComplete).toHaveBeenCalledWith('继续学习', 1))
})
