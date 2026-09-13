# Unified First-Run Learning Setup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the separate click-triggered learning and review setup dialogs with one post-welcome first-run dialog whose new-word and time values react to the exam plan while remaining user-editable.

**Architecture:** Keep recommendation arithmetic in the existing pure learning recommendation module, and add one small draft-synchronization module shared by the first-run dialog and Settings page. `App` owns the one-session decision to show the dialog only after the welcome animation finishes; the dialog continues to use the existing portal, focus trap, one-wheel-at-a-time interaction, and atomic `updateSettings` save.

**Tech Stack:** React 19, Vite 8, Vitest 4, Testing Library, existing browser-local learning store, existing `SettingsWheel` component.

## Global Constraints

- Scope is Prompt 2 only; do not implement Prompt 3 learning tasks, Prompt 4 review tasks, or the Prompt 7 mistake notebook page.
- Show the combined first-run dialog only after the welcome particle animation completes.
- The combined dialog fields are exam date, learning word book, daily new words, daily review words, and daily study minutes.
- Keep every picker collapsed initially and allow only one picker tray at a time.
- Estimate one new word as 60 seconds and one review word as 20 seconds; round the total upward to a 5-minute picker value.
- Recalculate new words and study minutes after an exam-date or word-book change; recalculate study minutes after a new-word or review-count change.
- Preserve a manual study-minute choice until one of its upstream date, book, new-word, or review values changes.
- Clamp the suggested new-word setting to 1–100 and show a cannot-finish warning when the uncapped deadline requirement exceeds 100.
- Reject saving an exam date that is today or in the past.
- Keep the current 5–240 minute picker in 5-minute increments and the 1–100 word-count picker.
- Do not modify `src/components/VocabularyPage.jsx`, `src/components/WordCard.jsx`, or their styles.
- Do not install or invoke `finesse-ui` during this implementation.

---

### Task 1: Centralize the new recommendation arithmetic

**Files:**
- Modify: `src/data/learning/recommendations.js`
- Test: `src/data/learning/recommendations.test.js`

**Interfaces:**
- Produces: `estimateDailyStudyMinutes(dailyNewWords: number, dailyReviewWords: number): number`.
- Produces: `buildLearningRecommendation(input)` with new fields `recommendedDailyWords: number | null` and `exceedsDailyWordLimit: boolean` while retaining `remainingWords`, `daysRemaining`, `deadlineDailyWords`, `estimatedMinutes`, and `overloaded`.
- Consumes: existing `daysUntilExam` and `completedWordCount` behavior without changing their signatures.

- [ ] **Step 1: Write failing tests for 60-second/20-second timing and 5-minute ceiling**

```js
import {
  buildLearningRecommendation,
  completedWordCount,
  daysUntilExam,
  estimateDailyStudyMinutes,
} from './recommendations'

test('rounds the 60-second new-word and 20-second review estimate up to five minutes', () => {
  expect(estimateDailyStudyMinutes(13, 20)).toBe(20)
  expect(estimateDailyStudyMinutes(24, 20)).toBe(35)
  expect(estimateDailyStudyMinutes(1, 1)).toBe(5)
  expect(estimateDailyStudyMinutes(0, 0)).toBe(0)
})

test('caps the editable recommendation at 100 without hiding the deadline requirement', () => {
  expect(buildLearningRecommendation({
    totalWords: 4544,
    completedWords: 0,
    daysRemaining: 44,
    dailyNewWords: 100,
    dailyReviewWords: 100,
    dailyStudyMinutes: 100,
  })).toEqual({
    remainingWords: 4544,
    daysRemaining: 44,
    deadlineDailyWords: 104,
    recommendedDailyWords: 100,
    exceedsDailyWordLimit: true,
    estimatedMinutes: 135,
    overloaded: true,
  })
})
```

- [ ] **Step 2: Run the focused test and verify the new expectations fail**

Run: `npm test -- src/data/learning/recommendations.test.js --maxWorkers=1`

