// Deterministic distractors from the same book, excluding overlapping senses.
export function learningChoices(item, pool) {
  const meaning = value => value.meaning?.trim()
  const senses = value => new Set(meaning(value)?.split(/[;；,，、\n]/).map(s => s.trim()).filter(Boolean))
  const target = senses(item)
  const picked = [{ word: item.word.toLowerCase(), meaning: meaning(item) }]
  if (!picked[0].meaning) throw Error('choice content unavailable')
  for (const candidate of pool) {
    if (picked.length === 4) break
    if (!meaning(candidate) || picked.some(option => option.word === candidate.word.toLowerCase() || option.meaning === meaning(candidate))) continue
    if ([...senses(candidate)].some(sense => target.has(sense))) continue
    picked.push({ word: candidate.word.toLowerCase(), meaning: meaning(candidate) })
  }
  if (picked.length !== 4) throw Error('choice content unavailable')
  const offset = [...item.word].reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % 4
  return [...picked.slice(offset), ...picked.slice(0, offset)]
}
