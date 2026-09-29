// Manual buttons and lesson autoplay share one owner across both browser APIs.
let activePlayback = null
function safelyStop(operation) { try { operation() } catch { /* A detached media/engine cannot block navigation. */ } }

export function speechSupported(src) {
  return Boolean(src && typeof window.Audio === 'function') || (typeof window.speechSynthesis?.speak === 'function'
    && typeof window.speechSynthesis?.cancel === 'function' && typeof window.SpeechSynthesisUtterance === 'function')
}

export function speechMessage(state, lang = 'en-US', audio = false) {
  return state === 'unsupported' ? '此浏览器不支持语音发音'
    : state === 'missing-voice' ? `未找到${lang === 'en-GB' ? '英音' : '美音'}语音，请检查系统英语语音设置。`
    : state === 'loading-voices' ? '语音尚未就绪，请稍后再试。'
    : state === 'error' ? (audio ? '音频播放失败，请重试。' : '发音失败，请重试或检查浏览器语音设置。') : ''
}

export function cancelSpeechScope(scope) {
  if (activePlayback?.scope === scope) activePlayback.cancel()
}

export function playSpeechSequence(segments, { scope, onSegment, onState, onCancel } = {}) {
  const previous = activePlayback
  previous?.cancel()
  if (!previous) safelyStop(() => window.speechSynthesis?.cancel?.())
  let alive = true
  let stopSegment = null
  let failure = null
  const owner = { scope, cancel() {
    if (!alive) return
    // Invalidate first: pause/cancel can dispatch a synchronous stale end event.
    alive = false
    if (activePlayback === owner) activePlayback = null
    safelyStop(() => stopSegment?.(true))
    safelyStop(() => window.speechSynthesis?.cancel?.())
    onState?.('idle')
    onCancel?.()
  } }
  activePlayback = owner
  const next = index => {
    if (!alive) return
    if (index >= segments.length) {
      alive = false
      if (activePlayback === owner) activePlayback = null
      onState?.(failure ?? 'idle')
      return
    }
    const { text, lang = 'en-US', src } = segments[index]
    onSegment?.(index)
    let finished = false
    let timer
    let media
    let utterance
    const cleanup = stop => {
      window.clearTimeout(timer)
      if (media) {
        media.onended = null
        media.onerror = null
        if (stop) { safelyStop(() => media.pause()); safelyStop(() => { media.currentTime = 0 }) }
      }
      if (utterance) { utterance.onend = null; utterance.onerror = null }
    }
    stopSegment = cleanup
    const finish = state => {
      if (!alive || finished) return
      finished = true
      cleanup(Boolean(state))
      if (state) {
        failure = state
        onState?.(state)
        if (utterance) safelyStop(() => window.speechSynthesis?.cancel?.())
      }
      Promise.resolve().then(() => next(index + 1))
    }
    try {
      if (!speechSupported(src)) { finish('unsupported'); return }
      if (src && typeof window.Audio === 'function') {
        media = new window.Audio(src)
        media.onended = () => finish()
        media.onerror = () => finish('error')
        onState?.('speaking')
        media.play()?.catch(() => finish('error'))
      } else {
        const synthesis = window.speechSynthesis
        utterance = new window.SpeechSynthesisUtterance(text)
        utterance.lang = lang
        if (typeof synthesis.getVoices === 'function') {
          const voices = synthesis.getVoices()
          const voice = voices.find(entry => entry.lang.replace('_', '-').toLowerCase() === lang.toLowerCase())
          if (!voice) { finish(voices.length ? 'missing-voice' : 'loading-voices'); return }
          utterance.voice = voice
        }
        utterance.onend = () => finish()
        utterance.onerror = () => finish('error')
        onState?.('speaking')
        synthesis.speak(utterance)
      }
      // A blocked/hung API must not withhold the answer forever.
      if (!finished) timer = window.setTimeout(() => finish('error'), Math.max(30000, text.length * 180))
    } catch { finish('error') }
  }
  next(0)
  return owner
}