Expected: FAIL because `estimateDailyStudyMinutes` and the two new recommendation fields do not exist and the old estimate still uses 3 minutes/1 minute.

- [ ] **Step 3: Implement the shared arithmetic**

```js
export const MAX_DAILY_NEW_WORDS = 100
const FIVE_MINUTES_IN_SECONDS = 5 * 60

export function estimateDailyStudyMinutes(dailyNewWords, dailyReviewWords) {
  const seconds = Math.max(0, dailyNewWords) * 60 + Math.max(0, dailyReviewWords) * 20
  return seconds === 0 ? 0 : Math.ceil(seconds / FIVE_MINUTES_IN_SECONDS) * 5
}

export function buildLearningRecommendation({
  totalWords,
  completedWords,
  daysRemaining,
  dailyNewWords = 0,
  dailyReviewWords = 0,
  dailyStudyMinutes = 0,
}) {
  const remainingWords = Math.max(0, totalWords - completedWords)
  const deadlineDailyWords = daysRemaining > 0 ? Math.ceil(remainingWords / daysRemaining) : null
  const recommendedDailyWords = deadlineDailyWords === null
    ? null
    : Math.min(MAX_DAILY_NEW_WORDS, Math.max(1, deadlineDailyWords))
  const exceedsDailyWordLimit = deadlineDailyWords !== null && deadlineDailyWords > MAX_DAILY_NEW_WORDS
  const estimatedMinutes = estimateDailyStudyMinutes(dailyNewWords, dailyReviewWords)
  return {
    remainingWords,
    daysRemaining,
    deadlineDailyWords,
    recommendedDailyWords,
    exceedsDailyWordLimit,
    estimatedMinutes,
    overloaded: dailyStudyMinutes > 0 && estimatedMinutes > dailyStudyMinutes,
  }
}
```

- [ ] **Step 4: Update the existing recommendation expectation and run the focused tests**

Replace the existing recommendation assertion with:

```js
test('builds a recommendation from progress and the shared time estimate', () => {
  expect(buildLearningRecommendation({
    totalWords: 100,
    completedWords: 1,
    daysRemaining: 10,
    dailyNewWords: 8,
    dailyReviewWords: 5,
    dailyStudyMinutes: 20,
  })).toEqual({
    remainingWords: 99,
    daysRemaining: 10,
    deadlineDailyWords: 10,
    recommendedDailyWords: 10,
    exceedsDailyWordLimit: false,
    estimatedMinutes: 10,
    overloaded: false,
  })
})
```

Run: `npm test -- src/data/learning/recommendations.test.js --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit the arithmetic change**

```bash
git add src/data/learning/recommendations.js src/data/learning/recommendations.test.js
git commit -m "feat: update daily learning time estimates"
```

---

### Task 2: Add one shared draft-linking policy

**Files:**
- Create: `src/components/setupDraft.js`
- Create: `src/components/setupDraft.test.js`

**Interfaces:**
- Consumes: `daysUntilExam`, `completedWordCount`, `buildLearningRecommendation`, and `estimateDailyStudyMinutes` from Task 1.
- Consumes: `wordBooks` from `src/data/wordBooks.js`.
- Produces: `synchronizeSetupDraft({ draft, changedField, snapshot, now }): object` returning a new draft.
- Produces: `setupPlanStatus({ draft, snapshot, now }): { invalidExamDate, exceedsDailyWordLimit, deadlineDailyWords, recommendedDailyWords }`.
- Produces: `initialSetupComplete(settings): boolean` using the five first-run fields and current picker ranges.

- [ ] **Step 1: Write failing pure-function tests**

```js
import { expect, test } from 'vitest'
import { initialSetupComplete, setupPlanStatus, synchronizeSetupDraft } from './setupDraft'

const snapshot = {
  settings: {},
  wordBooks: {},
  mistakes: {},
  days: {},
}

