import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import { createInlineWordBookSession } from '../data/wordBookSession'
import * as audioManifest from '../data/audioManifest'
import TodayLearningPage from './TodayLearningPage'

// jsdom has dialog markup but does not implement the browser's showModal API.
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') } })
afterAll(() => { delete HTMLDialogElement.prototype.showModal })

const words = [{ word: 'daily', meaning: '每日', example: 'A daily example.' },
  ...Array.from({ length: 12 }, (_, index) => ({ word: `word${index}`, meaning: `释义${index}`, example: `Example ${index}.` }))]
const token = task => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision,
  ...(task.kind === 'extra-learning' ? { kind: task.kind, taskId: task.taskId } : {}) })
function finish(store, get = () => store.getTask('learning')) {
  while (get().currentItemId !== null) {
    const task = get(), progress = task.items[task.currentItemId]
    if (task.method.id === 'guided-recall' && progress.knownCount === 0) {
      store.prepareLearningChoice(token(task), [progress.wordId, ...words.map(item => item.word).filter(word => word !== progress.wordId).slice(0, 3)].map(word => ({ word, meaning: word })))
      store.submitLearningChoice(token(get()), progress.wordId)
      store.revealLearningDetails(token(get()))
    } else store.submitSelfAssessment(token(task), 'known')
    store.advanceLearning(token(get()))
  }
}
function setup(method) {
  let raw = null, fail = false, date = new Date(2026, 8, 29)
  const storage = { getItem: () => raw, setItem: vi.fn((_, value) => { if (fail) throw Error('quota'); raw = value }) }
  const open = () => createLearningStore({ storage, now: () => date })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  store.ensureTodayLearning('cet4', ['daily'], store.getToday(), store.getSnapshot().settings, method)
  finish(store)
  const session = createInlineWordBookSession(words)
  const loader = vi.fn(async () => ({ ...session, loadLearningOrder: async () => words.map(item => item.word) }))
  const focus = vi.fn()
  const show = (s = store) => render(<LearningStoreProvider store={s}><TodayLearningPage loadBook={loader} onFocusModeChange={focus} /></LearningStoreProvider>)
  return { store, open, loader, session, storage, focus, show, fail: value => { fail = value }, nextDay: () => { date = new Date(2026, 8, 30) } }
}

test.each([
  ['without a batch', false],
  ['after the last completed batch', true],
])('restores exhausted extra learning %s offline without loading or changing history', async (_label, hasBatch) => {
  const env = setup(), user = userEvent.setup()
  const candidates = hasBatch ? ['daily', 'word0'] : ['daily']
  if (hasBatch) {
    env.store.ensureExtraLearning(candidates)
    finish(env.store, () => env.store.getExtraLearning())
  }
  env.store.ensureExtraLearning(candidates)
  env.store.updateSettings({ todayWordBookId: 'cet4-high-frequency' })
  const restored = env.open(), saved = restored.getSnapshot()
  expect(restored.getExtraLearningProcess()).toMatchObject({ exhausted: true })
  expect(restored.getExtraLearningProcess().batches).toHaveLength(hasBatch ? 1 : 0)
  env.storage.setItem.mockClear()
  env.loader.mockRejectedValue(Error('offline'))
  const loadWords = vi.spyOn(env.session, 'loadWords').mockRejectedValue(Error('offline'))
  const loadAudio = vi.spyOn(audioManifest, 'loadAudioManifest').mockRejectedValue(Error('offline'))
  const fetch = vi.fn().mockRejectedValue(Error('offline'))
  vi.stubGlobal('fetch', fetch)
  env.show(restored)
  await user.click(screen.getByRole('button', { name: '今日学习' }))

  expect(await screen.findByRole('heading', { name: '这本词书已全部学完' })).toBeInTheDocument()
  expect(screen.getByText('CET-4 · 额外学习')).toBeInTheDocument()
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(env.loader).not.toHaveBeenCalled()
  expect(loadWords).not.toHaveBeenCalled()
  expect(loadAudio).not.toHaveBeenCalled()
  expect(fetch).not.toHaveBeenCalled()
  expect(env.storage.setItem).not.toHaveBeenCalled()
  expect(restored.getSnapshot()).toBe(saved)
  expect(env.open().getSnapshot()).toEqual(saved)

  env.nextDay()
  act(() => window.dispatchEvent(new Event('focus')))
  expect(await screen.findByRole('alert')).toHaveTextContent('日期已变化')
  expect(screen.queryByRole('heading', { name: '这本词书已全部学完' })).not.toBeInTheDocument()
  expect(env.storage.setItem).not.toHaveBeenCalled()
  expect(restored.getExtraLearningProcess('2026-09-29')).toEqual(saved.extraLearning['2026-09-29'])
})

