import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import SpeechButton from './SpeechButton'

afterEach(() => vi.unstubAllGlobals())

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
