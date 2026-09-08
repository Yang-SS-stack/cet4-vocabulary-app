# 词表首次加载优化实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** 将两本词书从运行时整本 JSON 加载改为首屏详情分片优先、搜索索引后台加载，并保持现有搜索、排序、分页、词卡和发音接口行为。

**Architecture:** 旧整本 JSON 保留为构建源。新增数据生成脚本输出每本词书的 manifest.json、轻量 search-index.json 和按默认排序切分的完整详情分片。loadWordBook 返回带会话缓存的词书加载会话，VocabularyPage 只请求当前结果页需要的详情，同时用现有词性匹配函数在整本索引上执行搜索。

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, Node.js ESM scripts, static JSON assets.

## Global Constraints

- 首次打开词书时优先显示当前页内容，搜索索引不得阻塞首屏详情。
- 中英文释义和词性搜索必须覆盖整本词书，并沿用现有 matchesWordQuery 语义。
- 保持字母排序、词频排序、每页最多 21 条、翻转、例句、词组和现有发音地址接口行为。
- 缓存当前会话已加载的清单、索引、详情分片和进行中的请求。
- 已有可展示内容不被后台加载状态替换或阻塞。
- 保留 public/data/cet4.json 和 public/data/cet4-high-frequency.json 作为构建源和回退材料。
- 不修改 SpeechButton、音频地址生成、src/data/audioManifest.json 或音频播放逻辑。
- 不引入 IndexedDB、Service Worker、新状态管理框架或大范围 React/Vite 重构。
- 每个功能步骤先补测试，再实现，再运行对应测试。
- 基线中的 audioManifest.test.js 超时问题属于本任务排除的音频范围，不在本分支修复。

---

### Task 1: 生成可按需加载的词书资源

