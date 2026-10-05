import { useEffect, useId, useRef, useState } from 'react'
import { playSpeechSequence, speechMessage, speechSupported } from './speechPlayback'

export default function SpeechButton({ word, lang = 'en-US', label = '发音', accessibleLabel, active = true, src, scope, showIcon = false, iconOnly = false }) {
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
  const buttonLabel = state === 'speaking' ? (label === '发音' ? '重新发音' : `${label} · 重播`) : label
  return <>
    <button type="button" aria-label={accessibleLabel ?? `朗读 ${word}`} aria-describedby={message ? messageId : undefined}
      title={iconOnly ? buttonLabel : undefined} disabled={!supported || !active} onClick={speak}>
      {(showIcon || iconOnly) && <svg className="word-card__speaker" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M11 5 6 9H3v6h3l5 4V5Z" />
        <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
      </svg>}
      {!iconOnly && buttonLabel}
    </button>
    <span id={messageId} className="word-card__speech-message" aria-live="polite">{message}</span>
  </>
}
