import { describe, expect, it } from 'vitest'
import { buildLearningFacts } from './facts'
import { context, setup, token, finish, anomalousTask } from './fixtures'
describe('assistant facts', () => {
  it('reads a consistent frozen snapshot without writes and rejects stale storage', () => {
    const { store, storage, external } = setup()
    const { snapshot, raw } = store.readAssistantSnapshot()
    expect(raw).toBeNull()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(buildLearningFacts(snapshot, context).history.today.coverage.eventCompleteness).toBe('not-provable')
    expect(storage.setItem).not.toHaveBeenCalled()
    external('{}')
    expect(() => store.readAssistantSnapshot()).toThrow(/changed elsewhere/)
  })
  it('distinguishes missing tasks from zero assignments and current book from task book', () => {
    const { store } = setup()
    expect(buildLearningFacts(store.getSnapshot(), context).today.learning).toBeNull()
    store.ensureTask('learning', [], 'b')
    const facts = buildLearningFacts(store.getSnapshot(), context)
    expect(facts.today.learning).toEqual({ wordBookId: 'b', assignedWords: 0, completedWords: 0, remainingWords: 0 })
    expect(facts.history.today.coverage.taskCount).toBe(0)
  })
  it('keeps removed completions and counts real feedback rather than progress', () => {
    const { store } = setup()
    store.ensureTask('learning', ['one'], 'a')
    for (let i = 0; i < 3; i++) store.recordFeedback('learning', 'one', 'known')
    store.removeCompletedTaskItem('learning', 'one')
    const facts = buildLearningFacts(store.getSnapshot(), context)
    expect(facts.book.completedWords).toBe(1)
    expect(facts.today.learning.completedWords).toBe(1)
    expect(facts.history.today.selfAssessments.known).toBe(0)
    expect(facts.reviewLoad.needsReconciliation).toBe(false)
  })
  it('uses six preceding calendar days across leap day', () => {
    const { store } = setup()
    const facts = buildLearningFacts(store.getSnapshot(), { ...context, now: new Date(2024, 2, 1) })
    expect(facts.history.last7Days.fromDate).toBe('2024-02-24')
  })
})

