import { useEffect, useId, useRef, useState } from 'react'

// Browser speech has one shared queue. Track its owner so unrelated cards
// cannot cancel the current word when they leave the page.
let activeSpeech = null

export default function SpeechButton({ word, lang = 'en-US', label = '发音', accessibleLabel, active = true, src }) {
  const [state, setState] = useState('idle')
  const speechRef = useRef(null)
  const messageId = useId()
  const synthesis = window.speechSynthesis
  const browserSupported = typeof synthesis?.speak === 'function'
    && typeof synthesis?.cancel === 'function'
    && typeof window.SpeechSynthesisUtterance === 'function'
  const audioSupported = Boolean(src) && typeof window.Audio === 'function'
  const supported = browserSupported || audioSupported

  useEffect(() => () => {
    const ownSpeech = speechRef.current
    speechRef.current = null
    if (ownSpeech && activeSpeech === ownSpeech) {
      activeSpeech = null
      ownSpeech.stop()
      if (ownSpeech.utterance) {
        ownSpeech.utterance.onend = null
        ownSpeech.utterance.onerror = null
        synthesis.cancel()
      }
    }
  }, [synthesis, word, lang, active])

  const speak = () => {
    try {
      activeSpeech?.stop()
      activeSpeech = null
      if (typeof synthesis?.cancel === 'function') synthesis.cancel()
      if (audioSupported) {
        const audio = new window.Audio(src)
        const ownSpeech = {
          audio,
          stop: () => {
            audio.pause()
            audio.currentTime = 0
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
        audio.onended = () => finish('idle')
        audio.onerror = () => finish('error')
        speechRef.current = ownSpeech
        activeSpeech = ownSpeech
        setState('speaking')
        const result = audio.play()
        result?.catch(() => finish('error'))
        return
      }
      const utterance = new window.SpeechSynthesisUtterance(word)
      utterance.lang = lang
      if (typeof synthesis.getVoices === 'function') {
        const voices = synthesis.getVoices()
        const voice = voices.find((entry) => entry.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
        if (!voice) {
          setState(voices.length ? 'missing-voice' : 'loading-voices')
          return
        }
        utterance.voice = voice
      }
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
    : state === 'missing-voice' ? `未找到${lang === 'en-GB' ? '英音' : '美音'}语音，请检查系统英语语音设置。`
    : state === 'loading-voices' ? '语音尚未就绪，请稍后再试。'
    : state === 'error' ? (audioSupported ? '音频播放失败，请重试。' : '发音失败，请重试或检查浏览器语音设置。') : ''

  return (
    <>
      <button
        type="button"
        aria-label={accessibleLabel ?? `朗读 ${word}`}
        aria-describedby={message ? messageId : undefined}
        disabled={!supported || !active}
        onClick={speak}
      >
        {state === 'speaking' ? (label === '发音' ? '重新发音' : `${label} · 重播`) : label}
      </button>
      <span id={messageId} className="word-card__speech-message" aria-live="polite">{message}</span>
    </>
  )
}
