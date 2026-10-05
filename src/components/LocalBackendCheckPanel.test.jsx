import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import { createBrowserLearningStore } from '../data/learning/browserStore'
import { LEARNING_STORAGE_KEY } from '../data/learning/model'
import { AssistantProvider } from '../data/assistant/react'
import { createLocalClient } from '../data/assistant/localClient'
import SettingsPage from './SettingsPage'
import TodayLearningPage from './TodayLearningPage'
import LocalBackendCheckPanel from './LocalBackendCheckPanel'
import StatisticsPage from './StatisticsPage'

const start = new Date(2026, 9, 2, 12)
afterEach(() => vi.useRealTimers())
function setup({ permission = 'prompt', fetchImpl = vi.fn(), clock = () => start, permissionQuery, prepare = () => {}, browserStore = false } = {}) {
  let raw = null
  const storage = { getItem: () => raw, setItem: vi.fn((_, value) => { raw = value }) }
  const core = createLearningStore({ storage, now: clock })
  core.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 2, dailyReviewWords: 3, dailyStudyMinutes: 10 })
  prepare(core)
  // Synthetic tests run these synchronous mutations serially; no browser storage is used.
  const locks = { request: async (_key, _options, update) => update() }
  const store = browserStore ? createBrowserLearningStore({ storage, now: clock, locks }) : core
  storage.setItem.mockClear()
  const queryPermission = permissionQuery ?? vi.fn(async () => ({ state: permission }))
  const client = createLocalClient({ fetchImpl, now: clock })
  const content = page => <LearningStoreProvider store={store}><AssistantProvider client={client} clock={clock} queryPermission={queryPermission}>{page}<LocalBackendCheckPanel /></AssistantProvider></LearningStoreProvider>
  const view = render(content(<SettingsPage now={start} />))
  return { store, storage, locks, client, queryPermission, fetchImpl, navigate: page => view.rerender(content(page)) }
}
async function openAndConnect() {
  const user = userEvent.setup()
  await user.click(screen.getByText('开发验收：本机后端'))
  await user.type(screen.getByLabelText('一次性连接码'), 'c'.repeat(43))
  await user.click(screen.getByRole('button', { name: '连接本机后端' }))
  return user
}
function response(body, status = 200) {
  return { status, headers: new Headers({ 'content-type': 'application/json' }), json: async () => body }
}
function service(onCheck, sessionStart = start) {
  return vi.fn(async (url, options) => {
    if (url.endsWith('/health')) return response({ service: 'linguajet-local', contractVersion: 1 })
    if (url.endsWith('/session')) return response({ sessionToken: 'a'.repeat(43), expiresAt: new Date(sessionStart.getTime() + 43200000).toISOString() })
    const request = JSON.parse(options.body)
    if (onCheck) return onCheck(request)
    return response({ contractVersion: 1, requestId: request.requestId, snapshotToken: request.basis.snapshotToken, factsToken: request.basis.factsToken, status: 'validated', receivedAt: start.toISOString() })
  })
}
test('U01 rendering and opening stays read-only and offline until explicit connection', async () => {
  const { storage, queryPermission, fetchImpl } = setup()
  expect(screen.getByText('开发验收：本机后端').closest('details')).not.toHaveAttribute('open')
  expect(screen.getByRole('button', { name: '检查当前学习摘要', hidden: true })).toBeDisabled()
  await userEvent.click(screen.getByText('开发验收：本机后端'))
  expect(queryPermission).not.toHaveBeenCalled()
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(storage.setItem).not.toHaveBeenCalled()
})