test('links an exam change to the suggested count and rounded time', () => {
  const draft = synchronizeSetupDraft({
    draft: {
      examDate: '2026-12-12',
      todayWordBookId: 'cet4',
      dailyNewWords: 15,
      dailyReviewWords: 20,
      dailyStudyMinutes: 30,
    },
    changedField: 'examDate',
    snapshot,
    now: new Date(2026, 8, 13, 10),
  })

  expect(draft.dailyNewWords).toBe(51)
  expect(draft.dailyStudyMinutes).toBe(60)
})

test('links either word count to time but preserves a manual time edit', () => {
  const base = {
    examDate: '2026-12-12', todayWordBookId: 'cet4',
    dailyNewWords: 13, dailyReviewWords: 20, dailyStudyMinutes: 45,
  }
  expect(synchronizeSetupDraft({
    draft: base, changedField: 'dailyNewWords', snapshot, now: new Date(2026, 8, 13),
  }).dailyStudyMinutes).toBe(20)
  expect(synchronizeSetupDraft({
    draft: base, changedField: 'dailyStudyMinutes', snapshot, now: new Date(2026, 8, 13),
  }).dailyStudyMinutes).toBe(45)
})

test('reports past dates and uncapped plans', () => {
  const status = setupPlanStatus({
    draft: {
      examDate: '2026-09-13', todayWordBookId: 'cet4',
      dailyNewWords: 100, dailyReviewWords: 20, dailyStudyMinutes: 110,
    },
    snapshot,
    now: new Date(2026, 8, 13, 10),
  })
  expect(status.invalidExamDate).toBe(true)
})

test('requires all five supported first-run fields', () => {
  const complete = {
    examDate: '2027-09-13', todayWordBookId: 'cet4', dailyNewWords: 20,
    dailyReviewWords: 20, dailyStudyMinutes: 30,
  }
  expect(initialSetupComplete(complete)).toBe(true)
  expect(initialSetupComplete({ ...complete, dailyReviewWords: null })).toBe(false)
})
```

- [ ] **Step 2: Run the new test and verify it fails**

Run: `npm test -- src/components/setupDraft.test.js --maxWorkers=1`

Expected: FAIL because `setupDraft.js` does not exist.

- [ ] **Step 3: Implement the pure synchronization module**

```js
import { wordBooks } from '../data/wordBooks'
import {
  buildLearningRecommendation,
  completedWordCount,
  daysUntilExam,
  estimateDailyStudyMinutes,
} from '../data/learning/recommendations'

export const INITIAL_SETUP_FIELDS = [
  'examDate', 'todayWordBookId', 'dailyNewWords', 'dailyReviewWords', 'dailyStudyMinutes',
]

const countValid = (value) => Number.isSafeInteger(value) && value >= 1 && value <= 100
const minutesValid = (value) => Number.isSafeInteger(value)
  && value >= 5 && value <= 240 && value % 5 === 0

export function setupPlanStatus({ draft, snapshot, now }) {
  const book = wordBooks.find(({ id }) => id === draft.todayWordBookId) ?? wordBooks[0]
  const daysRemaining = daysUntilExam(draft.examDate, now)
  const recommendation = buildLearningRecommendation({
    totalWords: book.totalWords,
    completedWords: completedWordCount(snapshot, book.id),
    daysRemaining,
    dailyNewWords: draft.dailyNewWords,
    dailyReviewWords: draft.dailyReviewWords,
    dailyStudyMinutes: draft.dailyStudyMinutes,
  })
  return {
    invalidExamDate: !Number.isFinite(daysRemaining) || daysRemaining <= 0,
    exceedsDailyWordLimit: recommendation.exceedsDailyWordLimit,
    deadlineDailyWords: recommendation.deadlineDailyWords,
    recommendedDailyWords: recommendation.recommendedDailyWords,
  }
}

