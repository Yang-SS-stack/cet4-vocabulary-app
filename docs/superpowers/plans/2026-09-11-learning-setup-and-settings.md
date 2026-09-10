# Prompt 2 First-Run Setup and Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Prompt 2 first-run setup dialogs, today-learning overview, settings page, recommendations, persistence, and gentle wheel-picker interactions without implementing later learning flows.

**Architecture:** Keep calculations in pure data helpers, bridge the Prompt 1 external store into React through one hook, and compose focused UI components for the overview, modal, picker, and settings page. Dialogs edit a draft and call `updateSettings` once after validation; the current settings snapshot remains unchanged until confirmation.

**Tech Stack:** React 19, browser `localStorage`, CSS scroll snap and transitions, Vitest, Testing Library, existing Vite application.

## Global Constraints

- Do not modify the existing vocabulary browsing page or word-card components.
- Do not create learning, review, or mistake tasks; those belong to Prompts 3, 4, and 7.
- Quantity wheels cover integers 1–100; study-time wheels cover 5–240 minutes in five-minute steps.
- Only one picker is expanded in a dialog; switching fields preserves the previous draft value.
- Modal entry is approximately 240 ms and exit is approximately 180 ms; reduced-motion mode removes nonessential movement.
- Research principles, product estimates, calculated recommendations, and user settings remain visibly distinct.
- Recommendations never update user settings automatically.

---

### Task 1: Recommendation and progress calculations

**Files:**
- Create: `src/data/learning/recommendations.js`
- Create: `src/data/learning/recommendations.test.js`
- Modify: `src/data/wordBooks.js`
- Modify: `src/data/wordBooks.test.js`

**Interfaces:**
- Produces: `daysUntilExam(examDate, now) -> number | null`
- Produces: `completedWordCount(snapshot, wordBookId) -> number`
- Produces: `buildLearningRecommendation(input) -> { remainingWords, daysRemaining, deadlineDailyWords, estimatedMinutes, overloaded }`
- Produces: `wordBooks[].totalWords`

- [ ] **Step 1: Write failing calculation tests**

```js
expect(daysUntilExam('2026-09-21', new Date(2026, 8, 11, 18))).toBe(10)
expect(completedWordCount(snapshot, 'cet4')).toBe(2)
expect(buildLearningRecommendation({ totalWords: 100, completedWords: 1, daysRemaining: 10, dailyNewWords: 8, dailyReviewWords: 5, dailyStudyMinutes: 20 })).toEqual({
  remainingWords: 99, daysRemaining: 10, deadlineDailyWords: 10, estimatedMinutes: 29, overloaded: true,
})
```

- [ ] **Step 2: Run the focused tests and verify missing exports fail**

Run: `npm test -- src/data/learning/recommendations.test.js src/data/wordBooks.test.js`

Expected: FAIL because `recommendations.js` and `totalWords` do not exist.

- [ ] **Step 3: Implement the pure calculations and static totals**

```js
export function buildLearningRecommendation({ totalWords, completedWords, daysRemaining, dailyNewWords = 0, dailyReviewWords = 0, dailyStudyMinutes = 0 }) {
  const remainingWords = Math.max(0, totalWords - completedWords)
  const deadlineDailyWords = daysRemaining > 0 ? Math.ceil(remainingWords / daysRemaining) : null
  const estimatedMinutes = dailyNewWords * 3 + dailyReviewWords
  return { remainingWords, daysRemaining, deadlineDailyWords, estimatedMinutes, overloaded: dailyStudyMinutes > 0 && estimatedMinutes > dailyStudyMinutes }
}
```

Add `totalWords: 4544` and `totalWords: 2000` to the two existing word-book records, with a test matching the checked-in manifests.

- [ ] **Step 4: Run the focused tests and commit**

Run: `npm test -- src/data/learning/recommendations.test.js src/data/wordBooks.test.js`

Expected: PASS.

Commit: `feat: add learning recommendation calculations`

### Task 2: React learning-store connection

**Files:**
- Create: `src/data/learning/react.js`
- Create: `src/data/learning/react.test.jsx`
- Modify: `src/data/learning/index.js`

**Interfaces:**
- Consumes: `createLearningStore()` from Prompt 1.
- Produces: `LearningStoreProvider({ store, children })` and `useLearningStore() -> { store, snapshot }`.

- [ ] **Step 1: Write a failing provider test**

```jsx
function Probe() {
  const { store, snapshot } = useLearningStore()
  return <button onClick={() => store.updateSettings({ dailyNewWords: 12 })}>{snapshot.settings.dailyNewWords ?? 'unset'}</button>
}
```

Assert that clicking the button changes `unset` to `12`.

- [ ] **Step 2: Run the test and verify the missing provider fails**

Run: `npm test -- src/data/learning/react.test.jsx`

Expected: FAIL because the React connection is absent.

