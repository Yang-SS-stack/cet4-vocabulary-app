import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import SessionAdviceModal from './SessionAdviceModal'
import InitialLearningFlow from './InitialLearningFlow'
import TodayLearningPage from './TodayLearningPage'
import { buildSessionAdvice } from '../data/assistant/sessionAdvice'

const now = new Date(2026, 9, 9, 12)
beforeEach(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') }; HTMLDialogElement.prototype.close = function () { this.removeAttribute('open') } })
afterEach(() => { delete HTMLDialogElement.prototype.showModal; delete HTMLDialogElement.prototype.close; document.body.style.overflow = '' })
function harness(Component, props = {}) {
  let raw = null
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  const store = createLearningStore({ now: () => now, storage })
  store.updateSettings({ examDate: '2027-01-01', todayWordBookId: 'cet4', dailyNewWords: 30, dailyReviewWords: 20, dailyStudyMinutes: 120 })
  const onClose = vi.fn(), onStart = vi.fn()
  const modelState = props.generate ? { status: 'ready', revision: 'verified-1' } : undefined
  const view = render(<LearningStoreProvider store={store}><Component now={now} onClose={onClose} onStart={onStart} modelState={modelState} {...props} /></LearningStoreProvider>)
  return { ...view, store, raw: () => raw, onClose, onStart, outsideSave: patch => createLearningStore({ now: () => now, storage }).updateSettings(patch) }
}
function modelResult(args, patch = {}) {
  return { requestId: args.requestId, basisVersion: args.basisVersion, cacheHit: false,
    draft: { ...buildSessionAdvice(args), source: 'model', reasons: ['本次以可用时间为依据。'], ...patch } }
}

test('real rule preview and adjustment never save or apply a plan', async () => {
  const { raw, onStart } = harness(SessionAdviceModal)
  const before = raw()
  await screen.findByText('规则推荐 · 草稿')
  expect(screen.getByRole('button', { name: '采用此计划' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '微调计划' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: '草稿新词数量' }), { target: { value: '2' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿微调' }))
  expect(raw()).toBe(before)
  expect(screen.queryByRole('button', { name: '确认应用计划' })).not.toBeInTheDocument()
  expect(screen.getByText(/采用后将先进入确认/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '按原设置开始学习' }))
  expect(onStart).toHaveBeenCalledOnce()
  expect(raw()).toBe(before)
})

test('initial flow preserves six settings, saves once, then invites without creating tasks', async () => {
  const { raw, store, onStart } = harness(InitialLearningFlow)
  const before = raw()
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveAttribute('max', '60')
  expect(screen.getByRole('button', { name: /^每日学习时长 / })).toHaveTextContent('120 分钟')
  fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: '优先复习' }))
  expect(raw()).toBe(before)
  fireEvent.click(screen.getByRole('button', { name: '完成设置' }))
  await screen.findByRole('heading', { name: '要看看助手的学习建议吗？' })
  expect(store.getSnapshot().settings.dailyStudyMinutes).toBe(120)
  expect(store.getSnapshot().days).toEqual({})
  fireEvent.click(screen.getByRole('button', { name: '暂不需要，直接开始学习' }))
  expect(onStart).toHaveBeenCalledOnce()
})

test('save failure retains setup and session input without showing an invitation', async () => {
  harness(InitialLearningFlow, { saveSettings: () => { throw Error('elsewhere') } })
  fireEvent.change(screen.getByRole('slider'), { target: { value: '10' } })
  fireEvent.click(screen.getByRole('button', { name: '完成设置' }))
  await screen.findByText(/记录已在其他页面更新/)
  expect(screen.getByRole('slider')).toHaveValue('10')
  expect(screen.queryByText('要看看助手的学习建议吗？')).not.toBeInTheDocument()
})

