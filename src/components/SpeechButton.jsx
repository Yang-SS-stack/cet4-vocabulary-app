import { useEffect, useId, useRef, useState } from 'react'
import { playSpeechSequence, speechMessage, speechSupported } from './speechPlayback'

export default function SpeechButton({ word, lang = 'en-US', label = '发音', accessibleLabel, active = true, src, scope }) {
  const [state, setState] = useState('idle')
  const playback = useRef(null)
  const messageId = useId()
  const supported = speechSupported(src)
  useEffect(() => () => {
    playback.current?.cancel()
    playback.current = null
  }, [word, lang, active])
  const speak = () => {
    playback.current = playSpeechSequence([{ text: word, lang, src }], { scope, onState: setState })
  }
  const message = speechMessage(supported ? state : 'unsupported', lang, Boolean(src))
  return <>
    <button type="button" aria-label={accessibleLabel ?? `朗读 ${word}`} aria-describedby={message ? messageId : undefined}
      disabled={!supported || !active} onClick={speak}>
      {state === 'speaking' ? (label === '发音' ? '重新发音' : `${label} · 重播`) : label}
    </button>
    <span id={messageId} className="word-card__speech-message" aria-live="polite">{message}</span>
  </>
}
