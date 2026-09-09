import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createInlineWordBookSession } from '../data/wordBookSession'
import VocabularyPage from './VocabularyPage'

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })
beforeEach(() => vi.spyOn(window, 'scrollTo').mockImplementation(() => {}))

test('filters by Chinese and abbreviated POS including mixed labels without filling unrelated cards', async () => {
  const user = await openBrowseBook([
    { word: 'apple', meaning: '苹果', partOfSpeech: 'n' },
    { word: 'listen', meaning: '听', partOfSpeech: 'vi' },
    { word: 'take', meaning: '拿', partOfSpeech: 'n/vt' },
  ])
  for (const [query, expected] of [['名词', ['apple', 'take']], ['vt.', ['take']], ['不及物动词', ['listen']], ['动词', ['listen', 'take']]]) {
    const search = screen.getByRole('searchbox')
    await user.clear(search)
    await user.type(search, query)
    await waitFor(() => expect(visibleWordNames()).toEqual(expected))
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  }
})

test('previous and next page return to the document top after rendering the new page', async () => {
  const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
  const words = Array.from({ length: 43 }, (_, index) => ({
    ...browseWords[0], word: `word-${String(index + 1).padStart(2, '0')}`,
  }))
  const user = await openBrowseBook(words)
  expect(scroll).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '下一页' }))
  expect(visibleWordNames()[0]).toBe('word-22')
  expect(screen.getByRole('heading', { name: 'CET-4', exact: true })).toHaveFocus()
  expect(scroll).toHaveBeenLastCalledWith({ top: 0, left: 0, behavior: 'instant' })
  await user.click(screen.getByRole('button', { name: '上一页' }))
  expect(visibleWordNames()[0]).toBe('word-01')
  expect(scroll).toHaveBeenCalledTimes(2)
  await user.click(screen.getByRole('button', { name: '上一页' }))
  expect(scroll).toHaveBeenCalledTimes(2)
  await user.type(screen.getByRole('searchbox'), 'word-01')
  expect(scroll).toHaveBeenCalledTimes(2)
})

const browseWords = [
  { word: 'zebra', meaning: '斑马', frequency: 8 },
  { word: 'Apple', meaning: '苹果', frequency: 12 },
  { word: 'application', meaning: '申请；应用', frequency: 8 },
  { word: 'absent', meaning: '缺席' },
  { word: 'zero', meaning: '零', frequency: 0 },
].map((item) => ({ phonetic: '/test/', partOfSpeech: 'n', example: '', translation: '', phrases: [], ...item }))

const catalogBook = {
  id: 'cet4',
  label: 'CET-4',
  description: '测试词书',
  wordListLabel: '测试单词',
}

function deferredIndexSession(words) {
  let resolveIndex
  const indexReady = new Promise((resolve) => { resolveIndex = resolve })
  return {
    indexReady,
    resolveIndex,
    loadPage: createInlineWordBookSession(words).loadPage,
  }
}

function deferredPageSession() {
  const nextPageReady = new Promise(() => {})
  return {
    indexReady: Promise.resolve(),
    loadPage: ({ page }) => page === 1
      ? Promise.resolve({ words: [{ ...browseWords[0], word: 'abruptly' }], total: 22, totalPages: 2 })
      : nextPageReady,
  }
}

function failedPageSession() {
  return {
    indexReady: Promise.resolve(),
    loadPage: ({ page }) => page === 1
      ? Promise.resolve({ words: [{ ...browseWords[0], word: 'abruptly' }], total: 22, totalPages: 2 })
      : Promise.reject(new Error('page unavailable')),
  }
}

function deferredSearchSession() {
  let resolveSearch
  return {
    indexReady: Promise.resolve(),
    resolveSearch: () => resolveSearch({ words: [{ ...browseWords[0], word: 'needle' }], total: 1, totalPages: 1 }),
    loadPage: ({ query }) => query
      ? new Promise((resolve) => { resolveSearch = resolve })
      : Promise.resolve({ words: Array.from({ length: 43 }, (_, index) => ({ ...browseWords[0], word: `word-${String(index + 1).padStart(2, '0')}` })), total: 43, totalPages: 3 }),
  }
}

