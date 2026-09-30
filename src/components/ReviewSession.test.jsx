import { fireEvent, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, expect, test, vi } from 'vitest'
import { createBrowserLearningStore } from '../data/learning/browserStore'
import { reviewFixture, reviewToken } from './reviewTestFixture'

vi.mock('../data/audioManifest', () => ({ loadAudioManifest: async () => ({ words: {} }) }))
beforeAll(() => { HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', '') } })
const known = () => screen.getByRole('button', { name: '认识', exact: true })
const next = () => screen.getByRole('button', { name: '下一词' })
const current = store => { const task = store.getTask('review'); return task.items[task.currentItemId] }

test('new due review starts at two, hides every English answer in Chinese question, completes at four', async () => {
  const e = reviewFixture(); const user = userEvent.setup(); e.show()
  await screen.findByRole('heading', { name: 'alpha' })
  expect(screen.getByText('2 / 4')).toBeInTheDocument()
  expect(screen.queryByText('首字母；开端')).not.toBeInTheDocument()
  await user.click(known()); await screen.findByText('例句翻译')
  expect(screen.getByText('继续复习本词')).toBeInTheDocument()
  await user.click(next())
  const meaning = await screen.findByRole('heading', { name: '首字母；开端' })
  expect(meaning).toHaveAttribute('lang', 'zh-CN')
  const region = screen.getByRole('region', { name: '今日复习练习' })
  expect(region.outerHTML).not.toMatch(/alpha|ælfa|An alpha example/)
  expect(screen.queryByRole('button', { name: '重播本轮朗读' })).not.toBeInTheDocument()
  await user.click(known()); await screen.findByText('例句翻译')
  expect(screen.getByRole('heading', { name: 'alpha' })).toBeInTheDocument()
  expect(screen.getByText(/下次复习：2026-10-02/)).toBeInTheDocument()
  expect(current(e.open()).knownCount).toBe(4)
  expect(e.store.getWord('cet4', 'alpha').learning.completed).toBe(false)
})

test('saved completion details restore and correction rolls back four to three once across reopen', async () => {
  const e = reviewFixture(); e.store.ensureTodayReview(); e.feedback('known'); e.advance(); e.feedback('known')
  const previous = current(e.store).settlement.previousReview
  const view = e.show(); const user = userEvent.setup()
  await screen.findByText('例句翻译'); await user.click(screen.getByRole('button', { name: '记错了' }))
  expect(await screen.findByText('已更正：模糊，认识次数减 1')).toBeInTheDocument()
  expect(e.store.getWord('cet4', 'alpha').review).toEqual(previous)
  view.unmount(); e.show(e.open()); await screen.findByText('例句翻译')
  expect(screen.getByRole('button', { name: '已更正' })).toBeDisabled()
  await user.click(next()); await screen.findByRole('heading', { name: '首字母；开端' })
})

test('fuzzy rolls back to English example and unknown repeats all four stages with persisted choices', async () => {
  const e = reviewFixture(); e.show(); const user = userEvent.setup()
  await screen.findByRole('heading', { name: 'alpha' }); await user.click(screen.getByRole('button', { name: '模糊' }))
  await screen.findByText('例句翻译'); await user.click(next())
  await screen.findByText('An alpha example.')
  expect(screen.queryByText('例句翻译')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '不认识' })); await screen.findByText('例句翻译'); await user.click(next())
  await user.click(await screen.findByRole('button', { name: '测试版' }))
  expect(current(e.store).knownCount).toBe(0)
  expect(screen.getByRole('button', { name: '继续' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '继续' })); await screen.findByText('例句翻译'); await user.click(next())
  await user.click(await screen.findByRole('button', { name: '首字母；开端' }))
  await user.click(screen.getByRole('button', { name: '继续' })); await screen.findByText('例句翻译'); await user.click(next())
  for (let i = 1; i < 4; i++) { await user.click(await screen.findByRole('button', { name: '认识', exact: true })); await screen.findByText('例句翻译'); if (i < 3) await user.click(next()) }
  expect(current(e.open()).knownCount).toBe(4)
  expect(e.store.getWord('cet4', 'alpha').review.stage).toBe(0)
})

