import { describe, expect, it, vi } from 'vitest'
import { spawnSync } from 'node:child_process'
import { createLearningStore } from '../learning/store'
import * as Facts from './facts'
import { anomalousTask, context, finish, token } from './fixtures'

function datedStore(initial = new Date(2026, 8, 20, 12)) {
  let clock = initial
  let raw = null
  const storage = { getItem: () => raw, setItem: vi.fn((key, value) => { raw = value }) }
  const store = createLearningStore({ storage, now: () => clock })
  return { store, storage, setDate: (year, month, day) => { clock = new Date(year, month - 1, day, 12) } }
}

function finishReview(store) {
  for (let i = 0; i < 2; i++) {
    store.submitReviewFeedback(token(store.getTask('review')), 'known')
    if (i === 0) store.advanceReview(token(store.getTask('review')))
  }
}

describe('read-only statistics facts', () => {
  it('exports the statistics projection and reads saved tasks across dates and books without writes', () => {
    expect(Facts.buildStatisticsFacts).toBeTypeOf('function')
    const { store, storage, setDate } = datedStore()
    store.updateSettings({ todayWordBookId: 'a', dailyReviewWords: 1 })
    store.ensureTask('learning', ['alpha'], 'a'); finish(store)
    store.ensureExtraLearning(['gamma']); finish(store, () => store.getExtraLearning())
    store.ensureExtraLearning(['epsilon']); finish(store, () => store.getExtraLearning())
    store.addToReview('a', 'alpha', { nextReviewAt: new Date(2026, 8, 21).toISOString() })
    setDate(2026, 9, 26)
    store.ensureTask('learning', ['delta'], 'b'); finish(store)
    setDate(2026, 9, 27)
    store.ensureTodayReview(); finishReview(store)
    setDate(2026, 10, 2)
    store.ensureTask('learning', ['beta'], 'a'); finish(store)
    store.ensureTodayReview(); finishReview(store)
    const snapshot = store.getSnapshot()
    const before = JSON.stringify(snapshot)
    storage.setItem.mockClear()
    const options = { ...context, now: new Date(2026, 9, 2, 12) }
    const all = Facts.buildStatisticsFacts(snapshot, { ...options, period: 'all' })
    const seven = Facts.buildStatisticsFacts(snapshot, { ...options, period: 'last7Days' })
    const today = Facts.buildStatisticsFacts(snapshot, { ...options, period: 'today' })
    expect(all.history).toMatchObject({ fromDate: '2026-09-20', toDate: '2026-10-02',
      completions: { learningWords: 2, extraLearningWords: 2, reviewWords: 2 } })
    expect(seven.history).toMatchObject({ fromDate: '2026-09-26', completions: { learningWords: 1, extraLearningWords: 0, reviewWords: 2 } })
    expect(today.history).toMatchObject({ fromDate: '2026-10-02', completions: { learningWords: 1, extraLearningWords: 0, reviewWords: 1 } })
    expect(all.book).toEqual({ id: 'a', label: 'A', totalWords: 10, completedWords: 4 })
    expect(all.reviewLoad).toEqual(today.reviewLoad)
    expect(all.granularity).toBe('day')
    expect(all.buckets).toHaveLength(13)
    expect(all.buckets[1]).toEqual({ fromDate: '2026-09-21', toDate: '2026-09-21', label: '2026-09-21',
      completions: { learningWords: 0, extraLearningWords: 0, reviewWords: 0 } })
    for (const field of ['learningWords', 'extraLearningWords', 'reviewWords']) {
      expect(all.buckets.reduce((sum, row) => sum + row.completions[field], 0)).toBe(all.history.completions[field])
    }
    expect(JSON.stringify(snapshot)).toBe(before)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('uses selected-book saved tasks to start all history, including an empty task, and handles no tasks', () => {
    const { store, setDate } = datedStore(new Date(2025, 0, 1, 12))
    store.ensureTask('learning', [], 'b')
    setDate(2025, 1, 5)
    store.ensureTask('learning', [], 'a')
    setDate(2026, 10, 2)
    const selected = Facts.buildStatisticsFacts(store.getSnapshot(), { ...context, period: 'all' })
    expect(selected.history.fromDate).toBe('2025-01-05')
    expect(selected.history.coverage.taskCount).toBe(1)
    const absent = Facts.buildStatisticsFacts(store.getSnapshot(), { ...context, selectedWordBookId: 'c', period: 'all' })
    expect(absent.history).toMatchObject({ fromDate: '2026-10-02', toDate: '2026-10-02',
      completions: { learningWords: 0, extraLearningWords: 0, reviewWords: 0 } })
    expect(absent.buckets).toHaveLength(1)
  })

  it('preserves correction and anomalous-source semantics in history and buckets', () => {
    const snapshot = anomalousTask()
    const task = snapshot.days['2026-10-02'].learning
    task.feedbackEvents.push({ ...task.feedbackEvents[0] })
    let result = Facts.buildStatisticsFacts(snapshot, { ...context, period: 'all' })
    expect(result.history.selfAssessments.known).toBe(1)
    expect(result.history.issues).toContain('duplicate-event')
    task.feedbackEvents[1].feedback = 'fuzzy'
    result = Facts.buildStatisticsFacts(snapshot, { ...context, period: 'all' })
    expect(result.history.selfAssessments).toBeNull()
    expect(result.history.effectiveSelfAssessments).toBeNull()
    expect(result.buckets[0].completions.learningWords).toBe(0)
    task.items[task.currentItemId].completed = true
    snapshot.extraLearning['2026-10-02'] = { batches: [{ ...task, kind: 'extra-learning', taskId: 'extra' }], exhausted: false }
    result = Facts.buildStatisticsFacts(snapshot, { ...context, period: 'all' })
    expect(result.history.completions).toMatchObject({ learningWords: null, extraLearningWords: null })
    expect(result.buckets[0].completions).toMatchObject({ learningWords: null, extraLearningWords: null })
  })

  it('keeps raw and effective feedback distinct after a saved correction', () => {
    const { store } = datedStore(new Date(2026, 9, 2, 12))
    store.ensureTask('learning', ['alpha'], 'a')
    for (let n = 0; n < 3; n++) {
      store.submitSelfAssessment(token(store.getTask('learning')), 'known')
      if (n < 2) store.advanceLearning(token(store.getTask('learning')))
    }
    store.correctLearningFeedback(token(store.getTask('learning')))
    const result = Facts.buildStatisticsFacts(store.getSnapshot(), { ...context, period: 'all' })
    expect(result.history.selfAssessments).toEqual({ known: 3, fuzzy: 0, unknown: 0 })
    expect(result.history.corrections).toEqual({ fromSelfAssessment: 1, fromChoice: 0 })
    expect(result.history.effectiveSelfAssessments).toEqual({ known: 2, fuzzy: 1, unknown: 0 })
    expect(result.history.completions.learningWords).toBe(0)
  })

  it('uses seven-calendar-day and month bins across long histories, with exact sums', () => {
    const { store, setDate } = datedStore(new Date(2025, 8, 20, 12))
    store.ensureTask('learning', ['alpha'], 'a'); finish(store)
    setDate(2026, 7, 1)
    store.ensureTask('learning', ['beta'], 'a'); finish(store)
    setDate(2026, 10, 2)
    const snapshot = store.getSnapshot()
    const weekly = Facts.buildStatisticsFacts(snapshot, { ...context, period: 'last7Days' })
    expect(weekly.granularity).toBe('day')
    const all = Facts.buildStatisticsFacts(snapshot, { ...context, period: 'all' })
    expect(all.granularity).toBe('month')
    expect(all.buckets[0].fromDate).toBe('2025-09-20')
    expect(all.buckets.at(-1).toDate).toBe('2026-10-02')
    expect(all.buckets.reduce((sum, bucket) => sum + bucket.completions.learningWords, 0)).toBe(2)
    const recent = Facts.buildStatisticsFacts(snapshot, { ...context, period: 'all', now: new Date(2025, 11, 1, 12) })
    expect(recent.granularity).toBe('week')
    expect(recent.buckets[0]).toMatchObject({ fromDate: '2025-09-20', toDate: '2025-09-26' })
    expect(recent.buckets.at(-1).toDate).toBe('2025-12-01')
    expect(recent.buckets.reduce((sum, bucket) => sum + bucket.completions.learningWords, 0)).toBe(1)
  })

  it('makes calendar dates stable across daylight-saving changes', () => {
    const script = `
      const { readFileSync } = require('node:fs'); const { resolve, dirname } = require('node:path');
      function moduleUrl(path) {
        const source = readFileSync(path, 'utf8').replace(/from '([^']+)'/g, (_, specifier) => "from '" + moduleUrl(resolve(dirname(path), specifier + '.js')) + "'");
        return 'data:text/javascript;base64,' + Buffer.from(source).toString('base64');
      }
      import(moduleUrl(resolve('src/data/assistant/facts.js'))).then(({buildStatisticsFacts}) => {
        const facts = buildStatisticsFacts({days:{'2026-03-04':{learning:{date:'2026-03-04',kind:'learning',wordBookId:'a',itemIds:[],items:{},feedbackEvents:[],method:null}}},extraLearning:{},wordBooks:{},settings:{}},
          {now:new Date(2026,2,10,12),wordBooks:[],selectedWordBookId:'a',period:'all'});
        console.log(JSON.stringify({from:facts.history.fromDate,days:facts.buckets.map(row=>row.fromDate),zone:Intl.DateTimeFormat().resolvedOptions().timeZone}));
      });`
    const result = spawnSync(process.execPath, ['-e', script], { env: { ...process.env, TZ: 'America/New_York' }, encoding: 'utf8' })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout)).toEqual({ from: '2026-03-04',
      days: ['2026-03-04', '2026-03-05', '2026-03-06', '2026-03-07', '2026-03-08', '2026-03-09', '2026-03-10'],
      zone: 'America/New_York' })
  })
})
