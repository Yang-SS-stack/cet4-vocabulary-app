import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import { createInlineWordBookSession } from '../data/wordBookSession'
import { loadAudioManifest } from '../data/audioManifest'
import LearningSession from './LearningSession'

vi.mock('../data/audioManifest', () => ({ loadAudioManifest: vi.fn() }))
const words = [
  { word: 'alpha', meaning: '首字母', example: 'An alpha example.', translation: '例句翻译' },
  { word: 'beta', meaning: '测试版', example: 'A beta example.' },
  { word: 'chill', meaning: '寒冷' }, { word: 'drain', meaning: '排水' },
]
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') } })
afterAll(() => { delete HTMLDialogElement.prototype.showModal })
let sounds
let active
let synthesis
beforeEach(() => {
  sounds = []
  active = new Set()
  vi.stubGlobal('Audio', class {
    constructor(src) {
      this.src = src
      this.pause = vi.fn(() => active.delete(this))
      this.play = vi.fn(() => { active.add(this); expect(active.size).toBe(1); return Promise.resolve() })
      sounds.push(this)
    }
  })
  synthesis = { cancel: vi.fn(), speak: vi.fn() }
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  loadAudioManifest.mockResolvedValue({ words: Object.fromEntries(words.map(w => [w.word,
    { 'en-GB': `/${w.word}-gb`, 'en-US': `/${w.word}-us`, example: `/${w.word}-example` }])) })
})
afterEach(() => { cleanup(); vi.useRealTimers() })
function setup({ count = 1, method = { id: 'guided-recall', rulesVersion: 1 } } = {}) {
  let raw = null
  let date = new Date(2026, 8, 29, 12)
  let fail = false
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw Error('quota'); raw = value } }
  const open = () => createLearningStore({ storage, now: () => date })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: count, pronunciation: 'en-GB' })
  store.ensureTodayLearning('cet4', words.slice(0, count).map(w => w.word), store.getToday(), store.getSnapshot().settings, method)
  const loadBook = async () => createInlineWordBookSession(words)
  const exit = vi.fn()
  const show = (s = store) => render(<LearningStoreProvider store={s}><LearningSession loadBook={loadBook} onExit={exit} /></LearningStoreProvider>)
  return { store, open, show, exit, fail: value => { fail = value }, nextDay: () => { date = new Date(2026, 8, 30) } }
}
async function finish(sound = sounds.at(-1), failure = false) {
  await act(async () => { active.delete(sound); (failure ? sound.onerror : sound.onended)?.(); await Promise.resolve() })
}
async function ready() { await screen.findByRole('button', { name: '首字母' }); await waitFor(() => expect(sounds.length).toBeGreaterThan(0)) }

test('wrong choice saves once and stays anchored, revealing green only with correct speech', async () => {
  const env = setup()
  env.show()
  const user = userEvent.setup()
  await ready()
  expect(sounds.map(a => a.src)).toEqual(['/alpha-gb'])
  const heading = screen.getByRole('heading', { name: 'alpha' })
  const wrong = screen.getByRole('button', { name: '测试版' })
  const correct = screen.getByRole('button', { name: '首字母' })
  const oldEnd = sounds[0].onended
  await user.click(wrong)
  expect(env.open().getTask('learning').feedbackEvents).toHaveLength(1)
  expect(screen.getByRole('heading', { name: 'alpha' })).toBe(heading)
  expect(wrong).toHaveClass('is-wrong')
  expect(correct).not.toHaveClass('is-correct')
  expect(heading.closest('.study-transition')).not.toHaveClass('is-leaving')
  expect(screen.getByRole('button', { name: '继续' })).toHaveFocus()
  expect(sounds.at(-1).src).toBe('/beta-gb')
  await act(async () => { oldEnd(); await Promise.resolve() })
  expect(sounds.at(-1).src).toBe('/beta-gb')
  await finish()
  expect(sounds.at(-1).src).toBe('/alpha-gb')
  expect(correct).toHaveClass('is-correct')
  expect(screen.getByRole('heading', { name: 'alpha' })).toBe(heading)
  expect(env.open().getTask('learning').feedbackEvents).toHaveLength(1)
})

