# 线上音频路径与音频索引按需加载 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复 GitHub Pages 子路径下的音频地址，并将约 1 MB 的音频索引从首页主脚本移出，在进入具体词书后才加载。

**Architecture:** 新增一个音频数据边界模块，使用动态导入读取 `audioManifest.json`，并在加载完成时基于 `import.meta.env.BASE_URL` 转换清单内的每个音频地址。`VocabularyPage` 在选择具体词书时并行启动音频索引加载，把可选索引传给 `WordCard`；索引未就绪或失败时传入 `null`，让现有 `SpeechButton` 继续使用浏览器语音兜底。

**Tech Stack:** React 19、Vite 8、Vitest 4、Testing Library、现有 `SpeechButton` 音频/浏览器语音实现。

## Global Constraints

- 只在 `C:\Users\29864\Documents\单词学习软件\.worktrees\audio-path-lazy-manifest` 独立工作区和 `codex/audio-path-lazy-manifest` 分支修改。
- 不合入 `main`，不推送远程仓库。
- 首页和未进入具体词书时不得动态加载或解析 `src/data/audioManifest.json`。
- 进入具体词书后才启动音频索引加载；索引未就绪时词卡必须可读、可翻转。
- 保留英音 Sonia、美音 Jenny、例句美音 Jenny、播放中止、错误提示和浏览器语音兜底。
- 不改变词库搜索、排序、分页、翻转及每页 21 张逻辑。
- 所有新增行为先写失败测试，再实现最小代码。

---

### Task 1: 建立音频路径转换与动态加载边界

**Files:**
- Create: `src/data/audioManifest.js`
- Modify: `src/data/audioManifest.test.js`

**Interfaces:**
- Produces `resolveAudioPath(path, baseUrl = import.meta.env.BASE_URL)`, returning an unchanged empty value or a path with exactly one base URL prefix.
- Produces `loadAudioManifest()`, returning a cached Promise of `{ ...manifest, words }`, where each word audio path is converted with `resolveAudioPath`.
- `loadAudioManifest()` must reset its cached Promise after rejection so a later word-book entry can retry.

- [ ] **Step 1: Write the failing path tests**

Append tests to `src/data/audioManifest.test.js`:

```js
import { loadAudioManifest, resolveAudioPath } from './audioManifest'

test('adds the GitHub Pages base path to an audio URL', () => {
  expect(resolveAudioPath('/audio/sonia-jenny/words/en-US/apple.mp3', '/cet4-vocabulary-app/'))
    .toBe('/cet4-vocabulary-app/audio/sonia-jenny/words/en-US/apple.mp3')
})

test('keeps local audio URLs rooted at the local site', () => {
  expect(resolveAudioPath('/audio/sonia-jenny/words/en-US/apple.mp3', '/'))
    .toBe('/audio/sonia-jenny/words/en-US/apple.mp3')
})

test('loads the manifest lazily and reuses the resolved result', async () => {
  const first = await loadAudioManifest()
  const second = await loadAudioManifest()

  expect(second).toBe(first)
  expect(first.words.apple['en-GB']).toMatch(/^\/audio\/sonia-jenny\/words\/en-GB\/apple\.mp3$/)
})
```

Keep the existing raw JSON integrity test: the source manifest should continue storing portable `/audio/...` paths, while the loader is responsible for adding the deployment prefix.

- [ ] **Step 2: Run the focused test and verify it fails for the expected reason**

Run:

```powershell
npm test -- src/data/audioManifest.test.js
```

Expected: FAIL because `src/data/audioManifest.js` and its exported functions do not exist yet.

- [ ] **Step 3: Implement the smallest loader**

Create `src/data/audioManifest.js`:

```js
let manifestPromise

export function resolveAudioPath(path, baseUrl = import.meta.env.BASE_URL) {
  if (!path) return path
  const normalizedBaseUrl = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`
  return `${normalizedBaseUrl}${path.replace(/^\/+/, '')}`
}

function resolveManifest(manifest) {
  return {
    ...manifest,
    words: Object.fromEntries(Object.entries(manifest.words ?? {}).map(([word, files]) => [
      word,
      Object.fromEntries(Object.entries(files ?? {}).map(([type, path]) => [
        type,
        resolveAudioPath(path),
      ])),
    ])),
  }
}

