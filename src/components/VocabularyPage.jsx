import { useLayoutEffect, useRef, useState } from 'react'
import { wordBooks } from '../data/wordBooks'
import { loadWordBook } from '../data/loadWordBook'
import './VocabularyPage.css'

const WORDS_PER_PAGE = 21

function VocabularyPage({ books = wordBooks, loadWords = loadWordBook }) {
  const [selectedBookId, setSelectedBookId] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [words, setWords] = useState(null)
  const [loadState, setLoadState] = useState('idle')
  const loadRequestId = useRef(0)
  const contentRef = useRef(null)
  const animationRef = useRef(null)
  const isLeaving = useRef(false)
  const selectedBook = books.find((book) => book.id === selectedBookId)

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

    const totalPages = Math.max(1, Math.ceil(words.length / WORDS_PER_PAGE))
    const pageStart = (currentPage - 1) * WORDS_PER_PAGE
    const pageWords = words.slice(pageStart, pageStart + WORDS_PER_PAGE)

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
            <p className="panel-label">第一批词汇</p>
          </div>
          <h2 id="vocabulary-heading">{selectedBook.label}</h2>
          <p>先熟悉一小批高频基础词，再逐步扩充完整词库。</p>
        </div>

        <ul className="vocabulary-list" aria-label={selectedBook.wordListLabel}>
          {pageWords.map((item) => (
            <li className="vocabulary-card" key={item.word}>
              <div className="vocabulary-card__topline">
                <h3>{item.word}</h3>
                <span>{item.partOfSpeech}</span>
              </div>
              <p className="vocabulary-card__phonetic">{item.phonetic}</p>
              <p className="vocabulary-card__meaning">{item.meaning}</p>
              <p className="vocabulary-card__example">{item.example}</p>
              <p className="vocabulary-card__translation">{item.translation}</p>
            </li>
          ))}
        </ul>

        <nav className="vocabulary-pagination" aria-label="词表分页">
          <button
            className="vocabulary-pagination__button vocabulary-pagination__button--previous"
            type="button"
            aria-label="上一页"
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
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
            onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
            disabled={currentPage === totalPages}
          >
            下一页
            <span className="vocabulary-pagination__arrow" aria-hidden="true" />
          </button>
        </nav>
      </section>
    )
  }

  return <div ref={contentRef} className="vocabulary-transition">{renderContent()}</div>
}

export default VocabularyPage
