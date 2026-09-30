export const LEARNING_STORAGE_KEY = 'linguajet.learning'
export const SCHEMA_VERSION = 6
export const EXTRA_LEARNING_BATCH_SIZE = 10
export const MISTAKE_ENTRY_THRESHOLD = 5
export const REVIEW_STAGE_DAYS = Object.freeze([1, 2, 4, 7, 15])
export const TASK_KINDS = Object.freeze(['learning', 'review', 'mistakes'])
export const DEFAULT_SETTINGS = Object.freeze({
  examDate: null,
  todayWordBookId: null,
  dailyNewWords: null,
  dailyReviewWords: null,
  dailyStudyMinutes: null,
  pronunciation: 'en-GB',
  mistakeStudyWords: null,
})

export function assert(condition, message = 'Invalid learning data') {
  if (!condition) throw new Error(message)
}

export function wordId(word) {
  assert(typeof word === 'string' && word.trim().length > 0, 'Invalid word')
  return word.normalize('NFKC').trim().toLowerCase()
}

export function wordBookWordId(wordBook, word) {
  assert(typeof wordBook === 'string' && wordBook.trim().length > 0, 'Invalid word book')
  return JSON.stringify([wordBook.trim(), wordId(word)])
}

export function localDateKey(date) {
  assert(date instanceof Date && Number.isFinite(date.getTime()), 'Invalid clock')
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function localDayStartIso(date, daysAhead = 0) {
  assert(date instanceof Date && Number.isFinite(date.getTime()), 'Invalid clock')
  assert(Number.isSafeInteger(daysAhead), 'Invalid day offset')
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + daysAhead, 0, 0, 0, 0).toISOString()
}

const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const string = (value) => typeof value === 'string' && value.trim().length > 0
const integer = (value) => Number.isSafeInteger(value) && value >= 0
const boolean = (value) => typeof value === 'boolean'
const nullable = (check) => (value) => value === null || check(value)
const timestamp = (value) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString() === value
const dateKey = (value) => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))
  && new Date(`${value}T00:00:00.000Z`).toISOString().slice(0, 10) === value
const feedback = (value) => ['known', 'fuzzy', 'unknown'].includes(value)
const method = (value) => value === null || shape(value, {
  id: (id) => ['self-assessment', 'guided-recall', 'review-guided-recall'].includes(id), rulesVersion: (v) => v === 1,
})
const choice = (value) => value === null || shape(value, {
  options: (options) => Array.isArray(options) && options.length === 4
    && options.every((option) => shape(option, { word: string, meaning: string }) && option.word === wordId(option.word))
    && new Set(options.map((option) => option.word)).size === 4
    && new Set(options.map((option) => option.meaning)).size === 4,
  selectedWord: nullable(string), revealed: boolean,
}) && (value.selectedWord === null || value.options.some((option) => option.word === value.selectedWord))
const feedbackEvent = (event, task, version) => {
  if (event?.source === 'self-assessment') return shape(event, {
    source: (v) => v === 'self-assessment', rulesVersion: (v) => v === 1,
    itemId: (id) => task.itemIds.includes(id), feedback, at: timestamp, revision: integer,
  })
  if (version >= 5 && (event?.source === 'feedback-correction'
    || version >= 6 && task.kind === 'review' && event?.source === 'review-feedback-correction')) return shape(event, {
    source: (v) => v === event.source, rulesVersion: (v) => v === 1,
    itemId: (id) => task.itemIds.includes(id), correctedRevision: integer, at: timestamp, revision: integer,
  })
  return version >= 3 && shape(event, {
    source: (v) => v === 'guided-choice', rulesVersion: (v) => v === 1,
    itemId: (id) => task.itemIds.includes(id), selectedWord: nullable(string),
    outcome: (v) => ['correct', 'incorrect', 'show-answer'].includes(v), at: timestamp, revision: integer,
  }) && ((event.outcome === 'show-answer') === (event.selectedWord === null))
    && (event.outcome === 'show-answer' || (event.outcome === 'correct') ===
      (event.selectedWord === task.items[event.itemId]?.wordId))
}