- [ ] **Step 3: Implement one context and `useSyncExternalStore` subscription**

```jsx
const LearningStoreContext = createContext(null)
export function LearningStoreProvider({ store, children }) {
  return <LearningStoreContext.Provider value={store}>{children}</LearningStoreContext.Provider>
}
export function useLearningStore() {
  const store = useContext(LearningStoreContext)
  if (!store) throw new Error('Learning store is unavailable')
  return { store, snapshot: useSyncExternalStore(store.subscribe, store.getSnapshot) }
}
```

- [ ] **Step 4: Run the focused test and commit**

Run: `npm test -- src/data/learning/react.test.jsx`

Expected: PASS.

Commit: `feat: connect learning data to React`

### Task 3: Single-open wheel picker

**Files:**
- Create: `src/components/SettingsWheel.jsx`
- Create: `src/components/SettingsWheel.css`
- Create: `src/components/SettingsWheel.test.jsx`

**Interfaces:**
- Produces: `SettingsWheel({ label, value, displayValue, isOpen, onToggle, onChange, columns })`.
- `columns` is an array of `{ label, value, options: [{ value, label }] }` and supports one or three synchronized columns.

- [ ] **Step 1: Write failing interaction tests**

Render two controlled wheels and assert their compact value rows are initially visible, clicking one reveals its listbox, choosing an item calls `onChange`, and opening the second hides the first.

- [ ] **Step 2: Run the focused test and verify failure**

Run: `npm test -- src/components/SettingsWheel.test.jsx`

Expected: FAIL because `SettingsWheel` does not exist.

- [ ] **Step 3: Implement scroll-snap columns and keyboard controls**

```jsx
<button type="button" className="settings-wheel__summary" aria-expanded={isOpen} onClick={onToggle}>
  <span>{label}</span><strong>{displayValue}</strong>
</button>
{isOpen && <div className="settings-wheel__tray">{columns.map((column) => <WheelColumn key={column.label} {...column} onChange={onChange} />)}</div>}
```

Use an option button inside each snap-aligned row so mouse, touch, and keyboard users share the same selection path.

- [ ] **Step 4: Add the fixed 180 px tray and motion rules**

CSS must include `scroll-snap-type: y mandatory`, a selected center band, 240/180 ms dialog variables, and `@media (prefers-reduced-motion: reduce)` overrides.

- [ ] **Step 5: Run focused tests and commit**

Run: `npm test -- src/components/SettingsWheel.test.jsx`

Expected: PASS.

Commit: `feat: add accessible settings wheel`

### Task 4: First-run setup dialog

**Files:**
- Create: `src/components/LearningSetupModal.jsx`
- Create: `src/components/LearningSetupModal.css`
- Create: `src/components/LearningSetupModal.test.jsx`

**Interfaces:**
- Consumes: `SettingsWheel`, `wordBooks`, `buildLearningRecommendation`, `store.updateSettings`.
- Produces: `LearningSetupModal({ mode, settings, recommendation, onSave, onClose })` where mode is `learning`, `review`, or `mistakes`.

- [ ] **Step 1: Write failing mode, draft, and save tests**

Assert learning mode shows four fields, review and mistakes show one field, only one wheel is open, switching fields preserves the chosen draft, cancellation submits nothing, and saving emits one patch with all mode fields.

- [ ] **Step 2: Write the failing overload test**

Set a draft whose estimate exceeds `dailyStudyMinutes`; assert Save opens “预计约…超过…” and offers “返回调整” and “仍然保存”. Assert neither branch silently changes the draft.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- src/components/LearningSetupModal.test.jsx`

Expected: FAIL because the dialog is absent.

- [ ] **Step 4: Implement mode-specific fields and draft-only editing**

```js
const MODE_FIELDS = {
  learning: ['examDate', 'todayWordBookId', 'dailyNewWords', 'dailyStudyMinutes'],
  review: ['dailyReviewWords'],
  mistakes: ['mistakeStudyWords'],
}
```

Initialize null fields to sensible visible draft values, keep `activeField` singular, and only call `onSave(patch)` after all mode fields have values and overload confirmation has passed.

- [ ] **Step 5: Implement dialog animation, focus return, and error status**

Keep the dialog mounted during the 180 ms close state. Trap focus within the dialog, close with Escape as “暂不开始”, and render save failures in an `aria-live` status without clearing the draft.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- src/components/LearningSetupModal.test.jsx`

Expected: PASS.

Commit: `feat: add first-run learning setup dialog`

### Task 5: Today-learning overview

**Files:**
- Create: `src/components/TodayLearningPage.jsx`
- Create: `src/components/TodayLearningPage.css`
- Create: `src/components/TodayLearningPage.test.jsx`

**Interfaces:**
- Consumes: `useLearningStore`, `LearningSetupModal`, `wordBooks`, recommendation helpers.
- Produces: the Prompt 2 overview and first-run triggers.