test('cancelled and changed-input late responses cannot replace the current draft', async () => {
  let resolve
  const generate = vi.fn(args => new Promise(done => { resolve = () => done(modelResult(args)) }))
  const { raw } = harness(SessionAdviceModal, { generate })
  const before = raw()
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  expect(screen.getByRole('button', { name: '取消生成' })).toBeInTheDocument()
  fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
  await act(async () => resolve())
  expect(screen.getByText(/输入已变化/)).toBeInTheDocument()
  expect(raw()).toBe(before)
  expect(generate.mock.calls[0][0].signal.aborted).toBe(true)
})

test('a stale draft keeps its own time allocation until regenerated', () => {
  const { container } = harness(SessionAdviceModal)
  const bar = container.querySelector('.session-allocation span')
  const width = bar.style.width
  const blank = screen.getByText(/^留白 /).textContent
  fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
  expect(screen.getByText(/输入已变化/)).toBeInTheDocument()
  expect(bar.style.width).toBe(width)
  expect(screen.getByText(/^留白 /)).toHaveTextContent(blank)
})

test('provider failure keeps rules and waits for a fresh verified state before manual retry', async () => {
  const generate = vi.fn().mockRejectedValue({ code: 'TIMEOUT' })
  harness(SessionAdviceModal, { generate })
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  await screen.findByText(/等待超时/)
  expect(screen.getByText('规则推荐 · 草稿')).toBeInTheDocument()
  expect(generate).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '按原设置开始学习' })).toBeEnabled()
})

test('record changes invalidate current draft and require regeneration', async () => {
  const { store } = harness(SessionAdviceModal)
  await act(async () => store.updateSettings({ dailyNewWords: 10 }))
  await waitFor(() => expect(screen.getByText(/依据已变化/)).toBeInTheDocument())
  expect(screen.getByRole('button', { name: '微调计划' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '重新计算规则' }))
  await waitFor(() => expect(screen.queryByText(/依据已变化/)).not.toBeInTheDocument())
})

test('frozen tasks survive viewing, microadjusting, and skipping the draft', async () => {
  const { store, raw } = harness(SessionAdviceModal)
  await act(async () => store.ensureTodayLearning('cet4', ['alpha', 'beta']))
  const before = raw()
  fireEvent.click(screen.getByRole('button', { name: '重新计算规则' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '微调计划' })).toBeEnabled())
  fireEvent.click(screen.getByRole('button', { name: '微调计划' }))
  fireEvent.change(screen.getByRole('spinbutton', { name: '草稿新词数量' }), { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: '保存草稿微调' }))
  expect(raw()).toBe(before)
  expect(store.getTask('learning').itemIds).toHaveLength(2)
})

test('skipping from Today opens the existing learning session using original settings', async () => {
  const loadBook = vi.fn(() => new Promise(() => {}))
  const { raw, store } = harness(TodayLearningPage, { loadBook, legacy: true })
  const before = raw()
  fireEvent.click(screen.getByRole('button', { name: '安排本次学习' }))
  fireEvent.change(screen.getByRole('slider'), { target: { value: '5' } })
  fireEvent.click(screen.getByRole('button', { name: '按原设置开始学习' }))
  await waitFor(() => expect(loadBook).toHaveBeenCalled())
  expect(screen.queryByRole('dialog', { name: '安排这一次学习' })).not.toBeInTheDocument()
  expect(store.getSnapshot().settings.dailyNewWords).toBe(30)
  expect(raw()).toBe(before)
})

test('closing an in-flight provider aborts it and restores body scroll', async () => {
  let signal
  const { unmount, raw } = harness(SessionAdviceModal, { generate: args => { signal = args.signal; return new Promise(() => {}) } })
  const before = raw()
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  expect(document.body.style.overflow).toBe('hidden')
  unmount()
  expect(signal.aborted).toBe(true)
  expect(document.body.style.overflow).not.toBe('hidden')
  expect(raw()).toBe(before)
})

test('quota failure is explicit, retains rules and does not claim a numeric balance', async () => {
  harness(SessionAdviceModal, { generate: vi.fn().mockRejectedValue({ code: 'QUOTA_EXHAUSTED' }) })
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  await screen.findByText(/模型免费额度已用尽/)
  expect(screen.getByRole('button', { name: '按原设置开始学习' })).toBeEnabled()
})