it('review initial two is no feedback; two known and correction restore schedule', () => {
  const { store } = setup()
  store.updateSettings({ todayWordBookId: 'a', dailyReviewWords: 1 })
  store.addToReview('a', 'alpha', { nextReviewAt: new Date(2026, 9, 1).toISOString() })
  const original = store.getWord('a', 'alpha').review
  store.ensureTodayReview()
  let facts = buildLearningFacts(store.getSnapshot(), context)
  expect(facts.today.review).toMatchObject({ assignedWords: 1, completedWords: 0, remainingWords: 1 })
  expect(facts.history.today.selfAssessments).toEqual({ known: 0, fuzzy: 0, unknown: 0 })
  store.submitReviewFeedback(token(store.getTask('review')), 'known')
  store.advanceReview(token(store.getTask('review')))
  store.submitReviewFeedback(token(store.getTask('review')), 'known')
  store.correctReviewFeedback(token(store.getTask('review')))
  facts = buildLearningFacts(store.getSnapshot(), context)
  expect(facts.history.today.selfAssessments.known).toBe(2)
  expect(facts.history.today.effectiveSelfAssessments).toEqual({ known: 1, fuzzy: 1, unknown: 0 })
  expect(facts.history.today.corrections.fromSelfAssessment).toBe(1)
  expect(facts.today.review.completedWords).toBe(0)
  expect(store.getWord('a', 'alpha').review).toEqual(original)
  expect(facts.evidence.today.events.at(-1)).toMatchObject({ correctedSource: 'self-assessment', correctedRevision: 2 })
})
it('choice correction stays separate from self assessments', () => {
  const { store } = setup()
  store.ensureTask('learning', ['alpha'], 'a', { id: 'guided-recall', rulesVersion: 1 })
  store.prepareLearningChoice(token(store.getTask('learning')), ['alpha', 'beta', 'gamma', 'delta'].map(word => ({ word, meaning: word })))
  store.submitLearningChoice(token(store.getTask('learning')), 'alpha')
  store.revealLearningDetails(token(store.getTask('learning')))
  store.correctLearningFeedback(token(store.getTask('learning')))
  const facts = buildLearningFacts(store.getSnapshot(), context)
  expect(facts.history.today.choices.correct).toBe(1)
  expect(facts.history.today.corrections.fromChoice).toBe(1)
  expect(facts.history.today.effectiveSelfAssessments).toEqual({ known: 0, fuzzy: 0, unknown: 0 })
})
it('fixed learning two and two extra batches retain four unique completions', () => {
  const { store } = setup()
  store.updateSettings({ todayWordBookId: 'a', dailyNewWords: 2 })
  store.ensureTodayLearning('a', ['alpha', 'beta']); finish(store)
  for (const word of ['gamma', 'delta']) { store.ensureExtraLearning([word]); finish(store, () => store.getExtraLearning()) }
  const facts = buildLearningFacts(store.getSnapshot(), context)
  expect(facts.book.completedWords).toBe(4)
  expect(facts.today.extraLearning).toMatchObject({ batchCount: 2, assignedWords: 2, completedWords: 2 })
  expect(facts.history.today.completions).toEqual({ learningWords: 2, extraLearningWords: 2, reviewWords: 0 })
  expect(facts.evidence.today.tasks.flatMap(task => task.completedItems)).toHaveLength(4)
})
it('exhausted empty extra process is present with zero counts', () => {
  const { store } = setup()
  store.ensureTask('learning', [], 'a'); store.ensureExtraLearning([])
  expect(buildLearningFacts(store.getSnapshot(), context).today.extraLearning).toEqual({ wordBookId: 'a', batchCount: 0, assignedWords: 0, completedWords: 0, remainingWords: 0 })
})
it('deduplicates identical events but nulls conflicting distributions only', () => {
  const snapshot = anomalousTask(), task = snapshot.days['2026-10-02'].learning
  task.feedbackEvents.push({ ...task.feedbackEvents[0] })
  let facts = buildLearningFacts(snapshot, context)
  expect(facts.history.today.selfAssessments.known).toBe(1)
  expect(facts.history.today.issues).toContain('duplicate-event')
  task.feedbackEvents[1].feedback = 'fuzzy'
  facts = buildLearningFacts(snapshot, context)
  expect(facts.history.today.selfAssessments).toBeNull()
  expect(facts.history.today.effectiveSelfAssessments).toBeNull()
  expect(facts.history.today.choices).toEqual({ correct: 0, incorrect: 0, showAnswer: 0 })
})
it('rejects missing correction targets and retains completion facts', () => {
  const snapshot = anomalousTask(), task = snapshot.days['2026-10-02'].learning
  task.feedbackEvents.push({ source: 'feedback-correction', itemId: task.currentItemId, revision: 2, correctedRevision: 99 })
  const facts = buildLearningFacts(snapshot, context)
  expect(facts.history.today.issues).toContain('invalid-correction')
  expect(facts.history.today.corrections).toBeNull()
  expect(facts.history.today.effectiveSelfAssessments).toBeNull()
  expect(facts.history.today.completions.learningWords).toBe(0)
})
it('flags cross source completion conflicts without choosing a source', () => {
  const snapshot = anomalousTask(), task = snapshot.days['2026-10-02'].learning
  task.items[task.currentItemId].completed = true
  snapshot.extraLearning['2026-10-02'] = { batches: [{ ...task, kind: 'extra-learning', taskId: 'extra' }], exhausted: false }
  const facts = buildLearningFacts(snapshot, context)
  expect(facts.history.today.completions).toEqual({ learningWords: null, extraLearningWords: null, reviewWords: 0 })
  expect(facts.history.today.issues).toContain('completion-source-conflict')
})
it('uses due set difference independently from task remaining and never writes projection', () => {
  const { store, storage } = setup()
  store.updateSettings({ todayWordBookId: 'a', dailyReviewWords: 2 })
  for (const word of ['a', 'b', 'c', 'd']) store.addToReview('a', word, { nextReviewAt: new Date(2026, 9, 1).toISOString() })
  store.ensureTodayReview(); storage.setItem.mockClear()
  expect(buildLearningFacts(store.getSnapshot(), context).reviewLoad).toEqual({ wordBookId: 'a', dueCount: 4, outsideTodayTaskCount: 2, needsReconciliation: false })
  expect(storage.setItem).not.toHaveBeenCalled()
})
it('legacy three completions project schedules while zero feedback stays unknown coverage', () => {
  const { store, storage } = setup()
  store.ensureTask('learning', ['a', 'b', 'c'], 'a')
  for (const word of ['a', 'b', 'c']) for (let n = 0; n < 3; n++) store.recordFeedback('learning', word, 'known')
  const snapshot = JSON.parse(JSON.stringify(store.getSnapshot()))
  snapshot.days['2026-10-02'].learning.method = null
  for (const word of Object.values(snapshot.wordBooks.a.words)) { word.review = null; word.learning.completedAt = new Date(2026, 8, 20).toISOString() }
  storage.setItem.mockClear()
  const facts = buildLearningFacts(snapshot, context)
  expect(facts.book.completedWords).toBe(3)
  expect(facts.history.today.coverage).toEqual({ eventCompleteness: 'not-provable', taskCount: 1, tasksWithoutEvents: 1, legacyTaskCount: 1 })
  expect(facts.reviewLoad).toMatchObject({ dueCount: 3, needsReconciliation: true })
  expect(storage.setItem).not.toHaveBeenCalled()
})
it('counts same word review by date and excludes preceding seventh day', () => {
  const snapshot = anomalousTask(), task = snapshot.days['2026-10-02'].learning
  delete snapshot.days['2026-10-02'].learning
  for (const date of ['2026-10-02', '2026-09-26', '2026-09-25']) snapshot.days[date] = { review: { ...task, date, kind: 'review', items: { ...task.items, [task.currentItemId]: { ...task.items[task.currentItemId], completed: true } }, feedbackEvents: [] } }
  expect(buildLearningFacts(snapshot, context).history.last7Days.completions.reviewWords).toBe(2)
})
it.each(['2026-10-03', '2026-10-02', '2026-10-01', null])('handles exam date %s and missing settings without zero substitution', examDate => {
  const { store } = setup(); store.updateSettings({ examDate })
  const recommendation = buildLearningFacts(store.getSnapshot(), context).ruleRecommendation
  expect(recommendation.remainingWords).toBe(10)
  expect(recommendation.estimatedMinutes).toBeNull()
  expect(recommendation.overloaded).toBeNull()
  expect(recommendation.deadlineDailyWords).toBe(examDate === '2026-10-03' ? 10 : null)
})
it('nulls recommendations on catalog mismatch and handles absent selection', () => {
  const { store } = setup(); store.ensureTask('learning', ['alpha'], 'a')
  for (let n = 0; n < 3; n++) store.recordFeedback('learning', 'alpha', 'known')
  const facts = buildLearningFacts(store.getSnapshot(), { ...context, wordBooks: [{ id: 'a', label: 'A', totalWords: 0 }] })
  expect(facts.ruleRecommendation).toBeNull()
  expect(facts.history.today.issues).toContain('catalog-mismatch')
  const empty = buildLearningFacts(store.getSnapshot(), { ...context, selectedWordBookId: null })
  expect(empty.book).toEqual({ id: null, label: null, totalWords: null, completedWords: 0 })
  expect(empty.history.today.coverage.taskCount).toBe(0)
  expect(empty.reviewLoad.dueCount).toBeNull()
})
it('conflicting corrected target cannot yield an apparently certain correction count', () => {
  const snapshot = anomalousTask(), task = snapshot.days['2026-10-02'].learning
  task.feedbackEvents.push({ ...task.feedbackEvents[0], feedback: 'unknown' })
  task.feedbackEvents.push({ source: 'feedback-correction', itemId: task.currentItemId, revision: 2, correctedRevision: 0 })
  expect(buildLearningFacts(snapshot, context).history.today.corrections).toBeNull()
})

