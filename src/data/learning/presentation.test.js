import { expect, test } from 'vitest'
import { createPresentation, advancePresentation, legacyPresentation } from './presentation'

const task = (ids, completed = [], removed = []) => ({ itemIds: ids,
  items: Object.fromEntries(ids.map(id => [id, { completed: completed.includes(id), removed: removed.includes(id) }])) })
test('pure shuffle selects exactly eligible IDs and never mutates the task or previous round', () => {
  const t = task(['a', 'b', 'c', 'd'], ['b'], ['d'])
  const previous = { order: ['c', 'a'], index: 1, round: 4 }
  const before = structuredClone({ t, previous })
  expect(createPresentation(t, () => 0, previous)).toEqual({ order: ['a', 'c'], index: 0, round: 5 })
  expect({ t, previous }).toEqual(before)
})
test('empty, single and two-word rounds have bounded, deterministic transitions', () => {
  for (const ids of [[], ['a'], ['a', 'b']]) {
    const t = task(ids), first = createPresentation(t, () => 0)
    expect(first.order.toSorted()).toEqual(ids.toSorted())
    const next = advancePresentation({ ...t, presentation: { ...first, index: Math.max(0, ids.length - 1) } }, () => 0)
    expect(next.round).toBe(ids.length ? 2 : 1)
    if (ids.length > 1) expect(next.order).not.toEqual(first.order)
  }
})
test('advance skips completed and removed entries inside a round before reshuffling', () => {
  const t = task(['a', 'b', 'c', 'd'], ['b'], ['c'])
  t.presentation = { order: t.itemIds, index: 0, round: 2 }
  expect(advancePresentation(t, () => 0)).toEqual({ order: t.itemIds, index: 3, round: 2 })
  expect(legacyPresentation({ ...t, currentItemId: 'c' })).toEqual({ order: t.itemIds, index: 2, round: 1 })
  expect(legacyPresentation({ ...t, currentItemId: null }).index).toBe(4)
})
