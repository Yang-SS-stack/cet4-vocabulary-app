import { render } from '@testing-library/react'
import { vi } from 'vitest'
import { createLearningStore, LearningStoreProvider } from '../data/learning'
import { createInlineWordBookSession } from '../data/wordBookSession'
import LearningSession from './LearningSession'

export const reviewWords = [
  { word: 'alpha', meaning: '首字母；开端', phonetic: '/ælfa/', example: 'An alpha example.', translation: '例句翻译', phrases: ['alpha phrase'] },
  { word: 'beta', meaning: '测试版' }, { word: 'gamma', meaning: '第三个词' }, { word: 'delta', meaning: '第四个词' },
]
export const reviewToken = task => ({ date: task.date, itemId: task.currentItemId, revision: task.sessionRevision })
export function reviewFixture({ ids = ['alpha'], limit = 1 } = {}) {
  let raw = null, fail = false, date = new Date(2026, 8, 30, 12)
  const storage = { getItem: () => raw, setItem: (_, value) => { if (fail) throw Error('quota'); raw = value } }
  const open = () => createLearningStore({ storage, now: () => new Date(date) })
  const store = open()
  store.updateSettings({ todayWordBookId: 'cet4', dailyNewWords: 1, dailyReviewWords: limit, pronunciation: 'en-GB' })
  ids.forEach(id => store.addToReview('cet4', id, { nextReviewAt: new Date(2026, 8, 30).toISOString() }))
  const session = createInlineWordBookSession(reviewWords)
  const loader = vi.fn(async () => session)
  const exit = vi.fn()
  const show = (s = store, props = {}) => render(<LearningStoreProvider store={s}><LearningSession initialMode="review" loadBook={loader} onExit={exit} {...props} /></LearningStoreProvider>)
  const feedback = value => store.submitReviewFeedback(reviewToken(store.getTask('review')), value)
  const advance = () => store.advanceReview(reviewToken(store.getTask('review')))
  return { store, open, storage, now: () => new Date(date), show, loader, exit, session, feedback, advance, fail: value => { fail = value }, nextDay: () => { date = new Date(2026, 9, 1, 12) } }
}
