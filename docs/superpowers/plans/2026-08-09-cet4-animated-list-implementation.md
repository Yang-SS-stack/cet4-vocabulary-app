# CET-4 AnimatedList Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present CET-4 word cards through AnimatedList and synchronize the CET-4 title with the return control transition.

**Architecture:** A focused `AnimatedList` renders semantic list items with Motion's staggered entrance. `VocabularyPage` remains the owner of book selection and card content, and uses matching CSS animation declarations for the title and return button.

**Tech Stack:** React 19, Vite, Vitest, Testing Library, Motion for React (`motion`).

## Global Constraints

- Keep existing word data, card copy, responsive grid, navigation, and paper palette.
- Do not create a scroll container, custom scrollbar, gradient overlay, global keyboard handler, card selection state, or reduced-motion branch.
- The CET-4 title and return-to-books button must have the identical animation declaration.
- Do not include pre-existing uncommitted changes outside the files explicitly listed below.

---

### Task 1: Add Motion and a reusable animated card list

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/components/AnimatedList.jsx`, `src/components/AnimatedList.css`, `src/components/AnimatedList.test.jsx`

**Interfaces:**
- Produces: `AnimatedList({ items, renderItem, itemKey, ariaLabel, className, itemClassName })`.
- Behavior: renders `<ul aria-label={ariaLabel}>`; each item is a `motion.li` entering from `{ opacity: 0, scale: 0.96 }` to `{ opacity: 1, scale: 1 }`, with `duration: 0.22` and delay `0.32 + index * 0.08`.

- [ ] **Step 1: Install Motion**

```powershell
npm install motion
```

Expected: `motion` is listed under `dependencies` and resolved in `package-lock.json`.

- [ ] **Step 2: Write the failing test**

```jsx
import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import AnimatedList from './AnimatedList'

test('renders each item through the supplied card renderer', () => {
  render(<AnimatedList ariaLabel="测试卡片" items={['one', 'two']} itemKey={(item) => item} renderItem={(item) => <article>{item}</article>} />)
  expect(screen.getByRole('list', { name: '测试卡片' })).toHaveClass('animated-list')
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
})
```

- [ ] **Step 3: Verify the test fails for the missing component**

```powershell
npm test -- src/components/AnimatedList.test.jsx
```

Expected: FAIL with module resolution for `./AnimatedList`.

- [ ] **Step 4: Implement the smallest component**

```jsx
import { motion } from 'motion/react'
import './AnimatedList.css'

function AnimatedList({ items, renderItem, itemKey, ariaLabel, className = '', itemClassName = '' }) {
  return <ul className={`animated-list ${className}`.trim()} aria-label={ariaLabel}>
    {items.map((item, index) => <motion.li key={itemKey(item, index)} className={`animated-list__item ${itemClassName}`.trim()} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.22, delay: 0.32 + index * 0.08 }}>{renderItem(item, index)}</motion.li>)}
  </ul>
}

export default AnimatedList
```

```css
.animated-list { margin: 0; padding: 0; list-style: none; }
.animated-list__item { min-width: 0; }
```

- [ ] **Step 5: Verify the component test passes and commit**

```powershell
npm test -- src/components/AnimatedList.test.jsx
git add package.json package-lock.json src/components/AnimatedList.jsx src/components/AnimatedList.css src/components/AnimatedList.test.jsx
git commit -m "feat: add animated card list"
```

Expected: one passing test, then one commit containing only Task 1 files.

### Task 2: Integrate the list and synchronized controls into the word-book view

**Files:**
- Modify: `src/components/VocabularyPage.jsx`, `src/components/VocabularyPage.css`
- Create: `src/components/VocabularyPage.test.jsx`

**Interfaces:**
- Consumes: `AnimatedList` and word objects with `word`, `partOfSpeech`, `phonetic`, `meaning`, `example`, and `translation`.
- Produces: `.vocabulary-book-title` and `.book-back--transition` with the shared `book-detail-enter` keyframes; word cards provided to `AnimatedList` as `<article className="vocabulary-card">`.

- [ ] **Step 1: Write the failing interaction test**

```jsx
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, test } from 'vitest'
import VocabularyPage from './VocabularyPage'

