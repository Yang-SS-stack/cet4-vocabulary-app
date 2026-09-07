import { useEffect, useId, useRef, useState } from 'react'

// Browser speech has one shared queue. Track its owner so unrelated cards
// cannot cancel the current word when they leave the page.
let activeSpeech = null

export default function SpeechButton({ word }) {
  const [state, setState] = useState('idle')
  const speechRef = useRef(null)
  const messageId = useId()
  const synthesis = window.speechSynthesis
  const supported = typeof synthesis?.speak === 'function'
    && typeof synthesis?.cancel === 'function'
    && typeof window.SpeechSynthesisUtterance === 'function'

  useEffect(() => () => {
    const ownSpeech = speechRef.current
    speechRef.current = null
    if (ownSpeech && activeSpeech === ownSpeech) {
      activeSpeech = null
      ownSpeech.utterance.onend = null
      ownSpeech.utterance.onerror = null
      synthesis.cancel()
    }
  }, [synthesis, word])

  const speak = () => {
    try {
      activeSpeech?.stop()
      activeSpeech = null
      synthesis.cancel()
      const utterance = new window.SpeechSynthesisUtterance(word)
      utterance.lang = 'en-US'
      const ownSpeech = {
        utterance,
        stop: () => {
          speechRef.current = null
          setState('idle')
        },
      }
      const finish = (nextState) => {
        if (speechRef.current !== ownSpeech) return
        speechRef.current = null
        if (activeSpeech === ownSpeech) activeSpeech = null
        setState(nextState)
      }
      utterance.onend = () => finish('idle')
      utterance.onerror = (event) => finish(['canceled', 'interrupted'].includes(event.error) ? 'idle' : 'error')
      speechRef.current = ownSpeech
      activeSpeech = ownSpeech
      setState('speaking')
      synthesis.speak(utterance)
    } catch {
      if (activeSpeech === speechRef.current) activeSpeech = null
      speechRef.current = null
      setState('error')
    }
  }

  const message = !supported ? '此浏览器不支持语音发音'
    : state === 'error' ? '发音失败，请重试或检查浏览器语音设置。' : ''

  return (
    <>
      <button
        type="button"
        aria-label={`朗读 ${word}`}
        aria-describedby={message ? messageId : undefined}
        disabled={!supported}
        onClick={speak}
      >
        {state === 'speaking' ? '重新发音' : '发音'}
      </button>
      <span id={messageId} className="word-card__speech-message" aria-live="polite">{message}</span>
    </>
  )
}
