import { readFile, writeFile } from 'node:fs/promises'

const [sourcePath, outputPath] = process.argv.slice(2)

if (!sourcePath || !outputPath) {
  throw new Error('Usage: node scripts/import-cet4-vocabulary.mjs <source.jsonl> <output.js>')
}

const normalize = (value) => value?.replace(/\s+/g, ' ').trim() ?? ''
const unique = (items) => [...new Set(items.filter(Boolean))]

const sourceRows = (await readFile(sourcePath, 'utf8'))
  .trim()
  .split('\n')
  .map((line) => JSON.parse(line))

const entriesByWord = new Map()

for (const row of sourceRows) {
  const word = normalize(row.word).toLowerCase()
  if (!word) continue

  const entries = entriesByWord.get(word) ?? []
  entries.push(row)
  entriesByWord.set(word, entries)
}

const words = [...entriesByWord.entries()].map(([word, entries]) => {
  const translations = unique(
    entries.flatMap((entry) => entry.translations?.map((item) => normalize(item.translation)) ?? []),
  )
  const partsOfSpeech = unique(
    entries.flatMap((entry) => entry.translations?.map((item) => normalize(item.type)) ?? []),
  )
  const phrases = unique(
    entries.flatMap((entry) => entry.phrases?.map((item) => normalize(item.phrase)) ?? []),
  )
  const sentence = entries.flatMap((entry) => entry.sentences ?? []).find((item) => item.sentence && item.translation)
  const phonetic = entries.map((entry) => normalize(entry.us || entry.uk)).find(Boolean)

  return {
    word,
      phonetic: `/${phonetic || '-'}/`,
    partOfSpeech: partsOfSpeech.join('/'),
    meaning: translations.join('；'),
    example: normalize(sentence?.sentence),
    translation: normalize(sentence?.translation),
    phrases,
  }
})

if (words.length !== 4544 || words.some((word) => !word.meaning || !word.partOfSpeech || !word.phonetic)) {
  throw new Error('Converted CET-4 data does not meet the expected schema.')
}

await writeFile(outputPath, `export const words = ${JSON.stringify(words, null, 2)}\n`, 'utf8')
console.log(`Wrote ${words.length} unique CET-4 words to ${outputPath}`)