export function loadAudioManifest() {
  if (!manifestPromise) {
    manifestPromise = import('./audioManifest.json')
      .then(({ default: manifest }) => resolveManifest(manifest))
      .catch((error) => {
        manifestPromise = null
        throw error
      })
  }
  return manifestPromise
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
npm test -- src/data/audioManifest.test.js
```

Expected: all tests in that file pass, including the base-path cases and the cached dynamic load.

- [ ] **Step 5: Commit the data boundary**

```powershell
git add src/data/audioManifest.js src/data/audioManifest.test.js
git commit -m "feat: lazy-load audio manifest with base paths"
```

### Task 2: Start audio loading only after a word book is selected

**Files:**
- Modify: `src/components/VocabularyPage.jsx`
- Test: `src/components/VocabularyPage.test.jsx`

**Interfaces:**
- `VocabularyPage` accepts an optional `loadAudio` prop defaulting to `loadAudioManifest`, so the behavior is testable without forcing tests to import the full manifest.
- `VocabularyPage` passes `audioManifest={audioManifest}` to every `WordCard`.
- `audioManifest` is `null` before a book selection, while a book is loading, and after an audio-index failure; it becomes the resolved manifest only for the current selection.

- [ ] **Step 1: Add a deferred-loader test**

Add a small deferred helper and test to `src/components/VocabularyPage.test.jsx`:

```js
function deferred() {
  let resolve
  let reject
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

test('does not load audio before a word book is selected and keeps cards usable while it loads', async () => {
  const user = userEvent.setup()
  const audio = deferred()
  const loadWords = vi.fn().mockResolvedValue([{
    word: 'apple', phonetic: '/ˈæpəl/', partOfSpeech: 'n', meaning: '苹果',
    example: 'I ate an apple.', translation: '我吃了一个苹果。', phrases: [],
  }])
  const loadAudio = vi.fn(() => audio.promise)

  render(
    <VocabularyPage
      books={[{ id: 'cet4', label: 'CET-4', description: '测试词书', wordListLabel: '测试单词', words: [] }]}
      loadWords={loadWords}
      loadAudio={loadAudio}
    />,
  )

  expect(loadAudio).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'CET-4' }))

  expect(loadAudio).toHaveBeenCalledOnce()
  expect(await screen.findByRole('heading', { name: 'apple' })).toBeInTheDocument()

  const front = screen.getByRole('group', { name: 'apple，查看详情' })
  await user.click(front)
  expect(screen.getByRole('region', { name: 'apple 的详情' })).toBeInTheDocument()
})

