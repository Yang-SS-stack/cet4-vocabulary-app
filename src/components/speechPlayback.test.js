import { afterEach, expect, test, vi } from 'vitest'
import { cancelSpeechScope, playSpeechSequence } from './speechPlayback'

const scope = {}
const instances = []
function audio(play = () => Promise.resolve()) {
  vi.stubGlobal('Audio', class {
    constructor(src) {
      this.src = src
      this.pause = vi.fn()
      this.play = vi.fn(play)
      this.load = vi.fn()
      this.removeAttribute = vi.fn()
      instances.push(this)
    }
  })
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
}
afterEach(() => { cancelSpeechScope(scope); instances.length = 0; vi.useRealTimers() })

test('loads the next media while current speech plays, without overlapping playback', async () => {
  audio()
  const segment = vi.fn()
  const queue = playSpeechSequence([{ text: 'wrong', src: '/wrong' }, { text: 'correct', src: '/correct' }], { scope, onSegment: segment })
  expect(instances.map(a => a.src)).toEqual(['/wrong', '/correct'])
  expect(instances[0].play).toHaveBeenCalledOnce()
  expect(instances[1].preload).toBe('auto')
  expect(instances[1].load).toHaveBeenCalledOnce()
  expect(instances[1].play).not.toHaveBeenCalled()
  const late = instances[0].onended
  late()
  await Promise.resolve()
  expect(instances.map(a => a.src)).toEqual(['/wrong', '/correct'])
  expect(instances[1].play).toHaveBeenCalledOnce()
  late()
  expect(segment).toHaveBeenCalledTimes(2)
  const canceledEnd = instances[1].onended
  queue.cancel()
  canceledEnd()
  expect(instances[1].pause).toHaveBeenCalledOnce()
  expect(segment).toHaveBeenCalledTimes(2)
})

test('manual ownership supersedes the complete auto queue and old scope cannot stop it', async () => {
  audio()
  playSpeechSequence([{ text: 'word', src: '/word' }, { text: 'example', src: '/example' }], { scope })
  const late = instances[0].onended
  const manualScope = {}
  const manual = playSpeechSequence([{ text: 'manual', src: '/manual' }], { scope: manualScope })
  cancelSpeechScope(scope)
  late()
  await Promise.resolve()
  expect(instances.map(a => a.src)).toEqual(['/word', '/example', '/manual'])
  expect(instances[1].play).not.toHaveBeenCalled()
  expect(instances[1].removeAttribute).toHaveBeenCalledWith('src')
  expect(instances[2].pause).not.toHaveBeenCalled()
  manual.cancel()
})

test('rejected sound continues to the answer and reports a retryable error', async () => {
  audio()
  const state = vi.fn()
  playSpeechSequence([{ text: 'wrong', src: '/wrong' }, { text: 'correct', src: '/correct' }], { scope, onState: state })
  instances[0].onerror()
  await Promise.resolve()
  expect(instances[1].src).toBe('/correct')
  instances[1].onended()
  await Promise.resolve()
  expect(state).toHaveBeenLastCalledWith('error')
})

test('hung media is stopped before advancing and the queue can be retried', async () => {
  audio()
  vi.useFakeTimers()
  playSpeechSequence([{ text: 'wrong', src: '/wrong' }, { text: 'answer', src: '/answer' }], { scope })
  await vi.advanceTimersByTimeAsync(30000)
  expect(instances[0].pause).toHaveBeenCalledOnce()
  expect(instances[1].src).toBe('/answer')
  playSpeechSequence([{ text: 'retry', src: '/retry' }], { scope })
  expect(instances[1].pause).toHaveBeenCalledOnce()
})

test('throwing cancellation APIs do not prevent replacement or resurrect old callbacks', async () => {
  audio()
  playSpeechSequence([{ text: 'old', src: '/old' }, { text: 'never', src: '/never' }], { scope })
  const late = instances[0].onended
  instances[0].pause.mockImplementation(() => { throw Error('media detached') })
  window.speechSynthesis.cancel.mockImplementation(() => { throw Error('engine unavailable') })
  expect(() => playSpeechSequence([{ text: 'new', src: '/new' }], { scope })).not.toThrow()
  late()
  await Promise.resolve()
  expect(instances.map(a => a.src)).toEqual(['/old', '/never', '/new'])
  expect(instances[1].play).not.toHaveBeenCalled()
})

test('ready example begins at word ended instead of paying another media load delay', async () => {
  audio()
  vi.useFakeTimers()
  const starts = []
  vi.stubGlobal('Audio', class {
    constructor(src) {
      this.src = src
      this.readyAt = Date.now() + 800
      this.pause = vi.fn()
      this.load = vi.fn()
      this.removeAttribute = vi.fn()
      instances.push(this)
    }
    play() {
      return new Promise(resolve => window.setTimeout(() => {
        starts.push({ src: this.src, at: Date.now() })
        resolve()
      }, Math.max(0, this.readyAt - Date.now())))
    }
  })
  playSpeechSequence([{ text: 'word', src: '/word' }, { text: 'example', src: '/example' }], { scope })
  await vi.advanceTimersByTimeAsync(2800)
  const wordEndedAt = Date.now()
  instances[0].onended()
  await vi.advanceTimersByTimeAsync(0)
  expect(starts).toHaveLength(2)
  expect(starts[1].at - wordEndedAt).toBe(0)
})

