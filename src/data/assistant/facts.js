import { localDateKey } from '../learning/model'
import { projectedMissingReviews, dueReviewWords } from '../learning/reviewLibrary'
import { completedWordCount, daysUntilExam, buildLearningRecommendation, estimateDailyStudyMinutes } from '../learning/recommendations'

const self = () => ({ known: 0, fuzzy: 0, unknown: 0 })
const choices = () => ({ correct: 0, incorrect: 0, showAnswer: 0 })
const corrections = () => ({ fromSelfAssessment: 0, fromChoice: 0 })
const identity = task => JSON.stringify([task.date, task.kind, task.taskId ?? null, task.wordBookId])
const content = value => JSON.stringify(value, Object.keys(value).sort())
function assertSafeNumbers(value) {
  if (typeof value === 'number' && !Number.isSafeInteger(value)) throw new Error('Cannot form a safe learning summary')
  if (value && typeof value === 'object') Object.values(value).forEach(assertSafeNumbers)
}
const progress = task => {
  if (!task) return null
  const assignedWords = task.itemIds.length
  const completedWords = task.itemIds.filter(id => task.items[id].completed).length
  return { wordBookId: task.wordBookId, assignedWords, completedWords, remainingWords: assignedWords - completedWords }
}

function period(tasks, fromDate, toDate, wordBookId, catalogMismatch) {
  const selected = wordBookId === null ? [] : tasks.filter(t => t.date >= fromDate && t.date <= toDate && t.wordBookId === wordBookId)
  const result = { fromDate, toDate, wordBookId, completions: { learningWords: 0, extraLearningWords: 0, reviewWords: 0 },
    selfAssessments: self(), choices: choices(), corrections: corrections(), effectiveSelfAssessments: self(),
    coverage: { eventCompleteness: 'not-provable', taskCount: selected.length, tasksWithoutEvents: 0, legacyTaskCount: 0 }, issues: [] }
  const evidence = { tasks: [], events: [], anomalies: [] }
  const issue = code => { if (!result.issues.includes(code)) result.issues.push(code) }
  const completed = new Map()
  for (const task of selected) {
    const taskIdentity = identity(task)
    const events = task.feedbackEvents ?? []
    result.coverage.tasksWithoutEvents += Number(events.length === 0)
    result.coverage.legacyTaskCount += Number(task.method === null)
    const completedItems = task.itemIds.filter(id => task.items[id].completed).map(id => ({ itemId: id, wordId: task.items[id].wordId }))
    evidence.tasks.push({ taskIdentity, date: task.date, kind: task.kind, wordBookId: task.wordBookId, ...progress(task), completedItems })
    const field = { learning: 'learningWords', 'extra-learning': 'extraLearningWords', review: 'reviewWords' }[task.kind]
    if (field) {
      for (const item of completedItems) {
        const key = JSON.stringify([task.date, task.wordBookId, item.wordId, task.kind === 'review' ? 'review' : 'new'])
        const previous = completed.get(key)
        if (previous && previous !== field) {
          issue('completion-source-conflict')
          result.completions[previous] = null
          result.completions[field] = null
          evidence.anomalies.push({ code: 'completion-source-conflict', taskIdentity, itemId: item.itemId })
        } else if (!previous) {
          completed.set(key, field)
          if (result.completions[field] !== null) result.completions[field]++
        } else {
          issue('completion-source-conflict')
          result.completions[field] = null
        }
      }
    }
    const revisions = new Map(), ordered = [], conflictedRevisions = new Set()
    const affected = new Set()
    const distribution = event => event.source === 'self-assessment' ? 'selfAssessments' : event.source === 'guided-choice' ? 'choices' : 'corrections'
    let lastRevision = -1
    for (const event of events) {
      const previous = revisions.get(event.revision)
      if (previous) {
        if (content(previous) === content(event)) { issue('duplicate-event'); evidence.anomalies.push({ code: 'duplicate-event', taskIdentity, revision: event.revision }); continue }
        issue('conflicting-event'); affected.add(distribution(previous)); affected.add(distribution(event)); conflictedRevisions.add(event.revision)
      } else {
        if (event.revision <= lastRevision) { issue('conflicting-event'); affected.add(distribution(event)) }
        revisions.set(event.revision, event); ordered.push(event)
        lastRevision = event.revision
      }
    }
    const corrected = new Set()
    for (const event of ordered) {
      const row = { taskIdentity, date: task.date, kind: task.kind, wordBookId: task.wordBookId, ...event }
      evidence.events.push(row)
      if (event.source === 'self-assessment') { if (result.selfAssessments) result.selfAssessments[event.feedback]++ }
      else if (event.source === 'guided-choice') { if (result.choices) result.choices[event.outcome === 'show-answer' ? 'showAnswer' : event.outcome]++ }
      else {
        const original = revisions.get(event.correctedRevision)
        if (conflictedRevisions.has(event.correctedRevision)) affected.add('corrections')
        const valid = original && original.revision < event.revision && original.itemId === event.itemId
          && !corrected.has(original.revision) && ((original.source === 'self-assessment' && original.feedback === 'known')
            || (original.source === 'guided-choice' && original.outcome === 'correct'))
        if (!valid) {
          issue('invalid-correction'); affected.add('corrections')
          if (original) affected.add(distribution(original))
          else { affected.add('selfAssessments'); affected.add('choices') }
          row.invalidCorrection = true
        } else {
          corrected.add(original.revision)
          const field = original.source === 'self-assessment' ? 'fromSelfAssessment' : 'fromChoice'
          if (result.corrections) result.corrections[field]++
          row.correctedSource = original.source
        }
      }
    }
    for (const field of affected) result[field] = null
  }
  if (result.selfAssessments && result.corrections) {
    result.effectiveSelfAssessments = { known: result.selfAssessments.known - result.corrections.fromSelfAssessment,
      fuzzy: result.selfAssessments.fuzzy + result.corrections.fromSelfAssessment, unknown: result.selfAssessments.unknown }
  } else result.effectiveSelfAssessments = null
  if (catalogMismatch) issue('catalog-mismatch')
  return { result, evidence }
}