function shape(value, fields) {
  return record(value) && Object.keys(value).length === Object.keys(fields).length
    && Object.entries(fields).every(([key, check]) => Object.hasOwn(value, key) && check(value[key]))
}

// New review tasks have complete event history; legacy task histories remain untouched.
function validateReviewHistory(task) {
  let priorRevision = -1
  for (const event of task.feedbackEvents) {
    assert(event.revision > priorRevision, 'Invalid review event order')
    priorRevision = event.revision
  }
  for (const id of task.itemIds) {
    const item = task.items[id]
    let knownCount = item.initialKnownCount, fuzzyCount = 0, unknownCount = 0, lastFeedback = null
    let completedAt = null, settlementRevision = null
    for (const event of task.feedbackEvents.filter(e => e.itemId === id)) {
      assert(knownCount < 4 || event.source === 'review-feedback-correction', 'Invalid completed review feedback')
      if (event.source === 'self-assessment') {
        assert(knownCount >= 1, 'Invalid review round')
        lastFeedback = event.feedback
        if (event.feedback === 'known') knownCount += 1
        if (event.feedback === 'fuzzy') { fuzzyCount += 1; knownCount = Math.max(0, knownCount - 1) }
        if (event.feedback === 'unknown') { unknownCount += 1; knownCount = 0 }
        if (knownCount === 4) { completedAt = event.at; settlementRevision = event.revision }
      } else if (event.source === 'guided-choice') {
        assert(knownCount === 0, 'Invalid review choice round')
        if (event.outcome === 'correct') { knownCount = 1; lastFeedback = 'known' }
      } else {
        assert(event.source === 'review-feedback-correction', 'Invalid review feedback source')
        knownCount = Math.max(0, knownCount - 1); fuzzyCount += 1; lastFeedback = 'fuzzy'
        completedAt = null; settlementRevision = null
      }
    }
    assert(item.knownCount === knownCount && item.fuzzyCount === fuzzyCount && item.unknownCount === unknownCount
      && item.lastFeedback === lastFeedback && item.completedAt === completedAt
      && (item.settlement?.revision ?? null) === settlementRevision, 'Invalid review progress history')
  }
  assert(task.currentItemId !== null || task.itemIds.every(id => task.items[id].completed), 'Invalid unfinished review session')
  if (task.view === 'question' && task.currentItemId !== null) assert(!task.items[task.currentItemId].completed, 'Invalid completed review turn')
}

const settingsFields = {
  examDate: nullable(dateKey), todayWordBookId: nullable(string), dailyNewWords: nullable(integer),
  dailyReviewWords: nullable(integer), dailyStudyMinutes: nullable(integer),
  pronunciation: (value) => ['en-GB', 'en-US'].includes(value), mistakeStudyWords: nullable(integer),
}
const settingsValid = (value) => shape(value, settingsFields)
const reviewFields = {
  enteredAt: timestamp, lastReviewedAt: nullable(timestamp), nextReviewAt: nullable(timestamp),
  stage: (value) => integer(value) && value <= REVIEW_STAGE_DAYS.length,
  completedReviewCount: integer, mastered: boolean, paused: boolean,
}
const completionValid = (value) => shape(value, {
  date: dateKey, kind: (v) => ['learning', 'extra-learning'].includes(v), taskId: string, revision: integer,
})
const reviewValid = (value, version = SCHEMA_VERSION) => shape(value, {
  ...reviewFields,
  ...(version >= 6 && Object.hasOwn(value ?? {}, 'provenance') ? { provenance: (v) => shape(v, {
    source: (s) => ['learning', 'extra-learning', 'historical'].includes(s),
    completion: (c) => (v.source === 'historical' && c === null) || completionValid(c),
  }) } : {}),
})
const learningValid = (value) => shape(value, {
  completed: boolean, completedAt: nullable(timestamp),
}) && value.completed === (value.completedAt !== null)
const wordBookWordValid = (value, version) => shape(value, {
  id: string, wordBookId: string, wordId: string, learning: learningValid, review: nullable(v => reviewValid(v, version)),
}) && value.id === wordBookWordId(value.wordBookId, value.wordId)
const wordValid = (value) => shape(value, {
  id: string, unknownCount: integer, unknownCountSinceRemoval: integer, lastErrorAt: nullable(timestamp),
  entered: boolean, removed: boolean, enteredAt: nullable(timestamp), removedAt: nullable(timestamp),
}) && value.id === wordId(value.id) && value.unknownCountSinceRemoval <= value.unknownCount
  && (value.unknownCount > 0) === (value.lastErrorAt !== null)
  && value.entered === (value.enteredAt !== null) && value.removed === (value.removedAt !== null)
  && (!value.removed || value.entered)

