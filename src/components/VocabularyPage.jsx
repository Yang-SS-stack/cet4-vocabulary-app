import { useState } from 'react'
import { wordBooks } from '../data/wordBooks'
import './VocabularyPage.css'

function VocabularyPage({ books = wordBooks }) {
  const [selectedBookId, setSelectedBookId] = useState(null)
  const selectedBook = books.find((book) => book.id === selectedBookId)

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
                onClick={() => setSelectedBookId(book.id)}
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

  return (
    <section className="vocabulary-page" aria-labelledby="vocabulary-heading">
      <div className="vocabulary-intro">
        <div className="vocabulary-toolbar">
          <button
            className="book-back"
            type="button"
            aria-label="返回词书"
            onClick={() => setSelectedBookId(null)}
          >
            ← 返回词书
          </button>
          <p className="panel-label">第一批词汇</p>
        </div>
        <h2 id="vocabulary-heading">{selectedBook.label}</h2>
        <p>先熟悉一小批高频基础词，再逐步扩充完整词库。</p>
      </div>

      <ul className="vocabulary-list" aria-label={selectedBook.wordListLabel}>
        {selectedBook.words.map((item) => (
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
    </section>
  )
}

export default VocabularyPage
