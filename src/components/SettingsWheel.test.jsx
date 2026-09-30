import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import SettingsWheel from './SettingsWheel'

test('opens one controlled wheel at a time and reports the selected column value', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()

  render(<ControlledWheels onChange={onChange} />)

  const newWords = screen.getByRole('button', { name: '每日新词 20' })
  const studyMinutes = screen.getByRole('button', { name: '每日学习时长 30 分钟' })
  expect(newWords).toHaveAttribute('aria-expanded', 'false')
  expect(studyMinutes).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()

  await user.click(newWords)
  expect(screen.getByRole('listbox', { name: '每日新词' })).toBeInTheDocument()
  expect(newWords).toHaveAttribute('aria-expanded', 'true')

  await user.click(screen.getByRole('option', { name: '30' }))
  expect(onChange).toHaveBeenCalledWith(30, '每日新词')

  await user.click(studyMinutes)
  expect(screen.queryByRole('listbox', { name: '每日新词' })).not.toBeInTheDocument()
  expect(screen.getByRole('listbox', { name: '每日学习时长' })).toBeInTheDocument()
  expect(newWords).toHaveAttribute('aria-expanded', 'false')
  expect(studyMinutes).toHaveAttribute('aria-expanded', 'true')
})

test('uses arrow keys on an option to select its adjacent choice', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()

  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)

  const selectedOption = screen.getByRole('option', { name: '20', selected: true })
  selectedOption.focus()
  await user.keyboard('{ArrowDown}')

  expect(onChange).toHaveBeenCalledWith(30, '每日新词')
})

test('keeps the current option as the only tab stop and lets Tab leave its column', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()

  render(<ControlledWheels onChange={onChange} />)

  await user.click(screen.getByRole('button', { name: '每日新词 20' }))
  await user.tab()
  const selectedOption = screen.getByRole('option', { name: '20', selected: true })
  expect(selectedOption).toHaveFocus()
  expect(screen.getByRole('option', { name: '10' })).toHaveAttribute('tabindex', '-1')
  expect(selectedOption).toHaveAttribute('tabindex', '0')
  expect(screen.getByRole('option', { name: '30' })).toHaveAttribute('tabindex', '-1')

  await user.keyboard('{ArrowDown}')
  expect(onChange).toHaveBeenCalledWith(30, '每日新词')
  expect(screen.getByRole('option', { name: '30', selected: true })).toHaveFocus()

  await user.tab()
  expect(screen.getByRole('button', { name: '每日学习时长 30 分钟' })).toHaveFocus()
})

test('keeps the tray mounted through its closing state before removing it', async () => {
  const user = userEvent.setup()
  const onChange = vi.fn()

  render(<ControlledWheels onChange={onChange} />)

  const summary = screen.getByRole('button', { name: '每日新词 20' })
  await user.click(summary)
  expect(document.querySelector('.settings-wheel__tray')).toBeInTheDocument()

  await user.click(summary)
  expect(document.querySelector('.settings-wheel__tray')).toHaveClass('is-closing')
  expect(document.querySelector('.settings-wheel__tray')).toHaveAttribute('aria-hidden', 'true')

  await waitFor(() => expect(document.querySelector('.settings-wheel__tray')).not.toBeInTheDocument())
})

test('reports the option aligned by a touch or mouse scroll', async () => {
  const onChange = vi.fn()
  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)

  const listbox = screen.getByRole('listbox', { name: '每日新词' })
  listbox.scrollTop = 96
  fireEvent.scroll(listbox)

  await waitFor(() => expect(onChange).toHaveBeenCalledWith(30, '每日新词'))
})

test('one mouse wheel notch selects only the adjacent option and prevents native scrolling', () => {
  const onChange = vi.fn()
  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
  const listbox = screen.getByRole('listbox', { name: '每日新词' })

  const down = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 360 })
  listbox.dispatchEvent(down)
  expect(down.defaultPrevented).toBe(true)
  expect(onChange).toHaveBeenLastCalledWith(30, '每日新词')
  expect(onChange).toHaveBeenCalledTimes(1)

  const atEnd = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 360 })
  listbox.dispatchEvent(atEnd)
  expect(atEnd.defaultPrevented).toBe(true)
  expect(onChange).toHaveBeenCalledTimes(1)

  const up = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -360 })
  listbox.dispatchEvent(up)
  expect(onChange).toHaveBeenLastCalledWith(20, '每日新词')
  expect(onChange).toHaveBeenCalledTimes(2)
})