test.each(['unconnected', 'checked'])('storage conflict preserves the %s settings draft until explicit reread', async mode => {
  const fetchImpl = service(request => request.invalidSyntheticExample
    ? response({ error: { code: 'FACTS_INVALID', message: 'safe' } }, 422)
    : response({ contractVersion: 1, requestId: request.requestId, snapshotToken: request.basis.snapshotToken, factsToken: request.basis.factsToken, status: 'validated', receivedAt: start.toISOString() }))
  const { store, storage, locks } = setup({ fetchImpl, browserStore: true, prepare: core => core.updateSettings({ dailyNewWords: 20, dailyReviewWords: 20, dailyStudyMinutes: 90 }) })
  const user = mode === 'checked' ? await openAndConnect() : userEvent.setup()
  if (mode === 'checked') {
    await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
    expect(await screen.findByText('连接正常，摘要格式检查通过')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '检查非法示例' }))
    expect(await screen.findByText('错误输入已被拒绝')).toBeInTheDocument()
  }
  const oldSnapshot = store.getSnapshot()
  const oldRaw = storage.getItem(LEARNING_STORAGE_KEY)
  const otherTab = createBrowserLearningStore({ storage, now: () => start, locks })
  await otherTab.updateSettings({ dailyNewWords: 40 })
  const latestRaw = storage.getItem(LEARNING_STORAGE_KEY)
  expect(latestRaw).not.toBe(oldRaw)
  storage.setItem.mockClear()

  act(() => window.dispatchEvent(new StorageEvent('storage', { key: LEARNING_STORAGE_KEY, oldValue: oldRaw, newValue: latestRaw })))
  expect(screen.getByRole('button', { name: '每日新词数量 20 词' })).toBeInTheDocument()
  if (mode === 'checked') {
    expect(screen.getByText('记录或日期已变化，请重新检查')).toBeInTheDocument()
    expect(screen.queryByText('连接正常，摘要格式检查通过')).not.toBeInTheDocument()
    expect(screen.queryByText(/本次检查时间/)).not.toBeInTheDocument()
    expect(screen.getByText('错误输入已被拒绝')).toBeInTheDocument()
  }

  await user.click(screen.getByRole('button', { name: '保存设置' }))
  const reread = await screen.findByRole('button', { name: '重新读取已保存设置' })
  expect(screen.getByText(/记录已在其他页面更新/)).toBeInTheDocument()
  expect(store.getSnapshot()).toBe(oldSnapshot)
  expect(() => store.readAssistantSnapshot()).toThrow(/changed elsewhere/)
  expect(storage.getItem(LEARNING_STORAGE_KEY)).toBe(latestRaw)
  expect(storage.setItem).not.toHaveBeenCalled()
  if (mode === 'checked') {
    const calls = fetchImpl.mock.calls.length
    await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
    expect(await screen.findByText('摘要无法生成，请重新载入记录后再检查。')).toBeInTheDocument()
    expect(fetchImpl).toHaveBeenCalledTimes(calls)
    expect(screen.getByText('错误输入已被拒绝')).toBeInTheDocument()
  } else expect(fetchImpl).not.toHaveBeenCalled()

  await user.click(reread)
  expect(screen.getByRole('button', { name: '每日新词数量 40 词' })).toBeInTheDocument()
  expect(screen.getByText('已读取最新设置，请核对后再保存。')).toBeInTheDocument()
  expect(store.readAssistantSnapshot().raw).toBe(latestRaw)
  expect(storage.setItem).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  expect(await screen.findByText('设置已保存。已开始的今日任务保持原计划。')).toBeInTheDocument()
  expect(storage.setItem).toHaveBeenCalledOnce()
  expect(JSON.parse(storage.getItem(LEARNING_STORAGE_KEY)).settings.dailyNewWords).toBe(40)
})