**Files:**
- Create: scripts/build-word-book-assets.mjs
- Create: src/data/wordBookAssets.test.js
- Create: public/data/word-books/cet4/manifest.json
- Create: public/data/word-books/cet4/search-index.json
- Create: public/data/word-books/cet4/chunks/*.json
- Create: public/data/word-books/cet4-high-frequency/manifest.json
- Create: public/data/word-books/cet4-high-frequency/search-index.json
- Create: public/data/word-books/cet4-high-frequency/chunks/*.json
- Modify: package.json

**Interfaces:**
- node scripts/build-word-book-assets.mjs 读取两份旧 JSON 并生成确定性的运行时资源。
- 每个 manifest 具有 { version, total, defaultSort, initialPage, indexUrl, chunks }。
- initialPage 具有 { ids, chunkIds }，其中 ids 不超过 21 个。
- 每个索引条目具有 { word, meaning, partOfSpeech, frequency, chunkId }；orders 具有 alphabetical 和 frequency 两个单词 id 数组。
- 详情分片仍保存原始完整词条字段，包括 phonetic、example、translation、phrases 和可选的 frequency。

- [ ] **Step 1: 编写失败的资源完整性测试。**

在 src/data/wordBookAssets.test.js 中读取 public/data/word-books，检查两本词书的数量、唯一单词、manifest 总数、索引完整覆盖、有效分片引用、完整词卡字段和默认首屏顺序：

~~~js
test('generated assets cover both production word books', async () => {
  const cet4 = await readWordBookAssets('cet4')
  const highFrequency = await readWordBookAssets('cet4-high-frequency')

  expect(cet4.manifest.total).toBe(4544)
  expect(highFrequency.manifest.total).toBe(2000)
  expect(cet4.index.entries).toHaveLength(cet4.manifest.total)
  expect(highFrequency.index.entries).toHaveLength(highFrequency.manifest.total)
  expect(new Set(cet4.index.entries.map((entry) => entry.word)).size).toBe(4544)
  expect(new Set(highFrequency.index.entries.map((entry) => entry.word)).size).toBe(2000)
})
~~~

运行：

~~~text
npm test -- --run src/data/wordBookAssets.test.js
~~~

预期：失败，因为生成目录尚不存在。

- [ ] **Step 2: 实现确定性的资源生成脚本。**

在 scripts/build-word-book-assets.mjs 中定义：

~~~js
const BOOKS = [
  { id: 'cet4', input: 'public/data/cet4.json', defaultSort: 'alphabetical' },
  { id: 'cet4-high-frequency', input: 'public/data/cet4-high-frequency.json', defaultSort: 'frequency' },
]
const CHUNK_SIZE = 128
~~~

脚本必须：

1. 拒绝空单词和重复单词。
2. 使用 Intl.Collator('en', { sensitivity: 'base' }) 生成字母顺序。
3. 生成词频降序；词频相同时使用现有字母顺序；缺失词频排在最后。
4. 按每本词书默认顺序排列完整词条，再按 128 条切分详情分片。
5. 索引只保存单词、释义、词性、规范化词频和分片编号。
6. 写入 alphabetical 和 frequency 两套 id 顺序。
7. 写入默认排序的前 21 个 id 和对应 chunkIds。
8. 使用正斜杠写相对 URL，保证 Windows 和生产构建都能使用。
9. 生成固定两位数字分片名和文件末尾换行。

不得修改或删除旧 JSON。向 package.json 增加：

~~~json
"build:wordbooks": "node scripts/build-word-book-assets.mjs"
~~~

- [ ] **Step 3: 生成资源并运行聚焦测试。**

运行：

~~~text
npm run build:wordbooks
npm test -- --run src/data/wordBookAssets.test.js
~~~

预期：生成两本词书目录，资源完整性测试通过。

- [ ] **Step 4: 记录生成资源体积。**

用只读 Node 脚本记录每本词书的 manifest、search-index 和默认首屏详情分片字节数，供最终性能报告使用；不要把机器相关的时间阈值写入测试。

- [ ] **Step 5: 提交资源生成成果。**

~~~bash
git add package.json scripts/build-word-book-assets.mjs src/data/wordBookAssets.test.js public/data/word-books
git commit -m "feat: generate lazy word book assets"
~~~

### Task 2: 增加缓存的词书加载会话

**Files:**
- Create: src/data/wordBookSession.js
- Create: src/data/wordBookSession.test.js
- Modify: src/data/loadWordBook.js
- Modify: src/data/loadWordBook.test.js
- Modify: src/data/wordBooks.js
- Modify: src/data/words.test.js

**Interfaces:**
- loadWordBook(book, fetchImpl = fetch): Promise<WordBookSession>
- createInlineWordBookSession(words): WordBookSession
- WordBookSession.loadPage({ sort, page, query }): Promise<{ words, total, totalPages }>
- WordBookSession.indexReady: Promise<void>
- clearWordBookCache() 仅供测试隔离缓存。

- [ ] **Step 1: 编写失败的加载会话测试。**

覆盖以下行为：

~~~js
test('returns the first page before the background search index resolves', async () => {
  let resolveIndex
  const fetchImpl = vi.fn(async (url) => {
    if (url.endsWith('/manifest.json')) return jsonResponse(manifest)
    if (url.endsWith('/chunks/000.json')) return jsonResponse([
      { word: 'abruptly', meaning: '突然地', partOfSpeech: 'adv',
        phonetic: '/a/', example: '', translation: '', phrases: [] },
    ])
    if (url.endsWith('/search-index.json')) {
      return new Promise((resolve) => { resolveIndex = resolve })
    }
    throw new Error(`Unexpected URL: ${url}`)
  })

  const session = await loadWordBook(book, fetchImpl)
  await expect(session.loadPage({ sort: 'alphabetical', page: 1, query: '' }))
    .resolves.toMatchObject({ words: [expect.objectContaining({ word: 'abruptly' })] })
  expect(resolveIndex).toBeTypeOf('function')
})

test('reuses a session and does not refetch a completed detail chunk', async () => {
  const first = await loadWordBook(book, fetchImpl)
  const second = await loadWordBook(book, fetchImpl)
  expect(second).toBe(first)

  await first.loadPage({ sort: 'alphabetical', page: 1, query: '' })
  await first.loadPage({ sort: 'alphabetical', page: 1, query: '' })
  expect(fetchImpl).toHaveBeenCalledTimes(3)
})

test('searches the complete index and loads only the matching result page details', async () => {
  const session = await loadWordBook(book, fetchImpl)
  await expect(session.loadPage({ sort: 'alphabetical', page: 1, query: '名词' }))
    .resolves.toMatchObject({ total: 2, words: [expect.objectContaining({ word: 'apple' })] })
})
~~~

运行：

~~~text
npm test -- --run src/data/loadWordBook.test.js src/data/wordBookSession.test.js
~~~

预期：失败，因为当前加载器返回数组，且没有会话接口。

- [ ] **Step 2: 实现 manifest、索引和详情分片读取。**

在 src/data/wordBookSession.js 中集中实现排序和读取逻辑：

~~~js
const WORDS_PER_PAGE = 21
const wordOrder = new Intl.Collator('en', { sensitivity: 'base' })

function compareWords(first, second, sort) {
  if (sort === 'frequency') {
    const firstFrequency = Number.isFinite(first.frequency) && first.frequency >= 0 ? first.frequency : -1
    const secondFrequency = Number.isFinite(second.frequency) && second.frequency >= 0 ? second.frequency : -1
    if (firstFrequency !== secondFrequency) return secondFrequency - firstFrequency
  }
  return wordOrder.compare(first.word, second.word)
}
~~~

fetchJson(url, fetchImpl, message) 要检查 response.ok、JSON 解析和预期数组/对象结构。清单需要验证总数、首屏信息、索引地址和分片列表；索引需要验证唯一单词和两套排序数组。

- [ ] **Step 3: 实现远程会话的 loadPage。**

实现以下规则：

1. loadWordBook 只等待 manifest，然后返回会话。
2. 创建会话时立即启动 indexReady = fetchJson(manifest.indexUrl, ...)，但不等待它返回。
3. 默认排序、第 1 页、空搜索词直接使用 manifest.initialPage.ids 和 chunkIds。
4. 其他页码、其他排序和任何非空搜索词等待 indexReady。
5. 搜索时使用现有 matchesWordQuery 过滤完整索引，再按当前排序排序并切出当前页。
6. 无搜索词时从 index.orders[sort] 取 id 并切页。
7. 按 chunkId 分组请求详情分片，恢复为当前排序下的词条顺序。
8. 返回 totalPages = Math.max(1, Math.ceil(total / 21))。
9. 详情分片缺少索引要求的 id 时抛出错误，不返回不相关或不完整结果。

缓存 manifest 会话、index Promise 和每个详情分片 Promise。失败的缓存项要移除，以便用户重试。

- [ ] **Step 4: 实现内存数组适配器。**

createInlineWordBookSession(words) 提供同样的 loadPage 和 indexReady，但直接对传入数组过滤、排序、切页，绝不调用 fetch，以保留现有组件测试方式。

- [ ] **Step 5: 切换生产词书到 manifest。**

把 src/data/wordBooks.js 的两个 dataUrl 改为：

~~~js
'/data/word-books/cet4/manifest.json'
'/data/word-books/cet4-high-frequency/manifest.json'
~~~

更新 src/data/words.test.js 验证生成资源覆盖全部词条，同时保留旧 JSON 的来源数据检查。

- [ ] **Step 6: 运行数据层测试并提交。**

~~~text
npm test -- --run src/data/loadWordBook.test.js src/data/wordBookSession.test.js src/data/wordBookAssets.test.js src/data/words.test.js
~~~

预期：全部通过，且音频文件和音频清单没有变化。

~~~bash
git add src/data/loadWordBook.js src/data/loadWordBook.test.js src/data/wordBookSession.js src/data/wordBookSession.test.js src/data/wordBooks.js src/data/words.test.js
git commit -m "feat: add cached lazy word book sessions"
~~~

### Task 3: 让 VocabularyPage 使用按页会话

**Files:**
- Modify: src/components/VocabularyPage.jsx
- Modify: src/components/VocabularyPage.test.jsx
- Modify: src/components/VocabularyPage.css

**Interfaces:**
- 组件继续接受 books 和 loadWords。
- loadWords(book) 可返回新会话或旧数组；旧数组通过 createInlineWordBookSession 适配。
- WordCard 继续接收原有完整词条对象和 showFrequency。

- [ ] **Step 1: 编写延迟索引和局部加载的失败测试。**

新增一个索引 Promise 可延迟、首屏立即返回的假会话，并测试：

~~~js
test('shows the first page while the search index is still loading', async () => {
  const session = deferredIndexSession([{ ...browseWords[0], word: 'abruptly' }])
  const user = userEvent.setup()
  render(<VocabularyPage books={[catalogBook]} loadWords={async () => session} />)
  await user.click(screen.getByRole('button', { name: 'CET-4', exact: true }))

  expect(await screen.findByRole('heading', { name: 'abruptly' })).toBeInTheDocument()
  expect(screen.getByText('正在准备搜索')).toBeInTheDocument()
})

test('uses the complete index for Chinese and POS search', async () => {
  const user = await openSessionBook({ session: searchableSession([
    { ...browseWords[0], word: 'apple', meaning: '苹果', partOfSpeech: 'n' },
    { ...browseWords[0], word: 'listen', meaning: '听', partOfSpeech: 'vi' },
    { ...browseWords[0], word: 'take', meaning: '拿', partOfSpeech: 'n/vt' },
  ]) })
  await user.type(screen.getByRole('searchbox'), '不及物动词')

  expect(visibleWordNames()).toEqual(['listen'])
  expect(screen.getByText('找到 1 个单词')).toBeInTheDocument()
})
~~~

运行：

~~~text
npm test -- --run src/components/VocabularyPage.test.jsx
~~~

预期：失败，因为当前组件要求一次性完整数组。

- [ ] **Step 2: 替换整本数组状态为会话和页面数据状态。**

保留当前的动画 ref、焦点恢复和过渡逻辑，增加：

~~~js
const [bookSession, setBookSession] = useState(null)
const [pageData, setPageData] = useState({ words: [], total: 0, totalPages: 1 })
const [pageLoadState, setPageLoadState] = useState('idle')
const [indexState, setIndexState] = useState('loading')
const [pageError, setPageError] = useState(null)
~~~

选择词书时继续淡出并重置搜索、排序和页码；拿到会话后监听 indexReady，同时请求第一页。首个详情页成功后立刻进入可浏览状态，不等待索引。首屏请求失败才显示整页错误状态。

- [ ] **Step 3: 实现带请求编号保护的统一页面请求。**

增加 requestPage({ session, sort, page, query })，负责设置局部 loading、调用 session.loadPage、检查当前请求编号/词书/排序/搜索词/页码，成功后更新 pageData，失败后保留已有词卡并设置 pageError。搜索、排序、上一页、下一页和初次打开全部经过此路径。

VocabularyPage 不再执行 matchesWordQuery、.sort 和 .slice；这些操作全部由会话完成。

- [ ] **Step 4: 保留现有展示和交互契约。**

保留现有文案、按钮名称、21 条上限、卡片 props、翻转、例句、词组、发音按钮、过渡时长、减少动态效果行为和焦点恢复。把结果统计改为使用 pageData.total，分页使用 pageData.totalPages。

在筛选区增加局部可读状态：

~~~jsx
{indexState === 'loading' && <p className="vocabulary-load-status">正在准备搜索</p>}
{indexState === 'error' && <p className="vocabulary-load-status">搜索索引读取失败，词卡浏览仍可继续。</p>}
{pageLoadState === 'loading' && pageData.words.length > 0 && (
  <p className="vocabulary-load-status">正在加载当前结果...</p>
)}
{pageError && (
  <p className="vocabulary-load-status vocabulary-load-status--error">
    当前结果加载失败，请重试或返回词书。
  </p>
)}
~~~

后台索引或后续页面加载时不能用整页 loading 替换已有列表；只有清单或首屏详情失败时才使用现有整页错误表面。

- [ ] **Step 5: 运行组件测试并提交页面集成。**

~~~text
npm test -- --run src/components/VocabularyPage.test.jsx src/components/WordCard.test.jsx
~~~

预期：既有搜索、排序、分页、过渡、卡片测试和新增延迟索引测试全部通过。

~~~bash
git add src/components/VocabularyPage.jsx src/components/VocabularyPage.test.jsx src/components/VocabularyPage.css
git commit -m "feat: load vocabulary pages on demand"
~~~

### Task 4: 补充状态样式、数据说明和范围审计

**Files:**
- Modify: README.md
- Modify: src/components/VocabularyPage.css
- Modify: src/components/VocabularyPage.test.jsx

- [ ] **Step 1: 编写失败的状态测试。**

覆盖后续页面 loading 时保留已有卡片、索引失败时保留可浏览卡片：

~~~js
test('keeps visible cards while a later page is loading', async () => {
  const session = deferredPageSession()
  const user = await openSessionBook({ session })
  expect(visibleWordNames()).toEqual(['abruptly'])

  await user.click(screen.getByRole('button', { name: '下一页' }))

  expect(screen.getByRole('heading', { name: 'abruptly' })).toBeInTheDocument()
  expect(screen.getByText('正在加载当前结果...')).toBeInTheDocument()
})

test('reports an index failure without removing browseable cards', async () => {
  const session = searchableSession([{ ...browseWords[0], word: 'abruptly' }], { rejectIndex: true })
  await openSessionBook({ session })

  expect(screen.getByRole('heading', { name: 'abruptly' })).toBeInTheDocument()
  expect(await screen.findByText('搜索索引读取失败，词卡浏览仍可继续。')).toBeInTheDocument()
})
~~~

- [ ] **Step 2: 添加最小 CSS。**

使用现有颜色变量给 .vocabulary-load-status 设置紧凑字号、柔和文字色和错误色；不改变词卡、筛选器和分页布局。

- [ ] **Step 3: 更新 README。**

说明旧 JSON 仍是源文件，npm run build:wordbooks 会重新生成 public/data/word-books，运行时请求的是 manifest、搜索索引和详情分片。

- [ ] **Step 4: 运行聚焦测试并审计修改边界。**

~~~text
npm test -- --run src/components/VocabularyPage.test.jsx src/data/loadWordBook.test.js src/data/wordBookSession.test.js src/data/wordBookAssets.test.js
git diff --name-only main...HEAD
~~~

预期：聚焦测试通过；修改文件不包含 SpeechButton、audioManifest.json、音频文件或音频播放代码。

- [ ] **Step 5: 提交文档和状态成果。**

~~~bash
git add README.md src/components/VocabularyPage.css src/components/VocabularyPage.test.jsx
git commit -m "docs: explain lazy word book assets"
~~~

### Task 5: 完整验证、性能对比和最终分支审计

- [ ] **Step 1: 运行完整测试。**

~~~text
npm test -- --reporter=verbose
~~~

记录通过/失败数量；如果 src/data/audioManifest.test.js 仍超时，记录它是已知基线问题，并保留完整错误信息。

- [ ] **Step 2: 运行规范检查和生产构建。**

~~~text
npm run lint
npm run build
~~~

预期：两者退出码均为 0，dist/data/word-books 含两本词书的 manifest、索引和详情分片。

- [ ] **Step 3: 验证生产资源边界。**

检查以下文件存在：

~~~text
dist/data/word-books/cet4/manifest.json
dist/data/word-books/cet4/search-index.json
dist/data/word-books/cet4-high-frequency/manifest.json
dist/data/word-books/cet4-high-frequency/search-index.json
~~~

同时确认 wordBooks 指向 manifest，运行时没有请求旧整本 JSON 路径。

- [ ] **Step 4: 手动验收用户行为。**

运行 npm run preview 后检查：

1. 词书目录正常打开。
2. CET-4 首屏词卡先于搜索准备完成显示。
3. 高频词书默认按词频降序显示。
4. 中文、英文、n.、vt.、vi. 和中文词性搜索覆盖整本词书。
5. 空结果、少于 21 条结果、最后一页、字母排序和词频排序正确。
6. 首次进入未加载页有局部提示，再次进入不重复请求。
7. 卡片仍可翻转，例句、词组和英音/美音按钮仍存在。
8. 返回词书列表并重新进入词书不会出现错误的整页等待。

记录旧整本 JSON 与新 manifest 加首屏详情分片的体积，以及实际首张词卡出现时间；没有实际测量就不宣称具体改善数字。

- [ ] **Step 5: 审查最终 diff 和提交历史。**

~~~text
git status --short --branch
git diff --check
git log --oneline --decorate main..HEAD
git diff --name-only main...HEAD
~~~

预期：工作区干净、分支仍为 codex/optimize-wordbook-loading、没有排除范围的音频改动，也没有合入或推送。

- [ ] **Step 6: 仅在需要时提交最终性能记录。**

如果 README 增加了实际性能测量结果，提交：

~~~bash
git add README.md
git commit -m "docs: record word book loading verification"
~~~

如果没有新增记录，不创建空提交。最终报告包含提交号、首屏改善、手动验收步骤、已知音频超时和剩余限制。

## Plan Self-Review

- 规格覆盖：数据拆分、搜索索引、首屏优先、整本搜索、排序、分页、卡片详情、缓存、加载/失败状态、音频排除范围、测试、规范检查、构建和手动验收均有对应任务。
- 占位符检查：没有要求实现者自行补充的 TBD、TODO 或未定义步骤。
- 接口一致性：远程和内存会话都实现 loadPage 与 indexReady；VocabularyPage 可接受会话或旧数组；WordCard 继续接收完整词条。
- 范围检查：只改数据生成、词书加载会话、词表页面状态/展示、相关测试、文档和生成资源。
- 基线说明：音频清单超时被明确列为验证记录，不会被误当成本任务新引入的失败。
