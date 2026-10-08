const eligible = (task, id) => !task.items[id].completed && !task.items[id].removed

// The selected assignment is immutable; only this separate presentation is shuffled.
export function createPresentation(task, random, previous = null) {
  const order = task.itemIds.filter(id => eligible(task, id))
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  if (order.length > 1 && previous?.order.length === order.length
    && order.every((id, index) => id === previous.order[index])) {
    // A bounded fallback also works for deterministic or degenerate random sources.
    order.push(order.shift())
  }
  return { order, index: 0, round: previous ? previous.round + 1 : 1 }
}

export function advancePresentation(task, random) {
  const previous = task.presentation
  for (let index = previous.index + 1; index < previous.order.length; index++) {
    if (eligible(task, previous.order[index])) return { ...previous, index }
  }
  if (!task.itemIds.some(id => eligible(task, id))) return { ...previous, index: previous.order.length }
  return createPresentation(task, random, previous)
}

// Preserve the fixed-order suffix of old tasks; no random work during loading.
export function legacyPresentation(task) {
  return { order: [...task.itemIds], index: task.currentItemId === null
    ? task.itemIds.length : task.itemIds.indexOf(task.currentItemId), round: 1 }
}
