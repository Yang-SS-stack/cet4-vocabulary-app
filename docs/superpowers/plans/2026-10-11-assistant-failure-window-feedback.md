# Assistant failure and window feedback implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task.

**Goal:** Implement the user's six current preview comments: failure recovery actions, hidden failure inputs, demo ordering, desktop resizer and flash-free closing handoff.

**Architecture:** Reuse AssistantPlan's fresh readonly rule recovery and existing onStart callback. Repair window control stacking and animation teardown at their existing owners; preserve fixed composer, context and streaming lifecycle.

**Tech Stack:** Existing React, CSS, Vitest/Testing Library and browser Web Animations API. No dependencies or new model interface.

## Global Constraints

- Work only in existing isolated codex/p03b-initial-ui worktree; dispatch baseline871705138517baeb0132252ce9e0996a29c1c5d5. Keep main and its dirty docs untouched.
- Main original first setup/save/skip, independent study/review, frozen choices/tasks, records and provider whitelist remain unchanged.
- Timeout shows exactly one “按原设置开始学习” plus “重试”; quota shows exactly one original-study action and no retry. Remove “使用规则建议” from both failure surfaces.
- Failed pages hide 本次时间与目标 and rule-generation/success-result controls while retaining their state. Demo is below original-study action, including normal success page. Current actions remain explicitly simulated, no service calls, quota assertions or actual plan application.
- Retry is explicitly local rule-draft regeneration in this no-model build: reread facts, preserve selected minutes/goal, guard invalid/stale data, no writes. Do not pretend it retries a real provider. Quota has no retry.
- Restore desktop visible pointer-operable and keyboard-operable size control, outside send/shortcut hit regions; mobile has no resize/close title controls. Fixed four shortcuts and composer stay.
- Closing must not expose full-size panel after canceling animation, including onfinish/fallback/reduced-motion/resize. Reopen restores visibility once, stale callbacks cannot close new window; original start runs once after close. No new transcript persistence or provider changes.
- Physical browser observations unavailable unless approved tool operation succeeds; synthetic tests are not visual proof. Strict physical audio<=1s gap from previous task remains outside this six-comment patch. No push/merge/release or Obsidian writes.

### Task 1: Failure recovery and ordering

**Files:** Modify src/components/AssistantPlan.jsx, src/components/assistantStreaming.test.jsx; create src/components/assistantPlanRecovery.test.jsx for new focused behaviors. Do not edit CSS/window/motion or other tests. Existing tests containing 使用规则建议 must be rewritten for the new user behavior while preserving readonly/fresh/stale assertions; quota now tests original start instead of hidden fallback.

**Interfaces:** Existing onStart is original-learning deferred-close callback. Existing `fallback()` rereads store.readAssistantSnapshot, builds fresh facts and guarded local rules; rename to retry or reuse internally. No new external API, model request or write.

- [x] Add behavior regressions using existing real provider/store/clock harness. Timeout failure has original-start+retry and no SessionIntentControls/rule result; quota has original-start only; count original button once. Confirm demo follows start via DOM order, normal page too. Retry retains explicit time and goal, restores guarded draft, raw storage unchanged; corruption keeps failure and original entry usable. New timeout test example:
```jsx
expect(within(failure).getByRole('button', { name: '按原设置开始学习' })).toBeEnabled()
expect(within(failure).getByRole('button', { name: '重试', exact: true })).toBeEnabled()
expect(screen.queryByRole('slider', { name: '本次可用时间' })).not.toBeInTheDocument()
```
- [x] Run `npm test -- src/components/assistantPlanRecovery.test.jsx src/components/assistantStreaming.test.jsx`, record intended RED before product edits.
- [x] Make minimum JSX changes: failure actions call onStart and local retry; quota note omits retry; wrap SessionIntentControls in !failure; original onStart below result only !failure, move demo after it (failure actions appear above demo). Copy retains “模拟状态 · 未接入模型”; timeout explains retry rebuilds local rule draft; error preserves inputs internally. Use existing button styles and `.assistant-plan__actions` grouping. Update demonstrations' copy to current recovery instead of removed button.
```jsx
{!failure && <SessionIntentControls intent={intent} onChange={existingHandler} goalDescriptions />}
{!failure && <button type="button" className="assistant-primary" onClick={onStart}>按原设置开始学习</button>}
```
- [x] GREEN focused new tests plus FloatingLearningAssistant.test.jsx, assistantFeedback.test.jsx and assistantContext.test.jsx; existing audio tests not owned. Run lint/diff check. Report command, counts and genuine warnings, source/request limitations, commit only owned paths and write matching brief report. Controller runs full suite once after integration, not each worker.

