function choice(value) {
  const word = typeof value?.word === 'string' ? value.word.trim().toLowerCase() : ''
  const meaning = typeof value?.meaning === 'string' ? value.meaning.trim() : ''
  const senses = new Set(meaning.split(/[;；,，、\n]/).map(sense => sense.trim()).filter(Boolean))
  return word && senses.size ? { word, meaning, senses } : null
}

function compatible(first, second) {
  return first.word !== second.word && ![...first.senses].some(sense => second.senses.has(sense))
}

function shuffle(values) {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1))
    ;[values[index], values[other]] = [values[other], values[index]]
  }
  return values
}

// Fresh same-book choices; callers persist and reuse already prepared options.
export function learningChoices(item, pool) {
  const correct = choice(item)
  if (!correct) throw Error('choice content unavailable')
  const candidates = shuffle(pool.map(choice).filter(candidate => candidate && compatible(correct, candidate)))
  const picked = [correct]
  // Search at most three levels so an overlapping early candidate cannot hide a valid trio.
  function pick(start) {
    if (picked.length === 4) return true
    for (let index = start; index <= candidates.length - (4 - picked.length); index++) {
      const candidate = candidates[index]
      if (!picked.every(option => compatible(option, candidate))) continue
      picked.push(candidate)
      if (pick(index + 1)) return true
      picked.pop()
    }
    return false
  }
  if (!pick(0)) throw Error('choice content unavailable')
  return shuffle(picked).map(({ word, meaning }) => ({ word, meaning }))
}
