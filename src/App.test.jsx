import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import App from './App'
import { createLearningStore, LEARNING_STORAGE_KEY } from './data/learning'
import { clearWordBookCache } from './data/loadWordBook'

beforeEach(() => {
  let queue = Promise.resolve()
  Object.defineProperty(navigator, 'locks', { configurable: true, value: {
    request: (_, __, work) => {
      const result = queue.then(work)
      queue = result.catch(() => {})
      return result
    },
  } })
})

vi.mock('./components/ParticleTextTransition', () => ({
  default: ({ onSourceRelease, onScatterComplete, onComplete }) => (
    <div data-testid="particle-text-transition">
      <button type="button" onClick={onSourceRelease}>开始文字拆散</button>
      <button type="button" onClick={onScatterComplete}>完成文字拆散</button>
      <button type="button" onClick={onComplete}>完成粒子过场</button>
    </div>
  ),
}))

afterEach(() => {
  vi.useRealTimers()
  localStorage.removeItem(LEARNING_STORAGE_KEY)
})

async function waitForApp() {
  await waitFor(
    () => expect(screen.getAllByRole('button', { name: '今日学习' }).length).toBeGreaterThan(0),
    { timeout: 1800 },
  )
}

async function enterApp(user) {
  await user.click(screen.getByRole('button', { name: '进入 LinguaJet' }))
  await user.click(screen.getByRole('button', { name: '完成文字拆散' }))
  await waitForApp()
  await user.click(screen.getByRole('button', { name: '完成粒子过场' }))
}

function configureFirstRun() {
  const now = new Date()
  const examDate = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate())
  const store = createLearningStore()
  store.updateSettings({
    examDate: [
      examDate.getFullYear(),
      String(examDate.getMonth() + 1).padStart(2, '0'),
      String(examDate.getDate()).padStart(2, '0'),
    ].join('-'),
    todayWordBookId: 'cet4',
    dailyNewWords: 20,
    dailyReviewWords: 20,
    dailyStudyMinutes: 30,
  })
}

test('opens one combined setup dialog only after the welcome animation finishes', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '进入 LinguaJet' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '完成粒子过场' }))

  expect(screen.getByRole('dialog', { name: '开始前，先设定你的学习计划' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^每日复习数量 / })).toBeInTheDocument()
})

test('does not reopen the first-run dialog when all five settings were saved', async () => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2030, 8, 13, 12))
  configureFirstRun()
  const user = userEvent.setup()
  render(<App />)

  await enterApp(user)

  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('shows the LinguaJet welcome screen and opens the app after a click', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)

  expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).toBeInTheDocument()
  expect(screen.getByLabelText('欢迎来到LinguaJet！很高兴见到你！')).toBeInTheDocument()
  expect(screen.getByText('点击任意处继续')).toBeInTheDocument()
  expect(screen.getByTestId('splash-waves')).toBeInTheDocument()

  await new Promise((resolve) => window.setTimeout(resolve, 1300))
  expect(screen.queryAllByRole('button', { name: '今日学习' })).toHaveLength(0)

  await enterApp(user)
  expect(screen.getByLabelText('LinguaJet')).toBeInTheDocument()
})

test('hands the logo from the welcome screen to the particle transition', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)

  await user.click(screen.getByRole('button', { name: '进入 LinguaJet' }))

  expect(screen.getByTestId('particle-text-transition')).toBeInTheDocument()
  expect(document.querySelector('.app-shell')).toHaveAttribute('inert')
  expect(document.querySelector('.app-shell')).toHaveAttribute('aria-hidden', 'true')
  expect(screen.queryByTestId('particle-logo-target')).not.toBeInTheDocument()
  expect(screen.getByText('LinguaJet', { exact: true })).toHaveClass('is-brand-concealed')
  expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).not.toHaveClass('is-background-leaving')

  await user.click(screen.getByRole('button', { name: '开始文字拆散' }))

  expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).toHaveClass('is-particle-source-released')

  await user.click(screen.getByRole('button', { name: '完成文字拆散' }))

  expect(document.querySelector('.app-shell')).toBeInTheDocument()
  expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert')
  expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).toHaveClass('is-background-leaving')

  await user.click(screen.getByRole('button', { name: '完成粒子过场' }))

  expect(screen.queryByRole('main', { name: 'LinguaJet 欢迎页' })).not.toBeInTheDocument()
  expect(screen.getByText('LinguaJet', { exact: true })).not.toHaveClass('is-brand-concealed')
})

