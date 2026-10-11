# P-03-B Floating Assistant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox syntax for tracking.

**Goal:** 将已批准的悬浮助手与今日页布局集成到真实项目，保持 main 首次设置和学习系统完整。

**Architecture:** 公共 LearningSurface 内挂载单个 FloatingLearningAssistant，路由/学习专注模式切换不卸载它。FloatingAssistantWindow 管理窗口定位与拖动/缩放/手机手势，AssistantConversation 管理模拟聊天，AssistantPlan 管理真实规则草稿；纯规则来自现有 sessionAdvice.js。App 默认首次路径回到 main 组件；旧今日页仅在 ui=legacy 条件显示。

**Tech Stack:** React 19, existing CSS tokens, SVG, existing Vitest/Testing Library. No dependencies.

## Global Constraints

- main 的首次进入 LearningSetupModal 六字段、保存与跳过流程保留，不移入助手、不改 main 首次 UI。
- 真实项目集成，不接 Qwen，不修改数据库、认证或学习记录，不自动保存设置或创建/应用任务。
- 本次 5～60 分钟，新词 60 秒、复习 20 秒，向上取整 5 分钟，不超真实上限与选择时间；复用现有规则。
- 采用此计划仅进入草稿确认；最终应用禁用，P-03-C 才实现。
- 入口全应用可见（欢迎/初始设置/数据恢复除外）、可拖动；桌面小窗可移动缩放；手机下拉 ≤50% 回弹、>50% 收起，以面板高度为分母。
- 首次今日提示 5 秒，提前打开立即消失；快捷操作在窗内。
- 默认移除旧独立建议入口，保留代码和 ui=legacy 回退。
- 所有模拟状态明确标识；真实记录不采用图片示例数字。
- 暖灰纸、海军蓝、柔金；减少动画可静态；不能覆盖主要学习按钮。

## Task 1: Complete approved floating UI integration

**Files:**
- Create src/components/FloatingLearningAssistant.jsx, FloatingLearningAssistant.css.
- Create src/components/FloatingAssistantWindow.jsx, floatingAssistantGeometry.js, AssistantConversation.jsx, AssistantPlan.jsx.
- Create src/components/BrandFlightMark.jsx, BrandFlightMark.css.
- Create behavior tests for floating assistant and geometry, update App/TodayVisual/TodayLearningPage integration tests for the new default and explicit legacy mode.
- Modify src/App.jsx, src/App.css, src/components/TodayLearningPage.jsx/.css.
- Preserve LearningSetupModal, LearningSetupModal.css, setupDraft as main behavior. Preserve old advice/InitialLearningFlow modules for history/fallback, never use new InitialLearningFlow as default.

**Interfaces:**

```jsx
<FloatingLearningAssistant enabled={enabled} selectedPage={selectedPage}
  onNavigate={onPageChange} onStartLearning={onStartOriginalLearning} now={now} />
<FloatingAssistantWindow open={open} onClose={close}>
  {stageContent}
</FloatingAssistantWindow>
<AssistantPlan now={now} initialGoal="progress" onBack={backToChat}
  onStart={onStartOriginalLearning} onSettings={navigateToExistingSettings} />
```

The exact internal prop names can follow local component conventions; no external Qwen callback is supplied. UI state stores open/stage/conversation/intent/draft/geometry in memory only. The pure geometry helpers clamp to viewport and decide mobile dismissal with delta > height / 2. Initial small window uses roughly 420×560 desktop pixels; usable bounds must adapt when viewport is smaller. Drag movement must suppress pointer click; keyboard activation remains available.

- [x] Write focused tests first for initial default main settings, removed default advice row, global assistant persistence, hint and no-write behavior. Use existing createLearningStore real in-memory persistence, capture serialized state before interaction and compare after planning/confirming. Add geometry tests for exact half, >half, bounds, resize and viewport shrink.

```js
const before = JSON.stringify(store.getSnapshot())
fireEvent.click(screen.getByRole('button', { name: '学习助手' }))
fireEvent.click(screen.getByRole('button', { name: '是，设置计划' }))
fireEvent.click(screen.getByRole('button', { name: '生成规则建议' }))
fireEvent.click(screen.getByRole('button', { name: '采用此计划' }))
expect(screen.getByRole('button', { name: '确认应用计划' })).toBeDisabled()
expect(JSON.stringify(store.getSnapshot())).toBe(before)
```

- [x] Run focused tests before implementation and record expected missing-feature failures in report.
- [x] Implement shell/pointer handling, rules/config/result/adjust/confirmation and simulated chat within named focused components; no duplicated rules or network generation. Use reference spec for exact dialogue strings and failure boundaries.
- [x] Integrate singleton above study focus clipping, restore default initial main renderer, move compact status/title into today header and actions into task footer; ui=legacy retains old advice entry and no floating assistant.
- [x] Add paper-plane brand animation in existing collapsed logo slot; preserve accessible brand name and reduce-motion/static mode. Do not use raster image generation for an existing SVG icon system.
- [x] Run focused tests and fix actual regressions; existing tests dependent on changed approved semantics must cover new default plus legacy appropriately.
- [x] Run full tests once, lint and build. Record commands/results and main-first-setting parity evidence. Commit only explicitly owned files.

## Task 2: Review, visual verification, delivery (controller)

- [x] Generate diff package from recorded task base 267e75b704615a9c82ee9654dab3eb4418b794c4 and review against task brief and test report; resolve Critical/Important findings and re-run their covering tests. Final whole-branch review uses main base b46389224716052de39e567b89a8d652a31d5b35.
- [x] Build fresh committed preview, record exact source/build version, capture desktop and phone in one bounded inspection round. Check default main first setup, today's layout, movable assistant, resized window, no-write confirmation and original study return.
- [x] Fix material visual/interaction issues in one batch and verify affected behaviors; provide independent final review.
- [x] Update component interface handoff and verification docs for current semantics, include readable rollback and all simulated/not-open capabilities. Keep branch isolated; no merge/push/publish.
- [x] Present version-linked desktop/mobile preview and first manual acceptance step only. Do not mark manual tests accepted without user response.


2026-10-10：实施与生产检查完成，源码509d878；两项独立审查Approved，交付见 docs/p03b-floating-ui-delivery.md。上述勾选为工程交付步骤，不代表用户人工验收已通过。人工第一步等待用户回复1。
