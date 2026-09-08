import { useLayoutEffect, useRef, useState } from 'react'
import SpeechButton from './SpeechButton'
import { describePartOfSpeech } from '../data/partOfSpeech'
import supplementalExamples from '../data/supplementalExamples.json'
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
  const supplemental = !item.example?.trim() ? supplementalExamples[item.word.toLowerCase()] : null
  const example = supplemental?.example ?? item.example
  const translation = supplemental?.translation ?? item.translation
  const frequency = hasFrequency ? `词频 ${item.frequency.toLocaleString('en-US')}` : '暂无词频数据'
  const pronunciations = (active) => <div className="word-card__pronunciations">
    <SpeechButton active={active} word={item.word} lang="en-GB" label="英音" accessibleLabel={`${item.word} 英音`} />
    <SpeechButton active={active} word={item.word} lang="en-US" label="美音" accessibleLabel={`${item.word} 美音`} />
  </div>
  const exampleContent = (active) => <div className="word-card__example">
    <div className="word-card__example-heading">
      <span>{supplemental ? '补充例句' : '例句'}</span>
      {example && <SpeechButton active={active} word={example} label="朗读例句" accessibleLabel={`朗读 ${item.word} 的例句`} />}
    </div>
    <p lang={example ? 'en' : undefined}>{example || '暂无例句'}</p>
    {translation && <p className="word-card__translation">{translation}</p>}
    {supplemental && item.word === 'reservior' && <p className="word-card__translation">例句采用规范拼写 reservoir。</p>}
  </div>

  useLayoutEffect(() => {
    if (!hasFlipped.current) return
    const target = flipped ? backButton : frontButton
    target.current?.focus({ preventScroll: true })
  }, [flipped])

  const flip = (value) => {
    hasFlipped.current = true
    setFlipped(value)
  }

  const clickFace = (event, value) => {
    if (event.target.closest('button, a, input, select, textarea')) return
    if (window.getSelection()?.isCollapsed === false) return
    const start = pointerStart.current
    // Dragging text or scrolling a long detail must not turn the card over.
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return
    flip(value)
  }

  return (
    <li className={`word-card${flipped ? ' is-flipped' : ''}`} onKeyDown={(event) => {
      if (flipped && event.key === 'Escape') {
        event.preventDefault()
        flip(false)
      }
    }}>
      <div className="word-card__rotator">
        <div className="word-card__face word-card__front" aria-hidden={flipped} inert={flipped}
          onPointerDown={(event) => { pointerStart.current = { x: event.clientX, y: event.clientY } }}
          onClick={(event) => clickFace(event, true)}>
          <div className="word-card__topline">
            <h3 lang="en">{item.word}</h3>
            <span>{item.partOfSpeech}</span>
          </div>
          <p className="word-card__phonetic">{item.phonetic || '暂无音标'}</p>
          {pronunciations(!flipped)}
          <p className="word-card__brief">{briefMeaning}</p>
          <p className="word-card__frequency">{frequency}</p>
          {exampleContent(!flipped)}
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
          onClick={(event) => clickFace(event, false)}
        >
          <div className="word-card__details" role="region" aria-label={`${item.word} 的详情`} tabIndex={flipped ? 0 : -1}>
            <div className="word-card__topline">
              <h3 lang="en">{item.word}</h3>
              <span>{describePartOfSpeech(item.partOfSpeech)}</span>
            </div>
            <p className="word-card__phonetic">{item.phonetic || '暂无音标'}</p>
            <p className="word-card__frequency">{frequency}</p>
            <h4>释义</h4>
            <p>{meaning}</p>
            {exampleContent(flipped)}
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
            {pronunciations(flipped)}
          </div>
        </div>
      </div>
    </li>
  )
}
