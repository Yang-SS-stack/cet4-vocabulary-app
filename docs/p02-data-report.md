# P-02 deterministic review data engine

Date: 2026-09-30. Workspace: `C:/Users/29864/.codex/worktrees/p02-today-review/单词学习软件`. Branch: `codex/p02-today-review`. Base: `7c48914`.

Implementation commit: `683c12f510a5829c836b58a161ddbd7e44a9fe2a` (`feat: add deterministic guided review data engine`). This report is committed separately after that implementation commit. No push or merge.

## Delivered API

`createLearningStore` is synchronous. `createBrowserLearningStore` exposes the following mutations as promises under the existing origin-wide `linguajet.learning` exclusive lock. Reads stay synchronous.

| API | Result / behavior |
| --- | --- |
| `ensureTodayReview(expectedDate = getToday(), expectedSettings = getSnapshot().settings)` | Returns today's review task. Reconciles missing historical reviews and creates the assignment in one write. Existing assignment is unchanged; a no-op returns the same task object without writing. Explicit stale date/settings are rejected. |
| `prepareReviewChoice({date,itemId,revision}, options)` | Returns task with saved four choices. Only count 0/question. Already prepared choice returns the same task without writing; fresh preparation increments revision. Options are `{word,meaning}` with distinct normalized words and meanings including the current word. |
| `submitReviewChoice(token, selectedWord \| null)` | Correct choice adds one known count. Incorrect/show-answer adds neither known count nor unknown evidence. Saves selection, outcome event, and feedback view. `null` reveals details immediately. Returns `undefined`. |
| `revealReviewDetails(token)` | Reveals selected-choice details and increments revision. Returns `undefined`. |
| `submitReviewFeedback(token, 'known' \| 'fuzzy' \| 'unknown')` | Question view/count >=1 only. Known +1, fuzzy -1/min0, unknown resets0 and immediately contributes global mistake evidence. Count4 settles schedule atomically. Returns `undefined`. |
| `correctReviewFeedback(token)` | Feedback details only, immediately preceding positive event, once. Decrements known, increments fuzzy, appends correction event. Count4→3 also restores exact original review snapshot. Returns `undefined`. |
| `advanceReview(token)` | Feedback only; selected choice must be revealed. Circular stable assignment order, skipping completed items. Clears choice and returns to question view. Returns `undefined`. |
| `getReviewOverview({wordBookId?, at?} = {})` | Pure read. `at` is an ISO timestamp, default current time. Returns shape below; projects missing historical reviews without writing. |

`canCorrectReviewFeedback(task)` and `REVIEW_GUIDED_RECALL` are exported from both `reviewSession.js` and `index.js`. Existing `getTask('review', date?)`, `getToday`, `getSnapshot`, `subscribe`, `reload`, `getWord`, and browser store provider integration remain available. UI should reread the task after each write and build a fresh token from its `currentItemId`/`sessionRevision`.

## Actual persisted shape

Task retains existing fields: `date`, `kind:'review'`, `wordBookId`, `createdAt`, settings snapshot, fixed `itemIds`, `items`, `currentItemId`, `previousItemId`, `view:'question'|'feedback'`, `sessionRevision`, `feedbackEvents`, and `choice`.

Method is `{id:'review-guided-recall', rulesVersion:1}`. Newly due items start `knownCount:2`; the latest prior unfinished occurrence makes that item's initial count0. Older unfinished occurrences do not override a later completed occurrence. Initial progress has `lastFeedback:null` and an empty event history.

Each new review item adds:

```js
initialKnownCount: 0 | 2
settlement: null | { previousReview: /* entire original review object */, revision: /* completion event revision */ }
```

All existing progress fields remain. Known counts 0/1/2/3/4 mean meaning choices/English example/English recall/Chinese recall/completed. Completion is exactly4 for this method and exactly3 for learning, mistakes, and legacy tasks. New review history replay validates counts, last feedback, completion time, and settlement revision against events.

Choice remains `null | {options:[{word,meaning},...], selectedWord:null|string, revealed:boolean}`. Feedback events retain existing `self-assessment` and `guided-choice` shapes. Review correction uses `{source:'review-feedback-correction',rulesVersion:1,itemId,correctedRevision,at,revision}`; original positive event remains intact.

New learning-created review records add:

```js
provenance: {
  source: 'learning' | 'extra-learning' | 'historical',
  completion: null | { date, kind:'learning'|'extra-learning', taskId, revision }
}
```

Daily completion identity has taskId `${date}:learning`; extra completion uses the batch's actual taskId. Historical completion identity is `null` when no original event survives (for example v1); no event/revision is invented. Historical entries use actual `learning.completedAt`, even when reconciled much later.

Overview returns `{bookId,dueCount,pendingCount,taskCount,completedCount,unassignedCount,needsReconciliation}`. `dueCount` includes eligible projected historical reviews. `pendingCount` counts unfinished assigned items; `taskCount` is total assignment size; `completedCount` counts completed assigned items. `unassignedCount` deducts actual pending IDs from due IDs, not original assignment size. With no task these task counts are0. Existing task book takes precedence over changed settings or explicit book option. Currently correctable learning completions are excluded from candidates and historical reconciliation.

## Scheduling and rollback

