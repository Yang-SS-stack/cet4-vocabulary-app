# P-03-B assistant feedback implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps track engineering delivery, not human acceptance.

**Goal:** 在真实隔离项目按用户10项页面批注和参考图修正助手反馈、计划呈现与动作连续性。

**Architecture:** 保持原学习系统和规则权威。助手增加可取消的模拟异步请求状态，能力声明驱动建议提问；准备内存规则草稿后才切换审核页。窗口统一处理桌面入口/退出与移动面板动效。现有真实摘要、旧回退及无写入边界不变。

**Tech Stack:** Existing React/CSS/SVG/Web Animations, Vitest/Testing Library; no new dependency.

## Global constraints

- Worktree `C:\Users\29864\.codex\worktrees\p03b-initial-ui\单词学习软件`; branch `codex/p03b-initial-ui`; initial planning base `39a4faf`; recorded implementation dispatch/diff base `ebc2e51cc2e52e17af9d99bf3ebaca2eaeae960c`.
- Preserve main original six setting fields/save/skip, frozen tasks/progress/records, independent original learning/review. No Qwen, schema/auth changes, real plan application, push/merge/publish or Obsidian write.
- Rules stay new60seconds/review20seconds,5..60minutes/threegoals,ceil5minutes capped budget and actualavailability; draft only.
- User's answer to button7: 按照图示案例做. Adopt becomes a filled rounded main action with arrow, still enters draft confirmation; finalapply disabled (P-03-C). Do not start original learning from adopt.
- Reference screenshots guide visual layout, not hardcoded counts or contradictory estimates. Future lookup remains truequery→vocabulary existingcard, not chatcard and not implemented.
- Preserve keyboard focus repair, mobile Tab containment, >half dismiss/<=half springback, reduced-motion, cleanup/oldcallback guards, global dialog singleton and draggable/resizable bounds.

## Task 1: Integrated feedback refinement

Files: modify `FloatingLearningAssistant.jsx/.css`, `AssistantConversation.jsx`, `assistantMockConversation.js`, `AssistantPlan.jsx`, `FloatingAssistantWindow.jsx`, `BrandFlightMark.jsx/.css`, `App.jsx/.css` and their relevant tests. A small focused helper/component is allowed if it prevents duplicate logic. Prefer assistant-scoped goal CSS over changing legacy controls' semantics.

- [x] Add behavioral RED tests. Initial closed assistant has no greeting/request; first open displays waiting then greeting. Suggestion click appends userrequest immediately, displays pending, does not navigate immediately, and only enters plan after response and a prepared real-rule draft. Repeat requests while pending ignored. Close/unmount/disabled invalidates pending timers/results and cannot cause late navigation or duplicate greeting. Storage unchanged throughout.

```js
await user.click(screen.getByRole('button', { name: '学习助手' }))
expect(screen.getByRole('status', { name: '助手正在回复' })).toBeVisible()
// Await the simulated reply rather than injecting events into hidden controls.
await screen.findByText(/你好！我是 LinguaJet 学习助手/)
await user.click(screen.getByRole('button', { name: '安排复习' }))
expect(screen.queryByRole('heading', { name: '特殊学习计划' })).not.toBeInTheDocument()
await screen.findByRole('heading', { name: '特殊学习计划' })
expect(screen.getByRole('article', { name: '本次建议草稿' })).toBeVisible()
expect(persistence.raw).toBe(before)
```

- [x] Implement simulated async response lifecycle. First greeting loads only after first open, revised copy introducing helper and asking whether a session plan is wanted. Current waiting clearly simulated; future async provider can reuse states. Capability registry provides only current real available suggestions (plan/tasks/review), each with small consistent animated SVG and hover/focus color. All suggestions go through one request path; no direct navigation.
- [x] Prepare rules using existing true summary and latest settings as an in-memory draft before plan transition. Show the reply long enough to read, then smoothly enter review, goal review for review request. No fake provider claims or task creation. Changes after a draft still require regeneration/current-basis checks. Keep draft/intent across ordinary fold/reopen; stale late results never advance UI.
- [x] Apply reference plan hierarchy: true remaining counts, time slider, three radio-like rows with explanatory text, only round indicator selected light→dark and hover transition (row remains paper). Result number surfaces, allocation, readable order, fullwidth basis control, secondary adjust and filled adopt-with-arrow action. Remove daily-settings button and callback. Original-start action still invokes original system.
- [x] Add motion for conversation→plan/back, result/adjust/confirm changes; preserve default visibility and keyboard destinations. Animate only purposeful state, no duplicated imperceptible patches. Reduced motion cancels movement, preserves state/feedback.
- [x] Window: desktop sole X closes/folds with shrink-to-launcher motion, entry expands smoothly from actual launcher (respect draggable position). Mobile header has neither minimize nor close buttons; retain accessible grab dismissal/backdrop/Escape and half-height behavior. Entry approx420ms desktop/320ms phone; exit faster~260ms/220ms. Interrupted animations, reduced-motion changes, lost finish callback fallback and rapid reopen remain bounded. Preserve geometry/resize and focus.
- [x] Show existing paper-plane mark before full product name in expanded desktop navigation as well as collapsed mode; one icon in either state, no clipped text/mobile corruption. SVG/reduced-motion match incumbent system.
- [x] Run all related tests (assistant/App/Today/legacy touched), lint/build, report exact RED/GREEN/output/warnings. Full suite once with explicit worker bound2 if practical; do not widen test timeouts for audio scanning or claim unsupported concurrency cause. Commit only owned source/test files. Report any unresolved issue.

## Task 2: controller review and delivery

- [x] Read committed code/logs; generate diff from recorded task base (not HEAD~1). Independent task review provides spec and quality verdicts. Fix Critical/Important and rerun affected checks.
- [x] Build clean immutable production version. One batched desktop/mobile check covers all10comments, initial greeting, capability chips, pending→reply→draft sequence, goal colors, brand expanded/collapsed, desktop expanding/shrinking and mobile controls/gesture; if defects onefixbatch then one confirmation round.
- [x] Final whole-branch review on most capable available model, previous mainbase b463892. Update version/preview/hand-off/docs distinguishing mock from futureprovider and initialsetup preservation. No manual acceptance marked passed without1.
- [x] Provide matching desktop/mobile preview and one current manual acceptance step only. Keep branch/worktree. No integration/release action.