test('correct choice, details, second and third rounds use their exact serial sequences', async () => {
  const env = setup()
  env.show()
  const user = userEvent.setup()
  await ready()
  const heading = screen.getByRole('heading', { name: 'alpha' })
  await user.click(screen.getByRole('button', { name: '首字母' }))
  expect(sounds.at(-1).src).toBe('/alpha-gb')
  expect(screen.getByRole('heading', { name: 'alpha' })).toBe(heading)
  const beforeDetails = sounds.length
  await user.click(screen.getByRole('button', { name: '继续' }))
  await screen.findByText('例句翻译')
  await waitFor(() => expect(sounds.length).toBeGreaterThan(beforeDetails))
  expect(screen.getByRole('heading', { name: 'alpha' })).toBe(heading)
  await finish()
  expect(sounds.at(-1).src).toBe('/alpha-example')
  const beforeSecond = sounds.length
  await user.click(screen.getByRole('button', { name: '下一词' }))
  await screen.findByRole('button', { name: '认识', exact: true })
  await waitFor(() => expect(sounds.length).toBeGreaterThan(beforeSecond))
  expect(sounds.at(-1).src).toBe('/alpha-gb')
  await finish()
  expect(sounds.at(-1).src).toBe('/alpha-example')
  expect(screen.queryByText('例句翻译')).not.toBeInTheDocument()
  const beforeSelfDetails = sounds.length
  await user.click(screen.getByRole('button', { name: '认识', exact: true }))
  await screen.findByText('例句翻译')
  await waitFor(() => expect(sounds.length).toBeGreaterThan(beforeSelfDetails))
  const beforeThird = sounds.length
  await user.click(screen.getByRole('button', { name: '下一词' }))
  await screen.findByRole('button', { name: '认识', exact: true })
  await waitFor(() => expect(sounds.length).toBeGreaterThan(beforeThird))
  expect(sounds.at(-1).src).toBe('/alpha-gb')
  const before = sounds.length
  await finish()
  expect(sounds).toHaveLength(before)
  expect(screen.queryByText('An alpha example.')).not.toBeInTheDocument()
})

test('failure reveals the answer and retry/manual speech never resumes an abandoned queue', async () => {
  const env = setup()
  env.show()
  const user = userEvent.setup()
  await ready()
  await user.click(screen.getByRole('button', { name: '测试版' }))
  await finish(undefined, true)
  expect(screen.getByRole('button', { name: /首字母/ })).toHaveClass('is-correct')
  await finish(undefined, true)
  expect(screen.getByText('音频播放失败，请重试。')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '重播本轮朗读' }))
  expect(sounds.at(-1).src).toBe('/beta-gb')
  const beforeDetails = sounds.length
  await user.click(screen.getByRole('button', { name: '继续' }))
  await screen.findByText('例句翻译')
  await waitFor(() => expect(sounds.length).toBeGreaterThan(beforeDetails))
  const stale = sounds.at(-1).onended
  await user.click(screen.getByRole('button', { name: 'alpha 美音' }))
  expect(sounds.at(-1).src).toBe('/alpha-us')
  await act(async () => { stale(); await Promise.resolve() })
  expect(sounds.at(-1).src).toBe('/alpha-us')
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  expect(active.size).toBe(1)
  await user.click(screen.getByRole('button', { name: '继续学习', exact: true }))
  expect(active.size).toBe(1)
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  const staleExit = sounds.at(-1).onended
  await user.click(screen.getByRole('button', { name: '确认退出' }))
  expect(active.size).toBe(0)
  await act(async () => { staleExit?.(); await Promise.resolve() })
  expect(active.size).toBe(0)
})

