# Lazy Vocabulary Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Keep the complete CET-4 vocabulary out of the initial JavaScript bundle and load each local word-book file only after the user selects it.

**Architecture:** wordBooks.js becomes a lightweight catalog with JSON URLs. A focused loadWordBook function accepts either existing inline test data or reads a JSON URL, validates the response, and returns an array. VocabularyPage owns the loading, ready, and failed states while retaining the existing cards and pagination.

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, static JSON files in Vite public/.

## Global Constraints

- CET-4 and CET-4 high-frequency data must be separate JSON files under public/data/.
- Initial production JavaScript must not import the full CET-4 list.
- The catalog, card content, page size of 20, and offline static deployment behavior stay unchanged.
- Loading failures must offer a return to the word-book catalog.
- Existing dirty working-tree changes are outside this task and must not be reverted.

---

### Task 1: Add the word-book loader contract

**Files:**
- Create: src/data/loadWordBook.js
- Create: src/data/loadWordBook.test.js

**Interfaces:**
- Consumes: a book object with either words: Array or dataUrl: string.
- Produces: loadWordBook(book, fetchImpl?), which resolves to an array of word objects or rejects with an Error.

- [ ] **Step 1: Write the failing tests**

~~~js
import { expect, test, vi } from 'vitest'
import { loadWordBook } from './loadWordBook'

test('returns inline words without requesting a data file', async () => {
  const fetchImpl = vi.fn()
  const words = await loadWordBook({ words: [{ word: 'access' }] }, fetchImpl)
  expect(words).toEqual([{ word: 'access' }])
  expect(fetchImpl).not.toHaveBeenCalled()
})

test('reads and returns a word-book JSON array', async () => {
  const fetchImpl = vi.fn().mockResolvedValue({ ok: true, json: async () => [{ word: 'access' }] })
  await expect(loadWordBook({ dataUrl: '/data/cet4.json' }, fetchImpl)).resolves.toEqual([{ word: 'access' }])
  expect(fetchImpl).toHaveBeenCalledWith('/data/cet4.json')
})

test('rejects a failed or malformed word-book response', async () => {
  await expect(loadWordBook({ dataUrl: '/missing.json' }, async () => ({ ok: false }))).rejects.toThrow('Unable to load word book')
  await expect(loadWordBook({ dataUrl: '/bad.json' }, async () => ({ ok: true, json: async () => ({}) }))).rejects.toThrow('Word book data must be an array')
})
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm.cmd test -- src/data/loadWordBook.test.js

Expected: FAIL because ./loadWordBook does not exist.

- [ ] **Step 3: Add the minimal loader**

~~~js
export async function loadWordBook(book, fetchImpl = fetch) {
  if (Array.isArray(book.words)) return book.words

  const response = await fetchImpl(book.dataUrl)
  if (!response.ok) throw new Error('Unable to load word book')

  const words = await response.json()
  if (!Array.isArray(words)) throw new Error('Word book data must be an array')
  return words
}
~~~

- [ ] **Step 4: Run the test to verify it passes**

Run: npm.cmd test -- src/data/loadWordBook.test.js

Expected: PASS with three tests.

- [ ] **Step 5: Commit the loader**

~~~text
git add src/data/loadWordBook.js src/data/loadWordBook.test.js
git commit -m "feat: add lazy word-book loader"
~~~

### Task 2: Move production word data to static JSON files

**Files:**
- Create: public/data/cet4.json
- Create: public/data/cet4-high-frequency.json
- Modify: src/data/wordBooks.js
- Modify: src/data/words.test.js

**Interfaces:**
- Consumes: src/data/words.js as the verified source list and the six existing high-frequency word names/frequencies.
- Produces: two JSON arrays and catalog records with dataUrl instead of words.

- [ ] **Step 1: Write the failing catalog test**

~~~js
test('keeps production word books as data-file references', () => {
  expect(wordBooks).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: 'cet4', dataUrl: '/data/cet4.json' }),
    expect.objectContaining({ id: 'cet4-high-frequency', dataUrl: '/data/cet4-high-frequency.json' }),
  ]))
  expect(wordBooks.every((book) => !('words' in book))).toBe(true)
})
~~~

- [ ] **Step 2: Run the test to verify it fails**

Run: npm.cmd test -- src/data/words.test.js

Expected: FAIL because catalog records currently import and expose words.

- [ ] **Step 3: Generate and validate static data**

Use the current words.js export as the source to produce public/data/cet4.json. Create public/data/cet4-high-frequency.json from access, ability, academic, anxiety, affect, and achieve with frequencies 46, 30, 25, 14, 12, 9, sorted descending. Preserve every word field.

Then change the catalog to:

