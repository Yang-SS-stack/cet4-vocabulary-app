import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import WordCard from './WordCard'
import { readFileSync } from 'node:fs'

const nativeAudio = window.Audio
afterEach(() => { vi.unstubAllGlobals(); window.Audio = nativeAudio })

test('front shows frequency and a full example with separate speech controls that do not flip', async () => {
  const synthesis = { speak: vi.fn(), cancel: vi.fn(), getVoices: () => [{ lang: 'en-GB' }, { lang: 'en-US' }] }
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
  window.Audio = undefined
  const user = userEvent.setup()
  const { container } = render(<WordCard item={word} />)
  const front = within(container.querySelector('.word-card__front'))
  expect(front.getByText('词频 12')).toBeVisible()
  expect(front.getByText(word.example)).toBeVisible()
  expect(front.getByText(word.translation)).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'absorb 英音' }))
  expect(synthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'en-GB', text: 'absorb' }))
  await user.click(screen.getByRole('button', { name: 'absorb 美音' }))
  expect(synthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ lang: 'en-US' }))
  await user.click(screen.getByRole('button', { name: '朗读 absorb 的例句' }))
  expect(synthesis.speak).toHaveBeenLastCalledWith(expect.objectContaining({ text: word.example }))
  expect(container.querySelector('.word-card')).not.toHaveClass('is-flipped')
  synthesis.cancel.mockClear()
  await user.click(front.getByText(word.example))
  expect(synthesis.cancel).toHaveBeenCalledOnce()
  expect(within(screen.getByRole('region', { name: 'absorb 的详情' })).getByText('动词')).toBeInTheDocument()
})

test('labels supplemental examples and preserves original examples', () => {
  const { container, rerender } = render(<WordCard item={{ word: 'approximately', partOfSpeech: 'adv' }} />)
  const front = within(container.querySelector('.word-card__front'))
  expect(front.getByText('补充例句')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '朗读 approximately 的例句' })).toBeInTheDocument()
  rerender(<WordCard item={{ word: 'approximately', example: 'Approximately ten people came.' }} />)
  expect(front.getByText('Approximately ten people came.')).toBeInTheDocument()
  expect(front.queryByText('补充例句')).not.toBeInTheDocument()
})

test('the readable back has no rotated ancestor or remaining rotation that can misroute wheel scrolling', async () => {
  const user = userEvent.setup()
  const css = readFileSync('src/components/WordCard.css', 'utf8')
  const { container } = render(<><style>{css}</style><WordCard item={word} /></>)
  await user.click(screen.getByRole('group', { name: 'absorb，查看详情' }))
  const back = container.querySelector('.word-card__back')
  expect(getComputedStyle(back).transform).toBe('none')
  expect(getComputedStyle(back.parentElement).transform).not.toMatch(/rotate/)
  expect(getComputedStyle(back.parentElement).transformStyle).not.toBe('preserve-3d')
  expect(getComputedStyle(screen.getByRole('region', { name: 'absorb 的详情' })).overflowY).toBe('auto')
})

const word = {
  word: 'absorb', phonetic: '/əbˈsɔːb/', partOfSpeech: 'v',
  meaning: '吸收；使专心；把某物并入或同化',
  example: 'Plants absorb nutrients from the soil.', translation: '植物从土壤中吸收养分。',
  phrases: ['absorb in', 'absorb energy'], frequency: 12,
}

test('flips from a concise front to complete details and returns with focus restored', async () => {
  const user = userEvent.setup()
  const { container } = render(<WordCard item={word} />)
  const front = screen.getByRole('group', { name: 'absorb，查看详情' })
  expect(screen.getByRole('heading', { name: 'absorb' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '返回单词正面' })).not.toBeInTheDocument()
  expect(container.querySelector('.word-card__back')).toHaveAttribute('inert')
  await user.click(front)
  expect(container.querySelector('.word-card__front')).toHaveAttribute('inert')
  expect(container.querySelector('.word-card__front').querySelectorAll('button')).toHaveLength(3)
  expect(within(container.querySelector('.word-card__front')).getByRole('button', { name: 'absorb 美音', hidden: true })).toBeDisabled()
  const details = screen.getByRole('region', { name: 'absorb 的详情' })
  expect(within(details).getByText(word.meaning)).toBeInTheDocument()
  expect(within(details).getByText(word.example)).toBeInTheDocument()
  expect(within(details).getByText(word.translation)).toBeInTheDocument()
  expect(within(details).getByText('absorb energy')).toBeInTheDocument()
  expect(within(details).getByText('词频 12')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '返回单词正面' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: '返回单词正面' }))
  expect(front).toHaveFocus()
  expect(container.querySelector('.word-card__back')).toHaveAttribute('inert')
})