test('restores feedback/details without another write and stops at expiry/save errors', async () => {
  const env = setup()
  let view = env.show()
  const user = userEvent.setup()
  await ready()
  await user.click(screen.getByRole('button', { name: '测试版' }))
  view.unmount()
  view = env.show(env.open())
  await screen.findByRole('button', { name: '继续' })
  await waitFor(() => expect(sounds.at(-1).src).toBe('/beta-gb'))
  await user.click(screen.getByRole('button', { name: '继续' }))
  await screen.findByText('例句翻译')
  view.unmount()
  env.show(env.open())
  await screen.findByText('例句翻译')
  await waitFor(() => expect(sounds.at(-1).src).toBe('/alpha-gb'))
  expect(env.open().getTask('learning').feedbackEvents).toHaveLength(1)
  env.fail(true)
  await user.click(screen.getByRole('button', { name: '下一词' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(active.size).toBe(0)
  env.fail(false)
  const beforeReload = sounds.length
  await user.click(screen.getByRole('button', { name: '重新读取进度' }))
  await screen.findByText('例句翻译')
  await waitFor(() => expect(sounds.length).toBeGreaterThan(beforeReload))
  env.nextDay()
  await user.click(screen.getByRole('button', { name: '下一词' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('日期已变化')
  expect(active.size).toBe(0)
})

test('waits for a delayed manifest then plays its file once despite prepared choices', async () => {
  let resolve
  loadAudioManifest.mockReturnValue(new Promise(done => { resolve = done }))
  const env = setup()
  env.show()
  await screen.findByRole('button', { name: '首字母' })
  expect(synthesis.speak).not.toHaveBeenCalled()
  expect(sounds).toHaveLength(0)
  await act(async () => { resolve({ words: { alpha: { 'en-GB': '/alpha-gb' } } }); await Promise.resolve() })
  await waitFor(() => expect(sounds).toHaveLength(1))
  expect(sounds[0].src).toBe('/alpha-gb')
  await finish()
  expect(sounds).toHaveLength(1)
  expect(synthesis.speak).not.toHaveBeenCalled()
})

test('failed manifest uses the requested accent, and unavailable voices can be manually retried', async () => {
  loadAudioManifest.mockRejectedValue(Error('network'))
  synthesis.getVoices = () => [{ lang: 'en-US' }]
  const env = setup()
  env.show()
  await screen.findByRole('button', { name: '首字母' })
  expect(await screen.findByText('未找到英音语音，请检查系统英语语音设置。')).toBeInTheDocument()
  expect(synthesis.speak).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: '看答案' })).toBeEnabled()
  synthesis.getVoices = () => [{ lang: 'en-GB' }]
  await userEvent.setup().click(screen.getByRole('button', { name: '重播本轮朗读' }))
  expect(synthesis.speak).toHaveBeenCalledOnce()
  expect(synthesis.speak.mock.calls[0][0]).toMatchObject({ text: 'alpha', lang: 'en-GB' })
})

test('detail motion is below the heading; next action alone fades the complete card', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const env = setup()
  env.show()
  const user = userEvent.setup()
  await ready()
  const heading = screen.getByRole('heading', { name: 'alpha' })
  const outer = heading.closest('.study-transition')
  await user.click(screen.getByRole('button', { name: '首字母' }))
  expect(outer).not.toHaveClass('is-leaving')
  await user.click(screen.getByRole('button', { name: '继续' }))
  expect(outer).not.toHaveClass('is-leaving')
  expect(document.querySelector('.study-transition--content')).toHaveClass('is-leaving')
  await screen.findByText('例句翻译')
  expect(screen.getByRole('heading', { name: 'alpha' })).toBe(heading)
  expect(screen.getByRole('region', { name: '单词内容' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: '下一词' }))
  expect(outer).toHaveClass('is-leaving')
  expect(outer).toHaveAttribute('inert')
  await screen.findByRole('button', { name: '认识', exact: true })
  expect(screen.getByRole('heading', { name: 'alpha' })).not.toBe(heading)
  expect(screen.getByRole('heading', { name: 'alpha' })).toHaveFocus()
})