function retryableIndexSession(words) {
  let attempts = 0
  return {
    indexReady: Promise.resolve(),
    loadIndex: vi.fn(() => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error('index unavailable')) : Promise.resolve()
    }),
    loadPage: createInlineWordBookSession(words).loadPage,
  }
}

function retryablePageSession() {
  let attempts = 0
  return {
    indexReady: Promise.resolve(),
    loadPage: ({ page }) => page === 1
      ? Promise.resolve({ words: [{ ...browseWords[0], word: 'abruptly' }], total: 22, totalPages: 2 })
      : attempts++ === 0
        ? Promise.reject(new Error('page unavailable'))
        : Promise.resolve({ words: [{ ...browseWords[0], word: 'again' }], total: 22, totalPages: 2 }),
  }
}

function searchableSession(words, { rejectIndex = false } = {}) {
  const session = createInlineWordBookSession(words)
  if (!rejectIndex) return session
  const indexReady = Promise.reject(new Error('index unavailable'))
  indexReady.catch(() => {})
  const loadIndex = () => Promise.reject(new Error('index unavailable'))
  return { ...session, indexReady, loadIndex }
}

async function openSessionBook({ session, book = catalogBook }) {
  const user = userEvent.setup()
  render(<VocabularyPage books={[book]} loadWords={async () => session} />)
  await user.click(screen.getByRole('button', { name: book.label, exact: true }))
  await screen.findAllByRole('heading', { level: 3 })
  return user
}

test('shows the first page while the search index is still loading', async () => {
  const session = deferredIndexSession([{ ...browseWords[0], word: 'abruptly' }])
  const user = userEvent.setup()
  render(<VocabularyPage books={[catalogBook]} loadWords={async () => session} />)

  await user.click(screen.getByRole('button', { name: 'CET-4', exact: true }))

  expect(await screen.findByRole('heading', { name: 'abruptly' })).toBeInTheDocument()
  expect(screen.getByText('正在准备搜索')).toBeInTheDocument()
})

test('uses the complete index for Chinese and POS search', async () => {
  const user = await openSessionBook({ session: searchableSession([
    { ...browseWords[0], word: 'apple', meaning: '苹果', partOfSpeech: 'n' },
    { ...browseWords[0], word: 'listen', meaning: '听', partOfSpeech: 'vi' },
    { ...browseWords[0], word: 'take', meaning: '拿', partOfSpeech: 'n/vt' },
  ]) })

  await user.type(screen.getByRole('searchbox'), '不及物动词')

  await waitFor(() => expect(visibleWordNames()).toEqual(['listen']))
  expect(screen.getByText('找到 1 个单词')).toBeInTheDocument()
})

test('keeps visible cards while a later page is loading', async () => {
  const session = deferredPageSession()
  const user = await openSessionBook({ session })
  expect(visibleWordNames()).toEqual(['abruptly'])

  await user.click(screen.getByRole('button', { name: '下一页' }))

  expect(screen.getByRole('heading', { name: 'abruptly' })).toBeInTheDocument()
  expect(screen.getByText('正在加载当前结果...')).toHaveAttribute('role', 'status')
})

test('reports an index failure without removing browseable cards', async () => {
  const session = searchableSession([{ ...browseWords[0], word: 'abruptly' }], { rejectIndex: true })
  await openSessionBook({ session })

  expect(screen.getByRole('heading', { name: 'abruptly' })).toBeInTheDocument()
  await waitFor(() => expect(statusContaining('搜索索引读取失败')).toBeTruthy())
  expect(statusContaining('搜索索引读取失败')).toHaveAttribute('role', 'status')
})

test('reports a later page failure without removing visible cards', async () => {
  const user = await openSessionBook({ session: failedPageSession() })
  expect(visibleWordNames()).toEqual(['abruptly'])

  await user.click(screen.getByRole('button', { name: '下一页' }))

  expect(screen.getByRole('heading', { name: 'abruptly' })).toBeInTheDocument()
  await waitFor(() => expect(statusContaining('当前结果加载失败')).toBeTruthy())
  expect(statusContaining('当前结果加载失败')).toHaveAttribute('role', 'status')
  expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
})