export function buildLearningFacts(snapshot, { now, wordBooks, selectedWordBookId }) {
  const date = localDateKey(now)
  const from = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))
  const tasks = Object.values(snapshot.days).flatMap(day => [day.learning, day.review].filter(Boolean))
    .concat(Object.values(snapshot.extraLearning).flatMap(process => process.batches))
  const catalog = wordBooks.find(book => book.id === selectedWordBookId)
  const count = selectedWordBookId === null ? 0 : completedWordCount(snapshot, selectedWordBookId)
  const book = { id: selectedWordBookId, label: catalog?.label ?? null, totalWords: catalog?.totalWords ?? null, completedWords: count }
  const mismatch = book.totalWords !== null && count > book.totalWords
  const daily = snapshot.days[date] ?? {}
  const extra = snapshot.extraLearning[date]
  const today = { learning: progress(daily.learning), review: progress(daily.review), extraLearning: null }
  if (extra) {
    const batches = extra.batches.map(progress)
    const assignedWords = batches.reduce((sum, batch) => sum + batch.assignedWords, 0)
    const completedWords = batches.reduce((sum, batch) => sum + batch.completedWords, 0)
    today.extraLearning = { wordBookId: extra.batches[0]?.wordBookId ?? daily.learning?.wordBookId ?? null,
      batchCount: batches.length, assignedWords, completedWords, remainingWords: assignedWords - completedWords }
  }
  let reviewLoad = { wordBookId: selectedWordBookId, dueCount: null, outsideTodayTaskCount: null, needsReconciliation: false }
  if (selectedWordBookId !== null) {
    const projected = projectedMissingReviews(snapshot, selectedWordBookId, date)
    const due = new Set(dueReviewWords(snapshot, selectedWordBookId, now.toISOString(), date, projected).map(word => word.id))
    const assigned = new Set(daily.review?.wordBookId === selectedWordBookId ? daily.review.itemIds : [])
    reviewLoad = { wordBookId: selectedWordBookId, dueCount: due.size,
      outsideTodayTaskCount: [...due].filter(id => !assigned.has(id)).length, needsReconciliation: projected.length > 0 }
  }
  const one = period(tasks, date, date, selectedWordBookId, mismatch)
  const seven = period(tasks, from, date, selectedWordBookId, mismatch)
  let ruleRecommendation = null
  if (book.totalWords !== null && !mismatch) {
    const settings = snapshot.settings
    const daysRemaining = daysUntilExam(settings.examDate, now)
    const recommendation = buildLearningRecommendation({ totalWords: book.totalWords, completedWords: count, daysRemaining,
      dailyNewWords: settings.dailyNewWords ?? 0, dailyReviewWords: settings.dailyReviewWords ?? 0, dailyStudyMinutes: settings.dailyStudyMinutes ?? 0 })
    const quantities = settings.dailyNewWords !== null && settings.dailyReviewWords !== null
    const estimatedMinutes = quantities ? estimateDailyStudyMinutes(settings.dailyNewWords, settings.dailyReviewWords) : null
    ruleRecommendation = { source: 'rules', ...recommendation, estimatedMinutes,
      exceedsDailyWordLimit: daysRemaining > 0 ? recommendation.exceedsDailyWordLimit : null,
      overloaded: estimatedMinutes !== null && settings.dailyStudyMinutes !== null ? recommendation.overloaded : null }
  }
  const summary = { book, today, reviewLoad, history: { today: one.result, last7Days: seven.result }, ruleRecommendation }
  assertSafeNumbers(summary)
  return { ...summary, evidence: { today: one.evidence, last7Days: seven.evidence } }
}