- New learning and extra learning completion add an absent review in the same durable write, enteredAt=completion timestamp and nextReviewAt=next local midnight.
- Learning completion correction withdraws only a pristine review with matching completion identity and no review-task references. Older/seeded/changed/referenced entries survive.
- Review schedule changes only at count4. Clean stage transitions: 0→1/+2 days, 1→2/+4, 2→3/+7, 3→4/+15, 4/5→5/+30. Any self unknown makes stage0/+1 day; fuzzy or correction without unknown retains original stage/+1 day.
- Completion updates lastReviewedAt and count once. Correction restores the previous full review object; completing again increments once from that restored state. Calendar construction uses local year/month/day, handling month/year boundaries without 24-hour millisecond arithmetic.
- Stage5 does not imply mastery. Unfinished reviews remain due. Paused/mastered/null-next-date entries are excluded. Daily limit must be1..100, sorted overdue-first with ID tie-break.
- Generic session/progress/removal mutations reject active new review tasks; generic `updateReview` rejects words assigned to today's new review task, protecting rollback snapshots.

## Migration and failure boundary

Schema is v6. Every v1..v5 snapshot is fully validated against its original version before migration. Existing v1→v2/v2→v3/v3→v4 additive migration steps remain; v4/v5 upgrade to6 without changing histories, batches, corrections, library records, or legacy review methods. Loading migrates in memory only. A later successful mutation persists v6; invalid input or failed storage leaves original raw storage intact. New task commands refuse legacy method:null reviews, and ensure does not overwrite them.

Six initial all-data regressions were fixture maintenance: two current-version assertions changed5→6 and four fixtures generating a current snapshot then labeling it v1..v4 strip only v6 provenance before downgrade. Fixture version numbers and existing migration assertions remain. Legacy damaged-data checks were not relaxed. A genuine legacy v5 review feedback-correction record is covered and remains unchanged.

Writes check saved raw storage against current storage before mutation. Conflict is rejected until explicit `reload`. Browser methods all use the existing lock. Dates/revisions/views/current IDs are checked inside the lock; failed storage never publishes the candidate snapshot.

## Error classification for UI

| Category | Message fragment |
| --- | --- |
| Day changed | `Review date changed; start today again` |
| Stale revision/item/view | `Review turn changed; reload progress` |
| Settings changed while planning | `Review settings changed; start today again` |
| Incomplete/invalid settings | `Set review settings before starting` |
| Legacy task incompatible | `Legacy review cannot use this review session` |
| Another tab/store changed data | `Learning data changed elsewhere; reopen the store` |
| No safe write lock | `Safe storage lock unavailable` |
| Guarded mutation required | `Use guarded review session commands` / `Active review snapshot is protected` |
| Storage failure | Original storage exception, e.g. `quota` |

Other invalid actions use actionable errors for choice preparation, reveal, feedback, or correction eligibility. Existing tasks continue their saved plan after settings changes; ensure's stale-settings error applies only when creating a new assignment.

## Files

Production: `model.js`, `store.js`, `browserStore.js`, `index.js`, new `reviewSession.js`, new `reviewLibrary.js` under `src/data/learning/`.

Tests: new `todayReview.test.js`, fixture maintenance in `todayLearning.test.js`, `extraLearning.test.js`, `feedbackCorrection.test.js`. Report is the only changed file outside `src/data/learning/`.

## RED/GREEN evidence

| Command / checkpoint | Observed result |
| --- | --- |
| `npm test -- src/data/learning/todayReview.test.js` (initial RED) | 22 failed/1 passed. Failures explicitly showed missing ensure/browser methods and missing atomic learning review entry. |
| Same file, `-t 'new due review|clean stage'` | 7 passed/16 skipped: creation and all stage transitions GREEN. |
| Same file, choice/correction/legacy/mistake slice | 6 passed/17 skipped. |
| Added latest-prior-task and corrupted-count regression RED | 2 failed/35 passed; fixed newest occurrence selection and event replay validation. |
| First all-data run | 113 passed/6 failed; downgrade fixture/current-version issues described above. |
| All-data after fixture maintenance | 9 files/119 tests passed. |
| Added exact historical identity/legacy v5 correction regression RED | 2 failed/44 skipped; fixed last matching event and original legacy source preservation. |
| FINAL `npm test -- src/data/learning` | **9 files/130 tests passed, exit0**, 2026-09-30 19:37 local. New todayReview suite has48 tests. |
| FINAL `npx oxlint src/data/learning` | **exit0**, no warnings/errors. |
| FINAL `git diff --check` | **exit0**, no whitespace errors. Git emitted ordinary LF→CRLF notices for tracked Windows files. |

## Required coverage mapping

The48 review tests cover initialization/no fabricated events, all stage transitions, four rounds and incorrect/show-answer, fuzzy/unknown rules, correction from choice and completion, refresh persistence and duplicate refusal, atomic new/extra entry/withdrawal, older/referenced entry preservation, book isolation, overdue tie sorting, limits0/null/101 refusal and cap100, excluded paused/mastered/null dates, current correctable exclusion, existing/empty/completed assignment stability, actual unfinished-ID overview subtraction, historical projection/single-write/idempotence, latest prior occurrence/crossday zero, five-unknown threshold and removal/re-entry, migration1..5 including real extra batches/corrections and failed migration persistence, invalid6 initial/count/settlement/method/revision and forged completion, legacy method/source preservation, generic mutation guards, core storage/conflict/date failures, and browser lock/concurrent creators/duplicate correction/stale tabs/no-lock/midnight/storage failure/settings race.

## Remaining integration checks and concerns

- Controller verified baseline41 files/297 tests. As explicitly coordinated, this subtask ran focused data suites only; controller runs the full suite once after integration, avoiding duplicate/concurrent full runs. UI, production build, and visual validation belong to the following task.
- Historical completion identities cannot be reconstructed when original events are absent; this is represented explicitly by `completion:null` while preserving known completion dates and avoiding invented evidence.
- Schema validation still scans the full saved state on writes, matching the existing architecture; review task event replay adds validation work proportional to saved review histories. No persistent storage abstraction or performance rewrite was introduced.
- No known failing focused tests or unresolved data rule blockers at delivery.
