import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import SpeechButton from './SpeechButton'

const nativeAudio = window.Audio
afterEach(() => { vi.unstubAllGlobals(); window.Audio = nativeAudio })

function mockSpeech() {
  const synthesis = { cancel: vi.fn(), speak: vi.fn() }
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    constructor(text) { this.text = text }
  })
  return synthesis
}

test('speaks English only on demand and cancels earlier speech on repeated clicks', async () => {
  const synthesis = mockSpeech()
  const user = userEvent.setup()
  render(<SpeechButton word="apple" />)
  expect(synthesis.speak).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '朗读 apple' }))
  expect(synthesis.speak).toHaveBeenCalledWith(expect.objectContaining({ text: 'apple', lang: 'en-US' }))
  const previous = synthesis.speak.mock.calls[0][0]
  await user.click(screen.getByRole('button', { name: '朗读 apple' }))
  expect(synthesis.cancel).toHaveBeenCalledTimes(2)
  const current = synthesis.speak.mock.calls[1][0]
  act(() => previous.onend?.())
  expect(screen.getByRole('button')).toHaveTextContent('重新发音')
  act(() => current.onend())
  expect(screen.getByRole('button')).toHaveTextContent('发音')
})

test('reports unsupported browsers and failures without crashing', async () => {
  vi.stubGlobal('speechSynthesis', undefined)
  vi.stubGlobal('SpeechSynthesisUtterance', undefined)
  const { unmount } = render(<SpeechButton word="apple" />)
  expect(screen.getByRole('button', { name: '朗读 apple' })).toBeDisabled()
  expect(screen.getByText('此浏览器不支持语音发音')).toBeInTheDocument()
  unmount()
  const synthesis = mockSpeech()
  const user = userEvent.setup()
  render(<SpeechButton word="apple" />)
  await user.click(screen.getByRole('button'))
  act(() => synthesis.speak.mock.calls[0][0].onerror({ error: 'synthesis-failed' }))
  expect(screen.getByText('发音失败，请重试或检查浏览器语音设置。')).toBeInTheDocument()
  synthesis.speak.mockImplementation(() => { throw new Error('unavailable') })
  await user.click(screen.getByRole('button'))
  expect(screen.getByText('发音失败，请重试或检查浏览器语音设置。')).toBeInTheDocument()
})

test('cancels only the active card on unmount and resets the previous card when another speaks', async () => {
  const synthesis = mockSpeech()
  const user = userEvent.setup()
  const first = render(<SpeechButton word="apple" />)
  const second = render(<SpeechButton word="banana" />)
  await user.click(screen.getByRole('button', { name: '朗读 apple' }))
  await user.click(screen.getByRole('button', { name: '朗读 banana' }))
  expect(screen.getByRole('button', { name: '朗读 apple' })).toHaveTextContent(/^发音$/)
  synthesis.cancel.mockClear()
  first.unmount()
  expect(synthesis.cancel).not.toHaveBeenCalled()
  second.unmount()
  expect(synthesis.cancel).toHaveBeenCalledOnce()
})

test('uses the matching British or American voice and can read an entire example', async () => {
  const synthesis = mockSpeech()
  const british = { lang: 'en-GB', name: 'British' }
  const american = { lang: 'en-US', name: 'American' }
  synthesis.getVoices = () => [american, british]
  const user = userEvent.setup()
  render(<>
    <SpeechButton word="apple" lang="en-GB" label="英音" accessibleLabel="apple 英音" />
    <SpeechButton word="apple" lang="en-US" label="美音" accessibleLabel="apple 美音" />
    <SpeechButton word="I ate an apple." label="朗读例句" accessibleLabel="朗读 apple 的例句" />
  </>)
  await user.click(screen.getByRole('button', { name: 'apple 英音' }))
  expect(synthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'en-GB', voice: british, text: 'apple' }))
  await user.click(screen.getByRole('button', { name: 'apple 美音' }))
  expect(synthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'en-US', voice: american }))
  await user.click(screen.getByRole('button', { name: '朗读 apple 的例句' }))
  expect(synthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'I ate an apple.' }))
})

test('does not silently substitute a different accent and retries when voices become available', async () => {
  const synthesis = mockSpeech()
  synthesis.getVoices = () => [{ lang: 'en-US' }]
  const user = userEvent.setup()
  render(<SpeechButton word="apple" lang="en-GB" label="英音" />)
  await user.click(screen.getByRole('button'))
  expect(synthesis.speak).not.toHaveBeenCalled()
  expect(screen.getByText('未找到英音语音，请检查系统英语语音设置。')).toBeInTheDocument()
  synthesis.getVoices = () => [{ lang: 'en-GB' }]
  await user.click(screen.getByRole('button'))
  expect(synthesis.speak).toHaveBeenCalledOnce()
})

test('plays a pre-generated audio file before using browser speech', async () => {
  const synthesis = mockSpeech()
  class AudioMock {
    static last
    constructor(src) {
      this.src = src
      this.play = vi.fn(() => Promise.resolve())
      this.pause = vi.fn()
      this.currentTime = 0
      AudioMock.last = this
    }
  }
  window.Audio = AudioMock
  const user = userEvent.setup()
  render(<SpeechButton word="apple" src="/audio/apple.mp3" accessibleLabel="apple 美音" />)
  await user.click(screen.getByRole('button', { name: 'apple 美音' }))
  expect(AudioMock.last.src).toBe('/audio/apple.mp3')
  expect(AudioMock.last.play).toHaveBeenCalledOnce()
  expect(synthesis.speak).not.toHaveBeenCalled()
  act(() => AudioMock.last.onended())
  expect(screen.getByRole('button')).toHaveTextContent('发音')
})
