# P-02 data task requirements — approved 2026-09-30

Workspace: C:/Users/29864/.codex/worktrees/p02-today-review/单词学习软件
Base: 7c48914. Work only src/data/learning/** plus report in docs. No UI edits, no push, no merge, no Obsidian edits. Commit scoped changes after tests.

## Rules

Daily learning remains guided-recall or legacy self-assessment with completion at 3. Review is review-guided-recall v1, initializes knownCount=2 for newly due words; prior-day unfinished review words start at 0. Never reset existing today's task counts or add imaginary initial feedback events.

Review knownCount 0=meaning choices, 1=English example, 2=English recall, 3=Chinese recall, 4=completed. Self-assessment known +1, fuzzy -1 min0, unknown0; unknown immediately increments global unknown evidence (5 threshold incl removal rules). First choices: correct +1, incorrect/show-answer no count/no unknown. Persist choices, selected answer, revealed details, revision, events.

Reuse existing learning feedback logic only with clear task-specific completion limits; do not weaken learning/mistakes/legacy task validation. Review must allow initial2 and lastFeedback null with empty event log. New review items can add initialKnownCount and settlement metadata. Explain actual shape/API in report.

User data format currently v5, extraLearning and feedback-correction. Add v6 validation/migration from every v1..5 preserving all data (no fabricated events). Old review method:null tasks remain unchanged and not editable with new commands; current-day legacy review shows incompatibility and is not overwritten.

New learning or extra learning completion atomically adds review if absent, at next local midnight from completion date; review enteredAt completion timestamp. Provenance includes source and completion identity {date,kind,taskId,revision}. Learning correct3→2 withdraws only freshly added, unreviewed, unreferenced review from exactly that completion event; preserve older records. Historical completed words lacking review are reconciled at ensureTodayReview, date from historical completion+1 day; historical record enteredAt should reflect known completion, source historical. Exclude currently correctable learning completions from review candidates/reconciliation races. Never destroy old history.

Task only current settings word book. Limit dailyReviewWords 1..100, overdue dates ascending + stable id tie. Exclude paused/mastered/null-nextdate; allow existing library records even legacy API seeded without learning.completed. Historical missing review only reconciles actual learning.completed. Existing today task returned unchanged even after settings change; no extending empty/completed tasks. Idempotent reconcile newly completed records may occur but do not change today assignment. ensure and reconcile one locked write, no-op should not write. Set snapshot settings when created. Next item circular stable order, no completed ones.

Scheduling only on reaching4, not each positive feedback. Newly learned first1day. For clean review completion stage0→1 next2days, 1→2 next4, 2→3 next7, 3→4 next15, 4/5→5 next30. Negative evidence during current review episode: any self-unknown → stage0 next1day; fuzzy/correction but no self-unknown → original stage retained next1day. lastReviewedAt and completedReviewCount increment exactly once at completion. mastered remains false, calendar math uses local dates (no 24h milliseconds). unfinished stays due.

Only immediately preceding positive feedback in revealed details can correct once, same as learning; correct knownCount -1, fuzzyCount +1, no unknown. 4→3 rolls back completion/settlement atomically (previous review snapshot incl count/dates/stage), can complete again with count increment once. Choice-correct after revealed details can correct. Preserve event and append review-feedback-correction referencing revision. Refresh/replay must not duplicate. Original settled snapshot must be protected against external update; generic unsafe mutation API rejected for active new review task.

## Required API contract (core sync, browser writes async under current origin-wide lock)

store.ensureTodayReview(expectedDate = today(), expectedSettings = snapshot.settings) -> today review task
store.prepareReviewChoice({date,itemId,revision}, options) -> task
store.submitReviewChoice({date,itemId,revision}, selectedWord|null)
store.revealReviewDetails({date,itemId,revision})
store.submitReviewFeedback({date,itemId,revision}, known|fuzzy|unknown)
store.correctReviewFeedback({date,itemId,revision})
store.advanceReview({date,itemId,revision})

Export canCorrectReviewFeedback(task) from reviewSession.js (or index.js) for UI eligibility. Errors must include date changed / turn changed / settings changed / legacy review / review settings for UI classification. Check current date inside lock; stale revision/view/id refused. Storage failure publishes no next snapshot; conflicts refused until explicit reload.

Add pure read helper getReviewOverview({wordBookId?, at?}?) or equivalent exported function returning bookId, dueCount, pendingCount, taskCount, completedCount, unassignedCount, needsReconciliation. Include projected historical due without writing. Actual unfinished task count deducted from current due by IDs, not original task size. On existing task overview follows task book (not new settings).

## Testing

TDD: add failing assertions via existing public API (missing new methods should fail expectations clearly), run red; implement and run focused suites. Cover rounds, correction, new/extra learning entry/rollback, historical idempotence, sorting/cap/excluded/book isolation, no-op reentry, settings, crossday abandoned counts0 vs newlydue2, five errors threshold, migrate1..5/invalid6, legacy refusal, generic bypass rejection, browser duplicate/locks/conflict/storage failures and lock-cross-midnight.

Run focused data tests then full existing suite before committing. Baseline suite is being run by controller; wait for controller's baseline result before production edits. Minimize schema noise; existing tests hard-coding current version must update only current-version assertions, preserving migration fixtures.

Report file: docs/p02-data-report.md. Include exact API/shape, files, RED/GREEN commands/output, commits, risk/concerns. Return under15 lines DONE/DONE_WITH_CONCERNS/BLOCKED with summary. No new agents.