test('assignment survives failed details loading and retry never uses learning order for assignment', async () => {
  const e = reviewFixture(); e.loader.mockRejectedValueOnce(Error('offline'))
  const order = vi.spyOn(e.session, 'loadLearningOrder'); e.show(); const user = userEvent.setup()
  expect(await screen.findByRole('alert')).toHaveTextContent('词书加载失败')
  const task = e.open().getTask('review'); expect(task.itemIds.map(id => task.items[id].wordId)).toEqual(['alpha'])
  await user.click(screen.getByRole('button', { name: '重试' })); await screen.findByRole('heading', { name: 'alpha' })
  expect(e.store.getTask('review')).toEqual(task); expect(order).not.toHaveBeenCalled()
})

test('empty and completed task display offline without any book loading', async () => {
  const e = reviewFixture({ ids: [] }); e.loader.mockRejectedValue(Error('offline')); const view = e.show()
  expect(await screen.findByRole('heading', { name: '还没有学过的词' })).toBeInTheDocument(); expect(e.loader).not.toHaveBeenCalled()
  view.unmount()
  const done = reviewFixture(); done.store.ensureTodayReview(); done.feedback('known'); done.advance(); done.feedback('known'); done.advance(); done.show()
  expect(await screen.findByRole('heading', { name: '今日复习已完成' })).toBeInTheDocument(); expect(done.loader).not.toHaveBeenCalled()
})

test('save failure keeps the question hidden and tab conflict requires explicit reload', async () => {
  const e = reviewFixture(); e.show(); const user = userEvent.setup(); await screen.findByRole('heading', { name: 'alpha' })
  e.fail(true); await user.click(known()); expect(await screen.findByRole('alert')).toHaveTextContent('保存失败')
  expect(screen.queryByText('例句翻译')).not.toBeInTheDocument(); e.fail(false)
  const other = e.open(); other.submitReviewFeedback(reviewToken(other.getTask('review')), 'known')
  await user.click(known()); expect(await screen.findByRole('alert')).toHaveTextContent('其他页面')
  await user.click(screen.getByRole('button', { name: '重新读取进度' })); await screen.findByText('例句翻译')
  expect(e.store.getTask('review').feedbackEvents).toHaveLength(1)
})

test('midnight rejects stale answers and restarts today review rather than daily learning', async () => {
  const e = reviewFixture(); e.show(); const user = userEvent.setup(); await screen.findByRole('heading', { name: 'alpha' })
  e.nextDay(); await user.click(known()); expect(await screen.findByRole('alert')).toHaveTextContent('日期已变化')
  await user.click(screen.getByRole('button', { name: '开始今天的任务' }))
  await waitFor(() => expect(e.store.getTask('review')?.date).toBe('2026-10-01'))
  expect(e.store.getTask('learning')).toBeNull()
})

test('exit cancel and Escape keep exact progress and return focus; confirm exits', async () => {
  const e = reviewFixture({ ids: ['alpha', 'beta'], limit: 2 }); e.show(); const user = userEvent.setup(); await screen.findByRole('heading', { name: 'alpha' })
  const exit = screen.getByRole('button', { name: '返回主界面' }); await user.click(exit)
  expect(screen.getByRole('dialog')).toHaveTextContent('剩余 2 词')
  await user.click(screen.getByRole('button', { name: '继续复习' })); expect(exit).toHaveFocus()
  await user.click(exit); fireEvent(screen.getByRole('dialog'), new Event('cancel', { bubbles: true, cancelable: true })); expect(exit).toHaveFocus()
  await user.click(exit); await user.click(screen.getByRole('button', { name: '确认退出' }))
  await waitFor(() => expect(e.exit).toHaveBeenCalledOnce()); expect(e.store.getTask('review').feedbackEvents).toEqual([])
})