~~~js
export const wordBooks = [
  { id: 'cet4', label: 'CET-4', description: '大学英语四级核心词汇', wordListLabel: '四级单词', dataUrl: '/data/cet4.json' },
  { id: 'cet4-high-frequency', label: 'CET-4高频词汇', description: '大学英语四级高频词汇', wordListLabel: '四级高频单词', dataUrl: '/data/cet4-high-frequency.json' },
]
~~~

- [ ] **Step 4: Run the data and catalog tests**

Run: npm.cmd test -- src/data/words.test.js

Expected: PASS; the source list remains 4544 unique, complete records and the catalog contains no inline word lists.

- [ ] **Step 5: Commit the data split**

~~~text
git add public/data src/data/wordBooks.js src/data/words.test.js
git commit -m "feat: move word-book data out of the bundle"
~~~

### Task 3: Load a selected word book in the page

**Files:**
- Modify: src/components/VocabularyPage.jsx
- Modify: src/components/VocabularyPage.test.jsx

**Interfaces:**
- Consumes: loadWordBook(book) and the lightweight catalog from Task 2.
- Produces: a selected-book view with loading, ready, and error states; optional loadWords prop for deterministic component tests.

- [ ] **Step 1: Write the failing interaction tests**

~~~jsx
test('loads a catalog word book only after it is selected', async () => {
  const user = userEvent.setup()
  const loadWords = vi.fn().mockResolvedValue([{ word: 'access', phonetic: '/a/', partOfSpeech: 'n', meaning: '入口', example: '', translation: '', phrases: [] }])
  render(<VocabularyPage books={[{ id: 'cet4', label: 'CET-4', description: '测试', wordListLabel: '测试单词', dataUrl: '/data/cet4.json' }]} loadWords={loadWords} />)
  expect(loadWords).not.toHaveBeenCalled()
  await user.click(screen.getByRole('button', { name: 'CET-4' }))
  expect(await screen.findByRole('heading', { name: 'access' })).toBeInTheDocument()
  expect(loadWords).toHaveBeenCalledWith(expect.objectContaining({ id: 'cet4' }))
})

test('returns to the catalog when a word book cannot be loaded', async () => {
  const user = userEvent.setup()
  render(<VocabularyPage books={[{ id: 'cet4', label: 'CET-4', description: '测试', dataUrl: '/data/cet4.json' }]} loadWords={async () => { throw new Error('failed') }} />)
  await user.click(screen.getByRole('button', { name: 'CET-4' }))
  expect(await screen.findByText('词库读取失败')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '返回词书' }))
  expect(screen.getByRole('button', { name: 'CET-4' })).toBeInTheDocument()
})
~~~

- [ ] **Step 2: Run the component test to verify it fails**

Run: npm.cmd test -- src/components/VocabularyPage.test.jsx

Expected: FAIL because VocabularyPage has no loadWords prop or loading/error state.

- [ ] **Step 3: Add the minimal page state handling**

Import loadWordBook. On selection, set the selected ID and page to 1, call loadWords(book), and store its returned array. During the unresolved promise, render 正在读取词库…; on rejection, render 词库读取失败 and a button labelled 返回词书 that clears the selected book. Use the loaded array for the existing total-pages, slice, cards, and pagination markup. Update existing injected-book tests to await the loaded view.

- [ ] **Step 4: Run the component test to verify it passes**

Run: npm.cmd test -- src/components/VocabularyPage.test.jsx

Expected: PASS, including the existing pagination and high-frequency ordering cases.

- [ ] **Step 5: Commit the page behavior**

~~~text
git add src/components/VocabularyPage.jsx src/components/VocabularyPage.test.jsx
git commit -m "feat: load vocabulary data on selection"
~~~

### Task 4: Verify the packaged result

**Files:**
- Verify only: dist/ build output

**Interfaces:**
- Consumes: Tasks 1-3.
- Produces: evidence that the JavaScript bundle does not contain the complete word list and the two JSON data files are published separately.

- [ ] **Step 1: Run the complete test suite**

Run: npm.cmd test

Expected: PASS with no failed tests.

- [ ] **Step 2: Run the code-quality check**

Run: npm.cmd run lint

Expected: exit code 0 with no errors.

- [ ] **Step 3: Build production assets**

Run: npm.cmd run build

Expected: exit code 0 and dist/data/cet4.json plus dist/data/cet4-high-frequency.json exist.

- [ ] **Step 4: Inspect generated asset types and sizes**

Run: Get-ChildItem dist/assets,dist/data -File | Select-Object Directory,Name,Length

Expected: the large CET-4 payload is a .json file under dist/data; JavaScript assets contain application code only.

- [ ] **Step 5: Commit verification-ready implementation**

~~~text
git add public/data src/data src/components
git commit -m "feat: defer vocabulary data loading"
~~~
