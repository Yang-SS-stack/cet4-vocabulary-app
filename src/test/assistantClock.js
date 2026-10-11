import { act, fireEvent, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { ASSISTANT_WELCOME } from '../components/assistantMockConversation'

export function startAssistantClock() {
  vi.useFakeTimers()
  // Testing Library's async user-event drain detects the Jest timer interface.
  // Bridge only that interface to Vitest so its zero-delay drain can finish.
  vi.stubGlobal('jest', { advanceTimersByTime: vi.advanceTimersByTime })
}

// Advance only the owned local response until completion, with a bounded clock.
// The streaming tests assert exact intermediate timing; callers here test later UI.
export function completeAssistantReply() {
  // 18 frames for the 450 ms wait, then at most one frame per grapheme.
  // The exact welcome is the longest static mock reply. Questions can quote
  // the bounded composer input (1000 chars) plus a short availability notice.
  const welcome = Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(ASSISTANT_WELCOME)).length
  const lastUser = [...document.querySelectorAll('.assistant-message--user .assistant-message__text')].at(-1)?.textContent?.length ?? 0
  const frameLimit = 18 + Math.max(welcome, lastUser + 80)
  for (let frames = 0; screen.queryByRole('status', { name: '助手正在回复' }) && frames < frameLimit; frames += 8) {
    // Eight real cadence frames per render keep long welcome checks inexpensive.
    // At most 175 ms past completion; never consumes the 900 ms plan read pause.
    act(() => vi.advanceTimersByTime(Math.min(8, frameLimit - frames) * 25))
  }
  if (screen.queryByRole('status', { name: '助手正在回复' })) throw new Error('Local mock reply did not finish within its bounded clock')
}

export function sendAssistantText(text) {
  const input = screen.getByRole('textbox', { name: '学习要求' })
  fireEvent.change(input, { target: { value: text } })
  fireEvent.submit(input.closest('form'))
}

export function requestConfirmedPlan(request = '设置学习计划', minutes = 30) {
  sendAssistantText(`${request} ${minutes}分钟`)
}
export function completeAssistantTurn() {
  completeAssistantReply()
  act(() => vi.advanceTimersByTime(900))
}
