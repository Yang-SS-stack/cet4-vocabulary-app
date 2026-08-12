import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import VocabularyPage from './VocabularyPage'

test('renders every book from the provided catalog', () => {
  render(
    <VocabularyPage
      books={[
        {
          id: 'cet4',
          label: 'CET-4',
          description: '大学英语四级核心词汇',
          words: [],
        },
        {
          id: 'cet6',
          label: 'CET-6',
          description: '大学英语六级核心词汇',
          words: [],
        },
      ]}
    />,
  )

  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'CET-6' })).toBeInTheDocument()
})

test('opens the CET-4 high-frequency book in descending frequency order and returns to the book list', async () => {
  const user = userEvent.setup()
  render(<VocabularyPage />)

  const bookButton = screen.getByRole('button', { name: 'CET-4高频词汇' })
  expect(bookButton).toHaveTextContent('大学英语四级高频词汇')

  await user.click(bookButton)

  expect(screen.getByRole('heading', { name: 'CET-4高频词汇' })).toBeInTheDocument()
  expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
    expect.stringContaining('access'),
    expect.stringContaining('ability'),
    expect.stringContaining('academic'),
    expect.stringContaining('anxiety'),
    expect.stringContaining('affect'),
    expect.stringContaining('achieve'),
  ])

  await user.click(screen.getByRole('button', { name: '返回词书' }))

  expect(screen.getByRole('button', { name: 'CET-4高频词汇' })).toBeInTheDocument()
})
