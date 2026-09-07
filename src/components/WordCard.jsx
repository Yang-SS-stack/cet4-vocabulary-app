import { useLayoutEffect, useRef, useState } from 'react'
import SpeechButton from './SpeechButton'
import './WordCard.css'

export default function WordCard({ item }) {
  const [flipped, setFlipped] = useState(false)
  const frontButton = useRef(null)
  const backButton = useRef(null)
  const hasFlipped = useRef(false)
  const pointerStart = useRef(null)
  const meaning = item.meaning?.trim() || '暂无释义'
  const briefMeaning = meaning.split(/[；;]/)[0]
  const hasFrequency = Number.isFinite(item.frequency) && item.frequency >= 0

  useLayoutEffect(() => {
    if (!hasFlipped.current) return
    const target = flipped ? backButton : frontButton
    target.current?.focus({ preventScroll: true })
  }, [flipped])

  const flip = (value) => {
    hasFlipped.current = true
    setFlipped(value)
  }

  const clickBack = (event) => {
    if (event.target.closest('button, a, input, select, textarea')) return
    if (window.getSelection()?.isCollapsed === false) return
    const start = pointerStart.current
    // Dragging text or scrolling a long detail must not turn the card over.
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
    flip(false)
  }

  return (
    <li className={`word-card${flipped ? ' is-flipped' : ''}`} onKeyDown={(event) => {
      if (flipped && event.key === 'Escape') {
        event.preventDefault()
        flip(false)
      }
    }}>
      <div className="word-card__rotator">
        <div className="word-card__face word-card__front" aria-hidden={flipped} inert={flipped}>
          <div className="word-card__topline">
            <h3 lang="en">{item.word}</h3>
            <span>{item.partOfSpeech}</span>
          </div>
          <p className="word-card__phonetic">{item.phonetic || '暂无音标'}</p>
          <p className="word-card__brief">{briefMeaning}</p>
          <button
            ref={frontButton}
            className="word-card__open"
            type="button"
            aria-label={`${item.word}，查看详情`}
            tabIndex={flipped ? -1 : 0}
            onClick={() => flip(true)}
          >
            <span>查看详情 <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M4 10h12m-5-5 5 5-5 5" /></svg></span>
          </button>
        </div>
        <div
          className="word-card__face word-card__back"
          aria-hidden={!flipped}
          inert={!flipped}
          onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY } }}
          onClick={clickBack}
        >
          <div className="word-card__details" role="region" aria-label={`${item.word} 的详情`} tabIndex={flipped ? 0 : -1}>
            <div className="word-card__topline">
              <h3 lang="en">{item.word}</h3>
              <span>{item.partOfSpeech}</span>
            </div>
            <p className="word-card__phonetic">{item.phonetic || '暂无音标'}</p>
            <p className="word-card__frequency">{hasFrequency ? `词频 ${item.frequency.toLocaleString('en-US')}` : '暂无词频数据'}</p>
            <h4>释义</h4>
            <p>{meaning}</p>
            <h4>例句</h4>
            <p lang={item.example ? 'en' : undefined}>{item.example || '暂无例句'}</p>
            {item.translation && <p className="word-card__translation">{item.translation}</p>}
            <h4>词组</h4>
            {item.phrases?.length ? (
              <ul className="word-card__phrases">
                {item.phrases.map((phrase, index) => <li key={`${phrase}-${index}`} lang="en">{phrase}</li>)}
              </ul>
            ) : <p>暂无词组</p>}
          </div>
          <div className="word-card__actions">
            <button ref={backButton} type="button" tabIndex={flipped ? 0 : -1} onClick={() => flip(false)}>
              返回单词正面
            </button>
            {flipped && <SpeechButton word={item.word} />}
          </div>
        </div>
      </div>
    </li>
  )
}
