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

test('rapid reopening preserves the same tray instead of restarting an entering mount', () => {
  render(<ControlledWheels onChange={vi.fn()} initialOpen="newWords" />)
  const tray = document.querySelector('.settings-wheel__tray')
  fireEvent.click(screen.getByRole('button', { name: '每日新词 20' }))
  expect(tray).toHaveClass('is-closing')
  fireEvent.click(screen.getByRole('button', { name: '每日新词 20' }))
  expect(document.querySelector('.settings-wheel__tray')).toBe(tray)
  expect(tray).not.toHaveClass('is-closing')
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

test('positions the initial value directly and settles later selections without ancestor scrolling', async () => {
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
    await waitFor(() => expect(listbox.scrollTop).toBe(96))
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

test.each([
  [40, -55, 10],
  [-40, 55, 30],
])('a reversed wheel gesture discards the previous direction remainder (%s then %s)', (first, reversed, expected) => {
  const onChange = vi.fn()
  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
  const list = screen.getByRole('listbox', { name: '每日新词' })
  list.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: first }))
  expect(onChange).not.toHaveBeenCalled()
  list.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: reversed }))
  expect(onChange).toHaveBeenCalledOnce()
  expect(onChange).toHaveBeenLastCalledWith(expected, '每日新词')
})

test('a fresh wheel gesture does not inherit a remainder after a pause', () => {
  const clock = vi.spyOn(performance, 'now')
  try {
    clock.mockReturnValue(100)
    const onChange = vi.fn()
    render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
    const list = screen.getByRole('listbox', { name: '每日新词' })
    list.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -40 }))
    clock.mockReturnValue(1000)
    list.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -10 }))
    expect(onChange).not.toHaveBeenCalled()
    for (let index = 0; index < 4; index++) {
      list.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -10 }))
    }
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenLastCalledWith(10, '每日新词')
  } finally {
    clock.mockRestore()
  }
})

test('rapid upward mouse notches all advance before the previous animation finishes', async () => {
  const onChange = vi.fn()
  function NumericWheel() {
    const [value, setValue] = useState(50)
    return <SettingsWheel label="数量" value={value} displayValue={String(value)} isOpen onToggle={vi.fn()}
      onChange={next => { setValue(next); onChange(next) }}
      columns={[{ label: '数量', value, options: Array.from({ length: 100 }, (_, index) => ({ value: index + 1, label: String(index + 1) })) }]} />
  }
  render(<NumericWheel />)
  const list = screen.getByRole('listbox', { name: '数量' })
  act(() => {
    for (let index = 0; index < 5; index++) {
      const event = new WheelEvent('wheel', { bubbles: true, cancelable: true, deltaY: -120 })
      list.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
  })
  expect(onChange.mock.calls.map(([next]) => next)).toEqual([49, 48, 47, 46, 45])
  expect(screen.getByRole('option', { name: '45', selected: true })).toBeInTheDocument()
  await waitFor(() => expect(list.scrollTop).toBe(44 * 48))
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


test('disabled options cannot change a draft through clicks, keyboard, wheel or scroll', () => {
  const onChange = vi.fn()
  render(<SettingsWheel label="数量" value={20} displayValue="20" disabled isOpen onToggle={vi.fn()} onChange={onChange}
    columns={[{ label: '数量', value: 20, options: [{ value: 10, label: '10' }, { value: 20, label: '20' }] }]} />)
  const option = screen.getByRole('option', { name: '20' })
  expect(option).toBeDisabled()
  fireEvent.click(option)
  fireEvent.keyDown(option, { key: 'Home' })
  const list = screen.getByRole('listbox')
  fireEvent.wheel(list, { deltaY: -100 })
  list.scrollTop = 0
  fireEvent.scroll(list)
  expect(onChange).not.toHaveBeenCalled()
})

test('Home and End choose the first and last values', () => {
  const onChange = vi.fn()
  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
  fireEvent.keyDown(screen.getByRole('option', { name: '20' }), { key: 'Home' })
  expect(onChange).toHaveBeenLastCalledWith(10, '每日新词')
  fireEvent.keyDown(screen.getByRole('option', { name: '10' }), { key: 'End' })
  expect(onChange).toHaveBeenLastCalledWith(30, '每日新词')
})


test('touch settlement aligns the current option even if its value does not change', async () => {
  const onChange = vi.fn()
  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)
  const list = screen.getByRole('listbox', { name: '每日新词' })
  list.scrollTop = 54
  fireEvent.scroll(list)
  await waitFor(() => expect(list.scrollTop).toBe(48))
  expect(onChange).not.toHaveBeenCalled()
})

test('a reversed choice animates from the visible offset and cancels on unmount', () => {
  const frames = new Map()
  let nextId = 0
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextId, callback)
    return nextId
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id))
  const advance = time => act(() => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(time))
  })
  try {
    const rendered = render(<ControlledWheels onChange={vi.fn()} initialOpen="newWords" />)
    const list = screen.getByRole('listbox', { name: '每日新词' })
    expect(list.scrollTop).toBe(48)
    fireEvent.click(screen.getByRole('option', { name: '30' }))
    advance(0)
    advance(90)
    const visibleOffset = list.scrollTop
    expect(visibleOffset).toBeGreaterThan(48)
    expect(visibleOffset).toBeLessThan(96)
    fireEvent.click(screen.getByRole('option', { name: '10' }))
    expect(list.scrollTop).toBe(visibleOffset)
    advance(100)
    expect(list.scrollTop).toBe(visibleOffset)
    advance(190)
    expect(list.scrollTop).toBeLessThan(visibleOffset)
    expect(cancel).toHaveBeenCalled()
    rendered.unmount()
    expect(frames.size).toBe(0)
  } finally {
    request.mockRestore()
    cancel.mockRestore()
  }
})