test('a skipped particle transition still reveals a usable homepage', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)
  await user.click(screen.getByRole('button', { name: '进入 LinguaJet' }))
  await user.click(screen.getByRole('button', { name: '完成粒子过场' }))
  expect(screen.getAllByRole('button', { name: '今日学习' })[0]).toBeVisible()
  expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert')
  expect(screen.queryByRole('main', { name: 'LinguaJet 欢迎页' })).not.toBeInTheDocument()
})

test('replaces the today-learning placeholder with the real overview', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)
  await enterApp(user)

  expect(screen.getByRole('region', { name: '今日学习概览' })).toBeInTheDocument()
  expect(screen.getByText('学习建议')).toBeInTheDocument()
  expect(screen.queryByLabelText('今日学习内容')).not.toBeInTheDocument()
})

test('mounts setup dialogs outside the animated page and disables the app shell behind them', async () => {
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)

  const dialog = screen.getByRole('dialog', { name: '开始前，先设定你的学习计划' })
  expect(dialog.closest('.page-transition')).toBeNull()
  expect(dialog.parentElement?.parentElement).toBe(document.body)
  expect(document.querySelector('.app-shell')).toHaveAttribute('inert')
  expect(document.querySelector('.app-shell')).toHaveAttribute('aria-hidden', 'true')

  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  expect(document.querySelector('.app-shell')).not.toHaveAttribute('inert')
  expect(document.querySelector('.app-shell')).toHaveAttribute('aria-hidden', 'false')
  await waitFor(() => expect(screen.getByRole('heading', { name: '今日学习' })).toHaveFocus())
})

test('focuses the Today page title after canceling the automatic first-run setup', async () => {
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '暂不开始' }))

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole('heading', { name: '今日学习' })).toHaveFocus())
})

test('focuses the Today page title after saving the automatic first-run setup', async () => {
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '保存并继续' }))

  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole('heading', { name: '今日学习' })).toHaveFocus())
})

test('opens editable settings from navigation and returns to the original vocabulary entry', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '设置' }))
  expect(screen.getByRole('region', { name: '学习设置' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /^发音偏好 / })).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '词表' }))
  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: '四级单词' })).not.toBeInTheDocument()
})

test.each([
  ['broken JSON', '{broken'],
  ['an unknown version', JSON.stringify({ version: 999 })],
])('preserves %s and offers an explicit two-step recovery without blocking vocabulary access', async (_label, raw) => {
  const user = userEvent.setup()
  localStorage.setItem(LEARNING_STORAGE_KEY, raw)

  render(<App />)

  expect(screen.getByRole('alert')).toHaveTextContent('学习数据暂时无法读取')
  expect(localStorage.getItem(LEARNING_STORAGE_KEY)).toBe(raw)

  await user.click(screen.getByRole('button', { name: '继续浏览词表' }))
  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
  expect(localStorage.getItem(LEARNING_STORAGE_KEY)).toBe(raw)

  await user.click(screen.getByRole('button', { name: '清除异常学习数据' }))
  expect(screen.getByRole('alertdialog', { name: '确认清除学习数据' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '保留原始数据' })).toHaveFocus()
  expect(localStorage.getItem(LEARNING_STORAGE_KEY)).toBe(raw)

  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  expect(localStorage.getItem(LEARNING_STORAGE_KEY)).toBe(raw)

  await user.click(screen.getByRole('button', { name: '清除异常学习数据' }))

  await user.click(screen.getByRole('button', { name: '确认清除并重新开始' }))
  await waitFor(() => expect(localStorage.getItem(LEARNING_STORAGE_KEY)).toBeNull())
  await waitFor(() => expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).toBeInTheDocument())
  expect(screen.queryByText('学习数据暂时无法读取')).not.toBeInTheDocument()
})

