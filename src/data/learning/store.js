import { SELF_ASSESSMENT, GUIDED_RECALL, nextLearningItem, requireLearningTurn, applySelfAssessment, canCorrectLearningFeedback } from './selfAssessment'
import { REVIEW_GUIDED_RECALL, isReviewSession, requireReviewTurn, createReviewProgress, nextReviewItem,
  applyReviewFeedback, canCorrectReviewFeedback } from './reviewSession'
import { addCompletedLearningReview, withdrawLearningReview, projectedMissingReviews, dueReviewWords } from './reviewLibrary'
import {
  assert, createMistakeRecord, createProgress, createState, createWordBookWord, DEFAULT_SETTINGS, freeze,
  LEARNING_STORAGE_KEY, localDateKey, localDayStartIso, TASK_KINDS, validateDateKey, validatePatch, validateState,
  wordBookWordId, wordId, migrateState, EXTRA_LEARNING_BATCH_SIZE,
} from './model'

const own = (object, key) => Object.hasOwn(object, key) ? object[key] : null

/** Creates a synchronous external store. Call once at the future learning app boundary.
 * Storage errors propagate; failed writes never publish a new snapshot.
 * getSnapshot/subscribe can be passed directly to React.useSyncExternalStore.
 */
export function createLearningStore({ storage = globalThis.localStorage, now = () => new Date() } = {}) {
  assert(storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function', 'Local storage unavailable')
  let saved = storage.getItem(LEARNING_STORAGE_KEY)
  let state = freeze(saved === null ? createState() : migrateState(JSON.parse(saved)))
  const listeners = new Set()
  const today = () => localDateKey(now())
  const timestamp = () => {
    const date = now()
    localDateKey(date)
    return date.toISOString()
  }

  function change(update) {
    // Detect intervening writes from another store/tab rather than overwrite progress.
    assert(storage.getItem(LEARNING_STORAGE_KEY) === saved, 'Learning data changed elsewhere; reopen the store')
    const next = JSON.parse(JSON.stringify(state))
    update(next)
    validateState(next)
    const encoded = JSON.stringify(next)
    storage.setItem(LEARNING_STORAGE_KEY, encoded)
    saved = encoded
    state = freeze(next)
    // A faulty subscriber must not prevent other subscribers observing a saved update.
    for (const listener of [...listeners]) {
      try { listener() } catch (error) { globalThis.reportError?.(error) }
    }
  }

  function ensureWord(next, id) {
    if (!Object.hasOwn(next.mistakes, id)) {
      Object.defineProperty(next.mistakes, id, {
        value: createMistakeRecord(id), enumerable: true, writable: true, configurable: true,
      })
    }
    return next.mistakes[id]
  }

  function ensureWordBookWord(next, wordBookId, id) {
    assert(typeof wordBookId === 'string' && wordBookId.trim().length > 0, 'Invalid word book')
    const bookId = wordBookId.trim()
    if (!Object.hasOwn(next.wordBooks, bookId)) next.wordBooks[bookId] = { id: bookId, words: {} }
    if (!Object.hasOwn(next.wordBooks[bookId].words, id)) {
      Object.defineProperty(next.wordBooks[bookId].words, id, {
        value: createWordBookWord(bookId, id), enumerable: true, writable: true, configurable: true,
      })
    }
    return next.wordBooks[bookId].words[id]
  }

  function taskAt(snapshot, kind, date) {
    assert(TASK_KINDS.includes(kind), 'Invalid task kind')
    validateDateKey(date)
    return own(own(snapshot.days, date) ?? {}, kind)
  }

  function requireTask(next, kind, date) {
    const task = taskAt(next, kind, date)
    assert(task, 'Create today\'s task before recording progress')
    return task
  }

  function extraProcessAt(snapshot, date) {
    validateDateKey(date)
    return own(snapshot.extraLearning, date)
  }

  function learningTask(snapshot, token, date) {
    assert(token?.date === date, 'Learning date changed; start today again')
    assert(token?.kind === undefined || ['learning', 'extra-learning'].includes(token.kind), 'Invalid learning task')
    if (token?.kind !== 'extra-learning') return requireTask(snapshot, 'learning', date)
    const task = extraProcessAt(snapshot, date)?.batches.at(-1)
    assert(task && task.taskId === token.taskId, 'Learning turn changed; reload progress')
    return task
  }

  function normalizeTaskItem(kind, entry, defaultWordBookId) {
    const value = typeof entry === 'string' ? { word: entry } : entry
    assert(value && typeof value === 'object' && typeof value.word === 'string', 'Invalid task word')
    const idInBook = wordId(value.word)
    if (kind === 'mistakes') return { id: idInBook, wordBookId: null, wordId: idInBook }
    const bookId = value.wordBookId ?? defaultWordBookId
    assert(typeof bookId === 'string' && bookId.trim().length > 0, 'Task word book is required')
    return { id: wordBookWordId(bookId, idInBook), wordBookId: bookId.trim(), wordId: idInBook }
  }

  const api = {
    ensureTodayReview(expectedDate = today(), expectedSettings = state.settings) {
      const date = today()
      assert(expectedDate === date, 'Review date changed; start today again')
      const existing = taskAt(state, 'review', date)
      const bookId = existing?.wordBookId ?? state.settings.todayWordBookId, count = state.settings.dailyReviewWords
      if (!existing) {
        assert(JSON.stringify(expectedSettings) === JSON.stringify(state.settings), 'Review settings changed; start today again')
        assert(typeof bookId === 'string' && bookId.trim() && Number.isSafeInteger(count) && count >= 1 && count <= 100,
          'Set review settings before starting')
      }
      const missing = projectedMissingReviews(state, bookId, date)
      if (existing && !missing.length) {
        assert(storage.getItem(LEARNING_STORAGE_KEY) === saved, 'Learning data changed elsewhere; reopen the store')
        return existing
      }
      const candidates = dueReviewWords(state, bookId, timestamp(), date, missing).slice(0, count)
      const createdAt = timestamp()
      change(next => {
        assert(today() === date, 'Review date changed; start today again')
        missing.forEach(word => { next.wordBooks[bookId].words[word.wordId].review = word.review })
        if (existing) return
        next.days[date] ??= {}
        const items = candidates.map(word => {
          const previous = Object.entries(next.days).filter(([day, tasks]) => day < date && tasks.review?.items[word.id])
            .sort(([a], [b]) => b.localeCompare(a))[0]?.[1].review.items[word.id]
          const abandoned = previous && !previous.completed
          ensureWord(next, word.wordId)
          return createReviewProgress(word, abandoned ? 0 : 2)
        })
        next.days[date].review = {
          date, kind: 'review', wordBookId: bookId, createdAt, settings: { ...next.settings },
          itemIds: items.map(item => item.id), items: Object.fromEntries(items.map(item => [item.id, item])),
          currentItemId: items[0]?.id ?? null, previousItemId: null, view: 'question',
          method: { ...REVIEW_GUIDED_RECALL }, sessionRevision: 0, feedbackEvents: [], choice: null,
        }
      })
      return taskAt(state, 'review', date)
    },
    getReviewOverview({ wordBookId, at = timestamp() } = {}) {
      assert(typeof at === 'string' && Number.isFinite(Date.parse(at)), 'Invalid review cutoff')
      const date = localDateKey(new Date(at)), task = taskAt(state, 'review', date)
      const bookId = task?.wordBookId ?? wordBookId ?? state.settings.todayWordBookId
      const missing = projectedMissingReviews(state, bookId, date)
      const due = dueReviewWords(state, bookId, at, date, missing)
      const pending = task ? task.itemIds.filter(id => !task.items[id].completed && !task.items[id].removed) : []
      return { bookId, dueCount: due.length, pendingCount: pending.length, taskCount: task?.itemIds.length ?? 0,
        completedCount: task ? task.itemIds.filter(id => task.items[id].completed).length : 0,
        unassignedCount: due.filter(word => !pending.includes(word.id)).length, needsReconciliation: missing.length > 0 }
    },
    submitReviewFeedback(token, feedback) {
      const date = today(), at = timestamp()
      change(next => {
        const task = taskAt(next, 'review', date)
        const progress = requireReviewTurn(task, token, today(), 'question')
        applyReviewFeedback(next, task, progress, feedback, at)
      })
    },
    prepareReviewChoice(token, options) {
      const date = today(), task = taskAt(state, 'review', date)
      const progress = requireReviewTurn(task, token, date, 'question')
      assert(progress.knownCount === 0 && !progress.completed, 'Choice is only for the first review round')
      if (task.choice !== null) {
        assert(storage.getItem(LEARNING_STORAGE_KEY) === saved, 'Learning data changed elsewhere; reopen the store')
        return task
      }
      assert(Array.isArray(options) && options.length === 4, 'Four meaning choices are required')
      const normalized = options.map(option => {
        assert(option && typeof option.word === 'string' && typeof option.meaning === 'string' && option.meaning.trim(), 'Invalid meaning choice')
        return { word: wordId(option.word), meaning: option.meaning.trim() }
      })
      assert(new Set(normalized.map(o => o.word)).size === 4 && new Set(normalized.map(o => o.meaning)).size === 4
        && normalized.some(o => o.word === progress.wordId), 'Invalid meaning choices')
      change(next => {
        const current = taskAt(next, 'review', date)
        requireReviewTurn(current, token, today(), 'question')
        current.choice = { options: normalized, selectedWord: null, revealed: false }; current.sessionRevision += 1
      })
      return taskAt(state, 'review', date)
    },
    submitReviewChoice(token, selectedWord) {
      const date = today(), at = timestamp()
      change(next => {
        const task = taskAt(next, 'review', date)
        const progress = requireReviewTurn(task, token, today(), 'question')
        assert(progress.knownCount === 0 && task.choice !== null, 'Prepare choices before answering')
        const selected = selectedWord === null ? null : wordId(selectedWord)
        assert(selected === null || task.choice.options.some(o => o.word === selected), 'Choice is not in this question')
        const outcome = selected === null ? 'show-answer' : selected === progress.wordId ? 'correct' : 'incorrect'
        if (outcome === 'correct') { progress.knownCount = 1; progress.lastFeedback = 'known' }
        task.choice.selectedWord = selected; task.choice.revealed = selected === null
        task.feedbackEvents.push({ source: 'guided-choice', rulesVersion: 1, itemId: progress.id,
          selectedWord: selected, outcome, at, revision: task.sessionRevision })
        task.view = 'feedback'; task.sessionRevision += 1
      })
    },
    revealReviewDetails(token) {
      const date = today()
      change(next => {
        const task = taskAt(next, 'review', date)
        requireReviewTurn(task, token, today(), 'feedback')
        assert(task.choice !== null && !task.choice.revealed && task.choice.selectedWord !== null, 'No unrevealed choice feedback')
        task.choice.revealed = true; task.sessionRevision += 1
      })
    },
    correctReviewFeedback(token) {
      const date = today(), at = timestamp()
      change(next => {
        const task = taskAt(next, 'review', date)
        const progress = requireReviewTurn(task, token, today(), 'feedback')
        assert(canCorrectReviewFeedback(task), 'No correctable positive feedback in this detail')
        const original = task.feedbackEvents.at(-1)
        if (progress.completed) {
          next.wordBooks[progress.wordBookId].words[progress.wordId].review = progress.settlement.previousReview
          progress.completed = false; progress.completedAt = null; progress.settlement = null
        }
        progress.knownCount = Math.max(0, progress.knownCount - 1); progress.fuzzyCount += 1; progress.lastFeedback = 'fuzzy'
        task.feedbackEvents.push({ source: 'review-feedback-correction', rulesVersion: 1, itemId: progress.id,
          correctedRevision: original.revision, at, revision: task.sessionRevision })
        task.sessionRevision += 1
      })
    },
    advanceReview(token) {
      const date = today()
      change(next => {
        const task = taskAt(next, 'review', date)
        requireReviewTurn(task, token, today(), 'feedback')
        assert(task.choice === null || task.choice.revealed, 'Reveal review details before advancing')
        task.previousItemId = task.currentItemId; task.currentItemId = nextReviewItem(task)
        task.view = 'question'; task.choice = null; task.sessionRevision += 1
      })
    },
    getToday: today,
    reload() {
      const raw = storage.getItem(LEARNING_STORAGE_KEY)
      const loaded = freeze(raw === null ? createState() : migrateState(JSON.parse(raw)))
      saved = raw
      state = loaded
      for (const listener of [...listeners]) listener()
    },
    ensureTodayLearning(wordBookId, orderedWords, expectedDate = today(), expectedSettings = state.settings, method = SELF_ASSESSMENT) {
      assert(expectedDate === today(), 'Learning date changed; start today again')
      const existing = taskAt(state, 'learning', today())
      if (existing) return existing
      assert(JSON.stringify(expectedSettings) === JSON.stringify(state.settings), 'Learning settings changed; start today again')
      assert(wordBookId === state.settings.todayWordBookId, 'Learning settings changed; start today again')
      const count = state.settings.dailyNewWords
      assert(Number.isSafeInteger(count) && count >= 1 && count <= 100, 'Set daily new words first')
      assert(Array.isArray(orderedWords), 'Invalid task candidates')
      const candidates = [...new Set(orderedWords.map(wordId))]
        .filter((word) => !api.getWord(wordBookId, word)?.learning.completed).slice(0, count)
      return api.ensureTask('learning', candidates, wordBookId, method)
    },
    getExtraLearningProcess(date = today()) { return extraProcessAt(state, date) },
    getExtraLearning(date = today()) { return extraProcessAt(state, date)?.batches.at(-1) ?? null },
    ensureExtraLearning(orderedWords, expectedDate = today()) {
      const date = today()
      assert(expectedDate === date, 'Learning date changed; start today again')
      const daily = taskAt(state, 'learning', date)
      assert(daily?.currentItemId === null && daily.itemIds.every(id => daily.items[id].completed), 'Finish the daily task before extra learning')
      const process = extraProcessAt(state, date)
      if (process?.exhausted) return null
      const current = process?.batches.at(-1)
      if (current && current.currentItemId !== null) return current
      assert(Array.isArray(orderedWords), 'Invalid task candidates')
      const candidates = [...new Set(orderedWords.map(wordId))]
        .filter(word => !api.getWord(daily.wordBookId, word)?.learning.completed).slice(0, EXTRA_LEARNING_BATCH_SIZE)
      const items = candidates.map(word => normalizeTaskItem('learning', word, daily.wordBookId))
      const createdAt = timestamp()
      change(next => {
        assert(today() === date, 'Learning date changed; start today again')
        next.extraLearning[date] ??= { batches: [], exhausted: false }
        const history = next.extraLearning[date]
        if (items.length === 0) { history.exhausted = true; return }
        items.forEach(item => { ensureWord(next, item.wordId); ensureWordBookWord(next, item.wordBookId, item.wordId) })
        history.batches.push({
          date, kind: 'extra-learning', taskId: `${date}:extra:${history.batches.length + 1}`,
          wordBookId: daily.wordBookId, createdAt, settings: { ...daily.settings },
          itemIds: items.map(item => item.id), items: Object.fromEntries(items.map(item => [item.id, createProgress(item)])),
          currentItemId: items[0].id, previousItemId: null, view: 'question',
          method: { ...daily.method }, sessionRevision: 0, feedbackEvents: [], choice: null,
        })
      })
      return candidates.length ? api.getExtraLearning(date) : null
    },
    prepareLearningChoice(token, options) {
      const date = today()
      const task = learningTask(state, token, date)
      const progress = requireLearningTurn(task, token, date, 'question', [GUIDED_RECALL.id])
      assert(progress.knownCount === 0 && !progress.completed && !progress.removed, 'Choice is only for the first encounter')
      if (task.choice !== null) return task
      assert(Array.isArray(options) && options.length === 4, 'Four meaning choices are required')
      const normalized = options.map((option) => {
        assert(option && typeof option === 'object' && typeof option.word === 'string'
          && typeof option.meaning === 'string' && option.meaning.trim(), 'Invalid meaning choice')
        return { word: wordId(option.word), meaning: option.meaning.trim() }
      })
      assert(new Set(normalized.map((option) => option.word)).size === 4
        && new Set(normalized.map((option) => option.meaning)).size === 4
        && normalized.some((option) => option.word === progress.wordId), 'Invalid meaning choices')
      change((next) => {
        const nextTask = learningTask(next, token, date)
        requireLearningTurn(nextTask, token, today(), 'question', [GUIDED_RECALL.id])
        nextTask.choice = { options: normalized, selectedWord: null, revealed: false }
        nextTask.sessionRevision += 1
      })
      return learningTask(state, token, date)
    },
    submitLearningChoice(token, selectedWord) {
      const date = today()
      const at = timestamp()
      change((next) => {
        const task = learningTask(next, token, date)
        const progress = requireLearningTurn(task, token, today(), 'question', [GUIDED_RECALL.id])
        assert(progress.knownCount === 0 && !progress.completed && task.choice !== null, 'Prepare choices before answering')
        const selected = selectedWord === null ? null : wordId(selectedWord)
        assert(selected === null || task.choice.options.some((option) => option.word === selected), 'Choice is not in this question')
        const outcome = selected === null ? 'show-answer' : selected === progress.wordId ? 'correct' : 'incorrect'
        if (outcome === 'correct') {
          progress.knownCount = 1
          progress.lastFeedback = 'known'
        }
        task.choice.selectedWord = selected
        task.choice.revealed = selected === null
        task.feedbackEvents.push({ source: 'guided-choice', rulesVersion: 1,
          itemId: progress.id, selectedWord: selected, outcome, at, revision: task.sessionRevision })
        task.view = 'feedback'
        task.sessionRevision += 1
      })
    },
    revealLearningDetails(token) {
      const date = today()
      change((next) => {
        const task = learningTask(next, token, date)
        requireLearningTurn(task, token, today(), 'feedback', [GUIDED_RECALL.id])
        assert(task.choice !== null && !task.choice.revealed && task.choice.selectedWord !== null,
          'No unrevealed choice feedback')
        task.choice.revealed = true
        task.sessionRevision += 1
      })
    },
    submitSelfAssessment(token, feedback) {
      const date = today()
      const at = timestamp()
      change((next) => {
        const task = learningTask(next, token, date)
        const progress = requireLearningTurn(task, token, today(), 'question')
        applySelfAssessment(next, task, progress, feedback, at)
        if (progress.completed) addCompletedLearningReview(next, task, progress, at, task.feedbackEvents.at(-1).revision)
      })
    },
    correctLearningFeedback(token) {
      const date = today()
      const at = timestamp()
      change((next) => {
        const task = learningTask(next, token, date)
        const progress = requireLearningTurn(task, token, today(), 'feedback')
        assert(canCorrectLearningFeedback(task), 'No correctable positive feedback in this detail')
        const original = task.feedbackEvents.at(-1)
        progress.knownCount = Math.max(0, progress.knownCount - 1)
        progress.fuzzyCount += 1
        progress.lastFeedback = 'fuzzy'
        if (progress.completed) {
          withdrawLearningReview(next, task, progress, original.revision)
          progress.completed = false
          progress.completedAt = null
          const learning = next.wordBooks[progress.wordBookId].words[progress.wordId].learning
          learning.completed = false
          learning.completedAt = null
        }
        task.feedbackEvents.push({ source: 'feedback-correction', rulesVersion: 1,
          itemId: progress.id, correctedRevision: original.revision, at, revision: task.sessionRevision })
        task.sessionRevision += 1
      })
    },
    advanceLearning(token) {
      const date = today()
      change((next) => {
        const task = learningTask(next, token, date)
        requireLearningTurn(task, token, today(), 'feedback')
        assert(task.method.id !== GUIDED_RECALL.id || task.choice === null || task.choice.revealed,
          'Reveal learning details before advancing')
        task.previousItemId = task.currentItemId
        task.currentItemId = nextLearningItem(task)
        task.view = 'question'
        task.choice = null
        task.sessionRevision += 1
      })
    },
    getSnapshot: () => state,
    subscribe(listener) {
      assert(typeof listener === 'function', 'Invalid subscriber')
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    updateSettings(patch) {
      validatePatch(patch, Object.keys(DEFAULT_SETTINGS))
      change((next) => { Object.assign(next.settings, patch) })
    },
    getWord(wordBookId, word) {
      const bookId = typeof wordBookId === 'string' ? wordBookId.trim() : ''
      return own(own(state.wordBooks, bookId)?.words ?? {}, wordId(word))
    },
    getMistake(word) { return own(state.mistakes, wordId(word)) },
    getTask(kind, date = today()) { return taskAt(state, kind, date) },

    /** Input order is authoritative. Re-entry returns the existing daily task unchanged. */
    ensureTask(kind, words, wordBookId = state.settings.todayWordBookId, method = SELF_ASSESSMENT) {
      const date = today()
      const existing = taskAt(state, kind, date)
      if (existing) return existing
      assert(kind !== 'learning' || (method?.rulesVersion === 1
        && [SELF_ASSESSMENT.id, GUIDED_RECALL.id].includes(method.id)), 'Unsupported learning method')
      assert(Array.isArray(words), 'Invalid task words')
      const items = words.map((entry) => normalizeTaskItem(kind, entry, wordBookId))
      const uniqueItems = [...new Map(items.map((item) => [item.id, item])).values()]
      const ids = uniqueItems.map((item) => item.id)
      const createdAt = timestamp()
      change((next) => {
        if (!Object.hasOwn(next.days, date)) next.days[date] = {}
        uniqueItems.forEach((item) => {
          ensureWord(next, item.wordId)
          if (item.wordBookId !== null) ensureWordBookWord(next, item.wordBookId, item.wordId)
        })
        next.days[date][kind] = {
          date, kind, wordBookId, createdAt, settings: { ...next.settings }, itemIds: ids,
          items: Object.fromEntries(uniqueItems.map((item) => [item.id, createProgress(item)])),
          currentItemId: ids[0] ?? null, previousItemId: null, view: 'question',
          method: kind === 'learning' ? { id: method.id, rulesVersion: 1 } : null,
          sessionRevision: 0, feedbackEvents: [], choice: null,
        }
      })
      return taskAt(state, kind, date)
    },

    setTaskSession(kind, patch) {
      const date = today()
      validatePatch(patch, ['currentItemId', 'previousItemId', 'view'])
      assert(!isReviewSession(taskAt(state, kind, date)), 'Use guarded review session commands')
      change((next) => { Object.assign(requireTask(next, kind, date), patch) })
    },

    recordFeedback(kind, entry, feedback) {
      assert(['known', 'fuzzy', 'unknown'].includes(feedback), 'Invalid feedback')
      const date = today()
      const task = requireTask(state, kind, date)
      assert(!isReviewSession(task), 'Use guarded review session commands')
      const item = normalizeTaskItem(kind, entry, task.wordBookId)
      const current = own(task.items, item.id)
      assert(current, 'Word is not in today\'s task')
      if (current.completed) return
      const at = timestamp()
      change((next) => {
        const progress = requireTask(next, kind, date).items[item.id]
        progress.lastFeedback = feedback
        if (feedback === 'known') progress.knownCount += 1
        if (feedback === 'fuzzy') {
          progress.fuzzyCount += 1
          progress.knownCount = Math.max(0, progress.knownCount - 1)
        }
        if (feedback === 'unknown') {
          progress.unknownCount += 1
          progress.knownCount = 0
          next.mistakes[item.wordId].unknownCount += 1
          next.mistakes[item.wordId].unknownCountSinceRemoval += 1
          next.mistakes[item.wordId].lastErrorAt = at
        }
        progress.completed = progress.knownCount === 3
        if (progress.completed) {
          progress.completedAt = at
          if (kind === 'learning') {
            const learning = ensureWordBookWord(next, item.wordBookId, item.wordId).learning
            learning.completed = true
            learning.completedAt ??= at
            addCompletedLearningReview(next, requireTask(next, kind, date), progress, at, requireTask(next, kind, date).sessionRevision)
          }
        }
      })
    },

    removeCompletedTaskItem(kind, entry) {
      const date = today()
      const task = requireTask(state, kind, date)
      assert(!isReviewSession(task), 'Use guarded review session commands')
      const item = normalizeTaskItem(kind, entry, task.wordBookId)
      const current = own(task.items, item.id)
      assert(current?.completed, 'Task word is not completed')
      if (current.removed) return
      const at = timestamp()
      change((next) => {
        const progress = requireTask(next, kind, date).items[item.id]
        progress.removed = true
        progress.removedAt = at
      })
    },

    addToReview(wordBookId, word, options = {}) {
      const id = wordId(word)
      if (api.getWord(wordBookId, id)?.review) return
      const enteredAt = timestamp()
      const nextReviewAt = options.nextReviewAt === undefined ? localDayStartIso(now(), 1) : options.nextReviewAt
      change((next) => {
        ensureWordBookWord(next, wordBookId, id).review = {
          enteredAt, lastReviewedAt: null, nextReviewAt, stage: 0,
          completedReviewCount: 0, mastered: false, paused: false,
        }
      })
    },

    updateReview(wordBookId, word, patch) {
      const id = wordId(word)
      const active = taskAt(state, 'review', today())
      assert(!isReviewSession(active) || !active.itemIds.includes(wordBookWordId(wordBookId, id)),
        'Active review snapshot is protected; use guarded review session commands')
      validatePatch(patch, ['lastReviewedAt', 'nextReviewAt', 'stage', 'completedReviewCount', 'mastered', 'paused'])
      change((next) => {
        const entry = own(own(next.wordBooks, wordBookId)?.words ?? {}, id)
        assert(entry?.review, 'Word is not in the review library')
        Object.assign(entry.review, patch)
      })
    },

    getReviewLibrary({ wordBookId = null } = {}) {
      const books = wordBookId === null ? Object.values(state.wordBooks) : [own(state.wordBooks, wordBookId)].filter(Boolean)
      return books.flatMap((book) => Object.values(book.words)).filter((word) => word.review !== null)
    },

    getDueReviews({ at = timestamp(), wordBookId = null } = {}) {
      assert(typeof at === 'string' && Number.isFinite(Date.parse(at)), 'Invalid review cutoff')
      return api.getReviewLibrary({ wordBookId }).filter(({ review }) => !review.paused && !review.mastered
        && review.nextReviewAt !== null && Date.parse(review.nextReviewAt) <= Date.parse(at))
        .sort((a, b) => a.review.nextReviewAt.localeCompare(b.review.nextReviewAt) || a.id.localeCompare(b.id))
    },

    addToMistakes(word) {
      const id = wordId(word)
      const at = timestamp()
      change((next) => {
        const mistake = ensureWord(next, id)
        mistake.entered = true
        mistake.removed = false
        mistake.enteredAt ??= at
        mistake.removedAt = null
      })
    },

    removeFromMistakes(word) {
      const id = wordId(word)
      const at = timestamp()
      change((next) => {
        const mistake = own(next.mistakes, id)
        assert(mistake?.entered, 'Word has not entered the mistake notebook')
        if (!mistake.removed) {
          mistake.removed = true
          mistake.removedAt = at
          mistake.unknownCountSinceRemoval = 0
        }
      })
    },

    getMistakes({ includeRemoved = false } = {}) {
      return Object.values(state.mistakes).filter((word) => word.entered && (includeRemoved || !word.removed))
    },

    getDailyStats(date = today()) {
      validateDateKey(date)
      const result = { date, taskCount: 0, totalWords: 0, completedWords: 0, knownCount: 0, fuzzyCount: 0, unknownCount: 0, feedbackCount: 0 }
      for (const task of Object.values(own(state.days, date) ?? {})) {
        result.taskCount += 1
        for (const progress of Object.values(task.items)) {
          result.totalWords += 1
          result.completedWords += Number(progress.completed)
          for (const key of ['knownCount', 'fuzzyCount', 'unknownCount']) result[key] += progress[key]
        }
      }
      result.feedbackCount = result.knownCount + result.fuzzyCount + result.unknownCount
      return result
    },
  }
  return api
}