test('legacy review explains incompatibility, never loads details and preserves the old task', async () => {
  const e = reviewFixture(); const original = e.store.ensureTask('review', ['alpha'], 'cet4'); e.show()
  expect(await screen.findByRole('alert')).toHaveTextContent('旧版复习任务无法使用当前流程')
  expect(e.loader).not.toHaveBeenCalled(); expect(e.store.getTask('review')).toEqual(original)
})

test('safe lock failure shows recovery instructions and creates no assignment', async () => {
  const e = reviewFixture(); const browser = createBrowserLearningStore({ storage: e.storage, now: e.now, locks: null }); e.show(browser)
  expect(await screen.findByRole('alert')).toHaveTextContent('当前浏览器无法安全保存')
  expect(browser.getTask('review')).toBeNull(); expect(e.loader).not.toHaveBeenCalled()
})

test('saved review book and pronunciation are used despite changed settings', async () => {
  const e = reviewFixture(); const original = e.store.ensureTodayReview()
  e.store.updateSettings({ todayWordBookId: 'cet4-high-frequency', dailyReviewWords: 2, pronunciation: 'en-US' })
  e.show(); await screen.findByRole('heading', { name: 'alpha' })
  expect(e.loader.mock.lastCall[0].id).toBe('cet4'); expect(e.store.getTask('review')).toEqual(original)
  await userEvent.setup().click(known()); await screen.findByText('例句翻译')
  expect(screen.getByRole('button', { name: 'alpha 英音' })).toBeInTheDocument()
})

test('saved choices restore without new pool loading or initial count reset', async () => {
  const e = reviewFixture(); e.store.ensureTodayReview(); e.feedback('unknown'); e.advance()
  e.store.prepareReviewChoice(reviewToken(e.store.getTask('review')), [
    { word: 'delta', meaning: '第四个词' }, { word: 'alpha', meaning: '首字母；开端' }, { word: 'gamma', meaning: '第三个词' }, { word: 'beta', meaning: '测试版' },
  ])
  const original = e.store.getTask('review'), order = vi.spyOn(e.session, 'loadLearningOrder'); e.show(e.open())
  await screen.findByRole('button', { name: '测试版' }); expect(order).not.toHaveBeenCalled()
  expect(e.open().getTask('review')).toEqual(original); expect(screen.getByText('0 / 4')).toBeInTheDocument()
})

test('not-yet-due words have a distinct empty state and reentry never expands an empty assignment', async () => {
  const e = reviewFixture(); e.store.updateReview('cet4', 'alpha', { nextReviewAt: new Date(2026, 9, 3).toISOString() })
  const view = e.show(); await screen.findByRole('heading', { name: '还没有到期词' }); view.unmount()
  const original = e.store.getTask('review'); e.store.addToReview('cet4', 'beta', { nextReviewAt: new Date(2026, 8, 30).toISOString() })
  e.show(); await screen.findByRole('heading', { name: '还没有到期词' })
  expect(e.store.getTask('review')).toEqual(original); expect(e.loader).not.toHaveBeenCalled()
})

test('completed reentry keeps saved fixed assignment even with additional due words', async () => {
  const e = reviewFixture({ ids: ['alpha', 'beta'], limit: 1 }); e.store.ensureTodayReview(); e.feedback('known'); e.advance(); e.feedback('known'); e.advance()
  const original = e.store.getTask('review'); const view = e.show(); await screen.findByRole('heading', { name: '今日复习已完成' }); view.unmount()
  e.show(e.open()); await screen.findByRole('heading', { name: '今日复习已完成' })
  expect(e.open().getTask('review')).toEqual(original); expect(e.store.getReviewOverview().unassignedCount).toBe(1)
})