test('positions the selected value without scrollIntoView or a selection feedback event', () => {
  const onChange = vi.fn()
  const scrollIntoView = vi.fn()
  const original = HTMLElement.prototype.scrollIntoView
  HTMLElement.prototype.scrollIntoView = scrollIntoView
  try {
    render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
    const listbox = screen.getByRole('listbox', { name: '每日新词' })
    expect(listbox.scrollTop).toBe(48)
    fireEvent.scroll(listbox)
    expect(onChange).not.toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('option', { name: '30' }))
    expect(listbox.scrollTop).toBe(96)
    fireEvent.scroll(listbox)
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(scrollIntoView).not.toHaveBeenCalled()
  } finally {
    HTMLElement.prototype.scrollIntoView = original
  }
})

test('returning a touch scroll to the selected row cancels its pending selection', () => {
  vi.useFakeTimers()
  try {
    const onChange = vi.fn()
    render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
    const listbox = screen.getByRole('listbox', { name: '每日新词' })

    listbox.scrollTop = 96
    fireEvent.scroll(listbox)
    listbox.scrollTop = 48
    fireEvent.scroll(listbox)
    act(() => vi.advanceTimersByTime(100))

    expect(onChange).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

test('small touchpad deltas accumulate before one adjacent choice', () => {
  const onChange = vi.fn()
  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
  const listbox = screen.getByRole('listbox', { name: '每日新词' })

  for (const deltaY of [10, 10, 10, 10]) {
    const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY })
    listbox.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  }
  expect(onChange).not.toHaveBeenCalled()

  listbox.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 10 }))
  expect(onChange).toHaveBeenCalledOnce()
  expect(onChange).toHaveBeenLastCalledWith(30, '每日新词')
})

test('a click starts a fresh touchpad gesture instead of using leftover delta', () => {
  const onChange = vi.fn()
  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
  const listbox = screen.getByRole('listbox', { name: '每日新词' })

  listbox.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 40 }))
  fireEvent.click(screen.getByRole('option', { name: '10' }))
  listbox.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: 10 }))

  expect(onChange).toHaveBeenCalledTimes(1)
  expect(onChange).toHaveBeenLastCalledWith(10, '每日新词')
})

test('focusing a clicked choice does not scroll its ancestors', () => {
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  try {
    render(<ControlledWheels onChange={vi.fn()} initialOpen="newWords" />)
    fireEvent.click(screen.getByRole('option', { name: '30' }))
    expect(focus).toHaveBeenCalledWith({ preventScroll: true })
  } finally {
    focus.mockRestore()
  }
})

function ControlledWheels({ onChange, initialOpen = null }) {
  const [openWheel, setOpenWheel] = useState(initialOpen)
  const [newWords, setNewWords] = useState(20)
  const [minutes, setMinutes] = useState(30)

  return (
    <div>
      <SettingsWheel
        label="每日新词"
        value={newWords}
        displayValue={String(newWords)}
        isOpen={openWheel === 'newWords'}
        onToggle={() => setOpenWheel((active) => active === 'newWords' ? null : 'newWords')}
        onChange={(nextValue, columnLabel) => {
          setNewWords(nextValue)
          onChange(nextValue, columnLabel)
        }}
        columns={[{
          label: '每日新词',
          value: newWords,
          options: [
            { value: 10, label: '10' },
            { value: 20, label: '20' },
            { value: 30, label: '30' },
          ],
        }]}
      />
      <SettingsWheel
        label="每日学习时长"
        value={minutes}
        displayValue={`${minutes} 分钟`}
        isOpen={openWheel === 'minutes'}
        onToggle={() => setOpenWheel((active) => active === 'minutes' ? null : 'minutes')}
        onChange={(nextValue, columnLabel) => {
          setMinutes(nextValue)
          onChange(nextValue, columnLabel)
        }}
        columns={[{
          label: '每日学习时长',
          value: minutes,
          options: [
            { value: 15, label: '15 分钟' },
            { value: 30, label: '30 分钟' },
            { value: 45, label: '45 分钟' },
          ],
        }]}
      />
    </div>
  )
}