test('keeps the word book usable when the audio index fails', async () => {
  const user = userEvent.setup()
  render(
    <VocabularyPage
      books={[{ id: 'cet4', label: 'CET-4', description: '测试词书', wordListLabel: '测试单词', words: [] }]}
      loadWords={async () => [{ word: 'apple', meaning: '苹果', example: '', translation: '', phrases: [] }]}
      loadAudio={async () => { throw new Error('audio index failed') }}
    />,
  )

  await user.click(screen.getByRole('button', { name: 'CET-4' }))
  expect(await screen.findByRole('heading', { name: 'apple' })).toBeInTheDocument()
  await user.click(screen.getByRole('group', { name: 'apple，查看详情' }))
  expect(screen.getByRole('region', { name: 'apple 的详情' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
npm test -- src/components/VocabularyPage.test.jsx
```

Expected: FAIL because `VocabularyPage` does not accept/use `loadAudio` and does not yet pass a manifest to cards.

- [ ] **Step 3: Add the loader prop and audio state**

Update imports and the component signature:

```js
import { loadAudioManifest } from '../data/audioManifest'

function VocabularyPage({ books = wordBooks, loadWords = loadWordBook, loadAudio = loadAudioManifest }) {
  const [audioManifest, setAudioManifest] = useState(null)
```

In `selectBook`, create the audio result alongside the existing word result:

```js
const audioResult = Promise.resolve().then(() => loadAudio()).then(
  (loadedAudio) => ({ loadedAudio }),
  () => ({ error: true }),
)
```

When the selected book state is reset, also call `setAudioManifest(null)`. After the existing word result is applied, apply the audio result only when the request id is still current:

```js
const { loadedAudio } = await audioResult
if (loadRequestId.current !== requestId) return
setAudioManifest(loadedAudio ?? null)
```

Pass the state through the card map:

```jsx
<WordCard
  item={item}
  audioManifest={audioManifest}
  showFrequency={selectedBookId === 'cet4-high-frequency'}
  key={item.word}
/>
```

Do not add a blocking loading state for audio; the existing word loading state remains the only visible loading state.

- [ ] **Step 4: Run the focused tests and verify they pass**

Run:

```powershell
npm test -- src/components/VocabularyPage.test.jsx
```

Expected: all vocabulary page tests pass, including the new deferred and failure cases.

- [ ] **Step 5: Commit the page-level loading behavior**

```powershell
git add src/components/VocabularyPage.jsx src/components/VocabularyPage.test.jsx
git commit -m "feat: load audio index when opening a word book"
```

### Task 3: Make word cards consume an optional resolved manifest

**Files:**
- Modify: `src/components/WordCard.jsx`
- Test: `src/components/WordCard.test.jsx`

**Interfaces:**
- `WordCard({ item, audioManifest = null, showFrequency = true })` remains backward-compatible for existing direct uses.
- Audio lookup is null-safe: `audioManifest?.words?.[item.word.toLowerCase()]`.
- `SpeechButton` receives the same `src` values as before when the manifest is ready, and receives `undefined` while it is not ready.

- [ ] **Step 1: Add a ready-manifest audio test**

Add a test to `src/components/WordCard.test.jsx` using the existing audio mock pattern:

```js
test('uses resolved audio URLs after the manifest becomes available', async () => {
  const synthesis = { speak: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(text) { this.text = text } })
  class AudioMock {
    static last
    constructor(src) {
      this.src = src
      this.play = vi.fn(() => Promise.resolve())
      this.pause = vi.fn()
      this.currentTime = 0
      AudioMock.last = this
    }
  }
  window.Audio = AudioMock
  const user = userEvent.setup()

  render(<WordCard item={word} audioManifest={{ words: {
    absorb: {
      'en-GB': '/cet4-vocabulary-app/audio/sonia-jenny/words/en-GB/absorb.mp3',
      'en-US': '/cet4-vocabulary-app/audio/sonia-jenny/words/en-US/absorb.mp3',
      example: '/cet4-vocabulary-app/audio/sonia-jenny/examples/en-US/example.mp3',
    },
  } }} />)

  await user.click(screen.getByRole('button', { name: 'absorb 英音' }))
  expect(AudioMock.last.src).toBe('/cet4-vocabulary-app/audio/sonia-jenny/words/en-GB/absorb.mp3')
  expect(AudioMock.last.play).toHaveBeenCalledOnce()
})
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
npm test -- src/components/WordCard.test.jsx
```

Expected: FAIL because `WordCard` still statically imports the manifest and does not accept the injected prop.

- [ ] **Step 3: Replace the static import with a null-safe prop**

Remove the JSON import and update the component:

```js
export default function WordCard({ item, audioManifest = null, showFrequency = true }) {
  // existing state and derived values remain unchanged
  const audio = audioManifest?.words?.[item.word.toLowerCase()]
```

Keep every existing `SpeechButton` prop, label, language, active state, and `src` mapping unchanged apart from reading from the optional prop.

- [ ] **Step 4: Run the WordCard and SpeechButton tests together**

Run:

```powershell
npm test -- src/components/WordCard.test.jsx src/components/SpeechButton.test.jsx
```

Expected: all existing and new tests pass; no existing speech cancellation or fallback behavior changes.

- [ ] **Step 5: Commit the card integration**

```powershell
git add src/components/WordCard.jsx src/components/WordCard.test.jsx
git commit -m "feat: make word cards use lazy audio data"
```

### Task 4: Run full verification and measure the production result

**Files:**
- No production source changes expected.
- Inspect: `dist/index.html`, `dist/assets/*.js`, and generated dynamic audio-manifest chunk after the build.

- [ ] **Step 1: Run the full test suite**

```powershell
npm test
```

Expected: 16 test files pass with 0 failures; the total test count is at least the 65-test baseline plus the new coverage.

- [ ] **Step 2: Run code quality checks**

```powershell
npm run lint
```

Expected: exit code 0 and no lint errors.

- [ ] **Step 3: Build production assets**

```powershell
npm run build
```

Expected: exit code 0, an entry JavaScript file substantially smaller than the 1,202,454-byte baseline, and a separate asset/chunk containing the lazy audio manifest.

- [ ] **Step 4: Record the entry-size comparison**

Read the script referenced by `dist/index.html` and record its byte size alongside the baseline `1,202,454` bytes. Also record the generated audio-manifest chunk size separately; do not add it to the homepage entry size.

- [ ] **Step 5: Run a production preview for manual checks**

```powershell
npm run preview -- --host 127.0.0.1
```

In a browser, verify:

1. Opening the homepage does not request the audio-manifest chunk.
2. Opening the 词表 page but staying on the book list does not request the chunk.
3. Clicking CET-4 requests the chunk and still shows readable, flippable cards while it is pending.
4. After the chunk is loaded, clicking 英音/美音/例句 creates requests under `/audio/...` locally.
5. On GitHub Pages, the same requests include `/cet4-vocabulary-app/audio/...` and return successfully.

- [ ] **Step 6: Check the isolated branch before handoff**

```powershell
git status --short --branch
git log --oneline -5
```

Expected: only intended implementation commits and any generated ignored build output; no merge, push, or changes in the original `main` worktree.