test('illegal provider quantities fall back to local bounds', async () => {
  harness(SessionAdviceModal, { generate: vi.fn(args => modelResult(args, { newWords: 101, reviewWords: 0, order: 'new-first' })) })
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  await screen.findByText(/建议未通过响应、数量或时间检查/)
  expect(screen.getByText('规则推荐 · 草稿')).toBeInTheDocument()
})

test('provider receives only summary and permitted settings, and displays its validated reason', async () => {
  const generate = vi.fn(args => modelResult(args))
  const { raw } = harness(SessionAdviceModal, { generate })
  const before = raw()
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  await screen.findByText('模型建议 · 草稿')
  expect(generate.mock.calls[0][0].facts).not.toHaveProperty('evidence')
  expect(generate.mock.calls[0][0].settings).not.toHaveProperty('pronunciation')
  expect(generate.mock.calls[0][0].settings).not.toHaveProperty('newWordSelectionMode')
  expect(screen.getByText('本次以可用时间为依据。')).toBeInTheDocument()
  expect(raw()).toBe(before)
})

test('an intervening external storage write rejects the response before the UI refresh timer', async () => {
  let resolve
  const generate = args => new Promise(done => { resolve = () => done(modelResult(args)) })
  const { outsideSave } = harness(SessionAdviceModal, { generate })
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  outsideSave({ dailyNewWords: 10 })
  await act(async () => resolve())
  expect(screen.queryByText('模型建议 · 草稿')).not.toBeInTheDocument()
  expect(screen.getByText(/依据已变化/)).toBeInTheDocument()
})

test('local calculation and input changes never call an injected model provider', () => {
  const generate = vi.fn()
  const { raw } = harness(SessionAdviceModal, { generate })
  const before = raw()
  expect(generate).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('slider'), { target: { value: '15' } })
  fireEvent.click(screen.getByRole('button', { name: '优先复习' }))
  fireEvent.click(screen.getByRole('button', { name: '重新计算规则' }))
  expect(generate).not.toHaveBeenCalled()
  expect(screen.queryByText(/输入已变化/)).not.toBeInTheDocument()
  expect(raw()).toBe(before)
})

test.each([undefined, { status: 'ready' }, { status: 'unexpected', revision: '1' },
  { status: 'disabled', revision: '1' }, { status: 'running', revision: '1' },
  { status: 'awaiting-quota-check', revision: '1' }, { status: 'quota-unavailable', revision: '1' },
  { status: 'limit-reached', revision: '1' }, { status: 'blocked', revision: '1' }])(
  'a missing or unavailable service state never permits a model request: %j', modelState => {
    const generate = vi.fn()
    harness(SessionAdviceModal, { generate, modelState })
    fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
    expect(generate).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '重新计算规则' })).toBeEnabled()
  })

test('the actual product without a provider offers rules and clearly marks AI unavailable', () => {
  harness(SessionAdviceModal)
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeDisabled()
  expect(screen.getByText(/AI 尚未接入/)).toBeInTheDocument()
  expect(screen.queryByText(/今日剩余可请求/)).not.toBeInTheDocument()
})

test('one explicit model operation binds its response and cannot be duplicated while waiting', async () => {
  let resolve
  const generate = vi.fn(args => new Promise(done => { resolve = () => done(modelResult(args, {})) }))
  const { raw } = harness(SessionAdviceModal, { generate })
  const before = raw()
  const button = screen.getByRole('button', { name: '生成 AI 建议' })
  fireEvent.click(button)
  fireEvent.click(button)
  expect(generate).toHaveBeenCalledOnce()
  expect(generate.mock.calls[0][0].requestId).toEqual(expect.any(String))
  expect(generate.mock.calls[0][0].basisVersion).toEqual(expect.any(String))
  await act(async () => resolve())
  expect(screen.getByRole('button', { name: '重新生成 AI 建议' })).toBeEnabled()
  expect(raw()).toBe(before)
})

