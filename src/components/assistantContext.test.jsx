import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import FloatingLearningAssistant from './FloatingLearningAssistant'

function setup(context = null) {
  vi.useFakeTimers()
  let raw = null
  const now = new Date(2026, 9, 10, 12)
  const store = createLearningStore({ storage: { getItem: () => raw, setItem: (_, value) => { raw = value } }, now: () => now })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 20, dailyReviewWords: 20, dailyStudyMinutes: 60 })
  const show = (lesson = context, selectedPage = '今日学习') => <LearningStoreProvider store={store}><FloatingLearningAssistant enabled now={now} selectedPage={selectedPage} learningContext={lesson} /></LearningStoreProvider>
  const view = render(show())
  fireEvent.click(screen.getByRole('button', { name: '学习助手' }))
  // The exact approved welcome is longest; finish the owned timer queue, not a padded timeout.
  const finish = () => { act(() => vi.runAllTimers()) }
  finish()
  const send = text => {
    fireEvent.change(screen.getByRole('textbox', { name: '学习要求' }), { target: { value: text } })
    fireEvent.click(screen.getByRole('button', { name: '发送学习要求' }))
    finish()
  }
  return { ...view, show, send, finish, store, raw: () => raw }
}
const reply = () => [...document.querySelectorAll('.assistant-message--assistant .assistant-message__text')].at(-1).textContent
afterEach(() => vi.useRealTimers())

test('four fixed intents replace yes/no buttons and exact welcome is plain visible text', () => {
  setup()
  for (const name of ['学习计划', '单词记忆', '专属练习', '学习答疑']) expect(screen.getByRole('button', { name })).toBeEnabled()
  expect(screen.queryByRole('button', { name: '是，设置计划' })).not.toBeInTheDocument()
  expect(screen.queryByText('可以从这些学习要求开始')).not.toBeInTheDocument()
  expect(reply()).toContain('👋 你好！我是你的 LinguaJet 学习助手！')
  expect(reply()).toContain('那么，今天要为自己制定一个特别的学习计划吗？ ✨')
  expect(reply()).not.toContain('**')
})

test('daily time and displayed slider are unconfirmed until explicit confirmation, then reused', () => {
  const { finish, send, raw } = setup(), before = raw()
  fireEvent.click(screen.getByRole('button', { name: '学习计划' })); finish()
  expect(reply()).toBe('你这次准备学习多少分钟？')
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
  fireEvent.change(screen.getByRole('slider', { name: '本次可用时间' }), { target: { value: '15' } })
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认本次时间' })); finish()
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveValue('15')
  expect(screen.getByRole('article', { name: '本次建议草稿' })).toBeVisible()
  for (const name of ['学习计划', '单词记忆', '专属练习', '学习答疑']) expect(screen.getByRole('button', { name })).toBeVisible()
  fireEvent.click(screen.getByRole('button', { name: '返回对话' }))
  send('是')
  expect(reply()).toContain('已准备')
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveValue('15')
  expect(raw()).toBe(before)
})

test('explicit text changes confirmed session time without a new default or persistence write', () => {
  const { send, raw } = setup(), before = raw()
  send('学习计划 15分钟')
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveValue('15')
  fireEvent.click(screen.getByRole('button', { name: '返回对话' }))
  send('20分钟')
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveValue('20')
  expect(raw()).toBe(before)
})

test('bare integer is a time answer only during the known time clarification', () => {
  const { send, finish } = setup()
  send('11')
  expect(reply()).toContain('无法理解或处理任意请求')
  fireEvent.click(screen.getByRole('button', { name: '学习计划' })); finish()
  send('20')
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveValue('20')
})

test('review goal survives invalid explicit time followed by a corrected minute answer', () => {
  const { send } = setup()
  send('安排复习 90分钟')
  expect(reply()).toContain('最多')
  send('20分钟')
  expect(screen.getByRole('button', { name: '优先复习' })).toHaveAttribute('aria-pressed', 'true')
})

