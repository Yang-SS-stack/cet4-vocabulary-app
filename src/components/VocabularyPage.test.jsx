import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
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

test('shows at most twenty-one cards per page and navigates to the final partial page', async () => {
  const user = userEvent.setup()
  const testWords = Array.from({ length: 45 }, (_, index) => ({
    word: `test-${String(index + 1).padStart(2, '0')}`,
    phonetic: '/test/',
    partOfSpeech: 'n',
    meaning: '测试',
    example: '',
    translation: '',
    phrases: [],
  }))

  render(
    <VocabularyPage
      books={[{
        id: 'cet4',
        label: 'CET-4',
        description: '测试词库',
        wordListLabel: '测试单词',
        words: testWords,
      }]}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'CET-4' }))

  expect(screen.getAllByRole('listitem')).toHaveLength(21)
  expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '下一页' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(21)
  expect(screen.getByRole('heading', { name: 'test-22' })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '下一页' }))
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  expect(screen.getByText('第 3 / 3 页')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
})

test('gives the pagination controls a clear editorial structure', async () => {
  const user = userEvent.setup()
  const testWords = Array.from({ length: 21 }, (_, index) => ({
    word: `test-${index + 1}`,
    phonetic: '/test/',
    partOfSpeech: 'n',
    meaning: '测试',
    example: '',
    translation: '',
    phrases: [],
  }))

  render(
    <VocabularyPage
      books={[{
        id: 'cet4',
        label: 'CET-4',
        description: '测试词库',
        wordListLabel: '测试单词',
        words: testWords,
      }]}
    />
  )

  await user.click(screen.getByRole('button', { name: 'CET-4' }))

  const previousButton = screen.getByRole('button', { name: '上一页' })
  const nextButton = screen.getByRole('button', { name: '下一页' })

  expect(previousButton).toHaveClass('vocabulary-pagination__button', 'vocabulary-pagination__button--previous')
  expect(nextButton).toHaveClass('vocabulary-pagination__button', 'vocabulary-pagination__button--next')
  expect(previousButton.querySelector('.vocabulary-pagination__arrow')).toHaveAttribute('aria-hidden', 'true')
  expect(nextButton.querySelector('.vocabulary-pagination__arrow')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.getByRole('status')).toHaveClass('vocabulary-pagination__status')
})

test('opens the CET-4 high-frequency book in descending frequency order and returns to the book list', async () => {
  const user = userEvent.setup()
  const loadWords = vi.fn().mockResolvedValue([
    { word: 'access', phonetic: '/a/', partOfSpeech: 'n', meaning: '', example: '', translation: '', phrases: [], frequency: 46 },
    { word: 'ability', phonetic: '/a/', partOfSpeech: 'n', meaning: '', example: '', translation: '', phrases: [], frequency: 30 },
    { word: 'academic', phonetic: '/a/', partOfSpeech: 'n', meaning: '', example: '', translation: '', phrases: [], frequency: 25 },
    { word: 'anxiety', phonetic: '/a/', partOfSpeech: 'n', meaning: '', example: '', translation: '', phrases: [], frequency: 14 },
    { word: 'affect', phonetic: '/a/', partOfSpeech: 'n', meaning: '', example: '', translation: '', phrases: [], frequency: 12 },
    { word: 'achieve', phonetic: '/a/', partOfSpeech: 'n', meaning: '', example: '', translation: '', phrases: [], frequency: 9 },
  ])
  render(<VocabularyPage loadWords={loadWords} />)

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

test('loads a catalog word book only after it is selected', async () => {
  const user = userEvent.setup()
  const loadWords = vi.fn().mockResolvedValue([
    { word: 'access', phonetic: '/a/', partOfSpeech: 'n', meaning: '', example: '', translation: '', phrases: [] },
  ])

  render(
    <VocabularyPage
      books={[{
        id: 'cet4',
        label: 'CET-4',
        description: '测试词书',
        wordListLabel: '测试单词',
        dataUrl: '/data/cet4.json',
      }]}
      loadWords={loadWords}
    />,
  )

  expect(loadWords).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: 'CET-4' }))

  expect(await screen.findByRole('heading', { name: 'access' })).toBeInTheDocument()
  expect(loadWords).toHaveBeenCalledWith(expect.objectContaining({ id: 'cet4' }))
})

test('returns to the catalog when a word book cannot be loaded', async () => {
  const user = userEvent.setup()

  render(
    <VocabularyPage
      books={[{
        id: 'cet4',
        label: 'CET-4',
        description: '测试词书',
        dataUrl: '/data/cet4.json',
      }]}
      loadWords={async () => { throw new Error('failed') }}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'CET-4' }))

  expect(await screen.findByText('词库读取失败')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '返回词书' }))

  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
})