test.each(['requestId', 'basisVersion', 'cacheHit'])('a mismatched response %s falls back instead of displaying model content', async field => {
  const generate = args => ({ ...modelResult(args), [field]: field === 'cacheHit' ? 'yes' : 'different' })
  harness(SessionAdviceModal, { generate })
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  await screen.findByText(/建议未通过/)
  expect(screen.getByText('规则推荐 · 草稿')).toBeInTheDocument()
  expect(screen.queryByText('模型建议 · 草稿')).not.toBeInTheDocument()
})

test('only a new explicit ready revision restores manual model requests after a failure', async () => {
  const generate = vi.fn().mockRejectedValueOnce({ code: 'QUOTA_CHECK_REQUIRED' }).mockImplementation(args => modelResult(args))
  const { rerender, store } = harness(SessionAdviceModal, { generate })
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  await screen.findByText(/需先核查免费额度/)
  const show = modelState => rerender(<LearningStoreProvider store={store}><SessionAdviceModal now={now} onClose={() => {}} onStart={() => {}} generate={generate} modelState={modelState} /></LearningStoreProvider>)
  show({ status: 'ready', revision: 'verified-1' })
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '重新计算规则' }))
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeDisabled()
  show({ status: 'ready', revision: 'verified-2' })
  expect(generate).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  await screen.findByText('模型建议 · 草稿')
  expect(generate).toHaveBeenCalledTimes(2)
  expect(generate.mock.calls[1][0].requestId).not.toBe(generate.mock.calls[0][0].requestId)
})

test('cancelling preserves rules and keeps the same verified state blocked', () => {
  const generate = vi.fn(() => new Promise(() => {}))
  harness(SessionAdviceModal, { generate })
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  fireEvent.click(screen.getByRole('button', { name: '取消生成' }))
  expect(screen.getByText(/已停止等待/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeDisabled()
  expect(screen.getByRole('button', { name: '重新计算规则' })).toBeEnabled()
})

test.each(['failure', 'cancel'])('a ready state seen before %s cannot count as later recovery', async outcome => {
  let reject
  const generate = () => new Promise((_, failed) => { reject = failed })
  const { store, rerender } = harness(SessionAdviceModal, { generate })
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  const show = revision => rerender(<LearningStoreProvider store={store}><SessionAdviceModal now={now} onClose={() => {}} onStart={() => {}} generate={generate} modelState={{ status: 'ready', revision }} /></LearningStoreProvider>)
  show('verified-2')
  if (outcome === 'failure') await act(async () => reject({ code: 'TIMEOUT' }))
  else fireEvent.click(screen.getByRole('button', { name: '取消生成' }))
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeDisabled()
  show('verified-3')
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeEnabled()
  expect(screen.queryByText(/等待超时/)).not.toBeInTheDocument()
})

test('cache and service attempt counts are explicitly labelled and never claim a Token balance', async () => {
  const generate = args => ({ ...modelResult(args), cacheHit: true })
  harness(SessionAdviceModal, { generate, modelState: { status: 'ready', revision: 'verified-1', remainingAttempts: { day: 7 }, retryAfterSeconds: 12 } })
  expect(screen.getByText(/今日剩余可请求 7 次/)).toBeInTheDocument()
  expect(screen.getByText(/服务提示需等待 12 秒/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '生成 AI 建议' }))
  await screen.findByText(/复用有效缓存/)
  expect(screen.queryByText(/剩余免费.*Token/)).not.toBeInTheDocument()
})

test('a completed frozen task with no review does not request a model', async () => {
  const generate = vi.fn(args => modelResult(args))
  const { store } = harness(SessionAdviceModal, { generate })
  await act(async () => {
    store.ensureTodayLearning('cet4', [])
  })
  fireEvent.click(screen.getByRole('button', { name: '重新计算规则' }))
  expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeDisabled()
  expect(generate).not.toHaveBeenCalled()
})