test('supports Enter, Space, Escape and clicking the back without trapping keyboard focus', async () => {
  const user = userEvent.setup()
  render(<WordCard item={word} />)
  screen.getByRole('group', { name: 'absorb，查看详情' }).focus()
  expect(screen.getByRole('group', { name: 'absorb，查看详情' })).toHaveFocus()
  await user.keyboard('{Enter}')
  expect(screen.getByRole('button', { name: '返回单词正面' })).toHaveFocus()
  await user.keyboard('{Escape}')
  expect(screen.getByRole('group', { name: 'absorb，查看详情' })).toHaveFocus()
  await user.keyboard(' ')
  expect(screen.getByRole('region', { name: 'absorb 的详情' })).toBeInTheDocument()
  await user.click(within(screen.getByRole('region', { name: 'absorb 的详情' })).getByText(word.example))
  expect(screen.getByRole('group', { name: 'absorb，查看详情' })).toHaveFocus()
})

test('shows honest missing-data messages and displays zero frequency as available', async () => {
  const user = userEvent.setup()
  const { rerender } = render(<WordCard item={{ word: 'test' }} />)
  await user.click(screen.getByRole('group', { name: 'test，查看详情' }))
  const details = screen.getByRole('region', { name: 'test 的详情' })
  for (const message of ['暂无释义', '暂无例句', '暂无词组']) {
    expect(within(details).getByText(message)).toBeInTheDocument()
  }
  expect(within(details).queryByText('暂无词频数据')).not.toBeInTheDocument()
  rerender(<WordCard item={{ word: 'test', frequency: 0 }} />)
  expect(within(details).getByText('词频 0')).toBeInTheDocument()
})

test('speech does not flip the card and returning stops the active pronunciation', async () => {
  const synthesis = { speak: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
  window.Audio = undefined
  const user = userEvent.setup()
  render(<WordCard item={word} />)
  await user.click(screen.getByRole('group', { name: 'absorb，查看详情' }))
  await user.click(screen.getByRole('button', { name: 'absorb 美音' }))
  expect(screen.getByRole('region', { name: 'absorb 的详情' })).toBeInTheDocument()
  expect(synthesis.speak).toHaveBeenCalledOnce()
  synthesis.cancel.mockClear()
  await user.click(screen.getByRole('button', { name: '返回单词正面' }))
  expect(synthesis.cancel).toHaveBeenCalledOnce()
})

test('uses resolved audio URLs after the manifest becomes available', async () => {
  const synthesis = { speak: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
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

  render(<WordCard item={word} audioManifest={{ words: {
    absorb: {
      'en-GB': '/cet4-vocabulary-app/audio/sonia-jenny/words/en-GB/absorb.mp3',
      'en-US': '/cet4-vocabulary-app/audio/sonia-jenny/words/en-US/absorb.mp3',
      example: '/cet4-vocabulary-app/audio/sonia-jenny/examples/en-US/example.mp3',
    },
  } }} />)

  await user.click(screen.getByRole('button', { name: 'absorb 英音' }))
  expect(AudioMock.last.src).toBe('/cet4-vocabulary-app/audio/sonia-jenny/words/en-GB/absorb.mp3')
  expect(AudioMock.last.play).toHaveBeenCalledOnce()
})

test('flip hint is plain text and clicking the hint or card heading flips the card', async () => {
  const user = userEvent.setup()
  const { container } = render(<WordCard item={word} />)
  const hint = screen.getByText('点击翻页')
  expect(hint.closest('button')).toBeNull()
  expect(container.querySelector('.word-card__open')).toBeNull()
  await user.click(hint)
  expect(container.querySelector('.word-card')).toHaveClass('is-flipped')
  await user.click(screen.getByRole('button', { name: '返回单词正面' }))
  await user.click(screen.getByRole('heading', { name: 'absorb' }))
  expect(container.querySelector('.word-card')).toHaveClass('is-flipped')
})