test('does not delete valid learning data written by another tab before reset confirmation', async () => {
  const user = userEvent.setup()
  localStorage.setItem(LEARNING_STORAGE_KEY, '{broken')
  render(<App />)

  await user.click(screen.getByRole('button', { name: '清除异常学习数据' }))

  localStorage.removeItem(LEARNING_STORAGE_KEY)
  const otherTabStore = createLearningStore()
  otherTabStore.updateSettings({ dailyNewWords: 18 })
  const validRaw = localStorage.getItem(LEARNING_STORAGE_KEY)

  await user.click(screen.getByRole('button', { name: '确认清除并重新开始' }))

  await waitFor(() => expect(localStorage.getItem(LEARNING_STORAGE_KEY)).toBe(validRaw))
  await waitFor(() => expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).toBeInTheDocument())
  expect(screen.queryByText('学习数据暂时无法读取')).not.toBeInTheDocument()
})

test('refreshes recovery instead of deleting a different invalid value written elsewhere', async () => {
  const user = userEvent.setup()
  const firstRaw = '{broken'
  const nextRaw = JSON.stringify({ version: 998 })
  localStorage.setItem(LEARNING_STORAGE_KEY, firstRaw)
  render(<App />)

  await user.click(screen.getByRole('button', { name: '清除异常学习数据' }))
  localStorage.setItem(LEARNING_STORAGE_KEY, nextRaw)
  await user.click(screen.getByRole('button', { name: '确认清除并重新开始' }))

  expect(localStorage.getItem(LEARNING_STORAGE_KEY)).toBe(nextRaw)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('数据已在其他页面更新，请重新确认'))
})

test('traps recovery confirmation focus and restores it after Escape', async () => {
  const user = userEvent.setup()
  localStorage.setItem(LEARNING_STORAGE_KEY, '{broken')
  render(<App />)

  const resetTrigger = screen.getByRole('button', { name: '清除异常学习数据' })
  await user.click(resetTrigger)

  const keepButton = screen.getByRole('button', { name: '保留原始数据' })
  const confirmButton = screen.getByRole('button', { name: '确认清除并重新开始' })
  expect(keepButton).toHaveFocus()
  expect(document.querySelector('.learning-data-recovery__context')).toHaveAttribute('inert')

  await user.tab({ shift: true })
  expect(confirmButton).toHaveFocus()
  await user.tab()
  expect(keepButton).toHaveFocus()

  await user.keyboard('{Escape}')
  await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
  await waitFor(() => expect(resetTrigger).toHaveFocus())
})

test('clicking vocabulary navigation shows the vocabulary page', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(screen.getByRole('heading', { name: '词表' })).toBeInTheDocument()
})

test('vocabulary page displays the first study words', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  const assetPaths = {
    '/data/word-books/cet4/manifest.json': 'public/data/word-books/cet4/manifest.json',
    '/data/word-books/cet4/chunks/00.json': 'public/data/word-books/cet4/chunks/00.json',
    '/data/word-books/cet4/search-index.json': 'public/data/word-books/cet4/search-index.json',
  }
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: Boolean(assetPaths[url]),
    json: async () => JSON.parse(readFileSync(assetPaths[url], 'utf8')),
  })))
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '词表' }))
  await user.click(screen.getByRole('button', { name: 'CET-4' }))

  expect(await screen.findByRole('list', { name: '四级单词' })).toBeInTheDocument()
  const firstWord = await screen.findByRole('heading', { name: 'abruptly' }).then((heading) => heading.closest('li'))
  expect(firstWord).toHaveTextContent('abruptly')
  expect(firstWord).toHaveTextContent('突然')
}, 15000)

