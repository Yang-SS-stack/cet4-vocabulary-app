import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, expect, test, vi } from 'vitest'
import { readFileSync } from 'node:fs'
const css = readFileSync('src/components/LearningSession.css', 'utf8')
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import { createInlineWordBookSession } from '../data/wordBookSession'
import TodayLearningPage from './TodayLearningPage'
import LearningSession from './LearningSession'

beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') } })
afterAll(() => { delete HTMLDialogElement.prototype.showModal })
const words = [{ word: 'alpha', meaning: '首字母', example: 'An alpha example.' }, { word: 'beta', meaning: '测试版' }, { word: 'chill', meaning: '寒冷' }, { word: 'drain', meaning: '排水' }]
const token = task => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision })
function setup({ guided = false, count = 2 } = {}) {
  let raw = null, fail = false
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw Error('quota'); raw = value } }
  const open = () => createLearningStore({ random: () => 0.999, storage })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: count })
  store.ensureTodayLearning('cet4', words.slice(0, count).map(w => w.word), store.getToday(), store.getSnapshot().settings,
    { id: guided ? 'guided-recall' : 'self-assessment', rulesVersion: 1 })
  const loadBook = async () => createInlineWordBookSession(words)
  const show = (s = store) => render(<LearningStoreProvider store={s}><TodayLearningPage loadBook={loadBook} /></LearningStoreProvider>)
  return { store, open, show, loadBook, fail: value => { fail = value } }
}

test('correction stays on details, handles failed save, persists once and keeps its heading', async () => {
  const env = setup(), user = userEvent.setup()
  let view = env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(await screen.findByRole('button', { name: '认识', exact: true }))
  const correct = await screen.findByRole('button', { name: '记错了' })
  const heading = screen.getByRole('heading', { name: 'alpha' })
  env.fail(true)
  await user.click(correct)
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(env.store.getTask('learning').feedbackEvents).toHaveLength(1)
  env.fail(false)
  await user.dblClick(correct)
  expect(screen.getByRole('heading', { name: 'alpha' })).toBe(heading)
  expect(screen.getByText('An alpha example.')).toBeInTheDocument()
  expect(screen.getByText(/已更正：模糊/)).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '已更正' })).toBeDisabled()
  expect(env.store.getTask('learning').feedbackEvents).toHaveLength(2)
  view.unmount()
  env.show(env.open())
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(await screen.findByRole('button', { name: '已更正' })).toBeDisabled()
  expect(screen.queryByRole('button', { name: '记错了' })).not.toBeInTheDocument()
})

test('guided correction appears only after correct choice full detail, never incorrect details', async () => {
  const env = setup({ guided: true }), user = userEvent.setup()
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(await screen.findByRole('button', { name: '首字母' }))
  expect(screen.queryByRole('button', { name: '记错了' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '继续' }))
  await user.click(await screen.findByRole('button', { name: '记错了' }))
  expect(screen.getByLabelText('今日认识 0 / 3 次')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '下一词' }))
  await user.click(await screen.findByRole('button', { name: '首字母' }))
  await user.click(screen.getByRole('button', { name: '继续' }))
  await screen.findByRole('heading', { name: '释义' })
  expect(screen.queryByRole('button', { name: '记错了' })).not.toBeInTheDocument()
})

test('cancel and Escape preserve progress and focus; confirmation fades out before main entry', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const env = setup(), user = userEvent.setup()
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('button', { name: '认识', exact: true })
  const task = env.store.getTask('learning')
  const exit = screen.getByRole('button', { name: '返回主界面' })
  await user.click(exit)
  expect(screen.getByRole('dialog', { name: '退出本次学习？' })).toHaveTextContent('当前任务剩余 2 词')
  await user.click(screen.getByRole('button', { name: '继续学习', exact: true }))
  expect(exit).toHaveFocus()
  expect(env.store.getTask('learning')).toBe(task)
  await user.click(exit)
  fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: false, cancelable: true }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(exit).toHaveFocus()
  await user.click(exit)
  await user.click(screen.getByRole('button', { name: '确认退出' }))
  expect(document.querySelector('.learning-session')).toHaveClass('is-exiting')
  expect(document.querySelector('.learning-session')).toHaveAttribute('inert')
  expect(screen.queryByRole('button', { name: '今日学习' })).not.toBeInTheDocument()
  expect(await screen.findByRole('button', { name: '今日学习' })).toHaveFocus()
  expect(screen.getByRole('region', { name: '今日学习概览' })).toHaveClass('is-entering')
  expect(env.store.getTask('learning')).toBe(task)
})

