# P-02 review interface handoff

Date: 2026-09-30. Workspace: `C:/Users/29864/.codex/worktrees/p02-today-review/单词学习软件`. Branch: `codex/p02-today-review`. Data baseline: `66f8a7fd9f3dd4febf57cef6ffebce617e0a24c7`.

Implementation commit: `dffbea81eb6408a11b1a7e2cfc1b5480a42e9c7e` (`feat: add guided today review interface`). This report is committed separately. No push, merge, data-engine changes, other agents, full-suite run, or memory writes.

## Implementation and ownership

Production files under `src/components/`:

- `LearningSession.jsx`: narrowly extends existing session with `initialMode='review'`. Existing daily/extra props stay supported. Adds review setup, command routing, four-count progress, Chinese question, saved review schedule, review correction, review empty/error/exit text and audio lifecycle gates.
- `ReviewSession.jsx`: five-line wrapper selecting review mode, forwards `onExit`, `loadBook`, and `animateEntry`.
- `TodayLearningPage.jsx`: replaces review placeholder; routes through existing `enter('review')` guard and transition; restores review-entry focus; uses real overview data and saved task book; changes overdue wording to respect the configured quantity.
- `StudyTransition.jsx`: optional `waitForEntry=false` prop. Review opts in to its existing 240ms entry completion before `onReady`. Existing learning remains on the default timing. Reduced motion reports ready immediately; stale timers are cancelled.
- `LearningSession.css`: one Chinese-title rule, inherited font, 20–30px responsive size, 1.5 line height, 22dvh maximum with scrolling and existing scrollbar colors. Footer/body flex layout remains intact.

Tests: new `ReviewSession.test.jsx`, `ReviewAudioExit.test.jsx`, reusable `reviewTestFixture.jsx`; extends `StudyEntry.test.jsx` and updates/adds `TodayLearningPage.test.jsx`. `App.test.jsx` was not modified.

Existing uncommitted controller files under `docs/` were neither edited nor staged by this task. `docs/p02-ui-report.md` is the only documentation file this task creates.

## Actual data contract used

All calls use the actual delivered store methods; no generic feedback/progress mutation is used for review:

| Method/read | UI use |
| --- | --- |
| `ensureTodayReview(date, store.getSnapshot().settings)` | First async operation on entry/retry. Assignment and reconciliation happen before requesting the book. Existing assignment is preserved. |
| `getTask('review')` / `snapshot.days[loaded.date].review` | Exit counts before details are ready; live saved view/count/choices/event state after loading. |
| `prepareReviewChoice(token, options)` | Count0 question only, when no saved choice. Uses existing `learningChoices` and existing pool loading. |
| `submitReviewChoice(token, selectedWord|null)` | Meaning option or show-answer. Engine owns feedback/count/view. |
| `revealReviewDetails(token)` | Continue after selected-choice feedback. |
| `submitReviewFeedback(token, 'known'|'fuzzy'|'unknown')` | Count1–3 self feedback. |
| `correctReviewFeedback(token)` | Revealed eligible positive feedback only. |
| `advanceReview(token)` | Next word/round, including transition to task completion. |
| `canCorrectReviewFeedback(task)` | Eligibility button uses actual exported helper. |
| `getReviewOverview()` | Uses `bookId`, `dueCount`, `taskCount`, `completedCount`, `unassignedCount`, `needsReconciliation`. Never writes from overview. |
| `getWord(bookId, wordId)` | Completed details read persisted `review.nextReviewAt`. Incomplete details show `继续复习本词`. |
| `getToday`, `getSnapshot`, `reload`, provider subscription | Clock guards, settings capture, explicit conflict reload, live renders. |

Token is rebuilt for every action from the displayed task: `{date:task.date,itemId:task.currentItemId,revision:task.sessionRevision}`. Review item IDs are compound book/word identities; word content uses `task.items[id].wordId`. No UI count mutation or reinitialization to2 occurs.

Setup loads the saved task's `wordBookId` and calls `session.loadWords(task.itemIds.map(id => task.items[id].wordId))`. `loadLearningOrder()` is **not** used for assignment. It is only used to build the existing four-choice distraction pool, capped at80. Saved choices skip pool loading and retain engine order. The API's browser-lock constructor is imported directly from `data/learning/browserStore` in a lock-failure test; it is not exported by `data/learning/index`.

## Behavior and reuse verified

