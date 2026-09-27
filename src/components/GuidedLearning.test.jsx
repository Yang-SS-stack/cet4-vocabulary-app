import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import { createInlineWordBookSession } from '../data/wordBookSession'
import TodayLearningPage from './TodayLearningPage'

const words = [
  { word: 'alpha', meaning: '首字母', example: 'An alpha example.', translation: '例句翻译' },
  { word: 'beta', meaning: '测试版' }, { word: 'chill', meaning: '寒冷' }, { word: 'drain', meaning: '排水' },
]
test('guided rounds persist choice then reveal details; hints decrease with progress', async () => {
  let raw = null
  const storage = { getItem: () => raw, setItem: (_, value) => { raw = value } }
  const store = createLearningStore({ storage })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  const loadBook = async () => createInlineWordBookSession(words)
  const show = () => render(<LearningStoreProvider store={store}><TodayLearningPage loadBook={loadBook} /></LearningStoreProvider>)
  const user = userEvent.setup()
  let view = show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(await screen.findByRole('button', { name: '首字母' }))
  expect(await screen.findByRole('button', { name: '继续' })).toBeInTheDocument()
  view.unmount()
  view = show()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  await user.click(await screen.findByRole('button', { name: '继续' }))
  await user.click(await screen.findByRole('button', { name: '下一词' }))
  await screen.findByRole('button', { name: '认识', exact: true })
  expect(await screen.findByText('An alpha example.')).toBeInTheDocument()
  expect(screen.queryByText('例句翻译')).not.toBeInTheDocument()
  await user.click(await screen.findByRole('button', { name: '认识', exact: true }))
  await user.click(await screen.findByRole('button', { name: '下一词' }))
  await screen.findByRole('button', { name: '认识', exact: true })
  expect(screen.queryByText('An alpha example.')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '认识', exact: true }))
  await user.click(await screen.findByRole('button', { name: '下一词' }))
  expect(await screen.findByRole('heading', { name: '今日学习已完成' })).toBeInTheDocument()
})


test('choice resource failure is reported as loading failure and can retry without resetting task', async () => {
  let raw = null
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } } })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1 })
  const session = createInlineWordBookSession(words)
  let failPool = true
  const loadBook = async () => ({ ...session, loadWords: async ids => {
    if (ids.length > 1 && failPool) throw Error('network')
    return session.loadWords(ids)
  } })
  render(<LearningStoreProvider store={store}><TodayLearningPage loadBook={loadBook} /></LearningStoreProvider>)
  const user = userEvent.setup()
  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('词书加载失败')
  const fixedWords = store.getTask('learning').itemIds
  failPool = false
  await user.click(screen.getByRole('button', { name: '重新读取进度' }))
  expect(await screen.findByRole('button', { name: '首字母' })).toBeEnabled()
  expect(store.getTask('learning').itemIds).toEqual(fixedWords)
})
