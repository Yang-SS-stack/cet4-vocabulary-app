import { act, render, screen } from '@testing-library/react'
import { afterEach, expect, test, vi } from 'vitest'
import LoadingIndicator from './LoadingIndicator'

afterEach(() => vi.useRealTimers())

test('shows only for real waits beyond 200ms and disappears as soon as loading ends', () => {
  vi.useFakeTimers()
  const { rerender } = render(<LoadingIndicator active label="正在读取词书" />)
  act(() => vi.advanceTimersByTime(199))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('status')).toHaveTextContent('正在读取词书')
  rerender(<LoadingIndicator active={false} label="正在读取词书" />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1000))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
})

test('fast requests never flash and each new wait starts its own delay', () => {
  vi.useFakeTimers()
  const { rerender, unmount } = render(<LoadingIndicator active label="准备中" />)
  act(() => vi.advanceTimersByTime(100))
  rerender(<LoadingIndicator active={false} label="准备中" />)
  act(() => vi.advanceTimersByTime(300))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  rerender(<LoadingIndicator active label="准备中" compact />)
  act(() => vi.advanceTimersByTime(199))
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.getByRole('status')).toHaveTextContent('准备中')
  unmount()
  expect(vi.getTimerCount()).toBe(0)
})