test('keeps displayed cards and pagination metadata together while a search is loading', async () => {
  const session = deferredSearchSession()
  await openSessionBook({ session })
  const search = screen.getByRole('searchbox')

  fireEvent.change(search, { target: { value: 'needle' } })

  expect(screen.getByRole('heading', { name: 'word-01' })).toBeInTheDocument()
  expect(screen.getByText('共 43 个单词')).toBeInTheDocument()
  expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled()
  expect(screen.queryByText('找到 1 个单词')).not.toBeInTheDocument()

  await act(async () => session.resolveSearch())

  expect(await screen.findByRole('heading', { name: 'needle' })).toBeInTheDocument()
  expect(screen.getByText('找到 1 个单词')).toBeInTheDocument()
  expect(screen.queryByText('共 43 个单词')).not.toBeInTheDocument()
})

test('retries a failed page request without changing the displayed page until success', async () => {
  const user = await openSessionBook({ session: retryablePageSession() })
  await user.click(screen.getByRole('button', { name: '下一页' }))

  await waitFor(() => expect(statusContaining('当前结果加载失败')).toBeTruthy())
  expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '重试当前结果' }))
  expect(await screen.findByRole('heading', { name: 'again' })).toBeInTheDocument()
  expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument()
})

test('retries the search index and announces recovery without hiding cards', async () => {
  const session = retryableIndexSession([{ ...browseWords[0], word: 'abruptly' }])
  const user = await openSessionBook({ session })

  await waitFor(() => expect(statusContaining('搜索索引读取失败')).toBeTruthy())
  await user.click(screen.getByRole('button', { name: '重试搜索' }))

  await waitFor(() => expect(session.loadIndex).toHaveBeenCalledTimes(2))
  expect(statusContaining('搜索索引读取失败')).toBeUndefined()
  expect(screen.getByRole('heading', { name: 'abruptly' })).toBeInTheDocument()
})

async function openBrowseBook(words = browseWords) {
  const user = userEvent.setup()
  render(<VocabularyPage books={[
    { id: 'cet4', label: 'CET-4', wordListLabel: '测试单词', words },
    { id: 'cet4-high-frequency', label: '高频测试', wordListLabel: '高频单词', words: browseWords },
  ]} />)
  await user.click(screen.getByRole('button', { name: 'CET-4', exact: true }))
  return user
}

function visibleWordNames() {
  return within(screen.getByRole('list', { name: '测试单词' }))
    .getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)
}

function statusContaining(text) {
  return screen.getAllByRole('status').find((status) => status.textContent.includes(text))
}

test('sorts alphabetically by default and by descending frequency with ties and missing data', async () => {
  const user = await openBrowseBook()
  expect(visibleWordNames()).toEqual(['absent', 'Apple', 'application', 'zebra', 'zero'])
  expect(screen.queryByText('词频 12')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '词频从高到低' }))
  expect(visibleWordNames()).toEqual(['Apple', 'application', 'zebra', 'zero', 'absent'])
  expect(browseWords[0].word).toBe('zebra')
})

test('searches only matching English spellings or Chinese meanings and clears an empty result', async () => {
  const user = await openBrowseBook()
  const search = screen.getByRole('searchbox', { name: '搜索单词、中文释义或词性' })
  await user.type(search, '  APP  ')
  expect(visibleWordNames()).toEqual(['Apple', 'application'])
  await user.clear(search)
  await user.type(search, '申请')
  expect(visibleWordNames()).toEqual(['application'])
  await user.clear(search)
  await user.type(search, '没有这个词')
  expect(screen.queryByRole('list', { name: '测试单词' })).not.toBeInTheDocument()
  expect(screen.getByText('没有找到匹配的单词')).toBeInTheDocument()
  expect(screen.queryByRole('navigation', { name: '词表分页' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '清空搜索' }))
  expect(visibleWordNames()).toHaveLength(5)
})