export function synchronizeSetupDraft({ draft, changedField, snapshot, now }) {
  const next = { ...draft }
  if (changedField === 'examDate' || changedField === 'todayWordBookId') {
    const status = setupPlanStatus({ draft: next, snapshot, now })
    if (!status.invalidExamDate && status.recommendedDailyWords !== null) {
      next.dailyNewWords = status.recommendedDailyWords
    }
  }
  if (['examDate', 'todayWordBookId', 'dailyNewWords', 'dailyReviewWords'].includes(changedField)) {
    next.dailyStudyMinutes = estimateDailyStudyMinutes(next.dailyNewWords, next.dailyReviewWords)
  }
  return next
}

export function initialSetupComplete(settings) {
  const validDate = typeof settings.examDate === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(settings.examDate)
    && Number.isFinite(Date.parse(`${settings.examDate}T00:00:00`))
  return validDate
    && wordBooks.some(({ id }) => id === settings.todayWordBookId)
    && countValid(settings.dailyNewWords)
    && countValid(settings.dailyReviewWords)
    && minutesValid(settings.dailyStudyMinutes)
}
```

- [ ] **Step 4: Run the pure-function tests**

Run: `npm test -- src/components/setupDraft.test.js --maxWorkers=1`

Expected: PASS.

- [ ] **Step 5: Commit the draft policy**

```bash
git add src/components/setupDraft.js src/components/setupDraft.test.js
git commit -m "feat: add linked setup draft policy"
```

---

### Task 3: Convert the first-run dialog to one linked five-field form

**Files:**
- Modify: `src/components/LearningSetupModal.jsx`
- Modify: `src/components/LearningSetupModal.css`
- Test: `src/components/LearningSetupModal.test.jsx`

**Interfaces:**
- Consumes: `synchronizeSetupDraft` and `setupPlanStatus` from Task 2.
- Changes: `LearningSetupModal` accepts `mode="initial"`, `snapshot`, and optional `now`; `mode="mistakes"` remains available for Prompt 7.
- Produces: an initial save patch containing exactly `examDate`, `todayWordBookId`, `dailyNewWords`, `dailyReviewWords`, and `dailyStudyMinutes`.

- [ ] **Step 1: Replace mode tests with a failing combined-dialog test**

```jsx
test('shows all five first-run settings and the visible estimate explanation', () => {
  renderModal({ mode: 'initial' })

  expect(screen.getByRole('dialog', { name: '开始前，先设定你的学习计划' })).toBeInTheDocument()
  expect(summary('考试日期')).toBeInTheDocument()
  expect(summary('学习词表')).toBeInTheDocument()
  expect(summary('每日新词')).toBeInTheDocument()
  expect(summary('每日复习数量')).toBeInTheDocument()
  expect(summary('每日学习时长')).toBeInTheDocument()
  expect(screen.getByText(/每个新词约 1 分钟、每个复习词约 20 秒/)).toBeVisible()
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Add failing interaction tests for linked values and save validation**

```jsx
test('recalculates time from count changes but still allows a final manual time choice', async () => {
  const user = userEvent.setup()
  renderModal({ mode: 'initial' })

  await user.click(summary('每日新词'))
  await user.click(screen.getByRole('option', { name: '13 词' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 20 分钟')

  await user.click(summary('每日学习时长'))
  await user.click(screen.getByRole('option', { name: '30 分钟' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 30 分钟')
})

test('blocks a non-future exam date and preserves the draft', async () => {
  const user = userEvent.setup()
  const onSave = vi.fn()
  renderModal({
    mode: 'initial',
    now: new Date(2026, 8, 13, 10),
    settings: { ...baseSettings, examDate: '2026-09-13' },
    onSave,
  })

  await user.click(screen.getByRole('button', { name: '保存并继续' }))
  expect(screen.getByRole('status')).toHaveTextContent('请选择未来的考试日期')
  expect(onSave).not.toHaveBeenCalled()
})
```

- [ ] **Step 3: Run the modal tests and verify they fail for the old split modes**

Run: `npm test -- src/components/LearningSetupModal.test.jsx --maxWorkers=1`

Expected: FAIL because `initial` is unsupported, the review field is absent, and the explanatory copy is absent.

- [ ] **Step 4: Implement the combined mode and linked change handler**

Update the mode definition and change path as follows, retaining the existing timers, portal, focus trap, Escape behavior, and one-wheel switching logic:

```jsx
const MODE_FIELDS = {
  initial: ['examDate', 'todayWordBookId', 'dailyNewWords', 'dailyReviewWords', 'dailyStudyMinutes'],
  mistakes: ['mistakeStudyWords'],
}

const MODE_COPY = {
  initial: {
    title: '开始前，先设定你的学习计划',
    description: '这些设置随时可以在“设置”页修改',
  },
  mistakes: {
    title: '开始前，先设定错题本计划',
    description: '先选择每天计划学习的错题数量',
  },
}

const changeField = (field, value, columnLabel) => {
  setError('')
  setShowOverload(false)
  setDraft((current) => {
    const changed = field === 'examDate'
      ? { ...current, examDate: changeDatePart(current.examDate, columnLabel, value) }
      : { ...current, [field]: value }
    const next = mode === 'initial'
      ? synchronizeSetupDraft({ draft: changed, changedField: field, snapshot, now })
      : changed
    draftRef.current = next
    return next
  })
}
```

Create the initial draft by normalizing the five fields, defaulting review to 20, and then calling `synchronizeSetupDraft` with `changedField: 'examDate'` so a fresh dialog immediately shows the date-derived count and rounded time:

```js
function createDraft(mode, settings, snapshot, now) {
  const normalized = {
    ...settings,
    examDate: normalizeExamDate(settings.examDate),
    todayWordBookId: normalizeWordBookId(settings.todayWordBookId),
    dailyNewWords: normalizeWordCount(settings.dailyNewWords, 15),
    dailyReviewWords: normalizeWordCount(settings.dailyReviewWords, 20),
    dailyStudyMinutes: normalizeStudyMinutes(settings.dailyStudyMinutes),
    mistakeStudyWords: normalizeWordCount(settings.mistakeStudyWords, 20),
  }
  return mode === 'initial'
    ? synchronizeSetupDraft({ draft: normalized, changedField: 'examDate', snapshot, now })
    : normalized
}
```

- [ ] **Step 5: Add date/limit messages and calculation explanation**

Render these messages after the field list and before overload confirmation:

```jsx
<p className="learning-setup-modal__estimate-note">
  预计时间按每个新词约 1 分钟、每个复习词约 20 秒计算，结果向上取整到 5 分钟；你仍可自行调整。
</p>
{planStatus.exceedsDailyWordLimit && (
  <p className="learning-setup-modal__plan-warning" role="status">
    按当前日期和剩余词量，考试前可能无法完成，请调整考试日期或学习计划。
  </p>
)}
```

Before overload handling in `save`, reject `planStatus.invalidExamDate` with `请选择未来的考试日期。`. Keep the existing save-failure, closing animation, and focus behavior.

- [ ] **Step 6: Keep the dialog compact on desktop and mobile**

Add only scoped styles for `.learning-setup-modal__estimate-note` and `.learning-setup-modal__plan-warning`; reuse existing type, border, and spacing tokens. Verify the fifth collapsed row fits without increasing the wheel tray height and that the modal continues to use its existing maximum-height scrolling.

- [ ] **Step 7: Run the modal tests and commit**

Run: `npm test -- src/components/LearningSetupModal.test.jsx --maxWorkers=1`

Expected: PASS, including the existing one-wheel, scroll-settlement, focus, animation, error, and mistake-mode coverage.

```bash
git add src/components/LearningSetupModal.jsx src/components/LearningSetupModal.css src/components/LearningSetupModal.test.jsx
git commit -m "feat: combine first-run learning settings"
```

---

### Task 4: Open the dialog after the welcome animation instead of from action buttons

**Files:**
- Modify: `src/App.jsx`
- Modify: `src/App.test.jsx`
- Modify: `src/components/TodayLearningPage.jsx`
- Modify: `src/components/TodayLearningPage.test.jsx`

**Interfaces:**
- Consumes: `initialSetupComplete` from Task 2.
- Consumes: the `mode="initial"` dialog from Task 3.
- Changes: `TodayLearningPage` action buttons only show the Prompt 3/4 unavailable status and never own first-run dialog state.
- Produces: one automatic setup decision after `finishParticleTransition`, with cancel suppressing the dialog for the rest of that page session and refresh checking again.

- [ ] **Step 1: Write failing App tests for the exact appearance timing**

```jsx
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
  const store = createLearningStore()
  store.updateSettings({
    examDate: '2027-09-13', todayWordBookId: 'cet4', dailyNewWords: 20,
    dailyReviewWords: 20, dailyStudyMinutes: 30,
  })
  const user = userEvent.setup()
  render(<App />)
  await enterApp(user)
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
```

- [ ] **Step 2: Replace TodayLearningPage setup tests with a failing no-trigger test**

```jsx
test('leaves first-run setup to the app entry and keeps later flows disabled', async () => {
  const user = userEvent.setup()
  const store = createStore()
  renderPage(store)

  await user.click(screen.getByRole('button', { name: '今日学习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('学习流程将在下一阶段启用')

  await user.click(screen.getByRole('button', { name: '今日复习' }))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('复习流程将在下一阶段启用')
})
```

- [ ] **Step 3: Run the focused integration tests and verify failure**

Run: `npm test -- src/App.test.jsx src/components/TodayLearningPage.test.jsx --maxWorkers=1`

Expected: FAIL because the dialog still opens from action buttons and does not open automatically after the welcome animation.

- [ ] **Step 4: Move modal ownership into `LearningApp`**

Add `showInitialSetup` state and set it only in `finishParticleTransition` after checking the store snapshot:

```jsx
const [showInitialSetup, setShowInitialSetup] = useState(false)

const finishParticleTransition = useCallback(() => {
  setIsLearningRevealed(true)
  setParticleSources(null)
  setShowSplash(false)
  setShowInitialSetup(!initialSetupComplete(learningStore.getSnapshot().settings))
}, [learningStore])
```

Inside `LearningStoreProvider`, render the existing surface and the portal dialog:

```jsx
{showInitialSetup && (
  <InitialLearningSetup onClose={() => setShowInitialSetup(false)} />
)}
```

`InitialLearningSetup` must call `useLearningStore()`, pass `snapshot`, `snapshot.settings`, and `mode="initial"` into `LearningSetupModal`, and save through `store.updateSettings(patch)`. Keeping `showInitialSetup` true until the modal's existing close callback finishes preserves the exit animation.

```jsx
function InitialLearningSetup({ onClose }) {
  const { store, snapshot } = useLearningStore()
  return (
    <LearningSetupModal
      mode="initial"
      settings={snapshot.settings}
      snapshot={snapshot}
      onSave={(patch) => store.updateSettings(patch)}
      onClose={onClose}
    />
  )
}
```

- [ ] **Step 5: Remove modal state and validation from TodayLearningPage**

Replace `start` with status-only behavior and remove `LearningSetupModal`, `LEARNING_FIELDS`, and their validators:

```jsx
const start = (mode) => {
  setStatus(mode === 'learning'
    ? '学习流程将在下一阶段启用。'
    : '复习流程将在下一阶段启用。')
}
```

- [ ] **Step 6: Seed complete settings in unrelated App tests**

Add this helper and call it before rendering tests that need to navigate behind the automatic dialog:

```js
function configureFirstRun() {
  const store = createLearningStore()
  store.updateSettings({
    examDate: '2027-09-13', todayWordBookId: 'cet4', dailyNewWords: 20,
    dailyReviewWords: 20, dailyStudyMinutes: 30,
  })
}
```

Do not seed the new first-run timing test. Update the existing portal/inert test so it asserts the automatically opened dialog instead of clicking “今日学习”.

- [ ] **Step 7: Run the integration tests and commit**

Run: `npm test -- src/App.test.jsx src/components/TodayLearningPage.test.jsx --maxWorkers=1`

Expected: PASS.

```bash
git add src/App.jsx src/App.test.jsx src/components/TodayLearningPage.jsx src/components/TodayLearningPage.test.jsx
git commit -m "feat: open setup after the welcome transition"
```

---

### Task 5: Apply the same live rules to Settings and Today recommendations

**Files:**
- Modify: `src/components/SettingsPage.jsx`
- Modify: `src/components/SettingsPage.test.jsx`
- Modify: `src/components/TodayLearningPage.jsx`
- Modify: `src/components/TodayLearningPage.test.jsx`

**Interfaces:**
- Consumes: `synchronizeSetupDraft` and `setupPlanStatus` from Task 2.
- Consumes: the updated recommendation result from Task 1.
- Changes: `SettingsPage` accepts optional `now = new Date()` for deterministic tests.
- Produces: identical time and deadline output in first-run setup, Settings, and Today overview after save.

- [ ] **Step 1: Write failing Settings tests for linked draft behavior**

```jsx
test('recalculates study minutes when either word count changes', async () => {
  const user = userEvent.setup()
  renderPage(createStore(), new Date(2026, 8, 13, 10))

  await user.click(summary('每日新词数量'))
  await user.click(screen.getByRole('option', { name: '13 词' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 20 分钟')

  await user.click(summary('每日复习数量'))
  await user.click(screen.getByRole('option', { name: '1 词' }))
  expect(summary('每日学习时长')).toHaveAccessibleName('每日学习时长 15 分钟')
})

test('does not save a date that is today or earlier', async () => {
  const user = userEvent.setup()
  const store = createStore()
  store.updateSettings({ examDate: '2026-09-13' })
  renderPage(store, new Date(2026, 8, 13, 10))
  await user.click(screen.getByRole('button', { name: '保存设置' }))
  expect(screen.getByRole('status')).toHaveTextContent('请选择未来的考试日期')
})
```

Change the test helper to pass the injectable clock:

```jsx
function renderPage(store, now = new Date(2026, 8, 11, 10)) {
  return render(
    <LearningStoreProvider store={store}>
      <SettingsPage now={now} />
    </LearningStoreProvider>,
  )
}
```

- [ ] **Step 2: Update Today recommendation expectations before implementation**

For 12 new words and 7 reviews, change `约 43 分钟` to `约 15 分钟`. Replace the non-numeric “研究建议：新词” row with a concise “学习方法建议” row, and add an over-limit fixture that checks the raw “考试目标需要” value, the capped personalized “系统建议” value of 100, and the cannot-finish warning text:

```jsx
test('separates an impossible raw deadline from the capped editable suggestion', () => {
  const store = createStore()
  configure(store, { examDate: '2026-09-12', dailyNewWords: 100, dailyStudyMinutes: 110 })
  renderPage(store)

  expect(screen.getByText('每天 4,544 词')).toBeInTheDocument()
  expect(screen.getByText('每天 100 词')).toBeInTheDocument()
  expect(screen.getByText(/考试前可能无法完成/)).toBeInTheDocument()
})
```

- [ ] **Step 3: Run the focused tests and verify failure**

Run: `npm test -- src/components/SettingsPage.test.jsx src/components/TodayLearningPage.test.jsx --maxWorkers=1`

Expected: FAIL because Settings does not yet synchronize fields and Today still uses the old recommendation shape and estimate.

- [ ] **Step 4: Link Settings changes through the shared policy**

After producing the direct field change, call the shared policy exactly as in the modal:

```jsx
const changed = field === 'examDate'
  ? { ...current, examDate: changeDatePart(current.examDate, columnLabel, value) }
  : { ...current, [field]: value }
const next = synchronizeSetupDraft({ draft: changed, changedField: field, snapshot, now })
```

Use `setupPlanStatus` during save to reject today/past exam dates and to show the same over-100 warning. Replace the local `dailyNewWords * 3 + dailyReviewWords` expression with `estimateDailyStudyMinutes` so overload decisions use the shared formula.

- [ ] **Step 5: Distinguish raw deadline calculation from the capped system suggestion on Today**

Render the recommendation rows with separate values:

```jsx
const deadlinePlan = recommendation.deadlineDailyWords === null
  ? '设置未来考试日期后计算'
  : `每天 ${formatNumber(recommendation.deadlineDailyWords)} 词`
const systemPlan = recommendation.recommendedDailyWords === null
  ? '设置未来考试日期后计算'
  : `每天 ${formatNumber(recommendation.recommendedDailyWords)} 词`
```

Render “学习方法建议” as method guidance only: use spaced learning and active recall, and prioritize due reviews. Do not present a fixed daily quantity as a research result. When `exceedsDailyWordLimit` is true, render the same cannot-finish warning near the recommendation rows. Keep “用户当前设置” sourced from saved settings, not the recommendation, and add a short plan result that explains whether the current setting meets the deadline requirement.

- [ ] **Step 6: Run focused tests and commit**

Run: `npm test -- src/components/SettingsPage.test.jsx src/components/TodayLearningPage.test.jsx --maxWorkers=1`

Expected: PASS.

```bash
git add src/components/SettingsPage.jsx src/components/SettingsPage.test.jsx src/components/TodayLearningPage.jsx src/components/TodayLearningPage.test.jsx
git commit -m "feat: link settings to learning recommendations"
```

---

### Task 6: Complete regression and production-preview verification

**Files:**
- Modify only if a verified defect is found in the Prompt 2 files already listed above.
- Do not modify vocabulary page or word-card files.

**Interfaces:**
- Consumes: all completed behavior from Tasks 1–5.
- Produces: a clean Prompt 2 branch ready for user acceptance.

- [ ] **Step 1: Run all automated tests serially**

Run: `npm test -- --maxWorkers=1`

Expected: all test files and tests PASS with no unhandled errors.

- [ ] **Step 2: Run code-quality and production-build checks**

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run build`

Expected: exit code 0. The existing large audio-manifest chunk warning is allowed; new warnings are not.

- [ ] **Step 3: Verify the protected vocabulary boundary**

Run:

```bash
git diff --name-only 4c5f527..HEAD -- \
  src/components/VocabularyPage.jsx \
  src/components/VocabularyPage.css \
  src/components/WordCard.jsx \
  src/components/WordCard.css
```

Expected: no output.

- [ ] **Step 4: Inspect a clean first-run production preview**

Start the production preview on a new local port so prior `localStorage` cannot suppress first-run behavior. Verify at desktop and 390×844 mobile sizes:

1. Welcome page appears without the setup dialog.
2. The setup dialog appears immediately after the welcome animation completes.
3. All five summaries are collapsed and only one picker tray opens at a time.
4. The 1-minute/20-second explanation remains visible.
5. Date/book changes recalculate count and time; count changes recalculate time; a final manual time selection remains.
6. A one-day deadline caps new words at 100 and shows the warning.
7. Today/past dates cannot save.
8. Save closes smoothly, persists all five fields, and does not reappear after reload.
9. Cancel closes smoothly without saving and the dialog returns after a full reload.
10. Settings and Today show the same saved count and time estimate.
11. Background navigation is inert while the dialog is open.

- [ ] **Step 5: Commit only verified final corrections**

If Step 4 finds a scoped defect, first add a failing automated test, make the smallest correction, rerun Tasks 6.1–6.4, and commit only the affected Prompt 2 files:

```bash
git add \
  src/App.jsx src/App.test.jsx \
  src/components/LearningSetupModal.jsx src/components/LearningSetupModal.css \
  src/components/LearningSetupModal.test.jsx \
  src/components/SettingsPage.jsx src/components/SettingsPage.test.jsx \
  src/components/TodayLearningPage.jsx src/components/TodayLearningPage.test.jsx \
  src/components/setupDraft.js src/components/setupDraft.test.js \
  src/data/learning/recommendations.js src/data/learning/recommendations.test.js
git commit -m "fix: finish unified learning setup"
```

If no defect is found, do not create an empty commit.