const items = [{ word: 'abandon', partOfSpeech: 'v.', phonetic: '/a/', meaning: '放弃', example: 'Abandon the plan.', translation: '放弃这个计划。' }]

test('renders animated CET-4 controls and cards after selection', async () => {
  const user = userEvent.setup()
  render(<VocabularyPage items={items} />)
  await user.click(screen.getByRole('button', { name: 'CET-4' }))
  expect(screen.getByRole('heading', { name: 'CET-4' })).toHaveClass('vocabulary-book-title')
  expect(screen.getByRole('button', { name: '返回词书' })).toHaveClass('book-back--transition')
  expect(screen.getByRole('list', { name: '四级单词' })).toHaveClass('vocabulary-list')
  expect(screen.getByText('abandon')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '返回词书' }))
  expect(screen.getByRole('heading', { name: '选择一本词书' })).toBeInTheDocument()
})
```

- [ ] **Step 2: Verify it fails for the missing transition classes**

```powershell
npm test -- src/components/VocabularyPage.test.jsx
```

Expected: FAIL because the selected-book title has no `vocabulary-book-title` class.

- [ ] **Step 3: Render cards with AnimatedList**

Add `import AnimatedList from './AnimatedList'`. Replace the selected-book static `<ul>` with:

```jsx
<AnimatedList ariaLabel="四级单词" className="vocabulary-list" items={items} itemKey={(item) => item.word} renderItem={(item) => (
  <article className="vocabulary-card">
    <div className="vocabulary-card__topline"><h3>{item.word}</h3><span>{item.partOfSpeech}</span></div>
    <p className="vocabulary-card__phonetic">{item.phonetic}</p>
    <p className="vocabulary-card__meaning">{item.meaning}</p>
    <p className="vocabulary-card__example">{item.example}</p>
    <p className="vocabulary-card__translation">{item.translation}</p>
  </article>
)} />
```

Add `book-back--transition` to the selected-book back button and `vocabulary-book-title` to its `h2`.

- [ ] **Step 4: Add the shared animation and preserve the grid**

```css
.book-back--transition,
.vocabulary-book-title { animation: book-detail-enter 420ms var(--ease-out) both; }

@keyframes book-detail-enter {
  0% { opacity: 1; transform: translateY(0); }
  42% { opacity: 0; transform: translateY(-6px); }
  100% { opacity: 1; transform: translateY(3px); }
}

.vocabulary-list > .animated-list__item { display: contents; }
```

- [ ] **Step 5: Verify the interaction test passes and commit**

```powershell
npm test -- src/components/VocabularyPage.test.jsx
git add src/components/VocabularyPage.jsx src/components/VocabularyPage.css src/components/VocabularyPage.test.jsx
git commit -m "feat: animate CET-4 word cards"
```

Expected: one passing test, then one commit containing only Task 2 files.

### Task 3: Verify the complete application

**Files:**
- Verify only: `src/components/AnimatedList.jsx`, `src/components/VocabularyPage.jsx`, `src/components/VocabularyPage.css`

- [ ] **Step 1: Run all automated tests**

```powershell
npm test
```

Expected: exit code 0 and zero failing tests.

- [ ] **Step 2: Run static checking**

```powershell
npm run lint
```

Expected: exit code 0 and no lint violations.

- [ ] **Step 3: Produce the production build**

```powershell
npm run build
```

Expected: exit code 0 and successful Vite build output.

- [ ] **Step 4: Inspect the scoped final diff**

```powershell
git diff HEAD -- package.json package-lock.json src/components/AnimatedList.jsx src/components/AnimatedList.css src/components/AnimatedList.test.jsx src/components/VocabularyPage.jsx src/components/VocabularyPage.css src/components/VocabularyPage.test.jsx
```

Expected: only the new dependency, list component, card integration, card/heading animation, and associated tests.
