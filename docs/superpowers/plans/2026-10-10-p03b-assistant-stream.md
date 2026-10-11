# P-03-B 对话生成与异常卡片实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox syntax; engineering completion is separate from manual acceptance.

**Goal:** 完成本次逐字回复、发送气泡移动与参考异常卡片。

**Architecture:** 扩展现有可取消模拟请求生命周期；对话组件负责气泡和发送几何，计划组件负责手动失败展示及真实规则回退。现有规则/原学习调用链保持权威。

**Tech Stack:** React 19, native CSS/SVG/Web Animations, Vitest/Testing Library; no new dependency.

## Global Constraints

- Worktree C:\Users\29864\.codex\worktrees\p03b-initial-ui\单词学习软件; branch codex/p03b-initial-ui. Record exact dispatch base before implementation.
- main 首次设置的六项、保存、跳过保持原样；原学习、复习、冻结任务、进度与记录独立运行。
- 不接 Qwen，不新增网络模型请求、额度服务、数据库结构或认证修改；不推送、发布、合并或写 Obsidian。
- 草稿仅在内存；采用进入确认，最终应用禁用，真实应用留 P-03-C。
- 真摘要、5～60 分钟、三目标、新词60秒/复习20秒、向上取整5分钟并限于预算和真实数量继续使用现有规则。
- 保留桌面移动/缩放、手机半屏下滑阈值、收起中止、键盘焦点、减少动态效果和旧版回退。

## Task 1: Integrated streaming, send animation and failure UI

Read the supplementary spec alongside this task. Own src/components/FloatingLearningAssistant.jsx, AssistantConversation.jsx, AssistantPlan.jsx, FloatingLearningAssistant.css, assistantMotion.js and relevant tests; small focused helper permitted. Do not edit unrelated startup or learning logic. Controller owns docs and preview artifacts.

**Interfaces:** Preserve mockAssistantReply request→{text,stage,goal}; use plan.current.prepare(goal) for true basis; onRequest may accept optional input rectangle metadata and return acceptance. No real provider or request transport. Keep FloatingAssistantWindow onClosing/onClose guards unchanged unless an evidenced defect requires a narrow repair.

- [x] Add meaningful RED cases for intermediate visible text and no preloaded final bubble; no greeting while folded; pending reused; plan absent while response incomplete; plan entered only after completed text; close preserves partial text and cancels late transition, reopen resumes same message from cursor without replay; completed greeting not duplicated; Unicode intact; duplicate submits ignored; reduced-motion still completes. Test actual callback/state behavior with bounded fake timers.

```js
await user.click(screen.getByRole('button', { name: '学习助手' }))
expect(screen.getByRole('status', { name: '助手正在回复' })).toBeVisible()
// Advance only waiting delay: first assistant message must contain a prefix,
// with no hidden full-text node and no plan heading yet.
// Advance typing to completion, then request review and check this same ordering.
expect(persistence.raw).toBe(before)
```

- [x] Implement one owned pausable request sequence: wait→Unicode text growth→completed response→short read pause for plan→fresh prepare→stage. Use modest local character cadence (roughly25ms); preference changes and unsupported animations cannot block completion. Central cleanup clears current timer/animation and invalidates late callbacks while fold retains local response descriptor and cursor; reopen continues remaining text without duplicate message or resubmission. Disabled/unmount cancel active work. Announce completion once, not each character.
- [x] Capture input geometry before clearing it, pass request metadata and animate exactly one rendered user bubble from input to destination; approximately350ms. Use measured scroll destination, constrain overflow, cancel on inactive/unmount/reduced-motion. Skip flight for capability chips or unavailable geometry. Follow generated text without stealing focus, avoid scrolling the whole page on every character.
- [x] Add timeout/quota independent cards matching reference hierarchy using native SVG. Keep true facts visible, hide successful recommendation/adoption/confirmation during failure, preserve intent/draft and original-start access. Explicit simulation label; fallback re-reads true snapshot and invokes existing buildSessionAdvice. Handle storage/unavailable guard rather than using stale facts. Tests cover both cards, fallback changed actual basis, invalid store, and raw persistence unchanged.
- [x] Run new tests RED then GREEN, related assistant/App/legacy/Today checks and lint. Fix actual regressions; record command, output, precise test scope. Do not merely widen existing timeouts; adapt waits to known new response lifecycle or use deterministic clocks. Commit owned source/tests only and self-review.

## Task 2: Controller verification and delivery

- [x] Generate review package from exact dispatch base, independent spec/quality review and fix any material issue.
- [x] Run one full suite with worker bound2, lint/build against final code, preserving incumbent warnings accurately.
- [x] Build clean immutable preview on existing localhost origin, verify actual bundle commit and HTTP resources. Desktop/phone browser QA and matching screenshots if browser runtime available; explicitly document any missing visual check instead of asserting it passed.
- [x] Update interface handoff/delivery/verification/surface docs and evidence. Dispatch final whole-branch review using complete main→HEAD package and focus on new lifecycle; source/test reading reported no Critical/Important, then review service quota interrupted documentation/log verification. Controller completed remaining evidence checks and documented this limit.
- [ ] Obtain independent final whole-branch verdict after review-service availability returns; no merge/release before that review and manual acceptance.
- [x] Deliver versioned preview, desktop/phone evidence limits and exactly one initial manual acceptance step. Keep worktree/branch, no integration action. Manual acceptance remains pending.
