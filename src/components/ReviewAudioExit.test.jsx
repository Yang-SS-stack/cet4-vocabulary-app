import { act, cleanup, fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { loadAudioManifest } from '../data/audioManifest'
import { reviewFixture, reviewWords } from './reviewTestFixture'

vi.mock('../data/audioManifest', () => ({ loadAudioManifest: vi.fn() }))
let sounds, active, peakActive, synthesis
beforeEach(() => {
  sounds = []
  active = new Set()
  peakActive = 0
  vi.stubGlobal('Audio', class {
    constructor(src) {
      this.src = src
      this.load = vi.fn()
      this.removeAttribute = vi.fn(name => { if (name === 'src') this.src = '' })
      this.pause = vi.fn(() => active.delete(this))
      this.play = vi.fn(() => { active.add(this); peakActive = Math.max(peakActive, active.size); return Promise.resolve() })
      sounds.push(this)
    }
  })
  synthesis = { speak: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }
  loadAudioManifest.mockResolvedValue({ words: { alpha: { 'en-GB': '/alpha', 'en-US': '/alpha-us', example: '/example' }, beta: { 'en-GB': '/beta' } } })
  loadAudioManifest.mockClear()
})
afterEach(() => { cleanup(); vi.useRealTimers(); expect(peakActive).toBeLessThanOrEqual(1) })
const played = () => sounds.filter(sound => sound.play.mock.calls.length > 0)
const playing = () => [...active].at(-1)
async function end(sound = playing(), failure = false) { await act(async () => { active.delete(sound); (failure ? sound.onerror : sound.onended)?.(); await Promise.resolve() }) }
const click = async name => userEvent.setup().click(await screen.findByRole('button', { name, exact: true }))

test('English/details serialize, Chinese cancels queued audio, stale end cannot read the answer', async () => {
  const e = reviewFixture(); e.show(); await waitFor(() => expect(played().map(s => s.src)).toEqual(['/alpha']))
  await click('认识'); await screen.findByText('例句翻译'); await waitFor(() => expect(played().map(s => s.src)).toEqual(['/alpha', '/alpha']))
  const old = playing(), oldEnd = old.onended, prepared = sounds.at(-1)
  expect(prepared.src).toBe('/example'); expect(prepared.load).toHaveBeenCalledOnce(); expect(prepared.play).not.toHaveBeenCalled()
  const count = sounds.length
  await click('下一词'); await screen.findByRole('heading', { name: '首字母；开端' })
  expect(old.pause).toHaveBeenCalled(); expect(active.size).toBe(0); expect(sounds).toHaveLength(count); expect(played()).toHaveLength(2)
  expect(prepared.pause).toHaveBeenCalled(); expect(prepared.removeAttribute).toHaveBeenCalledWith('src'); expect(prepared.src).toBe(''); expect(prepared.load).toHaveBeenCalledTimes(2)
  await act(async () => { oldEnd(); await Promise.resolve() }); expect(sounds).toHaveLength(count); expect(played()).toHaveLength(2); expect(active.size).toBe(0)
  expect(prepared.play).not.toHaveBeenCalled()
  expect(synthesis.speak).not.toHaveBeenCalled()
  await click('认识'); await screen.findByText('例句翻译'); await waitFor(() => expect(played()).toHaveLength(3))
  expect(playing().src).toBe('/alpha')
  const nextExample = sounds.at(-1)
  expect(nextExample.src).toBe('/example'); expect(nextExample.load).toHaveBeenCalledOnce(); expect(nextExample.play).not.toHaveBeenCalled()
  await end(); expect(playing()).toBe(nextExample); expect(nextExample.play).toHaveBeenCalledOnce()
  expect(played().map(s => s.src)).toEqual(['/alpha', '/alpha', '/alpha', '/example'])
  expect(e.store.getTask('review').feedbackEvents).toHaveLength(2)
})

test('count one reads word then example; manual playback cancels autoplay queue and failures allow feedback', async () => {
  const e = reviewFixture(); e.store.ensureTodayReview(); e.feedback('fuzzy'); e.advance(); e.show()
  await waitFor(() => expect(playing()?.src).toBe('/alpha'))
  const firstExample = sounds.at(-1)
  expect(firstExample.src).toBe('/example'); expect(firstExample.load).toHaveBeenCalledOnce(); expect(firstExample.play).not.toHaveBeenCalled()
  expect(played().map(s => s.src)).toEqual(['/alpha'])
  await end(); expect(playing()).toBe(firstExample); expect(firstExample.play).toHaveBeenCalledOnce()
  expect(played().map(s => s.src)).toEqual(['/alpha', '/example'])
  await click('认识'); await screen.findByText('例句翻译'); await waitFor(() => expect(playing().src).toBe('/alpha'))
  const old = playing(), oldEnd = old.onended, prepared = sounds.at(-1)
  expect(prepared.src).toBe('/example'); expect(prepared.load).toHaveBeenCalledOnce(); expect(prepared.play).not.toHaveBeenCalled()
  await click('alpha 美音'); expect(old.pause).toHaveBeenCalled(); expect(playing().src).toBe('/alpha-us')
  expect(prepared.pause).toHaveBeenCalled(); expect(prepared.removeAttribute).toHaveBeenCalledWith('src'); expect(prepared.src).toBe(''); expect(prepared.load).toHaveBeenCalledTimes(2)
  const count = sounds.length; await act(async () => { oldEnd(); await Promise.resolve() }); expect(sounds).toHaveLength(count)
  expect(played().map(s => s.src)).toEqual(['/alpha', '/example', '/alpha', '/alpha-us']); expect(playing().src).toBe('/alpha-us'); expect(prepared.play).not.toHaveBeenCalled()
  await end(undefined, true); await click('下一词'); await click('模糊'); await screen.findByText('例句翻译')
  expect(e.store.getTask('review').feedbackEvents).toHaveLength(3)
})

test('Chinese restored question never starts audio even when a delayed manifest arrives', async () => {
  let resolveAudio; loadAudioManifest.mockImplementation(() => new Promise(resolve => { resolveAudio = resolve }))
  const e = reviewFixture(); e.store.ensureTodayReview(); e.feedback('known'); e.advance(); e.show()
  await screen.findByRole('heading', { name: '首字母；开端' })
  await waitFor(() => expect(resolveAudio).toBeTypeOf('function'))
  await act(async () => resolveAudio({ words: { alpha: { 'en-GB': '/alpha', example: '/example' } } }))
  expect(sounds).toHaveLength(0); expect(synthesis.speak).not.toHaveBeenCalled()
})

test('review autoplay waits for word and body entry animations before starting', async () => {
  vi.useFakeTimers(); vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const e = reviewFixture(); e.show()
  await act(async () => Promise.resolve())
  expect(screen.getByRole('heading', { name: 'alpha' })).toBeInTheDocument()
  expect(played()).toHaveLength(0)
  await act(async () => vi.advanceTimersByTimeAsync(239)); expect(played()).toHaveLength(0)
  await act(async () => vi.advanceTimersByTimeAsync(1)); expect(played()).toHaveLength(1)
  fireEvent.click(screen.getByRole('button', { name: '认识', exact: true }))
  await act(async () => Promise.resolve()); expect(played()).toHaveLength(1)
  await act(async () => vi.advanceTimersByTimeAsync(160)); expect(played()).toHaveLength(1)
  await act(async () => vi.advanceTimersByTimeAsync(239)); expect(played()).toHaveLength(1)
  await act(async () => vi.advanceTimersByTimeAsync(1)); expect(played()).toHaveLength(2)
  expect(played().map(s => s.src)).toEqual(['/alpha', '/alpha']); expect(playing().src).toBe('/alpha')
  const prepared = sounds.at(-1)
  expect(prepared.src).toBe('/example'); expect(prepared.load).toHaveBeenCalledOnce(); expect(prepared.play).not.toHaveBeenCalled()
})

test('confirmed exit ignores delayed book and prevents new details and audio work', async () => {
  const e = reviewFixture(); let resolveBook
  e.loader.mockImplementation(() => new Promise(resolve => { resolveBook = resolve }))
  e.show(); await waitFor(() => expect(e.loader).toHaveBeenCalledOnce()); const original = e.store.getTask('review')
  const prepare = vi.spyOn(e.store, 'prepareReviewChoice')
  await click('返回主界面'); await click('确认退出'); await waitFor(() => expect(e.exit).toHaveBeenCalledOnce())
  const details = vi.spyOn(e.session, 'loadWords')
  await act(async () => { resolveBook(e.session) })
  expect(details).not.toHaveBeenCalled(); expect(loadAudioManifest).not.toHaveBeenCalled()
  expect(prepare).not.toHaveBeenCalled(); expect(sounds).toHaveLength(0)
  expect(e.store.getTask('review')).toBe(original)
})

test('exit during choice pool loading cannot prepare a choice after confirmation', async () => {
  const e = reviewFixture(); e.store.ensureTodayReview(); e.feedback('unknown'); e.advance()
  let resolveOrder; e.session.loadLearningOrder = vi.fn(() => new Promise(resolve => { resolveOrder = resolve }))
  const prepare = vi.spyOn(e.store, 'prepareReviewChoice'); e.show()
  await waitFor(() => expect(e.session.loadLearningOrder).toHaveBeenCalledOnce())
  const details = vi.spyOn(e.session, 'loadWords')
  await click('返回主界面'); await click('确认退出')
  await act(async () => resolveOrder(reviewWords.map(w => w.word)))
  expect(prepare).not.toHaveBeenCalled(); expect(details).not.toHaveBeenCalled(); expect(e.store.getTask('review').choice).toBeNull()
})

test('reloaded progress waits for the new audio load result before autoplay', async () => {
  const e = reviewFixture(); e.show(); await waitFor(() => expect(sounds).toHaveLength(1))
  e.fail(true); await click('认识'); await screen.findByRole('alert'); e.fail(false)
  let resolveAudio; loadAudioManifest.mockImplementation(() => new Promise(resolve => { resolveAudio = resolve }))
  await click('重新读取进度'); await screen.findByRole('heading', { name: 'alpha' }); await act(async () => Promise.resolve())
  expect(sounds).toHaveLength(1)
  await act(async () => resolveAudio({ words: { alpha: { 'en-GB': '/new-alpha' } } }))
  await waitFor(() => expect(sounds.at(-1).src).toBe('/new-alpha'))
})

test('exit while initial ensure is pending lets started write finish but never loads or creates again', async () => {
  const e = reviewFixture(); const coreEnsure = e.store.ensureTodayReview; let resolveEnsure
  e.store.ensureTodayReview = vi.fn((...args) => new Promise(resolve => { resolveEnsure = () => resolve(coreEnsure(...args)) }))
  e.show(); await click('返回主界面'); await waitFor(() => expect(e.exit).toHaveBeenCalledOnce())
  await act(async () => resolveEnsure())
  expect(e.store.ensureTodayReview).toHaveBeenCalledOnce(); expect(e.loader).not.toHaveBeenCalled(); expect(loadAudioManifest).not.toHaveBeenCalled(); expect(sounds).toHaveLength(0)
  expect(e.store.getTask('review')).not.toBeNull()
})

test('completed and empty assignment never asks for audio offline', async () => {
  const e = reviewFixture({ ids: [] }); e.show(); await screen.findByRole('heading', { name: '还没有学过的词' }); expect(loadAudioManifest).not.toHaveBeenCalled()
})

test('delayed loading appears at 200ms and disappears immediately on failure', async () => {
  vi.useFakeTimers(); let rejectBook
  const e = reviewFixture(); e.loader.mockImplementation(() => new Promise((_, reject) => { rejectBook = reject })); e.show()
  await act(async () => Promise.resolve())
  expect(screen.queryByRole('status', { name: '正在准备复习' })).not.toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(199)); expect(screen.queryByRole('status', { name: '正在准备复习' })).not.toBeInTheDocument()
  await act(async () => vi.advanceTimersByTimeAsync(1)); expect(screen.getByRole('status', { name: '正在准备复习' })).toBeInTheDocument()
  await act(async () => rejectBook(Error('offline')))
  expect(screen.queryByRole('status', { name: '正在准备复习' })).not.toBeInTheDocument(); expect(screen.getByRole('alert')).toHaveTextContent('词书加载失败')
})
