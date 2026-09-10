import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'

import { createLearningStore } from './index'
import { LearningStoreProvider, useLearningStore } from './react'

function createMemoryStorage() {
  const values = new Map()
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  }
}

function Probe() {
  const { store, snapshot } = useLearningStore()
  return <button onClick={() => store.updateSettings({ dailyNewWords: 12 })}>{snapshot.settings.dailyNewWords ?? 'unset'}</button>
}

test('updates the React snapshot after a learning-store settings change', async () => {
  const user = userEvent.setup()
  const store = createLearningStore({ storage: createMemoryStorage() })

  render(<LearningStoreProvider store={store}><Probe /></LearningStoreProvider>)

  expect(screen.getByRole('button')).toHaveTextContent('unset')
  await user.click(screen.getByRole('button'))
  expect(screen.getByRole('button')).toHaveTextContent('12')
})