const taskItemValid = (value, review = false) => shape(value, {
  id: string, wordBookId: nullable(string), wordId: string,
  knownCount: (count) => integer(count) && count <= (review ? 4 : 3),
  fuzzyCount: integer, unknownCount: integer, lastFeedback: nullable(feedback),
  completed: boolean, completedAt: nullable(timestamp), removed: boolean, removedAt: nullable(timestamp),
  ...(review ? {
    initialKnownCount: (v) => v === 0 || v === 2,
    settlement: (v) => v === null || shape(v, { previousReview: reviewValid, revision: integer }),
  } : {}),
}) && value.completed === (value.knownCount === (review ? 4 : 3)) && value.completed === (value.completedAt !== null)
  && value.removed === (value.removedAt !== null) && (!value.removed || value.completed)
  && (review ? (value.lastFeedback !== null || value.knownCount === value.initialKnownCount
    && value.fuzzyCount === 0 && value.unknownCount === 0)
    && value.completed === (value.settlement !== null)
    : ((value.knownCount + value.fuzzyCount + value.unknownCount > 0) === (value.lastFeedback !== null)))
  && value.id === (value.wordBookId === null ? wordId(value.wordId) : wordBookWordId(value.wordBookId, value.wordId))

export function validatePatch(patch, allowedKeys) {
  assert(record(patch) && Object.keys(patch).every((key) => allowedKeys.includes(key)), 'Invalid update fields')
}

export function validateDateKey(value) {
  assert(dateKey(value), 'Invalid date')
}

