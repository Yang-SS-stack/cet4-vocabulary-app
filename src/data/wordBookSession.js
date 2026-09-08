import { matchesWordQuery } from './partOfSpeech'

const WORDS_PER_PAGE = 21
const wordOrder = new Intl.Collator('en', { sensitivity: 'base' })

function compareWords(first, second, sort) {
  if (sort === 'frequency') {
    const firstFrequency = Number.isFinite(first.frequency) && first.frequency >= 0 ? first.frequency : -1
    const secondFrequency = Number.isFinite(second.frequency) && second.frequency >= 0 ? second.frequency : -1
    if (firstFrequency !== secondFrequency) return secondFrequency - firstFrequency
  }
  return wordOrder.compare(first.word, second.word)
}

function pageResult(words, page) {
  const total = words.length
  const totalPages = Math.max(1, Math.ceil(total / WORDS_PER_PAGE))
  const start = (Math.max(1, page) - 1) * WORDS_PER_PAGE
  return { words: words.slice(start, start + WORDS_PER_PAGE), total, totalPages }
}

function resolveAssetUrl(manifestUrl, assetUrl) {
  if (assetUrl.startsWith('/')) return assetUrl
  return `${manifestUrl.slice(0, manifestUrl.lastIndexOf('/') + 1)}${assetUrl}`
}

async function fetchJson(url, fetchImpl, message, isExpected) {
  let response
  try {
    response = await fetchImpl(url)
  } catch {
    throw new Error(message)
  }
  if (!response?.ok) throw new Error(message)
  let value
  try {
    value = await response.json()
  } catch {
    throw new Error(message)
  }
  if (!isExpected(value)) throw new Error(message)
  return value
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string' && item.length > 0)
}

function validateManifest(value) {
  return value && typeof value === 'object'
    && Number.isInteger(value.total) && value.total >= 0
    && typeof value.defaultSort === 'string'
    && typeof value.indexUrl === 'string' && value.indexUrl.length > 0
    && isStringArray(value.chunks)
    && value.initialPage && isStringArray(value.initialPage.ids) && isStringArray(value.initialPage.chunkIds)
    && value.initialPage.ids.length === value.initialPage.chunkIds.length
    && value.initialPage.ids.length === Math.min(WORDS_PER_PAGE, value.total)
    && new Set(value.initialPage.ids).size === value.initialPage.ids.length
    && value.initialPage.chunkIds.every((chunkId) => value.chunks.includes(chunkId))
}

function validateIndex(index, manifest) {
  if (!index || typeof index !== 'object' || !Array.isArray(index.entries) || !index.orders || typeof index.orders !== 'object') return false
  if (index.entries.length !== manifest.total) return false
  const ids = index.entries.map((entry) => entry?.word)
  if (!isStringArray(ids) || new Set(ids).size !== ids.length) return false
  if (!index.entries.every((entry) => typeof entry.meaning === 'string' && typeof entry.partOfSpeech === 'string'
    && manifest.chunks.includes(entry.chunkId) && (entry.frequency === null || (typeof entry.frequency === 'number' && entry.frequency >= 0)))) return false
  return ['alphabetical', 'frequency'].every((sort) => isStringArray(index.orders[sort])
    && index.orders[sort].length === ids.length
    && new Set(index.orders[sort]).size === ids.length
    && index.orders[sort].every((id) => ids.includes(id)))
}

export function createInlineWordBookSession(words) {
  return {
    indexReady: Promise.resolve(),
    async loadPage({ sort, page, query }) {
      const filtered = query.trim() ? words.filter((word) => matchesWordQuery(word, query)) : words
      return pageResult([...filtered].sort((first, second) => compareWords(first, second, sort)), page)
    },
  }
}

export function createRemoteWordBookSession(manifest, manifestUrl, fetchImpl) {
  const chunkPromises = new Map()
  let indexPromise

  const getIndex = () => {
    if (!indexPromise) {
      indexPromise = fetchJson(
        resolveAssetUrl(manifestUrl, manifest.indexUrl),
        fetchImpl,
        'Unable to load word book search index',
        (value) => validateIndex(value, manifest),
      ).catch((error) => {
        indexPromise = undefined
        throw error
      })
    }
    return indexPromise
  }

  const getChunk = (chunkId) => {
    if (!chunkPromises.has(chunkId)) {
      const promise = fetchJson(
        resolveAssetUrl(manifestUrl, chunkId),
        fetchImpl,
        'Unable to load word book details',
        Array.isArray,
      ).catch((error) => {
        chunkPromises.delete(chunkId)
        throw error
      })
      chunkPromises.set(chunkId, promise)
    }
    return chunkPromises.get(chunkId)
  }

  const loadDetails = async (entries) => {
    const chunks = await Promise.all([...new Set(entries.map((entry) => entry.chunkId))].map(async (chunkId) => [chunkId, await getChunk(chunkId)]))
    const wordsByChunk = new Map(chunks.map(([chunkId, words]) => [chunkId, new Map(words.map((word) => [word.word, word]))]))
    return entries.map((entry) => {
      const word = wordsByChunk.get(entry.chunkId).get(entry.word)
      if (!word) throw new Error(`Word book details are missing ${entry.word}`)
      return word
    })
  }

  const indexReady = getIndex().then(() => undefined)

  return {
    indexReady,
    async loadPage({ sort, page, query }) {
      const normalizedQuery = query.trim()
      if (sort === manifest.defaultSort && page === 1 && !normalizedQuery) {
        const entries = manifest.initialPage.ids.map((word, index) => ({ word, chunkId: manifest.initialPage.chunkIds[index] }))
        return { words: await loadDetails(entries), total: manifest.total, totalPages: Math.max(1, Math.ceil(manifest.total / WORDS_PER_PAGE)) }
      }

      const index = await getIndex()
      const entriesById = new Map(index.entries.map((entry) => [entry.word, entry]))
      const matchingEntries = normalizedQuery
        ? index.entries.filter((entry) => matchesWordQuery(entry, normalizedQuery)).sort((first, second) => compareWords(first, second, sort))
        : index.orders[sort].map((id) => entriesById.get(id))
      const result = pageResult(matchingEntries, page)
      return { ...result, words: await loadDetails(result.words) }
    },
  }
}

export function isValidWordBookManifest(value) {
  return validateManifest(value)
}
