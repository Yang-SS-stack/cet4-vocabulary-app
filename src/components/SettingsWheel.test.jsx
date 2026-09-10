import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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

test('reports the option aligned by a touch or mouse scroll', async () => {
  const onChange = vi.fn()
  render(<ControlledWheels onChange={onChange} initialOpen="newWords" />)

  const listbox = screen.getByRole('listbox', { name: '每日新词' })
  listbox.scrollTop = 96
  fireEvent.scroll(listbox)

  await waitFor(() => expect(onChange).toHaveBeenCalledWith(30, '每日新词'))
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