test('resets pagination when searching or sorting and never fills results with unrelated words', async () => {
  const words = Array.from({ length: 45 }, (_, index) => ({
    ...browseWords[0], word: `word-${String(index + 1).padStart(2, '0')}`,
    meaning: index < 23 ? '匹配' : '其他', frequency: index,
  }))
  const user = await openBrowseBook(words)
  await user.click(screen.getByRole('button', { name: '下一页' }))
  await user.type(screen.getByRole('searchbox'), '匹配')
  expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
  expect(visibleWordNames()).toHaveLength(21)
  await user.click(screen.getByRole('button', { name: '下一页' }))
  expect(visibleWordNames()).toEqual(['word-22', 'word-23'])
  await user.click(screen.getByRole('button', { name: '词频从高到低' }))
  expect(screen.getByText('第 1 / 2 页')).toBeInTheDocument()
  expect(visibleWordNames()[0]).toBe('word-23')
})

test('clears the search on changing books and restores each book default sort', async () => {
  const user = await openBrowseBook()
  await user.type(screen.getByRole('searchbox'), '不存在')
  await user.click(screen.getByRole('button', { name: '返回词书' }))
  await user.click(screen.getByRole('button', { name: '高频测试' }))
  expect(screen.getByRole('searchbox')).toHaveValue('')
  expect(screen.getByRole('button', { name: '词频从高到低' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: '返回词书' }))
  await user.click(screen.getByRole('button', { name: 'CET-4', exact: true }))
  expect(screen.getByRole('button', { name: '字母顺序 A–Z' })).toHaveAttribute('aria-pressed', 'true')
})

test('offers two visible sort choices with keyboard operation and an explicit selected state', async () => {
  const user = await openBrowseBook()
  const group = screen.getByRole('group', { name: '排序方式' })
  const alphabet = within(group).getByRole('button', { name: '字母顺序 A–Z' })
  const frequency = within(group).getByRole('button', { name: '词频从高到低' })
  expect(alphabet).toHaveAttribute('aria-pressed', 'true')
  expect(frequency).toHaveAttribute('aria-pressed', 'false')
  alphabet.focus()
  await user.tab()
  await user.keyboard('{Enter}')
  expect(frequency).toHaveFocus()
  expect(frequency).toHaveAttribute('aria-pressed', 'true')
  expect(alphabet).toHaveAttribute('aria-pressed', 'false')
})

test('fades out before paging and scrolling, then fades in and restores keyboard access', async () => {
  const user = await openBrowseBook(Array.from({ length: 43 }, (_, index) => ({
    ...browseWords[0], word: `word-${String(index + 1).padStart(2, '0')}`,
  })))
  const root = document.querySelector('.vocabulary-transition')
  const finishes = []
  root.animate = vi.fn(() => ({
    cancel: vi.fn(), finished: new Promise((resolve) => finishes.push(resolve)),
  }))
  const next = screen.getByRole('button', { name: '下一页' })
  await user.click(next)
  expect(root.inert).toBe(true)
  expect(root.animate).toHaveBeenCalledTimes(1)
  expect(window.scrollTo).not.toHaveBeenCalled()
  expect(screen.getByText('第 1 / 3 页')).toBeInTheDocument()
  fireEvent.click(next)
  expect(root.animate).toHaveBeenCalledTimes(1)
  await act(async () => finishes[0]())
  expect(screen.getByText('第 2 / 3 页')).toBeInTheDocument()
  expect(window.scrollTo).toHaveBeenCalledOnce()
  expect(root.animate).toHaveBeenLastCalledWith([{ opacity: 0 }, { opacity: 1 }], expect.objectContaining({ duration: 240 }))
  expect(root.inert).toBe(true)
  await act(async () => finishes[1]())
  expect(root.inert).toBe(false)
  expect(screen.getByRole('heading', { name: 'CET-4', exact: true })).toHaveFocus()
})

test('skips page animation for reduced motion and still returns to the top', async () => {
  const user = await openBrowseBook(Array.from({ length: 22 }, (_, index) => ({ ...browseWords[0], word: `test-${index}` })))
  const root = document.querySelector('.vocabulary-transition')
  root.animate = vi.fn()
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  await user.click(screen.getByRole('button', { name: '下一页' }))
  expect(root.animate).not.toHaveBeenCalled()
  expect(screen.getByText('第 2 / 2 页')).toBeInTheDocument()
  expect(root.inert).toBe(false)
  expect(window.scrollTo).toHaveBeenCalledOnce()
})

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
