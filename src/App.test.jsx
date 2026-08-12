import { readFileSync } from 'node:fs'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test, vi } from 'vitest'
import App from './App'

vi.mock('./components/ParticleTextTransition', () => ({
  default: ({ onSourceRelease, onScatterComplete, onComplete }) => (
    <div data-testid="particle-text-transition">
      <button type="button" onClick={onSourceRelease}>开始文字拆散</button>
      <button type="button" onClick={onScatterComplete}>完成文字拆散</button>
      <button type="button" onClick={onComplete}>完成粒子过场</button>
    </div>
  ),
}))

async function waitForApp() {
  await waitFor(
    () => expect(screen.getByRole('button', { name: '今日学习' })).toBeInTheDocument(),
    { timeout: 1800 },
  )
}

async function enterApp(user) {
  await user.click(screen.getByRole('button', { name: '进入 LinguaJet' }))
  await waitForApp()
}

test('shows the LinguaJet welcome screen and opens the app after a click', async () => {
  const user = userEvent.setup()
  render(<App />)

  expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).toBeInTheDocument()
  expect(screen.getByLabelText('欢迎来到LinguaJet！很高兴见到你！')).toBeInTheDocument()
  expect(screen.getByText('点击任意处继续')).toBeInTheDocument()
  expect(screen.getByTestId('splash-waves')).toBeInTheDocument()

  await new Promise((resolve) => window.setTimeout(resolve, 1300))
  expect(screen.queryByRole('button', { name: '今日学习' })).not.toBeInTheDocument()

  await enterApp(user)
  expect(screen.getByLabelText('LinguaJet')).toBeInTheDocument()
})

test('hands the logo from the welcome screen to the particle transition', async () => {
  const user = userEvent.setup()
  render(<App />)

  await user.click(screen.getByRole('button', { name: '进入 LinguaJet' }))

  expect(screen.getByTestId('particle-text-transition')).toBeInTheDocument()
  expect(screen.getByText('LinguaJet', { exact: true })).toHaveClass('is-brand-concealed')
  expect(document.querySelector('.app-shell')).toHaveClass('is-transition-prepared')
  expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).not.toHaveClass('is-background-leaving')

  await user.click(screen.getByRole('button', { name: '开始文字拆散' }))

  expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).toHaveClass('is-particle-source-released')

  await user.click(screen.getByRole('button', { name: '完成文字拆散' }))

  expect(document.querySelector('.app-shell')).not.toHaveClass('is-transition-prepared')
  expect(screen.getByRole('main', { name: 'LinguaJet 欢迎页' })).toHaveClass('is-background-leaving')

  await user.click(screen.getByRole('button', { name: '完成粒子过场' }))

  expect(screen.queryByRole('main', { name: 'LinguaJet 欢迎页' })).not.toBeInTheDocument()
  expect(screen.getByText('LinguaJet', { exact: true })).not.toHaveClass('is-brand-concealed')
})

test('clicking vocabulary navigation shows the vocabulary page', async () => {
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(screen.getByRole('heading', { name: '词表' })).toBeInTheDocument()
})

test('vocabulary page displays the first study words', async () => {
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '词表' }))
  await user.click(screen.getByRole('button', { name: 'CET-4' }))

  expect(screen.getByRole('list', { name: '四级单词' })).toBeInTheDocument()
  const firstWord = screen.getByRole('heading', { name: 'abandon' }).closest('li')
  expect(firstWord).toHaveTextContent('abandon')
  expect(firstWord).toHaveTextContent('放弃；遗弃')
})

test('vocabulary page starts with a book list', async () => {
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
  expect(screen.queryByRole('list', { name: '四级单词' })).not.toBeInTheDocument()
})

test('vocabulary page can return from a book to the book list', async () => {
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '词表' }))
  await user.click(screen.getByRole('button', { name: 'CET-4' }))
  await user.click(screen.getByRole('button', { name: '返回词书' }))

  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
})

test('hiding navigation keeps a control for showing it again', async () => {
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '隐藏导航栏' }))

  expect(screen.getByRole('button', { name: '显示导航栏' })).toBeVisible()
})

test('hiding navigation makes the entire sidebar inert', async () => {
  const user = userEvent.setup()
  const { container } = render(<App />)
  await enterApp(user)

  await user.click(screen.getByRole('button', { name: '隐藏导航栏' }))

  const sidebar = container.querySelector('.sidebar')
  expect(sidebar).toHaveAttribute('aria-hidden', 'true')
  expect(sidebar).toHaveAttribute('inert')
})

test('navigation toggle scrolls with the application page', () => {
  const appStyles = readFileSync('src/App.css', 'utf8')

  expect(appStyles).toMatch(/\.nav-toggle\s*\{[^}]*position:\s*absolute/s)
})

test('navigation stays visible while the page scrolls', () => {
  const appStyles = readFileSync('src/App.css', 'utf8')

  expect(appStyles).toMatch(/\.sidebar\s*\{[^}]*position:\s*sticky/s)
  expect(appStyles).toMatch(/\.sidebar\s*\{[^}]*top:\s*0/s)
})

test('crossfades the splash and learning surfaces over the same duration', () => {
  const appStyles = readFileSync('src/App.css', 'utf8')
  const splashStyles = readFileSync('src/components/SplashScreen.css', 'utf8')

  expect(appStyles).toContain('opacity 1100ms var(--ease-out)')
  expect(splashStyles).toContain('transition: opacity 1100ms var(--ease-out)')
})
