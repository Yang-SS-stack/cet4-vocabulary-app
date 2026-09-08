import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const BOOKS = [
  { id: 'cet4', input: 'public/data/cet4.json', defaultSort: 'alphabetical' },
  { id: 'cet4-high-frequency', input: 'public/data/cet4-high-frequency.json', defaultSort: 'frequency' },
]
const CHUNK_SIZE = 128
const INITIAL_PAGE_SIZE = 21
const wordOrder = new Intl.Collator('en', { sensitivity: 'base' })
const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function normalizeFrequency(value) {
  return Number.isFinite(value) && value >= 0 ? value : null
}

function compareAlphabetically(first, second) {
  return wordOrder.compare(first.word, second.word) || first.sourceIndex - second.sourceIndex
}

function compareByFrequency(first, second) {
  const firstFrequency = normalizeFrequency(first.frequency)
  const secondFrequency = normalizeFrequency(second.frequency)

  if (firstFrequency === null && secondFrequency !== null) return 1
  if (firstFrequency !== null && secondFrequency === null) return -1
  if (firstFrequency !== null && secondFrequency !== null && firstFrequency !== secondFrequency) {
    return secondFrequency - firstFrequency
  }

  return compareAlphabetically(first, second)
}

function validateWords(words, bookId) {
  if (!Array.isArray(words)) throw new Error(`${bookId} source data must be an array`)

  const seenWords = new Set()
  return words.map((word, sourceIndex) => {
    if (typeof word.word !== 'string' || word.word.trim() === '') {
      throw new Error(`${bookId} contains an empty word at index ${sourceIndex}`)
    }
    if (seenWords.has(word.word)) throw new Error(`${bookId} contains duplicate word: ${word.word}`)

    seenWords.add(word.word)
    return { ...word, sourceIndex }
  })
}

function toJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

async function buildBook({ id, input, defaultSort }) {
  const sourcePath = path.join(projectDirectory, input)
  const outputDirectory = path.join(projectDirectory, 'public', 'data', 'word-books', id)
  const sourceWords = JSON.parse(await readFile(sourcePath, 'utf8'))
  const records = validateWords(sourceWords, id)
  const alphabetical = [...records].sort(compareAlphabetically)
  const frequency = [...records].sort(compareByFrequency)
  const orderedRecords = defaultSort === 'frequency' ? frequency : alphabetical
  const chunks = []
  const chunkIdByWord = new Map()

  for (let offset = 0; offset < orderedRecords.length; offset += CHUNK_SIZE) {
    const chunkId = `chunks/${String(chunks.length).padStart(2, '0')}.json`
    const words = orderedRecords.slice(offset, offset + CHUNK_SIZE).map(({ sourceIndex: _sourceIndex, ...word }) => word)

    chunks.push({ id: chunkId, words })
    for (const word of words) chunkIdByWord.set(word.word, chunkId)
  }

  const entries = orderedRecords.map((word) => ({
    word: word.word,
    meaning: word.meaning,
    partOfSpeech: word.partOfSpeech,
    frequency: normalizeFrequency(word.frequency),
    chunkId: chunkIdByWord.get(word.word),
  }))
  const orders = {
    alphabetical: alphabetical.map((word) => word.word),
    frequency: frequency.map((word) => word.word),
  }
  const initialIds = orders[defaultSort].slice(0, INITIAL_PAGE_SIZE)
  const manifest = {
    version: 1,
    total: records.length,
    defaultSort,
    initialPage: {
      ids: initialIds,
      chunkIds: initialIds.map((word) => chunkIdByWord.get(word)),
    },
    indexUrl: 'search-index.json',
    chunks: chunks.map((chunk) => chunk.id),
  }

  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(path.join(outputDirectory, 'chunks'), { recursive: true })
  await Promise.all([
    writeFile(path.join(outputDirectory, 'manifest.json'), toJson(manifest)),
    writeFile(path.join(outputDirectory, 'search-index.json'), toJson({ entries, orders })),
    ...chunks.map((chunk) => writeFile(path.join(outputDirectory, chunk.id), toJson(chunk.words))),
  ])
}

await Promise.all(BOOKS.map(buildBook))