test('plan chip honors an explicit composer review request and its twenty-minute duration', () => {
  const { finish, raw } = setup(), before = raw()
  const input = screen.getByRole('textbox', { name: '学习要求' })
  fireEvent.change(input, { target: { value: '安排复习 20分钟' } })
  fireEvent.click(screen.getByRole('button', { name: '学习计划' })); finish()
  expect(screen.getByRole('button', { name: '优先复习' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveValue('20')
  expect(screen.getByRole('article', { name: '本次建议草稿' })).toBeVisible()
  expect(input).toHaveValue('')
  expect(raw()).toBe(before)
  fireEvent.click(screen.getByRole('button', { name: '返回对话' }))
  expect(screen.getByText('安排复习 20分钟', { selector: '.assistant-message--user .assistant-message__text' })).toBeVisible()
})

test.each(['学习计划', '安排复习 90分钟'])('explicit memory replaces %s time clarification and binds its word while streaming', request => {
  const exhibit = { source: 'today-learning', wordId: 'exhibit', word: 'exhibit' }
  const { send, finish, rerender, show, raw } = setup(exhibit), before = raw()
  send(request)
  expect(screen.getByRole('button', { name: '确认本次时间' })).toBeVisible()
  fireEvent.change(screen.getByRole('textbox', { name: '学习要求' }), { target: { value: '帮我记住 banana' } })
  fireEvent.click(screen.getByRole('button', { name: '发送学习要求' }))
  rerender(show({ ...exhibit, wordId: 'remain', word: 'remain' }))
  finish()
  expect(reply()).toContain('目标单词：banana')
  expect(reply()).toContain('尚未接入模型')
  expect(reply()).not.toContain('exhibit')
  expect(reply()).not.toContain('remain')
  expect(screen.queryByRole('button', { name: '确认本次时间' })).not.toBeInTheDocument()
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
  expect(raw()).toBe(before)
  // The old missing time was not implicitly confirmed by the capability switch.
  fireEvent.click(screen.getByRole('button', { name: '学习计划' })); finish()
  expect(reply()).toBe('你这次准备学习多少分钟？')
})

test.each([['3分钟', '至少'], ['61分钟', '最多'], ['5.5分钟', '整数'], ['一会儿', '明确']])('invalid time %s clarifies without preparing a draft', (text, reason) => {
  const { send, finish } = setup()
  fireEvent.click(screen.getByRole('button', { name: '学习计划' })); finish(); send(text)
  expect(reply()).toContain(reason)
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
})

test('word target binds at click, survives switching, and a later missing target never guesses history', () => {
  const exhibit = { source: 'today-learning', wordId: 'exhibit', word: 'exhibit', example: 'An exhibit.', wordBookId: 'cet4' }
  const { rerender, show, finish, send } = setup(exhibit)
  fireEvent.click(screen.getByRole('button', { name: '单词记忆' }))
  rerender(show({ ...exhibit, wordId: 'remain', word: 'remain' }))
  finish()
  expect(screen.getByText('帮我记住 exhibit', { selector: '.assistant-message--user .assistant-message__text' })).toBeVisible()
  expect(reply()).toContain('exhibit'); expect(reply()).toContain('尚未接入模型')
  expect(reply()).not.toContain('remain')
  rerender(show(null, '词表'))
  fireEvent.click(screen.getByRole('button', { name: '单词记忆' })); finish()
  expect(reply()).toBe('你想记住哪个单词呢？')
  send('banana')
  expect(reply()).toContain('banana'); expect(reply()).toContain('尚未接入模型')
})

test('memory chip consumes explicit draft over current word and refuses ambiguous multiple words', () => {
  const { finish } = setup({ source: 'today-learning', wordId: 'exhibit', word: 'exhibit' })
  const input = screen.getByRole('textbox', { name: '学习要求' })
  fireEvent.change(input, { target: { value: '帮我记住 banana' } })
  fireEvent.click(screen.getByRole('button', { name: '单词记忆' })); finish()
  expect(reply()).toContain('banana'); expect(reply()).not.toContain('exhibit')
  expect(input).toHaveValue('')
  fireEvent.change(input, { target: { value: 'banana apple' } })
  fireEvent.click(screen.getByRole('button', { name: '单词记忆' })); finish()
  expect(reply()).toContain('一个单词'); expect(reply()).not.toContain('exhibit')
})

test('exercise clarifies missing scope, confirms supplied scope and never makes fake questions', () => {
  const { finish, send } = setup()
  fireEvent.click(screen.getByRole('button', { name: '专属练习' })); finish()
  expect(reply()).toContain('练习'); expect(reply()).toContain('范围')
  send('一般过去时')
  expect(reply()).toContain('一般过去时'); expect(reply()).toContain('确认')
  send('是')
  expect(reply()).toContain('一般过去时'); expect(reply()).toContain('尚未接入模型')
})

test('Q&A consumes composer question, missing asks once and arbitrary text is honestly unsupported', () => {
  const { finish, send } = setup({ source: 'today-learning', wordId: 'exhibit', word: 'exhibit' })
  fireEvent.click(screen.getByRole('button', { name: '学习答疑' })); finish()
  expect(reply()).toBe('你遇到了什么问题呢？')
  send('为什么这里用过去完成时？')
  expect(reply()).toContain('过去完成时'); expect(reply()).toContain('尚未接入模型')
  fireEvent.change(screen.getByRole('textbox', { name: '学习要求' }), { target: { value: 'exhibit 和 exhibition 有什么区别？' } })
  fireEvent.click(screen.getByRole('button', { name: '学习答疑' })); finish()
  expect(reply()).toContain('exhibit 和 exhibition'); expect(reply()).not.toContain('你遇到了')
  send('帮我订机票')
  expect(reply()).toContain('无法理解或处理任意请求')
  expect(within(screen.getByRole('log')).queryByText(/内部指令/)).not.toBeInTheDocument()
})