- [ ] **Step 1: Write failing overview and trigger tests**

Assert the page renders days remaining, `未完成 / 总数`, both action buttons, the six recommendation rows, and “查看依据”. Verify missing learning fields open learning mode, missing review quota opens review mode, configured modes show the correct “流程将在下一阶段启用” status, and save updates the store.

- [ ] **Step 2: Run focused tests and verify failure**

Run: `npm test -- src/components/TodayLearningPage.test.jsx`

Expected: FAIL because the page is absent.

- [ ] **Step 3: Implement overview, recommendation card, and modal controller**

```jsx
<section className="learning-overview">
  <LearningStatusStrip daysRemaining={...} remainingWords={...} totalWords={...} />
  <div className="learning-overview__actions">
    <button onClick={() => start('learning')}>今日学习</button>
    <button onClick={() => start('review')}>今日复习</button>
  </div>
  <RecommendationCard recommendation={...} settings={snapshot.settings} />
</section>
```

- [ ] **Step 4: Run focused tests and commit**

Run: `npm test -- src/components/TodayLearningPage.test.jsx`

Expected: PASS.

Commit: `feat: add today learning setup overview`

### Task 6: Settings page and application wiring

**Files:**
- Create: `src/components/SettingsPage.jsx`
- Create: `src/components/SettingsPage.css`
- Create: `src/components/SettingsPage.test.jsx`
- Modify: `src/App.jsx`
- Modify: `src/App.css`
- Modify: `src/App.test.jsx`
- Modify: `src/test/setup.js`

**Interfaces:**
- Consumes: all earlier Prompt 2 components and the single app-level learning store.
- Produces: navigation-integrated today-learning and settings pages.

- [ ] **Step 1: Write failing settings-page tests**

Assert all seven settings rows render, only one wheel expands, changing pronunciation saves `en-US`, a later save updates only settings, and an existing daily task snapshot is not rewritten.

- [ ] **Step 2: Write failing app integration tests**

Assert the real today-learning overview replaces the placeholder, navigation to Settings renders editable fields, and returning to Vocabulary still displays the original word-book entry UI.

- [ ] **Step 3: Run focused tests and verify failure**

Run: `npm test -- src/components/SettingsPage.test.jsx src/App.test.jsx`

Expected: FAIL until both pages are wired.

- [ ] **Step 4: Implement settings editing and app-level provider**

Create one store per mounted App, wrap `LearningSurface` in `LearningStoreProvider`, render `TodayLearningPage` for “今日学习”, `SettingsPage` for “设置”, and preserve `VocabularyPage` unchanged.

- [ ] **Step 5: Apply responsive paper-style UI**

Use existing `--paper`, `--ink`, `--ink-soft`, `--gold`, and `--line` variables. Keep the large editorial heading, quiet bordered panels, mobile single-column layout, and no gradients or glass effects.

- [ ] **Step 6: Isolate browser storage between UI tests**

Add `localStorage.clear()` and mock restoration to the test cleanup so setup saved by one test cannot leak into another.

- [ ] **Step 7: Run focused tests and commit**

Run: `npm test -- src/components/SettingsPage.test.jsx src/components/TodayLearningPage.test.jsx src/App.test.jsx`

Expected: PASS.

Commit: `feat: integrate learning setup and settings pages`

### Task 7: Documentation and full verification

**Files:**
- Modify: `docs/learning-data.md`
- Modify: `README.md`

**Interfaces:**
- Documents the user-visible Prompt 2 behavior and keeps Prompt 3/4/7 boundaries explicit.

- [ ] **Step 1: Document the setup flows and calculation assumptions**

Record the three first-run modes, single-open wheel behavior, value ranges, recommendation formula, 3-minute/1-minute product estimate, local persistence, and later-Prompt exclusions.

- [ ] **Step 2: Run Prompt 2 focused tests**

Run: `npm test -- src/data/learning/recommendations.test.js src/data/learning/react.test.jsx src/components/SettingsWheel.test.jsx src/components/LearningSetupModal.test.jsx src/components/TodayLearningPage.test.jsx src/components/SettingsPage.test.jsx src/App.test.jsx`

Expected: PASS.

- [ ] **Step 3: Run the full quality gate**

Run: `npm test`

Expected: all tests PASS.

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0; the existing large audio-manifest chunk advisory is allowed.

- [ ] **Step 4: Review the final diff and commit**

Confirm no vocabulary-page or word-card file changed, no task creation was added, and only Prompt 2 files plus documentation are included.

Commit: `docs: document learning setup flow`

- [ ] **Step 5: Start and inspect the production preview**

Run the production preview for the feature branch, verify desktop and mobile layouts, all three first-run flows, picker switching, modal transitions, settings persistence, and unchanged vocabulary browsing.
