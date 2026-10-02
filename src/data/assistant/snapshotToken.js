import { buildLearningFacts } from './facts'
import { localDateKey, DEFAULT_SETTINGS } from '../learning/model'

export function canonicalStringify(value) {
  if (value === null) return 'null'
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(',')}]`
  if (typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Cannot form a safe learning summary')
  if (!['string', 'number', 'boolean'].includes(typeof value)) throw new Error('Cannot serialize learning summary')
  return JSON.stringify(value)
}

async function hash(value) {
  const bytes = new TextEncoder().encode(canonicalStringify(value))
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}
function read(store, context) {
  const { snapshot, raw } = store.readAssistantSnapshot()
  const { book, today, reviewLoad, history, ruleRecommendation } = buildLearningFacts(snapshot, context)
  return { raw, snapshot, facts: { localDate: localDateKey(context.now), timeZone: context.timeZone,
    selectedWordBookId: context.selectedWordBookId, book, today, reviewLoad, history, ruleRecommendation } }
}
function same(left, right) {
  return left.raw === right.raw && canonicalStringify(left.snapshot) === canonicalStringify(right.snapshot)
    && canonicalStringify(left.facts) === canonicalStringify(right.facts)
}

export async function buildFactsRequest(store, context) {
  const initial = read(store, context)
  const snapshotToken = await hash(initial.snapshot)
  const factsToken = await hash({ snapshotToken, ...initial.facts })
  if (!same(initial, read(store, context))) throw new Error('Learning facts changed; check again')
  const { localDate, timeZone, selectedWordBookId, ...facts } = initial.facts
  return { contractVersion: 1, requestId: globalThis.crypto.randomUUID(),
    basis: { localDate, generatedAt: context.now.toISOString(), timeZone, selectedWordBookId, snapshotToken, factsToken },
    settings: Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(key => [key, initial.snapshot.settings[key]])), ...facts }
}
export async function isFactsRequestCurrent(store, context, request) {
  try {
    if (request.contractVersion !== 1) return false
    const initial = read(store, context)
    const snapshotToken = await hash(initial.snapshot)
    const factsToken = await hash({ snapshotToken, ...initial.facts })
    return same(initial, read(store, context)) && request.basis.snapshotToken === snapshotToken && request.basis.factsToken === factsToken
  } catch { return false }
}