test.each([
  ['click', '30', null, 96],
  ['Home', '10', 'Home', 0],
  ['End', '30', 'End', 96],
])('a repeated %s after pointer interruption resumes alignment from the visible offset', (_name, optionName, key, target) => {
  const frames = new Map()
  let nextId = 0
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextId, callback)
    return nextId
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id))
  const advance = time => act(() => {
    const pending = [...frames.values()]
    frames.clear()
    pending.forEach(callback => callback(time))
  })
  try {
    render(<ControlledWheels onChange={vi.fn()} initialOpen="newWords" />)
    const list = screen.getByRole('listbox', { name: '每日新词' })
    fireEvent.click(screen.getByRole('option', { name: optionName }))
    advance(0)
    advance(90)
    const visibleOffset = list.scrollTop
    expect(visibleOffset).not.toBe(target)
    fireEvent.pointerDown(list)
    expect(frames.size).toBe(0)
    const option = screen.getByRole('option', { name: optionName, selected: true })
    if (key) fireEvent.keyDown(option, { key })
    else fireEvent.click(option)
    expect(list.scrollTop).toBe(visibleOffset)
    expect(frames.size).toBe(1)
    advance(100)
    expect(list.scrollTop).toBe(visibleOffset)
    advance(190)
    expect(Math.abs(list.scrollTop - target)).toBeLessThan(Math.abs(visibleOffset - target))
    expect(list.scrollTop).not.toBe(target)
    advance(280)
    expect(list.scrollTop).toBe(target)
  } finally {
    request.mockRestore()
    cancel.mockRestore()
  }
})


test('hiding the page cancels scroll animation at its final selected value', () => {
  const frames = new Map()
  let nextId = 0
  const request = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => {
    frames.set(++nextId, callback)
    return nextId
  })
  const cancel = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => frames.delete(id))
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  try {
    render(<ControlledWheels onChange={vi.fn()} initialOpen="newWords" />)
    const list = screen.getByRole('listbox', { name: '每日新词' })
    fireEvent.click(screen.getByRole('option', { name: '30' }))
    expect(frames.size).toBe(1)
    hidden.mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    expect(list.scrollTop).toBe(96)
  } finally {
    hidden.mockRestore()
    request.mockRestore()
    cancel.mockRestore()
  }
})

test('reduced motion selects directly without scheduling a scroll animation', () => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }))
  const request = vi.spyOn(window, 'requestAnimationFrame')
  try {
    render(<ControlledWheels onChange={vi.fn()} initialOpen="newWords" />)
    const list = screen.getByRole('listbox', { name: '每日新词' })
    fireEvent.click(screen.getByRole('option', { name: '30' }))
    expect(list.scrollTop).toBe(96)
    expect(request).not.toHaveBeenCalled()
  } finally {
    vi.unstubAllGlobals()
    request.mockRestore()
  }
})