test('cancellation releases the waiting media and late completion cannot play it', async () => {
  audio()
  const queue = playSpeechSequence([{ text: 'word', src: '/word' }, { text: 'example', src: '/example' }], { scope })
  const late = instances[0].onended
  queue.cancel()
  late()
  await Promise.resolve()
  expect(instances).toHaveLength(2)
  expect(instances[1].play).not.toHaveBeenCalled()
  expect(instances[1].pause).toHaveBeenCalledOnce()
  expect(instances[1].removeAttribute).toHaveBeenCalledWith('src')
  expect(instances[1].load).toHaveBeenCalledTimes(2)
})

test('missing media uses the existing TTS route while preparing only the next known asset', async () => {
  audio()
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
  playSpeechSequence([{ text: 'word' }, { text: 'example', src: '/example' }], { scope })
  expect(instances.map(media => media.src)).toEqual(['/example'])
  expect(instances[0].play).not.toHaveBeenCalled()
  const utterance = window.speechSynthesis.speak.mock.calls[0][0]
  utterance.onend()
  await Promise.resolve()
  expect(instances[0].play).toHaveBeenCalledOnce()
})

test('rejected media play still advances to the prepared example', async () => {
  let calls = 0
  audio(() => ++calls === 1 ? Promise.reject(Error('blocked')) : Promise.resolve())
  const states = vi.fn()
  playSpeechSequence([{ text: 'word', src: '/word' }, { text: 'example', src: '/example' }], { scope, onState: states })
  await Promise.resolve()
  await Promise.resolve()
  expect(instances[1].play).toHaveBeenCalledOnce()
  expect(states).toHaveBeenCalledWith('error')
})

test('prepares only one upcoming known asset and does not allocate audio for missing paths', async () => {
  audio()
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
  playSpeechSequence([{ text: 'first', src: '/first' }, { text: 'second', src: '/second' }, { text: 'third' },
    { text: 'fourth', src: '/fourth' }], { scope })
  expect(instances.map(media => media.src)).toEqual(['/first', '/second'])
  instances[0].onended()
  await Promise.resolve()
  expect(instances).toHaveLength(2)
  instances[1].onended()
  await Promise.resolve()
  expect(instances.map(media => media.src)).toEqual(['/first', '/second', '/fourth'])
  expect(instances[2].play).not.toHaveBeenCalled()
})

test('a cancellation callback cannot start playback after handing the segment to UI', () => {
  audio()
  playSpeechSequence([{ text: 'word', src: '/word' }, { text: 'example', src: '/example' }], {
    scope, onSegment: () => cancelSpeechScope(scope),
  })
  expect(instances).toHaveLength(0)
})

test('preload failures retry normal playback without interrupting the current segment', async () => {
  audio()
  const NormalAudio = window.Audio
  let attempts = 0
  vi.stubGlobal('Audio', class extends NormalAudio {
    constructor(src) {
      attempts += 1
      if (attempts === 2) throw Error('preload unavailable')
      super(src)
    }
  })
  const states = vi.fn()
  playSpeechSequence([{ text: 'word', src: '/word' }, { text: 'example', src: '/example' }], { scope, onState: states })
  expect(attempts).toBe(2)
  expect(states).not.toHaveBeenCalledWith('error')
  instances[0].onended()
  await Promise.resolve()
  expect(attempts).toBe(3)
  expect(instances[1].play).toHaveBeenCalledOnce()
})

test('late rejected playback after replacement cannot advance or report state for the old queue', async () => {
  let rejectOld
  audio(() => new Promise((resolve, reject) => { rejectOld = reject }))
  const states = vi.fn()
  playSpeechSequence([{ text: 'word', src: '/word' }, { text: 'example', src: '/example' }], { scope, onState: states })
  const rejectCanceled = rejectOld
  const replacement = playSpeechSequence([{ text: 'manual', src: '/manual' }], { scope: {} })
  states.mockClear()
  rejectCanceled(Error('late failure'))
  await Promise.resolve()
  await Promise.resolve()
  expect(instances[1].play).not.toHaveBeenCalled()
  expect(states).not.toHaveBeenCalled()
  replacement.cancel()
})

test('canceling on speaking state prevents the audio from being played or the next asset allocated', () => {
  audio()
  playSpeechSequence([{ text: 'word', src: '/word' }, { text: 'example', src: '/example' }], {
    scope, onState: state => { if (state === 'speaking') cancelSpeechScope(scope) },
  })
  expect(instances).toHaveLength(1)
  expect(instances[0].play).not.toHaveBeenCalled()
})