### Task 2: Desktop resizer and closing handoff

**Files:** Modify src/components/FloatingAssistantWindow.jsx and src/components/FloatingLearningAssistant.css; create src/components/assistantWindowLifecycle.test.jsx. Existing closing tests in assistantFeedback.test.jsx and geometry/desktop resize tests in FloatingLearningAssistant.test.jsx are covering unchanged integrations; do not edit those tests unless you establish a changed legitimate invariant and first notify root.

**Interfaces:** Existing section/dialog ref, `open`, `onClose`, `onClosing`, `launcherRect`; no parent API change. Existing finishClose(epoch), requestClose(), viewport listener and stale epoch protections are authority for closing. Read existing source/test complete before changes.

- [x] Verify CSS layering: fixed composer flex item has z-index1, absolute resizer has auto -> hit/paint coverage. Verify terminal animation canceled before parent open=false hides panel, which exposes base geometry; also inspect mobile pull transform transition and closing during opening. Record confirmed code paths versus physical hypothesis separately.
- [x] Write regressions before fix: capture panel presentation when exit animation cancel occurs (must already be hidden), same behavior for desktop/mobile finish and fallback, reopen visible/stale callbacks ignored, original start once; interrupted opening close must continue current animated presentation if this path is implicated. Browser animate/computed-style mocks model API ordering only. Preserve mobile >50% dismissal and <=50% rebound tests. Existing geometry tests cover pointer resize; use real CSS computed rules to check layer priority and reserved space where jsdom can, do not mirror code with string-only assertions.
- [x] Run new lifecycle tests, verify intended RED. Make minimal fix: hide outgoing panel synchronously before cancel/removing final animation then call existing close callback; reset hidden presentation on next open. Do not cancel before snapshotting current presentation when closing an unfinished opening. Suppress underlying mobile CSS transform transition during exit if source tests establish a competing transition. Keep missing-animation and reduced-motion immediate-close paths safe, clean listeners/timers and never duplicate actions.
- [x] Restore resizing with explicit z-index above composer and a reserved desktop footer strip so 24px handle doesn't intercept Send. Preserve mobile original padding/no handle. Starting CSS shape:
```css
.floating-assistant__resize { z-index: 2; }
@media (min-width: 641px) { .assistant-conversation__composer { padding-bottom: 32px; } }
```
Adjust minimally if actual existing geometry needs more space; no window-wide zoom or CSS transform scaling unrelated to resize.
- [x] GREEN new tests plus assistantFeedback, FloatingLearningAssistant, assistantStreaming and floatingAssistantGeometry tests. Run lint/diff check, report evidence and unverified actual flicker, commit only owned paths and write matching brief report. Root will rebuild preview and manually hand off real close/resize acceptance.

### Task 3: Integrated verification, review and preview

**Files:** docs/p03b-window-feedback-delivery.md, current delivery links and surface current summary only; ignored ledger/artifacts.

- [x] Fresh task reviewer per completed task, prepared baseline-to-head package plus brief/report; fix Critical/Important issues and rereview. Source readonly review, no reported test reruns.
- [x] Once source tasks approved, controller `npm test -- --maxWorkers=1`, lint, diff check and one Impeccable detector over changed UI targets. Fix attributable findings, leave incumbent initial setup warning untouched.
- [x] Build clean source/document checkpoint into a new verified nonexistent artifact-root folder, record actual sourceCommit/dirtyfalse and asset hashes. Stop only tracked current4182 preview and start new bundle same port; HTTP index/assets/version verified. Browser automation respects prior approval rejection, no protocol bypass; manual evidence remains separately marked.
- [x] Broad final review uses full branch package with previous completed final-review report plus current delta and cross-owner risks. Record source acceptance separately from physical/browser/audio gaps. New version/manual single step and rollback instructions, no integration/release.
