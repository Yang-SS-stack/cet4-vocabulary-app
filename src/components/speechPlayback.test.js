import { afterEach, expect, test, vi } from 'vitest'
import { cancelSpeechScope, playSpeechSequence } from './speechPlayback'

const scope = {}
const instances = []
function audio() {
  vi.stubGlobal('Audio', class {
    constructor(src) { this.src = src; this.pause = vi.fn(); this.play = vi.fn(() => Promise.resolve()); instances.push(this) }
  })
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn(), speak: vi.fn() })
}
afterEach(() => { cancelSpeechScope(scope); instances.length = 0; vi.useRealTimers() })

test('serializes segments and ignores duplicate or canceled end events', async () => {
  audio()
  const segment = vi.fn()
  const queue = playSpeechSequence([{ text: 'wrong', src: '/wrong' }, { text: 'correct', src: '/correct' }], { scope, onSegment: segment })
  expect(instances.map(a => a.src)).toEqual(['/wrong'])
  const late = instances[0].onended
  late()
  await Promise.resolve()
  expect(instances.map(a => a.src)).toEqual(['/wrong', '/correct'])
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
  expect(instances.map(a => a.src)).toEqual(['/word', '/manual'])
  expect(instances[1].pause).not.toHaveBeenCalled()
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
  expect(instances.map(a => a.src)).toEqual(['/old', '/new'])
})
