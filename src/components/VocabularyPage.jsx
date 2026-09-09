import { useLayoutEffect, useRef, useState } from 'react'
import { wordBooks } from '../data/wordBooks'
import { loadWordBook } from '../data/loadWordBook'
import { createInlineWordBookSession } from '../data/wordBookSession'
import WordCard from './WordCard'
import './VocabularyPage.css'

const EMPTY_PAGE = { words: [], total: 0, totalPages: 1 }

function VocabularyPage({ books = wordBooks, loadWords = loadWordBook }) {
  const [selectedBookId, setSelectedBookId] = useState(null)
  const [bookSession, setBookSession] = useState(null)
  const [pageData, setPageData] = useState(EMPTY_PAGE)
  const [pageLoadState, setPageLoadState] = useState('idle')
  const [hasLoadedPage, setHasLoadedPage] = useState(false)
  const [indexState, setIndexState] = useState('loading')
  const [pageError, setPageError] = useState(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('alphabetical')
  const [displayedQuery, setDisplayedQuery] = useState('')
  const [displayedSort, setDisplayedSort] = useState('alphabetical')
  const searchRef = useRef(null)
  const headingRef = useRef(null)
  const pageNavigation = useRef(false)
  const loadRequestId = useRef(0)
  const contentRef = useRef(null)
  const animationRef = useRef(null)
  const isLeaving = useRef(false)
  const currentView = useRef({ bookId: null, session: null, page: 1, query: '', sort: 'alphabetical' })
  const selectedBook = books.find((book) => book.id === selectedBookId)

  const fade = (from, to, duration) => {
    const element = contentRef.current
    const startOpacity = to === 0 && element ? getComputedStyle(element).opacity : from
    animationRef.current?.cancel()
    if (!element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
    const animation = element.animate([{ opacity: startOpacity }, { opacity: to }], { duration, easing: to === 0 ? 'ease-in' : 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'both' })
    animationRef.current = animation
    return animation.finished.catch(() => {})
  }

  const requestPage = async ({ session, bookId, sort: requestedSort, page, query: requestedQuery }) => {
    const requestId = ++loadRequestId.current
    setPageLoadState('loading')
    setPageError(null)
    try {
      const result = await session.loadPage({ sort: requestedSort, page, query: requestedQuery })
      const view = currentView.current
      if (loadRequestId.current !== requestId || view.session !== session || view.bookId !== bookId || view.sort !== requestedSort || view.page !== page || view.query !== requestedQuery) return
      setPageData(result)
      setCurrentPage(page)
      setDisplayedQuery(requestedQuery)
      setDisplayedSort(requestedSort)
      setPageLoadState('ready')
      setHasLoadedPage(true)
    } catch {
      const view = currentView.current
      if (loadRequestId.current !== requestId || view.session !== session || view.bookId !== bookId || view.sort !== requestedSort || view.page !== page || view.query !== requestedQuery) return
      setPageLoadState('error')
      setPageError(new Error('Unable to load word book page'))
      pageNavigation.current = false
      isLeaving.current = false
      if (contentRef.current) contentRef.current.inert = false
    }
  }

  const updateView = ({ page, nextQuery = query, nextSort = sort }) => {
    if (!bookSession || !selectedBook) return
    currentView.current = { bookId: selectedBook.id, session: bookSession, page, query: nextQuery, sort: nextSort }
    setQuery(nextQuery)
    setSort(nextSort)
    requestPage({ session: bookSession, bookId: selectedBook.id, page, query: nextQuery, sort: nextSort })
  }

  const changePage = async (page) => {
    if (page === currentPage || isLeaving.current || pageLoadState === 'loading') return
    isLeaving.current = true
    const transitionId = ++loadRequestId.current
    contentRef.current.inert = true
    await fade(1, 0, 160)
    if (loadRequestId.current !== transitionId) return
    pageNavigation.current = true
    updateView({ page })
  }

  useLayoutEffect(() => {
    if (!pageNavigation.current) return
    pageNavigation.current = false
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
    fade(0, 1, 240).then(() => {
      contentRef.current.inert = false
      isLeaving.current = false
      headingRef.current?.focus({ preventScroll: true })
    })
  }, [currentPage])

  useLayoutEffect(() => {
    if (animationRef.current && (!hasLoadedPage || pageLoadState === 'error')) fade(0, 1, 240)
  }, [selectedBookId, pageLoadState, hasLoadedPage])

  const watchIndex = (session) => {
    setIndexState('loading')
    Promise.resolve()
      .then(() => (typeof session.loadIndex === 'function' ? session.loadIndex() : session.indexReady))
      .then(
        () => currentView.current.session === session && setIndexState('ready'),
        () => currentView.current.session === session && setIndexState('error'),
      )
  }

  useLayoutEffect(() => () => {
    loadRequestId.current += 1
    animationRef.current?.cancel()
  }, [])

  const selectBook = async (book) => {
    if (isLeaving.current) return
    isLeaving.current = true
    const transitionId = ++loadRequestId.current
    const sessionResult = Promise.resolve().then(() => loadWords(book)).then((value) => ({ session: Array.isArray(value) ? createInlineWordBookSession(value) : value }), () => ({ error: true }))
    contentRef.current.inert = true
    await fade(1, 0, 160)
    if (loadRequestId.current !== transitionId) return
    contentRef.current.inert = false
    isLeaving.current = false
    setSelectedBookId(book.id)
    setPageData(EMPTY_PAGE)
    setPageLoadState('loading')
    setHasLoadedPage(false)
    setPageError(null)
    setQuery('')
    setDisplayedQuery('')
    const defaultSort = book.id === 'cet4-high-frequency' ? 'frequency' : 'alphabetical'
    setSort(defaultSort)
    setDisplayedSort(defaultSort)
    setCurrentPage(1)
    const { session, error } = await sessionResult
    if (loadRequestId.current !== transitionId || error || !session?.loadPage) {
      if (loadRequestId.current === transitionId) { setPageLoadState('error'); setPageError(new Error('Unable to load word book')) }
      return
    }
    setBookSession(session)
    currentView.current = { bookId: book.id, session, page: 1, query: '', sort: defaultSort }
    watchIndex(session)
    requestPage({ session, bookId: book.id, page: 1, query: '', sort: defaultSort })
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
    currentView.current = { bookId: null, session: null, page: 1, query: '', sort: 'alphabetical' }
    setSelectedBookId(null); setBookSession(null); setPageData(EMPTY_PAGE); setPageLoadState('idle'); setHasLoadedPage(false); setPageError(null); setCurrentPage(1); setDisplayedQuery(''); setDisplayedSort('alphabetical')
  }

  const clearSearch = () => { updateView({ page: 1, nextQuery: '' }); searchRef.current?.focus() }
  const retryPage = () => {
    const view = currentView.current
    if (!view.session || view.bookId !== selectedBookId) return
    requestPage({ session: view.session, bookId: view.bookId, page: view.page, query: view.query, sort: view.sort })
  }
  const retryIndex = () => { if (bookSession) watchIndex(bookSession) }
  const isInitialLoading = pageLoadState === 'loading' && !hasLoadedPage
  const isInitialError = pageLoadState === 'error' && !hasLoadedPage

  return <div ref={contentRef} className="vocabulary-transition">{!selectedBook ? <section className="vocabulary-page" aria-labelledby="vocabulary-heading">
    <div className="vocabulary-intro"><p className="panel-label">词书</p><h2 id="vocabulary-heading">选择一本词书</h2><p>从一套明确的学习范围开始，逐步扩充你的词汇库。</p></div>
    <ul className="book-list" aria-label="词书列表">{books.map((book) => <li key={book.id}><button className="book-entry" type="button" aria-label={book.label} onClick={() => selectBook(book)}><span className="book-entry__name">{book.label}</span><span className="book-entry__description">{book.description}</span></button></li>)}</ul>
  </section> : isInitialLoading ? <section className="vocabulary-page" aria-live="polite"><p>正在读取词库...</p><button type="button" onClick={returnToBookList}>返回词书</button></section> : isInitialError ? <section className="vocabulary-page" aria-live="polite"><p>词库读取失败</p><button type="button" onClick={returnToBookList}>返回词书</button></section> : <BookContent book={selectedBook} bookId={selectedBookId} pageData={pageData} pageLoadState={pageLoadState} indexState={indexState} pageError={pageError} currentPage={currentPage} query={query} sort={sort} displayedQuery={displayedQuery} displayedSort={displayedSort} searchRef={searchRef} headingRef={headingRef} onBack={returnToBookList} onQuery={(value) => updateView({ page: 1, nextQuery: value })} onSort={(value) => updateView({ page: 1, nextSort: value })} onPage={changePage} onClearSearch={clearSearch} onRetryPage={retryPage} onRetryIndex={retryIndex} />}</div>
  }

function BookContent({ book, bookId, pageData, pageLoadState, indexState, pageError, currentPage, query, sort, displayedQuery, displayedSort, searchRef, headingRef, onBack, onQuery, onSort, onPage, onClearSearch, onRetryPage, onRetryIndex }) {
  const hasFrequency = pageData.words.some((item) => Number.isFinite(item.frequency) && item.frequency >= 0)
  return <section className="vocabulary-page" aria-labelledby="vocabulary-heading">
    <div className="vocabulary-intro">
      <div className="vocabulary-toolbar"><button className="book-back" type="button" aria-label="返回词书" onClick={onBack}>← 返回词书</button></div>
      <h2 ref={headingRef} tabIndex={-1} id="vocabulary-heading">{book.label}</h2>
      <p>按拼写、中文释义或词性查找，点击词卡查看详情。</p>
    </div>
    <div className="vocabulary-filters">
      <label className="vocabulary-search"><span>搜索单词、中文释义或词性</span><input ref={searchRef} type="search" placeholder="例如 apple、苹果、名词或 n." value={query} onChange={(event) => onQuery(event.target.value)} /></label>
      <div className="vocabulary-sort" role="group" aria-labelledby="vocabulary-sort-label">
        <span id="vocabulary-sort-label">排序方式</span>
        <div className="vocabulary-sort__choices">{[
          { value: 'alphabetical', label: '字母顺序 A–Z', text: '字母顺序' },
          { value: 'frequency', label: '词频从高到低', text: '词频高低' },
        ].map((option) => <button key={option.value} type="button" aria-label={option.label} aria-pressed={sort === option.value} onClick={() => onSort(option.value)}>{option.text}</button>)}</div>
      </div>
      <p className="vocabulary-result-count" aria-live="polite" aria-atomic="true">{displayedQuery.trim() ? `找到 ${pageData.total} 个单词` : `共 ${pageData.total} 个单词`}</p>
      {indexState === 'loading' && <p className="vocabulary-load-status" role="status">正在准备搜索</p>}
      {indexState === 'error' && <p className="vocabulary-load-status" role="status">搜索索引读取失败，词卡浏览仍可继续。 <button type="button" onClick={onRetryIndex}>重试搜索</button></p>}
      {pageLoadState === 'loading' && <p className="vocabulary-load-status" role="status">正在加载当前结果...</p>}
      {pageError && <p className="vocabulary-load-status vocabulary-load-status--error" role="status">当前结果加载失败，请重试或返回词书。 <button type="button" onClick={onRetryPage}>重试当前结果</button></p>}
    </div>
    {displayedSort === 'frequency' && !hasFrequency && <p className="vocabulary-data-note">本词书暂无词频数据，当前按字母顺序显示。</p>}
    {pageData.words.length === 0 ? <div className="vocabulary-empty">
      <h3>{displayedQuery.trim() ? '没有找到匹配的单词' : '这本词书暂无单词'}</h3>
      <p>{displayedQuery.trim() ? '试试更短的英文拼写或其他中文释义。' : '可以返回词书列表，选择其他词书。'}</p>
      {query && <button type="button" onClick={onClearSearch}>清空搜索</button>}
    </div> : <>
      <ul className="vocabulary-list" aria-label={book.wordListLabel} key={`${bookId}:${displayedQuery}:${displayedSort}:${currentPage}`}>
        {pageData.words.map((item) => <WordCard item={item} showFrequency={bookId === 'cet4-high-frequency'} key={item.word} />)}
      </ul>
      <nav className="vocabulary-pagination" aria-label="词表分页">
        <button className="vocabulary-pagination__button vocabulary-pagination__button--previous" type="button" aria-label="上一页" onClick={() => onPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1 || pageLoadState !== 'ready'}><span className="vocabulary-pagination__arrow" aria-hidden="true" />上一页</button>
        <span className="vocabulary-pagination__status" role="status">第 {currentPage} / {pageData.totalPages} 页</span>
        <button className="vocabulary-pagination__button vocabulary-pagination__button--next" type="button" aria-label="下一页" onClick={() => onPage(Math.min(pageData.totalPages, currentPage + 1))} disabled={currentPage === pageData.totalPages || pageLoadState !== 'ready'}>下一页<span className="vocabulary-pagination__arrow" aria-hidden="true" /></button>
      </nav>
    </>}
  </section>
}

export default VocabularyPage
