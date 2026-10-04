import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, test, vi } from 'vitest'
import DevelopmentMaintenancePage from './DevelopmentMaintenancePage'
import { createLearningStore, LearningStoreProvider } from '../data/learning'

let assistant
vi.mock('../data/assistant/react', async importOriginal => ({
  ...await importOriginal(), useAssistant: () => assistant,
}))
beforeEach(() => {
  assistant = { connected: false, busy: false, message: '未连接', connectionMessage: '未连接', summaryStatus: 'not-checked', activeOperationKind: null, checkedAt: null,
    illegalMessage: null, clientState: { error: null }, diagnostics: [],
    connect: vi.fn(), check: vi.fn(), disconnect: vi.fn(), cancel: vi.fn(), clearDiagnostics: vi.fn() }
})
function show() {
  const storage = { getItem: () => null, setItem: vi.fn() }
  const store = createLearningStore({ storage })
  const view = render(<LearningStoreProvider store={store}><DevelopmentMaintenancePage onReturnSettings={vi.fn()} onReturnToday={vi.fn()} /></LearningStoreProvider>)
  return { ...view, storage }
}
test('shows one project and switches views without sending or saving', async () => {
  const user = userEvent.setup()
  const { storage } = show()
  expect(screen.getByLabelText('一次性连接码')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '检查当前学习摘要' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: '当前摘要' }))
  expect(screen.queryByLabelText('一次性连接码')).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeDisabled()
  await user.click(screen.getByRole('tab', { name: '记录依据' }))
  expect(screen.getByRole('region', { name: '学习记录对账依据' })).toBeInTheDocument()
  await user.click(screen.getByRole('tab', { name: '检查记录' }))
  expect(screen.getByText('本标签页还没有检查记录。')).toBeInTheDocument()
  expect(assistant.connect).not.toHaveBeenCalled()
  expect(assistant.check).not.toHaveBeenCalled()
  expect(storage.setItem).not.toHaveBeenCalled()
})
test('keeps cancellation and disconnect available while project switching is disabled', () => {
  assistant.busy = true
  assistant.connected = true
  assistant.activeOperationKind = 'connect'
  show()
  expect(screen.getByRole('tab', { name: '当前摘要' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: '取消等待' }))
  fireEvent.click(screen.getByRole('button', { name: '断开连接' }))
  expect(assistant.cancel).toHaveBeenCalledOnce()
  expect(assistant.disconnect).toHaveBeenCalledOnce()
  expect(screen.getByText(/不代表服务此刻仍在线/)).toBeInTheDocument()
})
test('reentering an established session selects the summary and shows its own current state', async () => {
  assistant.connected = true
  assistant.summaryStatus = 'failed'
  assistant.message = '请求过于频繁，请稍后再试。'
  assistant.connectionMessage = '已建立临时会话。'
  assistant.projectErrors = { real: { retryAfter: 7 }, connect: null, illegal: null }
  show()
  expect(screen.getByRole('tab', { name: '当前摘要' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('当前摘要：检查失败')).toBeInTheDocument()
  expect(screen.getByText('请等待 7 秒后再手动尝试。')).toBeInTheDocument()
  await userEvent.setup().click(screen.getByRole('tab', { name: '非法示例' }))
  expect(screen.queryByText('请求过于频繁，请稍后再试。')).not.toBeInTheDocument()
  expect(screen.queryByText('请等待 7 秒后再手动尝试。')).not.toBeInTheDocument()
  expect(screen.getByText('尚未执行固定非法示例检查。')).toBeInTheDocument()
})
test('previews a labelled demo separately and offers selectable text when copying fails', async () => {
  const user = userEvent.setup()
  const { storage } = show()
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockRejectedValue(Error('denied')) } })
  await user.click(screen.getByRole('tab', { name: '检查记录' }))
  await user.click(screen.getByRole('button', { name: '预览演示报告' }))
  expect(screen.getByRole('textbox', { name: '诊断报告预览' }).value).toMatch(/演示报告.*未执行请求/)
  await user.click(screen.getByRole('button', { name: '复制这份报告' }))
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('手动复制'))
  expect(assistant.diagnostics).toEqual([])
  expect(storage.setItem).not.toHaveBeenCalled()
})
test('clears only diagnostic history after an explicit confirmation', async () => {
  assistant.diagnostics = [{ operationId: 1, kind: 'real', outcome: 'success', basisState: 'stale', finishedAt: '2026-10-05T00:00:00.000Z' }]
  const user = userEvent.setup()
  const { storage } = show()
  await user.click(screen.getByRole('tab', { name: '检查记录' }))
  expect(screen.getByText('依据已变化')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '清空检查记录' }))
  expect(screen.getByRole('button', { name: '保留记录' })).toHaveFocus()
  await user.click(screen.getByRole('button', { name: '确认清空' }))
  expect(assistant.clearDiagnostics).toHaveBeenCalledOnce()
  expect(assistant.disconnect).not.toHaveBeenCalled()
  expect(storage.setItem).not.toHaveBeenCalled()
})