test('vocabulary page starts with a book list', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: '四级单词' })).not.toBeInTheDocument()
})

test('vocabulary page can return from a book to the book list', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '词表' }))
  await user.click(screen.getByRole('button', { name: 'CET-4' }))
  await user.click(screen.getByRole('button', { name: '返回词书' }))

  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
})

test('hiding navigation keeps a control for showing it again', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '隐藏导航栏' }))

  expect(screen.getByRole('button', { name: '显示导航栏' })).toBeVisible()
})

test('hiding navigation makes the entire sidebar inert', async () => {
  const user = userEvent.setup()
  configureFirstRun()
  const { container } = render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '隐藏导航栏' }))

  const sidebar = container.querySelector('.sidebar')
  expect(sidebar).toHaveAttribute('aria-hidden', 'true')
  expect(sidebar).toHaveAttribute('inert')
})

test('navigation toggle stays fixed in the viewport while scrolling', () => {
  const appStyles = readFileSync('src/App.css', 'utf8')

  expect(appStyles).toMatch(/\.nav-toggle\s*\{[^}]*position:\s*fixed/s)
})

test('navigation stays visible while the page scrolls', () => {
  const appStyles = readFileSync('src/App.css', 'utf8')

  expect(appStyles).toMatch(/\.sidebar\s*\{[^}]*position:\s*sticky/s)
  expect(appStyles).toMatch(/\.sidebar\s*\{[^}]*top:\s*0/s)
})

test('crossfades the splash and learning surfaces over the same duration', () => {
  const appStyles = readFileSync('src/App.css', 'utf8')
  const splashStyles = readFileSync('src/components/SplashScreen.css', 'utf8')

  expect(appStyles).toContain('opacity 700ms var(--ease-out)')
  expect(splashStyles).toContain('transition: opacity 700ms var(--ease-out)')
})

test('study and review sessions conceal navigation and return to the dashboard', async () => {
  configureFirstRun()
  clearWordBookCache()
  const assetPaths = {
    '/data/word-books/cet4/manifest.json': 'public/data/word-books/cet4/manifest.json',
    '/data/word-books/cet4/chunks/00.json': 'public/data/word-books/cet4/chunks/00.json',
    '/data/word-books/cet4/search-index.json': 'public/data/word-books/cet4/search-index.json',
  }
  vi.stubGlobal('fetch', vi.fn(async (url) => ({
    ok: Boolean(assetPaths[url]),
    json: async () => JSON.parse(readFileSync(assetPaths[url], 'utf8')),
  })))
  const sounds = []
  vi.stubGlobal('Audio', class {
    constructor(src) {
      this.src = src
      this.currentTime = 0
      this.play = vi.fn(() => Promise.resolve())
      this.pause = vi.fn()
      sounds.push(this)
    }
  })
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)
  await user.click(screen.getByRole('button', { name: '今日复习' }))
  expect(document.querySelector('.app-shell')).toHaveClass('is-study-focused')
  expect(document.querySelector('.sidebar')).toHaveAttribute('inert')
  expect(screen.queryByRole('button', { name: '隐藏导航栏' })).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  expect(document.querySelector('.app-shell')).not.toHaveClass('is-study-focused')
  const start = screen.getAllByRole('button', { name: '今日学习' }).at(-1)
  await user.click(start)
  expect(document.querySelector('.sidebar')).toHaveAttribute('inert')
  await waitFor(() => expect(sounds.some(sound => sound.play.mock.calls.length > 0)).toBe(true))
  const playing = sounds.at(-1)
  expect(playing.play).toHaveBeenCalledOnce()
  expect(playing.pause).not.toHaveBeenCalled()
  playing.currentTime = 12
  await user.click(screen.getByRole('button', { name: '返回主界面' }))
  expect(playing.pause).toHaveBeenCalledOnce()
  expect(playing.currentTime).toBe(0)
  expect(playing.onended).toBe(null)
  expect(playing.onerror).toBe(null)
  expect(document.querySelector('.app-shell')).not.toHaveClass('is-study-focused')
})