export function validateState(state, version = SCHEMA_VERSION) {
  assert(shape(state, {
    version: (value) => value === version, settings: settingsValid,
    mistakes: record, wordBooks: record, days: record,
    ...(version >= 4 ? { extraLearning: record } : {}),
  }), 'Invalid or unsupported learning snapshot')
  for (const [id, word] of Object.entries(state.mistakes)) {
    assert(wordValid(word) && word.id === id, 'Invalid word record')
  }
  for (const [wordBookId, wordBook] of Object.entries(state.wordBooks)) {
    assert(shape(wordBook, { id: (value) => value === wordBookId, words: record }), 'Invalid word book record')
    for (const [id, word] of Object.entries(wordBook.words)) {
      assert(wordBookWordValid(word, version) && word.wordId === id && word.wordBookId === wordBookId, 'Invalid word book word')
    }
  }
  const entries = []
  for (const [day, tasks] of Object.entries(state.days)) {
    assert(dateKey(day) && record(tasks), 'Invalid day record')
    for (const [kind, task] of Object.entries(tasks)) {
      assert(TASK_KINDS.includes(kind), 'Invalid task kind')
      entries.push({ day, kind, task })
    }
  }
  if (version >= 4) for (const [day, process] of Object.entries(state.extraLearning)) {
    const daily = state.days[day]?.learning
    assert(dateKey(day) && shape(process, { batches: Array.isArray, exhausted: boolean })
      && (process.batches.length > 0 || process.exhausted)
      && daily?.currentItemId === null && daily.itemIds.every(id => daily.items[id].completed), 'Invalid extra learning process')
    const seen = new Set()
    process.batches.forEach((task, index) => {
      assert(task.taskId === `${day}:extra:${index + 1}` && task.itemIds.length > 0
        && task.itemIds.length <= EXTRA_LEARNING_BATCH_SIZE
        && task.wordBookId === daily.wordBookId
        && JSON.stringify(task.settings) === JSON.stringify(daily.settings)
        && JSON.stringify(task.method) === JSON.stringify(daily.method), 'Invalid extra learning batch')
      assert(task.itemIds.every(id => !seen.has(id)), 'Duplicate extra learning word')
      task.itemIds.forEach(id => seen.add(id))
      if (index < process.batches.length - 1 || process.exhausted) {
        assert(task.currentItemId === null && task.itemIds.every(id => task.items[id].completed), 'Unfinished extra learning batch')
      }
      entries.push({ day, kind: 'extra-learning', task })
    })
  }
  for (const { day, kind, task } of entries) {
      const review = version >= 6 && kind === 'review' && task.method?.id === 'review-guided-recall'
      assert(shape(task, {
        date: (value) => value === day, kind: (value) => value === kind,
        ...(kind === 'extra-learning' ? { taskId: string } : {}),
        wordBookId: nullable(string), createdAt: timestamp, settings: settingsValid,
        itemIds: (value) => Array.isArray(value) && value.every(string), items: record,
        currentItemId: nullable(string), previousItemId: nullable(string),
        view: (value) => ['question', 'feedback'].includes(value),
        ...(version >= 2 ? {
          method: (value) => version === 2
            ? value === null || shape(value, { id: (id) => id === 'self-assessment', rulesVersion: (v) => v === 1 })
            : method(value),
          sessionRevision: integer,
          feedbackEvents: (events) => Array.isArray(events) && events.every((event) => feedbackEvent(event, task, version)),
        } : {}),
        ...(version >= 3 ? { choice } : {}),
      }), 'Invalid task')
      if (version >= 3) {
        assert(['learning', 'extra-learning'].includes(task.kind)
          ? task.method === null || ['self-assessment', 'guided-recall'].includes(task.method?.id)
          : review || (task.choice === null && task.method === null), 'Invalid task choice')
        assert(task.feedbackEvents.every((event) => event.revision < task.sessionRevision
          && (event.source === 'self-assessment' || event.source === 'feedback-correction'
            || event.source === 'review-feedback-correction' || task.method?.id === 'guided-recall' || review)),
        'Invalid task feedback event')
        if (version >= 5) task.feedbackEvents.forEach((event, index) => {
          if (!['feedback-correction', 'review-feedback-correction'].includes(event.source)) return
          const original = task.feedbackEvents[index - 1]
          assert(original?.itemId === event.itemId && original.revision === event.correctedRevision
            && original.revision < event.revision
            && (original.source === 'self-assessment' && original.feedback === 'known'
              || original.source === 'guided-choice' && original.outcome === 'correct'),
          'Invalid feedback correction')
        })
        if (task.choice !== null) {
          const current = task.items[task.currentItemId]
          assert((task.method?.id === 'guided-recall' || review) && task.currentItemId !== null
            && current.knownCount <= 1
            && task.choice.options.some((option) => option.word === current.wordId), 'Invalid task choice')
          if (task.view === 'question') assert(task.choice.selectedWord === null && !task.choice.revealed, 'Invalid task choice')
          if (task.view === 'feedback') {
            const expectedOutcome = task.choice.selectedWord === null ? 'show-answer'
              : task.choice.selectedWord === current.wordId ? 'correct' : 'incorrect'
            const last = task.feedbackEvents.at(-1)
            const corrected = ['feedback-correction', 'review-feedback-correction'].includes(last?.source)
            const event = corrected ? task.feedbackEvents.at(-2) : last
            assert((task.choice.selectedWord !== null || task.choice.revealed)
              && current.knownCount === (expectedOutcome === 'correct' && !corrected ? 1 : 0)
              && (!corrected || (task.choice.revealed && last.itemId === current.id
                && last.correctedRevision === event?.revision && expectedOutcome === 'correct'))
              && event?.source === 'guided-choice' && event.itemId === current.id
              && event.selectedWord === task.choice.selectedWord && event.outcome === expectedOutcome,
            'Invalid task choice feedback')
          }
        }
      }
      assert(new Set(task.itemIds).size === task.itemIds.length
        && Object.keys(task.items).length === task.itemIds.length
        && (task.currentItemId === null || task.itemIds.includes(task.currentItemId))
        && (task.previousItemId === null || task.itemIds.includes(task.previousItemId)), 'Invalid task order')
      for (const id of task.itemIds) {
        const item = task.items[id]
        assert(Object.hasOwn(task.items, id) && taskItemValid(item, review), 'Invalid task progress')
        assert(Object.hasOwn(state.mistakes, item.wordId), 'Invalid task word reference')
        if (item.wordBookId === null) {
          assert(kind === 'mistakes', 'Invalid task word reference')
        } else {
          assert(kind !== 'mistakes'
            && Object.hasOwn(state.wordBooks, item.wordBookId)
            && Object.hasOwn(state.wordBooks[item.wordBookId].words, item.wordId), 'Invalid task word reference')
        }
        if (['learning', 'extra-learning'].includes(kind) || review) assert(item.wordBookId === task.wordBookId, 'Invalid task word reference')
        if (review) {
          assert(state.wordBooks[item.wordBookId].words[item.wordId].review !== null, 'Invalid review word reference')
          if (item.settlement) assert(item.settlement.revision < task.sessionRevision, 'Invalid review settlement')
        }
      }
      if (review) validateReviewHistory(task)
  }
  return state
}

