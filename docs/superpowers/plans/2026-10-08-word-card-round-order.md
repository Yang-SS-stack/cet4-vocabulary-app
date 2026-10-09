# Word-card flip and learning round order implementation
Date: 2026-10-08. Approved spec: ../specs/2026-10-08-word-card-flip-round-order-design.md
Baseline main 75f6e21. Worktree branch codex/word-card-round-order.
Execution: subagent-driven-development per executing-plans skill, all roles user-selected gpt-6-astra / medium.
## Global constraints
Keep selected word set, progress rules, review/mistakes scheduling, current appearance and colors unchanged. Persist presentation; schema v8 strictly migrates v1-v7. No merge/push in this task. Preserve unrelated main checkout documents. No real learning records mutated in browser checks.
## Task 1: Persist per-round learning presentation
Scope: src/data/learning/presentation.js (new pure queue helpers), model.js, store.js, focused new tests in src/data/learning/presentation.test.js and learningPresentation.test.js, existing learning/migration tests and src/test/legacyLearningSnapshot.js as necessary. Keep review's circular scheduler intact; selfAssessment/reviewSession may be adjusted only to separate helper names clearly.
Approved design: docs/superpowers/specs/2026-10-08-word-card-flip-round-order-design.md, learning sections.

Requirements:
- task.itemIds remains selected set; learning and extra-learning get presentation {order,index,round}. Each round visits each unfinished/nonremoved word once; shuffle first and subsequent rounds; if >1 eligible words avoid identical consecutive round orders. Single/empty supported.
- Persist queue and cursor. Reopen preserves current question/feedback/options/order; normal feedback/correction/knownCount rules unchanged. Advance only inside existing guarded atomic change.
- Inject random=Math.random into createLearningStore options; pure helpers use injected RNG. Never generate queue in React.
- Schema v8 strictly validates shape, unique task-local order, safe cursor/round and current correspondence. Prior valid v1-v7 migrate without losing events/progress/settings/extra batches. For old active tasks preserve current and old fixed-order suffix; shuffle only after suffix. Validate old input before migration. Preserve v7 random selection settings.
- Review/mistakes and seven-field assistant request unchanged. Protect failed saves, stale tokens, day changes, cross-tab conflicts.
- Follow existing generic legacy APIs compatibly; inspect setTaskSession/recordFeedback use before imposing unsupported restrictions.
- Deterministic tests must cover real observed behavior, not mocks alone: two rounds of five unique words, unfinished subsets, completion/correction, one/two/empty, reload mid-round+feedback, failed write/conflict/stale token/date, extra batch, strict invalid v8 and v1-v7 migration including nonfirst current and feedback.
- Existing tests depending on fixed word order should inject a deterministic random source or identify current word instead of hardcoding; don't weaken progress assertions or mock Math.random globally to hide randomized behavior.
Steps:
- [x] Run relevant baseline tests, add failing tests, record RED.
- [x] Implement queue helpers, model migration/validation, store integration.
- [x] Run focused tests, adapt legacy fixtures deliberately, record GREEN.
- [x] Run full suite once before commit, self-review and commit only scoped source/tests.
- [x] Write report with exact commands/counts, files, RED/GREEN, concerns to .superpowers/sdd/round-order/task-1-report.md.

## Task 2: Stabilize word-card face rendering
Scope: src/components/FadeContent.jsx, WordCard.jsx, WordCard.css, relevant existing tests only if behavior changes.
- Preserve appearance, colors, 3D flip, native detail wheel, text selection, keyboard/focus/inert/audio and reduced motion.
- First clear completed GSAP entry transform, test computed parent state in Edge large desktop; if remaining face exposure risk warrants explicit face handoff, document evidence and add stable transform endpoints/visibility without whole-card preserve-3d.
- Do not claim exact root confirmed or transient bug reproduced absent evidence. Old diagnostics did not capture flash.
- Avoid speculative GPU CSS pileup; one change at a time.
- Browser on isolated 4176, ordinary desktop and 2560x1440 DPR1/2, narrow mobile, rapid reverse, scrolling and keyboard/reduced-motion. Recording previously rejected by automatic approval; do not retry.
- [x] Implement controlled change and relevant component tests.
- [x] Commit scoped changes; report tested vs residual user hardware acceptance separately.

## Final verification and delivery
- [x] Independent task reviews and whole-branch review.
- [x] Full regression suite, build, lint (report host policy block if present; do not bypass).
- [x] Isolated preview with exact branch/commit metadata and five-word two-round/reload acceptance.
- [x] Record results and remaining hardware visual limitation; return preview for one-step manual acceptance.
