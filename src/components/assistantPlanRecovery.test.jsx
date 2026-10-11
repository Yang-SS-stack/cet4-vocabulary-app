import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import FloatingLearningAssistant from './FloatingLearningAssistant'
import { completeAssistantReply, completeAssistantTurn, requestConfirmedPlan, startAssistantClock } from '../test/assistantClock'

const now = new Date(2026, 9, 10, 12)
function setup() {
  startAssistantClock()
  let persisted = null
  const onStartLearning = vi.fn()
  const store = createLearningStore({ storage: { getItem: () => persisted, setItem: (_, value) => { persisted = value } }, now: () => now })
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 20, dailyReviewWords: 20, dailyStudyMinutes: 30 })
  render(<LearningStoreProvider store={store}><FloatingLearningAssistant enabled selectedPage="词表" now={now} onStartLearning={onStartLearning} /></LearningStoreProvider>)
  fireEvent.click(screen.getByRole('button', { name: '学习助手' }))
  completeAssistantReply(); requestConfirmedPlan('安排复习', 17); completeAssistantTurn()
  return { store, onStartLearning, raw: () => persisted, corrupt: () => { persisted = 'invalid' } }
}
const demonstrate = kind => {
  fireEvent.change(screen.getByLabelText('演示状态'), { target: { value: kind } })
  fireEvent.click(screen.getByRole('button', { name: '运行演示' }))
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

test.each(['timeout', 'quota'])('%s keeps one original-study button above the demo and hides plan controls', kind => {
  const { onStartLearning, raw } = setup(), before = raw()
  demonstrate(kind)
  const failure = screen.getByRole('region', { name: '建议异常提示' })
  const start = within(failure).getByRole('button', { name: '按原设置开始学习' })
  expect(start).toBeEnabled()
  expect(screen.getAllByRole('button', { name: '按原设置开始学习' })).toHaveLength(1)
  expect(screen.queryByRole('button', { name: '使用规则建议' })).not.toBeInTheDocument()
  expect(screen.queryByRole('region', { name: '本次时间与目标' })).not.toBeInTheDocument()
  expect(screen.queryByRole('slider', { name: '本次可用时间' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '生成规则建议' })).not.toBeInTheDocument()
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
  expect(start.compareDocumentPosition(screen.getByRole('region', { name: '建议状态演示' })) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(failure).toHaveTextContent('模拟状态 · 未接入模型')
  if (kind === 'timeout') {
    expect(within(failure).getByRole('button', { name: '重试', exact: true })).toBeEnabled()
    expect(failure).toHaveTextContent('重新生成本地规则草稿')
  } else {
    expect(within(failure).getAllByRole('button')).toHaveLength(1)
    expect(screen.queryByRole('button', { name: /重试/ })).not.toBeInTheDocument()
  }
  fireEvent.click(start)
  act(() => vi.advanceTimersByTime(1000))
  expect(onStartLearning).toHaveBeenCalledOnce()
  expect(raw()).toBe(before)
})

test('normal draft places the original-study action before the demo', () => {
  setup()
  const draft = screen.getByRole('article', { name: '本次建议草稿' })
  const start = screen.getByRole('button', { name: '按原设置开始学习' })
  const demo = screen.getByRole('region', { name: '建议状态演示' })
  expect(draft.compareDocumentPosition(start) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(start.compareDocumentPosition(demo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
})

test('local retry rebuilds guarded facts while restoring chosen time and goal without writes', () => {
  const { store, raw } = setup()
  fireEvent.change(screen.getByRole('slider', { name: '本次可用时间' }), { target: { value: '11' } })
  fireEvent.click(screen.getByRole('button', { name: '减少负担' }))
  demonstrate('timeout')
  act(() => store.updateSettings({ dailyNewWords: 2 }))
  const before = raw()
  fireEvent.click(screen.getByRole('button', { name: '重试', exact: true }))
  const draft = screen.getByRole('article', { name: '本次建议草稿' })
  expect(within(draft).getByText('新词').nextElementSibling).toHaveTextContent('2 词')
  expect(screen.getByRole('slider', { name: '本次可用时间' })).toHaveValue('11')
  expect(screen.getByRole('button', { name: '减少负担' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: '采用此计划' })).toBeEnabled()
  expect(screen.queryByRole('region', { name: '建议异常提示' })).not.toBeInTheDocument()
  expect(raw()).toBe(before)
})

test('corrupt persistence leaves the failure and original-study entry usable', () => {
  const { corrupt, raw, onStartLearning } = setup()
  demonstrate('timeout'); corrupt()
  const before = raw()
  fireEvent.click(screen.getByRole('button', { name: '重试', exact: true }))
  expect(screen.getByRole('alert')).toHaveTextContent('学习记录已变化或无法读取')
  const failure = screen.getByRole('region', { name: '建议异常提示' })
  expect(screen.queryByRole('article', { name: '本次建议草稿' })).not.toBeInTheDocument()
  expect(screen.queryByRole('slider', { name: '本次可用时间' })).not.toBeInTheDocument()
  fireEvent.click(within(failure).getByRole('button', { name: '按原设置开始学习' }))
  act(() => vi.advanceTimersByTime(1000))
  expect(onStartLearning).toHaveBeenCalledOnce()
  expect(raw()).toBe(before)
})