it.each([[2026, 0, 2, '2025-12-27'], [2026, 2, 10, '2026-03-04'], [2026, 10, 3, '2026-10-28']])('uses calendar days across year and DST transition dates', (year, month, day, from) => {
  const { store } = setup()
  expect(buildLearningFacts(store.getSnapshot(), { ...context, now: new Date(year, month, day) }).history.last7Days.fromDate).toBe(from)
})
it('learning completion correction keeps raw three but converts one effective known and revokes completion', () => {
  const { store } = setup(); store.ensureTask('learning', ['alpha'], 'a')
  for (let n = 0; n < 3; n++) { store.submitSelfAssessment(token(store.getTask('learning')), 'known'); if (n < 2) store.advanceLearning(token(store.getTask('learning'))) }
  store.correctLearningFeedback(token(store.getTask('learning')))
  const facts = buildLearningFacts(store.getSnapshot(), context)
  expect(facts.book.completedWords).toBe(0)
  expect(facts.today.learning.completedWords).toBe(0)
  expect(facts.history.today.selfAssessments.known).toBe(3)
  expect(facts.history.today.effectiveSelfAssessments).toEqual({ known: 2, fuzzy: 1, unknown: 0 })
  expect(store.getWord('a', 'alpha').review).toBeNull()
})
it('preserves old zero quantities, zero remaining book and raw over-limit daily need', () => {
  const { store } = setup(), snapshot = JSON.parse(JSON.stringify(store.getSnapshot()))
  Object.assign(snapshot.settings, { examDate: '2026-10-03', dailyNewWords: 0, dailyReviewWords: 0, dailyStudyMinutes: 0 })
  let rule = buildLearningFacts(snapshot, { ...context, wordBooks: [{ id: 'a', label: 'A', totalWords: 200 }] }).ruleRecommendation
  expect(rule).toMatchObject({ deadlineDailyWords: 200, recommendedDailyWords: 100, exceedsDailyWordLimit: true, estimatedMinutes: 0, overloaded: false })
  rule = buildLearningFacts(snapshot, { ...context, wordBooks: [{ id: 'a', label: 'A', totalWords: 0 }] }).ruleRecommendation
  expect(rule).toMatchObject({ remainingWords: 0, deadlineDailyWords: 0, recommendedDailyWords: 1 })
})

it('refuses arithmetic overflow instead of producing an unsafe summary', () => {
  const { store } = setup(), snapshot = JSON.parse(JSON.stringify(store.getSnapshot()))
  Object.assign(snapshot.settings, { dailyNewWords: Number.MAX_SAFE_INTEGER, dailyReviewWords: Number.MAX_SAFE_INTEGER })
  expect(() => buildLearningFacts(snapshot, context)).toThrow(/safe/)
})

it('invalidates distributions on contradictory revision order', () => {
  const snapshot = anomalousTask(), task = snapshot.days['2026-10-02'].learning
  task.feedbackEvents[0].revision = 2
  task.feedbackEvents.push({ ...task.feedbackEvents[0], revision: 0 })
  const facts = buildLearningFacts(snapshot, context)
  expect(facts.history.today.issues).toContain('conflicting-event')
  expect(facts.history.today.selfAssessments).toBeNull()
})
