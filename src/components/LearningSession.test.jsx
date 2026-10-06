import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import { createInlineWordBookSession } from '../data/wordBookSession'
import TodayLearningPage from './TodayLearningPage'

const words = [{ word: 'alpha', meaning: '完整释义；第二释义', example: 'An alpha example.', translation: '例句翻译', phrases: ['alpha phrase'], partOfSpeech: 'n.' }, { word: 'beta', meaning: '第二个词' }, { word: 'gamma', meaning: '第三个词' }, { word: 'delta', meaning: '第四个词' }]
function setup() {
  let raw = null
  let fail = false
  let date = new Date(2026, 8, 24, 23, 59)
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw Error('quota'); raw = value } }
  const open = () => createLearningStore({ storage, now: () => date })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 2 })
  const loader = vi.fn(async () => createInlineWordBookSession(words))
  const show = (s = store) => render(<LearningStoreProvider store={s}><TodayLearningPage loadBook={loader} /></LearningStoreProvider>)
  return { store, open, loader, show, fail: value => { fail = value }, nextDay: () => { date = new Date(2026, 8, 25) } }
}

test('random creation samples beyond the original first words and restores the exact task', async () => {
  const env = setup()
  env.store.updateSettings({ newWordSelectionMode: 'random' })
  const random = vi.spyOn(Math, 'random').mockReturnValue(0)
  const view = env.show()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'beta' })
  const original = env.store.getTask('learning')
  expect(original.itemIds.map(id => original.items[id].wordId)).toEqual(['beta', 'delta'])
  view.unmount()
  random.mockReturnValue(.99)
  env.show(env.open())
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'beta' })
  expect(env.store.getTask('learning')).toEqual(original)
})

test('hides answers, saves feedback/details, restores after remount and advances persistently', async () => {
  const env = setup()
  env.store.ensureTodayLearning('cet4', ['alpha', 'beta'])
  const user = userEvent.setup()
  const view = env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(await screen.findByRole('heading', { name: 'alpha' })).toBeInTheDocument()
  expect(screen.queryByText('完整释义；第二释义')).not.toBeInTheDocument()
  await user.dblClick(await screen.findByRole('button', { name: '认识', exact: true }))
  expect(await screen.findByText('完整释义；第二释义')).toBeInTheDocument()
  expect(env.store.getTask('learning').feedbackEvents).toHaveLength(1)
  expect(screen.getByText('An alpha example.')).toBeInTheDocument()
  view.unmount()
  env.show(env.open())
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(await screen.findByText('完整释义；第二释义')).toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: '下一词' }))
  expect(await screen.findByRole('heading', { name: 'beta' })).toBeInTheDocument()
  expect(env.open().getTask('learning').view).toBe('question')
})

test('loading failure is recoverable and creates no task', async () => {
  const env = setup()
  env.loader.mockRejectedValueOnce(Error('network'))
  env.show()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('词书加载失败')
  expect(env.store.getTask('learning')).toBe(null)
  await user.click(screen.getByRole('button', { name: '重试' }))
  expect(await screen.findByRole('heading', { name: 'alpha' })).toBeInTheDocument()
})

test('failed save leaves answer hidden; retry counts once; conflicts reload saved details', async () => {
  const env = setup()
  env.store.ensureTodayLearning('cet4', ['alpha', 'beta'])
  env.show()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'alpha' })
  env.fail(true)
  await user.click(screen.getByRole('button', { name: '不认识', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(screen.queryByText('完整释义；第二释义')).not.toBeInTheDocument()
  env.fail(false)
  const other = env.open()
  const task = other.getTask('learning')
  other.submitSelfAssessment({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision }, 'known')
  await user.click(await screen.findByRole('button', { name: '认识', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('其他页面')
  await user.click(screen.getByRole('button', { name: '重新读取进度' }))
  expect(await screen.findByText('完整释义；第二释义')).toBeInTheDocument()
  expect(env.store.getTask('learning').feedbackEvents).toHaveLength(1)
})

test('midnight rejects previous task and offers today entry', async () => {
  const env = setup()
  env.store.ensureTodayLearning('cet4', ['alpha', 'beta'])
  env.show()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'alpha' })
  env.nextDay()
  await user.click(await screen.findByRole('button', { name: '认识', exact: true }))
  expect(await screen.findByRole('alert')).toHaveTextContent('日期已变化')
  expect(env.store.getTask('learning', '2026-09-24').feedbackEvents).toHaveLength(0)
  await user.click(screen.getByRole('button', { name: '开始今天的任务' }))
  await waitFor(() => expect(env.store.getTask('learning')?.date).toBe('2026-09-25'))
})

test('settings changes and a different chosen book do not redraw an existing task', async () => {
  const env = setup()
  const view = env.show()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'alpha' })
  await screen.findByRole('button', { name: '完整释义；第二释义' })
  const original = env.store.getTask('learning')
  view.unmount()
  env.store.updateSettings({ todayWordBookId: 'cet4-high-frequency', dailyNewWords: 1 })
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'alpha' })
  expect(env.loader.mock.lastCall[0].id).toBe('cet4')
  expect(env.store.getTask('learning')).toEqual(original)
})

test('creation save failure leaves no task; detail load failure leaves existing task intact', async () => {
  const env = setup()
  env.fail(true)
  const view = env.show()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(env.store.getTask('learning')).toBe(null)
  env.fail(false)
  await user.click(screen.getByRole('button', { name: '重试' }))
  await screen.findByRole('heading', { name: 'alpha' })
  const task = env.store.getTask('learning')
  view.unmount()
  env.loader.mockResolvedValueOnce({ loadWords: async () => { throw Error('missing details') } })
  env.show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('词书加载失败')
  expect(env.store.getTask('learning')).toEqual(task)
})

test('one word reaches completion after three separate self assessment turns', async () => {
  const env = setup()
  env.store.updateSettings({ dailyNewWords: 1 })
  env.store.ensureTodayLearning('cet4', ['alpha'])
  env.show()
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await screen.findByRole('heading', { name: 'alpha' })
  for (let i = 0; i < 3; i++) {
    await user.click(await screen.findByRole('button', { name: '认识', exact: true }))
    await user.click(await screen.findByRole('button', { name: '下一词' }))
  }
  expect(await screen.findByRole('heading', { name: '今日学习已完成' })).toBeInTheDocument()
  expect(env.open().getWord('cet4', 'alpha').learning.completed).toBe(true)
})