export function createState() {
  return { version: SCHEMA_VERSION, settings: { ...DEFAULT_SETTINGS }, mistakes: {}, wordBooks: {}, days: {}, extraLearning: {} }
}

export function createWordBookWord(wordBookId, id) {
  return {
    id: wordBookWordId(wordBookId, id), wordBookId, wordId: id,
    learning: { completed: false, completedAt: null }, review: null,
  }
}

export function createMistakeRecord(id) {
  return {
    id, unknownCount: 0, unknownCountSinceRemoval: 0, lastErrorAt: null,
    entered: false, removed: false, enteredAt: null, removedAt: null,
  }
}

export function createProgress({ id, wordBookId, wordId: idInBook }) {
  return {
    id, wordBookId, wordId: idInBook, knownCount: 0, fuzzyCount: 0, unknownCount: 0,
    lastFeedback: null, completed: false, completedAt: null, removed: false, removedAt: null,
  }
}

export function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

// Validate the entire v1 snapshot before adding fields; never fabricate lost events.
export function migrateState(state) {
  if (state?.version === SCHEMA_VERSION) return validateState(state)
  assert([1, 2, 3, 4, 5].includes(state?.version), 'Invalid or unsupported learning snapshot')
  validateState(state, state.version)
  const next = JSON.parse(JSON.stringify(state))
  if (next.version === 1) {
    next.version = 2
    for (const tasks of Object.values(next.days)) for (const task of Object.values(tasks)) {
      task.method = task.kind === 'learning' ? { id: 'self-assessment', rulesVersion: 1 } : null
      task.sessionRevision = 0
      task.feedbackEvents = []
      if (task.kind === 'learning') {
        if (task.currentItemId === null) {
          task.currentItemId = task.itemIds.find(id => !task.items[id].completed && !task.items[id].removed) ?? null
          task.view = 'question'
        } else if (task.items[task.currentItemId].completed) {
          task.view = 'feedback'
        }
      }
    }
    validateState(next, 2)
  }
  if (next.version === 2) {
    next.version = 3
    for (const tasks of Object.values(next.days)) for (const task of Object.values(tasks)) task.choice = null
    validateState(next, 3)
  }
  if (next.version === 3) {
    next.version = 4
    next.extraLearning = {}
    validateState(next, 4)
  }
  next.version = SCHEMA_VERSION
  return validateState(next)
}