test('completed daily entry asks once, cancel writes nothing, confirm follows original book/settings and detail resumes on re-entry', async () => {
  const env = setup(), user = userEvent.setup()
  const daily = env.store.getTask('learning')
  env.store.updateSettings({ todayWordBookId: 'cet4-high-frequency', pronunciation: 'en-US', dailyNewWords: 100 })
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(screen.getByRole('dialog', { name: '继续学习更多单词？' })).toBeInTheDocument()
  expect(env.loader).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '暂不继续' }))
  expect(env.store.getExtraLearningProcess()).toBe(null)
  expect(env.focus).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(screen.getByRole('button', { name: '继续学习更多单词' }))
  await screen.findByRole('heading', { name: 'word0' })
  expect(env.loader.mock.lastCall[0].id).toBe('cet4')
  await user.click(screen.getByRole('button', { name: '认识', exact: true }))
  await screen.findByText('已保存：认识')
  const details = env.store.getExtraLearning()
  expect(details.settings).toEqual(daily.settings)
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('本组剩余 10 词')
  await user.click(screen.getByRole('button', { name: '继续学习', exact: true }))
  expect(env.store.getExtraLearning()).toBe(details)
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  await user.click(screen.getByRole('button', { name: '确认退出' }))
  await user.click(await screen.findByRole('button', { name: '今日学习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await screen.findByText('已保存：认识')
  expect(env.store.getExtraLearning()).toEqual(details)
  expect(env.store.getTask('learning')).toEqual(daily)
})

test('confirmed process automatically loads next batch and shows all-book completion after final batch', async () => {
  const env = setup(), user = userEvent.setup()
  const first = env.store.ensureExtraLearning(words.map(item => item.word))
  const view = env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'word0' })
  act(() => finish(env.store, () => env.store.getExtraLearning()))
  await screen.findByRole('heading', { name: 'word10' })
  expect(env.store.getExtraLearningProcess().batches).toHaveLength(2)
  expect(env.store.getExtraLearningProcess().batches[0].taskId).toBe(first.taskId)
  act(() => finish(env.store, () => env.store.getExtraLearning()))
  expect(await screen.findByRole('heading', { name: '这本词书已全部学完' })).toBeInTheDocument()
  const complete = env.store.getSnapshot()
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  await user.click(await screen.findByRole('button', { name: '今日学习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await screen.findByRole('heading', { name: '这本词书已全部学完' })
  expect(env.store.getSnapshot()).toBe(complete)
  view.unmount()
})

test('failed extra loading/creation is retryable and creates no undisplayable batch', async () => {
  const env = setup(), user = userEvent.setup()
  const session = createInlineWordBookSession(words)
  env.loader.mockResolvedValueOnce({ ...session, loadWords: async () => { throw Error('details unavailable') } })
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(screen.getByRole('button', { name: '继续学习更多单词' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('词书加载失败')
  expect(env.store.getExtraLearningProcess()).toBe(null)
  env.fail(true)
  await user.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(env.store.getExtraLearningProcess()).toBe(null)
  env.fail(false)
  await user.click(screen.getByRole('button', { name: '重试' }))
  await screen.findByRole('heading', { name: 'word0' })
})

test('loading missing word details does not create an extra batch', async () => {
  const env = setup(), user = userEvent.setup()
  const session = createInlineWordBookSession(words)
  env.loader.mockResolvedValueOnce({ ...session, loadWords: async () => [] })
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(screen.getByRole('button', { name: '继续学习更多单词' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('词书加载失败')
  expect(env.store.getExtraLearningProcess()).toBe(null)
})

test('exit during delayed next-batch details does not create another extra batch', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const env = setup()
  env.store.ensureExtraLearning(words.map(item => item.word))
  finish(env.store, () => env.store.getExtraLearning())
  const previous = env.store.getExtraLearningProcess()
  env.storage.setItem.mockClear()
  const ensure = vi.spyOn(env.store, 'ensureExtraLearning')
  let resolveDetails
  const loadWords = vi.fn(() => new Promise(resolve => { resolveDetails = resolve }))
  env.loader.mockResolvedValueOnce({ ...env.session, loadWords })
  env.show()
  await userEvent.setup().click(screen.getByRole('button', { name: '今日学习' }))
  await waitFor(() => expect(loadWords).toHaveBeenCalledOnce())
  await userEvent.setup().click(screen.getByRole('button', { name: '返回主界面' }))
  expect(document.querySelector('.learning-session')).toHaveClass('is-exiting')
  await act(async () => { resolveDetails(words.slice(11)); await Promise.resolve() })
  expect(ensure).not.toHaveBeenCalled()
  expect(env.store.getExtraLearningProcess()).toBe(previous)
  expect(env.storage.setItem).not.toHaveBeenCalled()
})

test('extra midnight notice starts todays fixed task while preserving old extra history', async () => {
  const env = setup(), user = userEvent.setup()
  env.store.ensureExtraLearning(words.map(item => item.word))
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'word0' })
  const old = env.store.getExtraLearning()
  env.nextDay()
  await user.click(screen.getByRole('button', { name: '认识', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('日期已变化')
  await user.click(screen.getByRole('button', { name: '开始今天的任务' }))
  await waitFor(() => expect(env.store.getTask('learning')?.date).toBe('2026-09-30'))
  expect(env.store.getExtraLearning(old.date)).toEqual(old)
})

test('extra guided choice restores unrevealed feedback and revealed detail after reopening', async () => {
  const env = setup({ id: 'guided-recall', rulesVersion: 1 }), user = userEvent.setup()
  let view = env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(screen.getByRole('button', { name: '继续学习更多单词' }))
  await user.click(await screen.findByRole('button', { name: '释义0' }))
  const feedback = env.store.getExtraLearning()
  expect(feedback.choice.revealed).toBe(false)
  expect(feedback.feedbackEvents).toHaveLength(1)
  view.unmount()
  view = env.show(env.open())
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: '继续' }))
  expect(await screen.findByText('Example 0.')).toBeInTheDocument()
  view.unmount()
  env.show(env.open())
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(await screen.findByText('Example 0.')).toBeInTheDocument()
  expect(env.open().getExtraLearning().feedbackEvents).toHaveLength(1)
})

test('extra conflict reload shows saved detail without replaying a rejected answer', async () => {
  const env = setup(), user = userEvent.setup()
  env.store.ensureExtraLearning(words.map(item => item.word))
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'word0' })
  const other = env.open()
  other.submitSelfAssessment(token(other.getExtraLearning()), 'known')
  await user.click(screen.getByRole('button', { name: '不认识', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('其他页面')
  await user.click(screen.getByRole('button', { name: '重新读取进度' }))
  expect(await screen.findByText('已保存：认识')).toBeInTheDocument()
  expect(env.store.getExtraLearning().feedbackEvents).toHaveLength(1)
})

test('next-batch detail failure keeps completed history and retry creates only one following batch', async () => {
  const env = setup(), user = userEvent.setup()
  env.store.ensureExtraLearning(words.map(item => item.word))
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'word0' })
  env.loader.mockRejectedValueOnce(Error('network'))
  act(() => finish(env.store, () => env.store.getExtraLearning()))
  expect(await screen.findByRole('alert')).toHaveTextContent('词书加载失败')
  expect(env.store.getExtraLearningProcess().batches).toHaveLength(1)
  await user.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('heading', { name: 'word10' })).toBeInTheDocument()
  expect(env.store.getExtraLearningProcess().batches).toHaveLength(2)
})

test('empty candidates show all-book completion and the next date enters todays daily task', async () => {
  const env = setup(), user = userEvent.setup()
  env.loader.mockResolvedValueOnce(createInlineWordBookSession([words[0]]))
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(screen.getByRole('button', { name: '继续学习更多单词' }))
  expect(await screen.findByRole('heading', { name: '这本词书已全部学完' })).toBeInTheDocument()
  expect(env.store.getExtraLearningProcess()).toEqual({ batches: [], exhausted: true })
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  env.nextDay()
  // No task exists on the new date, so the daily entry creates one without an extra prompt.
  await user.click(await screen.findByRole('button', { name: '今日学习' }))
  await waitFor(() => expect(env.store.getTask('learning')?.date).toBe('2026-09-30'))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
