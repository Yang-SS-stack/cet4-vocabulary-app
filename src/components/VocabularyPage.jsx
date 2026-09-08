import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { wordBooks } from '../data/wordBooks'
import { loadWordBook } from '../data/loadWordBook'
import WordCard from './WordCard'
import './VocabularyPage.css'

const WORDS_PER_PAGE = 21
const wordOrder = new Intl.Collator('en', { sensitivity: 'base' })

function VocabularyPage({ books = wordBooks, loadWords = loadWordBook }) {
  const [selectedBookId, setSelectedBookId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [words, setWords] = useState(null)
  const [loadState, setLoadState] = useState('idle')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('alphabetical')
  const searchRef = useRef(null)
  const headingRef = useRef(null)
  const pageNavigation = useRef(false)
  const loadRequestId = useRef(0)
  const contentRef = useRef(null)
  const animationRef = useRef(null)
  const isLeaving = useRef(false)
  const selectedBook = books.find((book) => book.id === selectedBookId)
  const filteredWords = useMemo(() => {
    const search = query.trim().toLowerCase()
    return (words ?? []).filter((item) => (
      item.word.toLowerCase().includes(search) || (item.meaning ?? '').toLowerCase().includes(search)
    )).sort((first, second) => {
      if (sort === 'frequency') {
        const firstFrequency = Number.isFinite(first.frequency) && first.frequency >= 0 ? first.frequency : -1
        const secondFrequency = Number.isFinite(second.frequency) && second.frequency >= 0 ? second.frequency : -1
        if (firstFrequency !== secondFrequency) return secondFrequency - firstFrequency
      }
      return wordOrder.compare(first.word, second.word)
    })
  }, [words, query, sort])

  const changeQuery = (value) => {
    setQuery(value)
    setCurrentPage(1)
  }

  const changePage = async (page) => {
    if (page === currentPage || isLeaving.current) return
    isLeaving.current = true
    const requestId = ++loadRequestId.current
    contentRef.current.inert = true
    await fade(1, 0, 160)
    if (loadRequestId.current !== requestId) return
    pageNavigation.current = true
    setCurrentPage(page)
  }

  useLayoutEffect(() => {
    if (!pageNavigation.current) return
    pageNavigation.current = false
    const requestId = loadRequestId.current
    // Reposition while the outgoing page is invisible, then reveal the new
    // cards. Keep input locked until the transition completes.
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    fade(0, 1, 240).then(() => {
      if (loadRequestId.current !== requestId) return
      contentRef.current.inert = false
      isLeaving.current = false
      headingRef.current?.focus({ preventScroll: true })
    })
  }, [currentPage])

  const clearSearch = () => {
    changeQuery('')
    searchRef.current?.focus()
  }

  const fade = (from, to, duration) => {
    const element = contentRef.current
    const startOpacity = to === 0 && element ? getComputedStyle(element).opacity : from
    animationRef.current?.cancel()
    if (!element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return Promise.resolve()
    }
    const animation = element.animate([{ opacity: startOpacity }, { opacity: to }], {
      duration,
      easing: to === 0 ? 'ease-in' : 'cubic-bezier(0.16, 1, 0.3, 1)',
      fill: 'both',
    })
    animationRef.current = animation
    return animation.finished.catch(() => {})
  }

  useLayoutEffect(() => {
    if (animationRef.current) fade(0, 1, 240)
  }, [selectedBookId, loadState])

  useLayoutEffect(() => () => {
    loadRequestId.current += 1
    animationRef.current?.cancel()
  }, [])

  const selectBook = async (book) => {
    if (isLeaving.current) return
    isLeaving.current = true
    const requestId = loadRequestId.current + 1

    loadRequestId.current = requestId
    // Start fetching during the exit; handle rejection immediately as well.
    const result = Promise.resolve().then(() => loadWords(book)).then(
      (loadedWords) => ({ loadedWords }),
      () => ({ error: true }),
    )
    contentRef.current.inert = true
    await fade(1, 0, 160)
    if (loadRequestId.current !== requestId) return
    contentRef.current.inert = false
    isLeaving.current = false
    setSelectedBookId(book.id)
    setQuery('')
    setSort(book.id === 'cet4-high-frequency' ? 'frequency' : 'alphabetical')
    setCurrentPage(1)
    setWords(null)
    setLoadState('loading')

    const { loadedWords, error } = await result
    if (loadRequestId.current !== requestId) return
    setWords(loadedWords ?? null)
    setLoadState(error ? 'error' : 'ready')
  }

  const returnToBookList = async () => {
    if (isLeaving.current) return
    isLeaving.current = true
    const requestId = ++loadRequestId.current
    contentRef.current.inert = true
    await fade(1, 0, 160)
    if (loadRequestId.current !== requestId) return
    contentRef.current.inert = false
    isLeaving.current = false
    setSelectedBookId(null)
    setCurrentPage(1)
    setWords(null)
    setLoadState('idle')
  }

  const renderContent = () => {
    if (!selectedBook) {
      return (
        <section className="vocabulary-page" aria-labelledby="vocabulary-heading">
          <div className="vocabulary-intro">
            <p className="panel-label">词书</p>
            <h2 id="vocabulary-heading">选择一本词书</h2>
            <p>从一套明确的学习范围开始，逐步扩充你的词汇库。</p>
          </div>

          <ul className="book-list" aria-label="词书列表">
            {books.map((book) => (
              <li key={book.id}>
                <button
                  className="book-entry"
                  type="button"
                  aria-label={book.label}
                  onClick={() => selectBook(book)}
                >
                  <span className="book-entry__name">{book.label}</span>
                  <span className="book-entry__description">{book.description}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )
    }

    if (loadState === 'loading') {
      return (
        <section className="vocabulary-page" aria-live="polite">
          <p>正在读取词库...</p>
          <button type="button" onClick={returnToBookList}>返回词书</button>
        </section>
      )
    }

    if (loadState === 'error') {
      return (
        <section className="vocabulary-page" aria-live="polite">
          <p>词库读取失败</p>
          <button type="button" onClick={returnToBookList}>返回词书</button>
        </section>
      )
    }

    const totalPages = Math.max(1, Math.ceil(filteredWords.length / WORDS_PER_PAGE))
    const pageStart = (currentPage - 1) * WORDS_PER_PAGE
    const pageWords = filteredWords.slice(pageStart, pageStart + WORDS_PER_PAGE)

    return (
      <section className="vocabulary-page" aria-labelledby="vocabulary-heading">
        <div className="vocabulary-intro">
          <div className="vocabulary-toolbar">
            <button
              className="book-back"
              type="button"
              aria-label="返回词书"
              onClick={returnToBookList}
            >
              ← 返回词书
            </button>
          </div>
          <h2 ref={headingRef} tabIndex={-1} id="vocabulary-heading">{selectedBook.label}</h2>
          <p>按拼写或中文释义查找，点击词卡查看详情。</p>
        </div>

        <div className="vocabulary-filters">
          <label className="vocabulary-search">
            <span>搜索单词或中文释义</span>
            <input
              ref={searchRef}
              type="search"
              placeholder="例如 apple 或 苹果"
              value={query}
              onChange={(event) => changeQuery(event.target.value)}
            />
          </label>
          <div className="vocabulary-sort" role="group" aria-labelledby="vocabulary-sort-label">
            <span id="vocabulary-sort-label">排序方式</span>
            <div className="vocabulary-sort__choices">
              {[
                { value: 'alphabetical', label: '字母顺序 A–Z', text: '字母顺序' },
                { value: 'frequency', label: '词频从高到低', text: '词频高低' },
              ].map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-label={option.label}
                  aria-pressed={sort === option.value}
                  onClick={() => {
                    setSort(option.value)
                    setCurrentPage(1)
                  }}
                >{option.text}</button>
              ))}
            </div>
          </div>
          <p className="vocabulary-result-count" aria-live="polite" aria-atomic="true">
            {query.trim() ? `找到 ${filteredWords.length} 个单词 · 共 ${words.length} 个` : `共 ${words.length} 个单词`}
          </p>
        </div>
        {sort === 'frequency' && !words.some((item) => Number.isFinite(item.frequency) && item.frequency >= 0) && (
          <p className="vocabulary-data-note">本词书暂无词频数据，当前按字母顺序显示。</p>
        )}

        {pageWords.length === 0 ? (
          <div className="vocabulary-empty">
            <h3>{query.trim() ? '没有找到匹配的单词' : '这本词书暂无单词'}</h3>
            <p>{query.trim() ? '试试更短的英文拼写或其他中文释义。' : '可以返回词书列表，选择其他词书。'}</p>
            {query && <button type="button" onClick={clearSearch}>清空搜索</button>}
          </div>
        ) : <>
        <ul className="vocabulary-list" aria-label={selectedBook.wordListLabel} key={`${selectedBookId}:${query}:${sort}:${currentPage}`}>
          {pageWords.map((item) => (
            <WordCard item={item} key={item.word} />
          ))}
        </ul>

        <nav className="vocabulary-pagination" aria-label="词表分页">
          <button
            className="vocabulary-pagination__button vocabulary-pagination__button--previous"
            type="button"
            aria-label="上一页"
            onClick={() => changePage(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <span className="vocabulary-pagination__arrow" aria-hidden="true" />
            上一页
          </button>
          <span className="vocabulary-pagination__status" role="status">
            第 {currentPage} / {totalPages} 页
          </span>
          <button
            className="vocabulary-pagination__button vocabulary-pagination__button--next"
            type="button"
            aria-label="下一页"
            onClick={() => changePage(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            下一页
            <span className="vocabulary-pagination__arrow" aria-hidden="true" />
          </button>
        </nav>
        </>}
      </section>
    )
  }

  return <div ref={contentRef} className="vocabulary-transition">{renderContent()}</div>
}

export default VocabularyPage