test('completed final details exit without confirmation, reduced motion exits promptly and only once', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: true }))
  const env = setup({ count: 1 }), exit = vi.fn()
  for (let n = 0; n < 3; n++) {
    env.store.submitSelfAssessment(token(env.store.getTask('learning')), 'known')
    if (n < 2) env.store.advanceLearning(token(env.store.getTask('learning')))
  }
  render(<LearningStoreProvider store={env.store}><LearningSession onExit={exit} loadBook={env.loadBook} /></LearningStoreProvider>)
  await screen.findByRole('button', { name: '记错了' })
  await userEvent.setup().dblClick(screen.getByRole('button', { name: '返回主界面' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(exit).toHaveBeenCalledOnce())
})

test('exit with no saved task does not invent remaining words', async () => {
  const store = createLearningStore({ random: () => 0.999, storage: { getItem: () => null, setItem: () => {} } }), exit = vi.fn()
  render(<LearningStoreProvider store={store}><LearningSession onExit={exit} /></LearningStoreProvider>)
  await screen.findByRole('alert')
  await userEvent.setup().click(screen.getByRole('button', { name: '返回主界面' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await waitFor(() => expect(exit).toHaveBeenCalledOnce())
})

test('exit during delayed daily details does not create a task', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const writes = vi.fn()
  const store = createLearningStore({ random: () => 0.999, storage: { getItem: () => null, setItem: writes } })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  writes.mockClear()
  const ensure = vi.spyOn(store, 'ensureTodayLearning')
  const session = createInlineWordBookSession(words)
  let resolveDetails
  const loadWords = vi.fn(() => new Promise(resolve => { resolveDetails = resolve }))
  const exit = vi.fn()
  render(<LearningStoreProvider store={store}><LearningSession onExit={exit} loadBook={async () => ({ ...session, loadWords })} /></LearningStoreProvider>)
  await waitFor(() => expect(loadWords).toHaveBeenCalledOnce())
  await userEvent.setup().click(screen.getByRole('button', { name: '返回主界面' }))
  expect(document.querySelector('.learning-session')).toHaveClass('is-exiting')
  expect(exit).not.toHaveBeenCalled()
  await act(async () => { resolveDetails([words[0]]); await Promise.resolve() })
  expect(ensure).not.toHaveBeenCalled()
  expect(store.getTask('learning')).toBe(null)
  expect(writes).not.toHaveBeenCalled()
})

test('exit during delayed choice preparation preserves the existing guided task', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const env = setup({ guided: true })
  const original = env.store.getTask('learning')
  const session = createInlineWordBookSession(words)
  let resolveOrder
  const loadLearningOrder = vi.fn(() => new Promise(resolve => { resolveOrder = resolve }))
  const prepare = vi.spyOn(env.store, 'prepareLearningChoice')
  render(<LearningStoreProvider store={env.store}><LearningSession onExit={vi.fn()} loadBook={async () => ({ ...session, loadLearningOrder })} /></LearningStoreProvider>)
  await waitFor(() => expect(loadLearningOrder).toHaveBeenCalledOnce())
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  await user.click(screen.getByRole('button', { name: '确认退出' }))
  await act(async () => { resolveOrder(words.map(word => word.word)); await Promise.resolve() })
  expect(prepare).not.toHaveBeenCalled()
  expect(env.store.getTask('learning')).toBe(original)
})

test('option colors and reserved English transition together at 350ms with a reduced-motion override', () => {
  expect(css).toMatch(/background-color 350ms/)
  expect(css).toMatch(/border-color 350ms/)
  expect(css).toMatch(/color 350ms/)
  expect(css).toMatch(/opacity 350ms/)
  expect(css).toMatch(/small\.is-reserved\s*\{\s*opacity: 0/)
  expect(css).toMatch(/prefers-reduced-motion: reduce[\s\S]*learning-session__choices[\s\S]*transition: none/)
})


test('correction waits until full details enter, and completed-to-corrected updates the exit remainder', async () => {
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  const env = setup({ count: 1 }), user = userEvent.setup()
  for (let n = 0; n < 2; n++) {
    env.store.submitSelfAssessment(token(env.store.getTask('learning')), 'known')
    env.store.advanceLearning(token(env.store.getTask('learning')))
  }
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await waitFor(() => expect(screen.getByRole('region', { name: '今日学习练习' })).not.toHaveAttribute('inert'))
  await user.click(await screen.findByRole('button', { name: '认识', exact: true }))
  const correct = screen.getByRole('button', { name: '记错了' })
  expect(correct).toBeDisabled()
  await waitFor(() => expect(correct).toBeEnabled())
  await user.click(correct)
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  expect(screen.getByRole('dialog')).toHaveTextContent('当前任务剩余 1 词')
})
