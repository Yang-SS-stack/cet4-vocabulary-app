# Task 2 report: React learning-store connection

## Summary

Added the React boundary for the existing learning store. `LearningStoreProvider` supplies a caller-created store, and `useLearningStore` returns that store with a live external-store snapshot. The public learning-data entry point re-exports both APIs. No page, word-book browser, word card, or learning/review/mistake task behavior was changed.

## Files

- Created `src/data/learning/react.js`
- Created `src/data/learning/react.test.jsx`
- Modified `src/data/learning/index.js`

## RED evidence

Command:

```text
npm test -- src/data/learning/react.test.jsx
```

Result: failed as expected before implementation because Vite could not resolve `./react` from `src/data/learning/react.test.jsx` (`Does the file exist?`).

## GREEN evidence

Command:

```text
npm test -- src/data/learning/react.test.jsx
```

Result: passed — 1 test file, 1 test passed. The probe initially rendered `unset`; after its click called the existing `store.updateSettings({ dailyNewWords: 12 })` API, its subscribed snapshot rendered `12`.

## Verification

- `git diff --check`: passed (no whitespace errors)
- Focused test: passed — 1 test file, 1 test
- Attempted `npm test`: did not finish within the 30-second command window; the observed output reported pre-existing failures in `src/components/particleMotion.test.js` and `src/data/audioManifest.test.js`. They are outside the files changed for this task.

## Self-review

- One context is used; the hook fails clearly outside its provider.
- `useSyncExternalStore` receives the existing store's `subscribe` and `getSnapshot` methods directly.
- Settings writes remain routed through `updateSettings`; no store state is mutated by React code.
- JSX was avoided in `react.js` because the required `.js` extension is parsed without JSX support; `createElement` preserves the same provider behavior.

## Commit

`0d85a945e5d6a92190fbce6f2d9f9e1d1ea2dd47` — `feat: connect learning data to React`

## Concerns

The full repository suite has unrelated observed failures and did not complete during the available command window. The focused Task 2 regression test passes.