test('storage conflict makes the live statistics unavailable without adopting the other tab state', async () => {
  const { store, storage, locks, navigate, fetchImpl } = setup({ browserStore: true })
  navigate(<StatisticsPage />)
  expect(screen.getByRole('heading', { name: '词书进度' })).toBeInTheDocument()
  const oldSnapshot = store.getSnapshot()
  const oldRaw = storage.getItem(LEARNING_STORAGE_KEY)
  const otherTab = createBrowserLearningStore({ storage, now: () => start, locks })
  await otherTab.updateSettings({ dailyNewWords: 40 })
  const latestRaw = storage.getItem(LEARNING_STORAGE_KEY)
  storage.setItem.mockClear()
  act(() => window.dispatchEvent(new StorageEvent('storage', { key: LEARNING_STORAGE_KEY, oldValue: oldRaw, newValue: latestRaw })))
  expect(await screen.findByText('学习记录已变化或无法读取，请重新载入页面。', {}, { timeout: 1500 })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: '词书进度' })).not.toBeInTheDocument()
  expect(store.getSnapshot()).toBe(oldSnapshot)
  expect(() => store.readAssistantSnapshot()).toThrow(/changed elsewhere/)
  expect(storage.getItem(LEARNING_STORAGE_KEY)).toBe(latestRaw)
  expect(storage.setItem).not.toHaveBeenCalled()
  expect(fetchImpl).not.toHaveBeenCalled()
})
test('denied permission never pairs and accurately provides recovery', async () => {
  const { fetchImpl, queryPermission } = setup({ permission: 'denied' })
  await openAndConnect()
  expect(queryPermission).toHaveBeenCalledOnce()
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(screen.getByText(/站点设置.*本地网络访问/)).toBeInTheDocument()
})
test('connect clears code but does not claim summary checked; check is read-only', async () => {
  const fetchImpl = service()
  const { storage } = setup({ fetchImpl })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByLabelText('一次性连接码')).toHaveValue(''))
  expect(screen.queryByText('连接正常，摘要格式检查通过')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  expect(await screen.findByText('连接正常，摘要格式检查通过')).toBeInTheDocument()
  const sent = JSON.parse(fetchImpl.mock.calls.at(-1)[1].body)
  expect(sent).not.toHaveProperty('evidence')
  expect(storage.setItem).not.toHaveBeenCalled()
})
test('S04 feedback and disconnect invalidate a late result without restoring connection', async () => {
  let finish
  const fetchImpl = service(request => new Promise(resolve => { finish = () => resolve(response({ contractVersion: 1, requestId: request.requestId, snapshotToken: request.basis.snapshotToken, factsToken: request.basis.factsToken, status: 'validated', receivedAt: start.toISOString() })) }))
  const { client } = setup({ fetchImpl })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  await waitFor(() => expect(finish).toBeTypeOf('function'))
  await user.click(screen.getByRole('button', { name: '断开连接' }))
  await act(async () => { finish() })
  expect(client.getState().status).toBe('disconnected')
  expect(screen.queryByText('连接正常，摘要格式检查通过')).not.toBeInTheDocument()
})
test('permission query failure is unknown and proceeds with health, never labels refusal', async () => {
  const fetchImpl = service()
  setup({ fetchImpl, permissionQuery: vi.fn(async () => { throw new TypeError('unsupported') }) })
  await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  expect(screen.queryByText(/已拒绝/)).not.toBeInTheDocument()
})
test('fixed illegal example only reports expected 422 and leaves real summary separate', async () => {
  const fetchImpl = service(() => response({ error: { code: 'FACTS_INVALID', message: 'safe' } }, 422))
  const { storage } = setup({ fetchImpl })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查非法示例' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '检查非法示例' }))
  expect(await screen.findByText('错误输入已被拒绝')).toBeInTheDocument()
  expect(JSON.parse(fetchImpl.mock.calls.at(-1)[1].body)).toEqual({ contractVersion: 1, invalidSyntheticExample: true })
  expect(screen.queryByText('连接正常，摘要格式检查通过')).not.toBeInTheDocument()
  expect(storage.setItem).not.toHaveBeenCalled()
})
test('navigation preserves connection within the same provider and stays offline', async () => {
  const fetchImpl = service()
  const { navigate, storage } = setup({ fetchImpl })
  await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  navigate(<TodayLearningPage now={start} />)
  navigate(<SettingsPage now={start} />)
  await userEvent.click(screen.getByText('开发验收：本机后端'))
  expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled()
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  expect(storage.setItem).not.toHaveBeenCalled()
})
test.each([['midnight', 3], ['due-time', 3], ['midnight', 4], ['due-time', 4]])('S04 before-send %s transition during digest %s never sends a stale summary', async (kind, transitionDigest) => {
  let now = kind === 'midnight' ? new Date(2026, 9, 2, 23, 59, 59) : start
  const later = kind === 'midnight' ? new Date(2026, 9, 3) : new Date(start.getTime() + 2000)
  const fetchImpl = service(undefined, now)
  setup({ fetchImpl, clock: () => now, prepare: store => { if (kind === 'due-time') store.addToReview('cet4', 'future', { nextReviewAt: new Date(start.getTime() + 1000).toISOString() }) } })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  const digest = crypto.subtle.digest.bind(crypto.subtle)
  let calls = 0
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args)
    if (++calls === transitionDigest) now = later
    return result
  })
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  expect(await screen.findByText('记录或日期已变化，请重新检查')).toBeInTheDocument()
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
test.each([5, 6])('S04 midnight during after-response digest %s cannot display success', async transitionDigest => {
  let now = new Date(2026, 9, 2, 23, 59, 59)
  setup({ fetchImpl: service(undefined, now), clock: () => now })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  const digest = crypto.subtle.digest.bind(crypto.subtle)
  let calls = 0
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(async (...args) => {
    const result = await digest(...args)
    if (++calls === transitionDigest) now = new Date(2026, 9, 3)
    return result
  })
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  expect(await screen.findByText('记录或日期已变化，请重新检查')).toBeInTheDocument()
  expect(screen.queryByText('连接正常，摘要格式检查通过')).not.toBeInTheDocument()
})
test('cancel while permission query waits cannot later initiate health or restore credentials', async () => {
  let finish
  const { fetchImpl, client } = setup({ permissionQuery: vi.fn(() => new Promise(resolve => { finish = resolve })) })
  const user = await openAndConnect()
  await user.click(screen.getByRole('button', { name: '断开连接' }))
  await act(async () => { finish({ state: 'granted' }) })
  expect(fetchImpl).not.toHaveBeenCalled()
  expect(client.getState().status).toBe('disconnected')
})
test('stopped service produces generic failure while the learning store remains unchanged', async () => {
  const fetchImpl = service(() => { throw new TypeError('network failed') })
  const { storage } = setup({ fetchImpl })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  expect(await screen.findByText('连接失败，检查服务和站点权限。')).toBeInTheDocument()
  expect(screen.queryByText(/已拒绝/)).not.toBeInTheDocument()
  expect(storage.setItem).not.toHaveBeenCalled()
})
test('local session expiry disables summary and discards credentials without network', async () => {
  let now = start
  const fetchImpl = service()
  const { client } = setup({ fetchImpl, clock: () => now })
  await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  await act(async () => { now = new Date(start.getTime() + 43200000) })
  await waitFor(() => expect(screen.getByText('会话过期，请重新启动服务配对。')).toBeInTheDocument(), { timeout: 1500 })
  expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeDisabled()
  expect(client.getState().status).toBe('disconnected')
  expect(fetchImpl).toHaveBeenCalledTimes(2)
})
test.each(['book', 'feedback', 'storage', 'midnight', 'due-time'])('S04 %s change after response cannot display current success', async kind => {
  let now = kind === 'midnight' ? new Date(2026, 9, 2, 23, 59, 59) : start
  let change
  const fetchImpl = service(request => {
    change()
    return response({ contractVersion: 1, requestId: request.requestId, snapshotToken: request.basis.snapshotToken, factsToken: request.basis.factsToken, status: 'validated', receivedAt: start.toISOString() })
  }, now)
  const { store, storage } = setup({ fetchImpl, clock: () => now, prepare: store => {
    store.ensureTask('learning', ['alpha'], 'cet4')
    if (kind === 'due-time') store.addToReview('cet4', 'future', { nextReviewAt: new Date(start.getTime() + 1000).toISOString() })
  } })
  change = () => {
    if (kind === 'book') store.updateSettings({ todayWordBookId: 'cet4-high-frequency' })
    else if (kind === 'feedback') store.recordFeedback('learning', 'alpha', 'known')
    else if (kind === 'storage') {
      const oldRaw = storage.getItem(LEARNING_STORAGE_KEY)
      const otherTab = createLearningStore({ storage, now: () => now })
      otherTab.updateSettings({ dailyNewWords: 40 })
      window.dispatchEvent(new StorageEvent('storage', { key: LEARNING_STORAGE_KEY, oldValue: oldRaw, newValue: storage.getItem(LEARNING_STORAGE_KEY) }))
    }
    else now = kind === 'midnight' ? new Date(2026, 9, 3) : new Date(start.getTime() + 2000)
  }
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  expect(await screen.findByText('记录或日期已变化，请重新检查')).toBeInTheDocument()
  expect(screen.queryByText('连接正常，摘要格式检查通过')).not.toBeInTheDocument()
})
test('permission capability query is bounded and cannot leave the UI waiting forever', async () => {
  vi.useFakeTimers()
  const { fetchImpl } = setup({ permissionQuery: vi.fn(() => new Promise(() => {})) })
  fireEvent.click(screen.getByText('开发验收：本机后端'))
  fireEvent.change(screen.getByLabelText('一次性连接码'), { target: { value: 'c'.repeat(43) } })
  fireEvent.click(screen.getByRole('button', { name: '连接本机后端' }))
  await act(async () => { await vi.advanceTimersByTimeAsync(60000) })
  expect(screen.getByRole('button', { name: '连接本机后端' })).toBeEnabled()
  expect(screen.getByText('连接失败，检查服务和站点权限。')).toBeInTheDocument()
  expect(fetchImpl).not.toHaveBeenCalled()
  vi.useRealTimers()
})
function connectWithKeyboardEquivalent() {
  fireEvent.click(screen.getByText('开发验收：本机后端'))
  fireEvent.change(screen.getByLabelText('一次性连接码'), { target: { value: 'c'.repeat(43) } })
  fireEvent.click(screen.getByRole('button', { name: '连接本机后端' }))
}
test('query time and suspended health share the original click deadline, late health cannot pair', async () => {
  vi.useFakeTimers()
  let finishQuery, finishHealth
  const fetchImpl = vi.fn(() => new Promise(resolve => { finishHealth = resolve }))
  const { client } = setup({ fetchImpl, permissionQuery: () => new Promise(resolve => { finishQuery = resolve }) })
  connectWithKeyboardEquivalent()
  await act(async () => { await vi.advanceTimersByTimeAsync(12000); finishQuery({ state: 'prompt' }) })
  expect(fetchImpl).toHaveBeenCalledOnce()
  await act(async () => { await vi.advanceTimersByTimeAsync(47999) })
  expect(screen.getByRole('button', { name: '连接本机后端' })).toBeDisabled()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(screen.getByText('连接失败，检查服务和站点权限。')).toBeInTheDocument()
  await act(async () => { finishHealth(response({ service: 'linguajet-local', contractVersion: 1 })) })
  expect(fetchImpl).toHaveBeenCalledOnce()
  expect(client.getState().status).toBe('disconnected')
})
test('healthy response at click 59999ms leaves a full independent pairing 5000ms', async () => {
  vi.useFakeTimers()
  let finishHealth
  const fetchImpl = vi.fn(url => url.endsWith('/health')
    ? new Promise(resolve => { finishHealth = resolve })
    : new Promise(() => {}))
  const { client } = setup({ fetchImpl })
  connectWithKeyboardEquivalent()
  await act(async () => { await vi.advanceTimersByTimeAsync(59999); finishHealth(response({ service: 'linguajet-local', contractVersion: 1 })) })
  expect(fetchImpl).toHaveBeenCalledTimes(2)
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(client.getState().status).toBe('connecting')
  await act(async () => { await vi.advanceTimersByTimeAsync(4998) })
  expect(client.getState().status).toBe('connecting')
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(client.getState().status).toBe('error')
  expect(client.getState().error.code).toBe('TIMEOUT')
  expect(client.getState().error.restartRequired).toBe(true)
})
test.each(['disconnect', 'expiry'])('real summary and illegal example retain separate results until %s clears them', async clearBy => {
  let now = start
  let illegal = false
  const fetchImpl = service(request => {
    if (request.invalidSyntheticExample) { illegal = true; return response({ error: { code: 'FACTS_INVALID', message: 'safe' } }, 422) }
    return response({ contractVersion: 1, requestId: request.requestId, snapshotToken: request.basis.snapshotToken, factsToken: request.basis.factsToken, status: 'validated', receivedAt: start.toISOString() })
  })
  const { store, storage } = setup({ fetchImpl, clock: () => now })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  expect(await screen.findByText('连接正常，摘要格式检查通过')).toBeInTheDocument()
  const checkTime = screen.getByText(/本次检查时间/).textContent
  await user.click(screen.getByRole('button', { name: '检查非法示例' }))
  expect(await screen.findByText('错误输入已被拒绝')).toBeInTheDocument()
  expect(illegal).toBe(true)
  expect(screen.getByText('连接正常，摘要格式检查通过')).toBeInTheDocument()
  expect(screen.getByText(/本次检查时间/)).toHaveTextContent(checkTime)
  expect(storage.setItem).not.toHaveBeenCalled()
  act(() => store.updateSettings({ todayWordBookId: 'cet4-high-frequency' }))
  expect(screen.getByText('记录或日期已变化，请重新检查')).toBeInTheDocument()
  expect(screen.getByText('错误输入已被拒绝')).toBeInTheDocument()
  expect(screen.queryByText(/本次检查时间/)).not.toBeInTheDocument()
  if (clearBy === 'disconnect') await user.click(screen.getByRole('button', { name: '断开连接' }))
  else {
    act(() => { now = new Date(start.getTime() + 43200000) })
    await waitFor(() => expect(screen.getByText('会话过期，请重新启动服务配对。')).toBeInTheDocument(), { timeout: 1500 })
  }
  expect(screen.queryByText('错误输入已被拒绝')).not.toBeInTheDocument()
})
test('midnight during an illegal response still invalidates preserved real basis and ignores the late example result', async () => {
  let now = new Date(2026, 9, 2, 23, 59, 59)
  const fetchImpl = service(request => {
    if (request.invalidSyntheticExample) {
      now = new Date(2026, 9, 3)
      return response({ error: { code: 'FACTS_INVALID', message: 'safe' } }, 422)
    }
    return response({ contractVersion: 1, requestId: request.requestId, snapshotToken: request.basis.snapshotToken, factsToken: request.basis.factsToken, status: 'validated', receivedAt: start.toISOString() })
  }, now)
  setup({ fetchImpl, clock: () => now })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  expect(await screen.findByText('连接正常，摘要格式检查通过')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '检查非法示例' }))
  expect(screen.getByText('记录或日期已变化，请重新检查')).toBeInTheDocument()
  expect(screen.queryByText('错误输入已被拒绝')).not.toBeInTheDocument()
  expect(screen.queryByText(/本次检查时间/)).not.toBeInTheDocument()
})
test.each([['SESSION_REQUIRED', 'illegal'], ['SESSION_EXPIRED', 'real'], ['failed-repair', 'connect']])('%s clears both old connection results when triggered by %s', async (failure, action) => {
  let failCode = null
  const fetchImpl = service(request => {
    if (failCode) return response({ error: { code: failCode, message: 'safe' } }, 401)
    if (request.invalidSyntheticExample) return response({ error: { code: 'FACTS_INVALID', message: 'safe' } }, 422)
    return response({ contractVersion: 1, requestId: request.requestId, snapshotToken: request.basis.snapshotToken, factsToken: request.basis.factsToken, status: 'validated', receivedAt: start.toISOString() })
  })
  const { client, storage } = setup({ fetchImpl })
  const user = await openAndConnect()
  await waitFor(() => expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '检查当前学习摘要' }))
  expect(await screen.findByText('连接正常，摘要格式检查通过')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '检查非法示例' }))
  expect(await screen.findByText('错误输入已被拒绝')).toBeInTheDocument()
  if (action === 'connect') {
    fetchImpl.mockImplementationOnce(async () => { throw new TypeError('stopped service') })
    await user.type(screen.getByLabelText('一次性连接码'), 'c'.repeat(43))
    await user.click(screen.getByRole('button', { name: '连接本机后端' }))
    await waitFor(() => expect(client.getState().status).toBe('error'))
  } else {
    failCode = failure
    await user.click(screen.getByRole('button', { name: action === 'illegal' ? '检查非法示例' : '检查当前学习摘要' }))
    await waitFor(() => expect(client.getState().status).toBe('expired'))
    expect(client.getState().expiresAt).toBeNull()
  }
  expect(screen.queryByText('连接正常，摘要格式检查通过')).not.toBeInTheDocument()
  expect(screen.queryByText('错误输入已被拒绝')).not.toBeInTheDocument()
  expect(screen.queryByText(/本次检查时间/)).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeDisabled()
  expect(storage.setItem).not.toHaveBeenCalled()
})