- New due count2→English word question; positive feedback reveals full details/count3; next question displays Chinese meaning; positive completes/count4 and full details return. Unknown resets to0 and repeats choices, English example, English word, Chinese recall. Fuzzy moves back one stage.
- Chinese question contains no English answer, phonetic, example, speech status or replay/pronunciation controls. Heading uses `lang='zh-CN'`. Full English/details return only on saved feedback. During outgoing160ms transition the old frame is inert/aria-hidden; the new interactive Chinese frame contains no old answer.
- Details retain existing meanings, phonetic/part of speech, translated examples, phrases, both accents and example playback. English stage title stays anchored for feedback/body transitions. Chinese versus English title uses a whole-word frame change.
- Persisted completion details remain reopenable and correctable4→3. Correction displays the confirmation, stays on full details, persists once, and restores the engine schedule. After advancing out of final details, currentItemId=null shows completed task offline and requires neither book nor audio. Finished reentry never creates more assignments even when unassigned due words remain.
- Empty settings, no learned words, no due words, completed task, failed book/details load and incompatible legacy task have distinct messages. Legacy method:null is preserved and never interpreted as the new four-round flow.
- Setup failure leaves the durable assignment available to retry. Storage failure leaves the question and count unchanged. Other-tab changes require explicit reload. Midnight rejects yesterday's answer and restarts review, never daily learning. Safe-lock failure offers browser recovery. Settings-change errors route back through review setup.
- Existing speech owner/queue/cancellation is reused: count0/2 word; count1 word→example; details word→example. Manual pronunciation cancels auto. Chinese entry cancels current and queued old audio; stale end events and delayed manifest results cannot expose the answer. Failure does not block feedback.
- Review autoplay waits for current audio-load outcome, entry completion, word completion and body completion. Retry resets review audio readiness instead of prematurely using the previous manifest. Manifest failures keep the existing browser-speech fallback.
- Existing180ms overview exit and240ms session entry/exit remain; entry double-click creates one session. Reduced motion enters promptly. Existing focus mode hides navigation. Return focuses review entry; daily/extra behavior remains covered by regressions.
- Unfinished exit uses exact remaining saved items. Cancel/Escape restore button focus and preserve progress. Confirm cancels speech and async continuations; late book/details/pool/audio responses cannot prepare another choice, load a new assignment or restart speech. An already initiated ensure/write is allowed to finish durably, but its late result cannot restart UI work. This is deliberate and covered by a delayed-ensure test.
- Loading uses existing real200ms delayed `LoadingIndicator`; failures remove it immediately.
- Overview shows actual due counts and completed/task/unassigned counts near the controls; saved book differs explicitly from changed settings. Historical projections are labeled `预计到期` until reconciliation. Recommendation says overdue first within configured quantity, preserving other plan rows/evidence.

## RED / GREEN evidence

| Checkpoint | Observed result |
| --- | --- |
| Initial RED `npm test -- src/components/ReviewSession.test.jsx`,20:24:57 | 8 failed/0 passed. Failures showed learning mode/0–3 instead of review2–4, unavailable review restore/empty states and wrong remaining count. Production edits started afterward. |
| Entry/overview RED with `ReviewSession`, `TodayLearningPage`, `StudyEntry`,20:32:26 | 6 failed/16 passed. Five failures exposed unchanged overview counts/copy, disabled review and bypassed entry; one was a test's transition wait. |
| Same3 files GREEN,20:33:46 | 22 passed. Test fixture expectations corrected to actual compound review item IDs; asynchronous transition waits corrected. |
| Audio/exit RED `npm test -- src/components/ReviewAudioExit.test.jsx`,20:37:23 | 4 failed/4 passed. One real defect: autoplay started before entry completion. Three test issues: uncleared mock call history and waiting for an old sound rather than new playback. |
| Audio/exit GREEN,20:40:28 | 8 passed after optional review entry readiness and test timing fixes. Fake clocks advance160ms outgoing then240ms incoming separately so React commits each stage. |
| Retry-audio RED `npm test -- src/components/ReviewAudioExit.test.jsx -t 'choice pool\|new audio'`,20:47:20 | 1 failed/1 passed/8 skipped. Progress reload incorrectly started a second sound before the new manifest resolved. |
| Same retry/late-pool GREEN,20:48:06 | 2 passed/8 skipped after resetting review audio readiness. |
| Final focused8 files,20:49:10 | **8 files/75 tests passed, exit0**.14 ReviewSession +10 ReviewAudioExit +9 TodayLearningPage +6 StudyEntry + listed existing regressions. |
| Final overview after moving saved-task summary beside controls,20:51:05 | **9 passed, exit0**. No behavior changed. |
| `npm test -- src/App.test.jsx -t 'study and review sessions conceal navigation'`,20:54:37 | **1 passed/24 skipped, exit0**. Existing App integration confirms hidden navigation and returned dashboard for review/learning. |
| Changed-file `npx oxlint` | **exit0, no warnings/errors** after extracting audio readiness dependencies. |
| `git diff --check -- src/components` | **exit0**, ordinary Windows LF→CRLF notices only. |

Final8-file command:

```text
npm test -- src/components/ReviewSession.test.jsx src/components/ReviewAudioExit.test.jsx src/components/TodayLearningPage.test.jsx src/components/StudyEntry.test.jsx src/components/LearningSession.test.jsx src/components/ExtraLearning.test.jsx src/components/LearningAudio.test.jsx src/components/LearningFeedbackExit.test.jsx
```

App navigation integration was also selected in the20:45:30 test run and passed; that run's one failure was a test importing the browser constructor from the index instead of its actual module. The import was corrected before final focused runs.

## Remaining checks / limitations

- No known focused failure or data-interface blocker. No data-engine modifications were necessary.
- Full integration suite, production build, and browser visual/mobile validation remain with the controller by task coordination. This report does not claim those checks passed. The controller's planned real CET4 preview with5 due words and quantity3 is appropriate for counts, long Chinese meaning and bottom-button reachability.
- The choice pool retains the incumbent first80-word approach and four-valid-distinct-meanings requirement. A book unable to supply four valid options shows the existing recoverable preparation message; no new answer policy was invented.
- Historical projection/read costs and guarded-write/schema-validation costs remain those of the delivered engine. No performance/storage architecture change was introduced.
- Auto playback can still be blocked by browser policy; the existing replay controls and speech error text remain available for English stages/details. Chinese question has neither replay controls nor answer-bearing pronunciation buttons.
