# P-03-B UI 生成边界实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. 本轮沿用现有隔离区在当前对话实施，用户已要求开始。

**Goal:** 分开本地计算和未来模型请求，明确草稿不能应用，并交付真实接口约定。

**Architecture:** 保留原 SessionAdviceModal 数据来源及规则模块。新增纯展示状态表，外部提供者及状态必须显式提供；请求/依据绑定是响应核对而非授权。正式调用处不注入模型提供者。

**Tech Stack:** 已有 React/Vite/Vitest，不加依赖。

## Global Constraints

- 学习 schema 8、普通保存、冻结任务、原学习及旧版回退保持。
- 不改 backend、Origin、模型配置或计数；不调用 Qwen；不写 Obsidian、不合并/推送/发布。
- 服务端保护参数仍未批准，不硬编码为已实施限制。
- 原需求和本次补充以 `specs/2026-10-09-p03b-ui-generation-boundaries-design.md` 为准。

### Task 1：分离操作与模型状态

**Files:** `src/components/SessionAdviceModal.jsx/.css`、新增 `src/components/sessionAdvicePresentation.js`；验证 `src/components/SessionAdviceModal.test.jsx`。

**Interfaces:** `modelState={status,revision,remainingAttempts?,retryAfterSeconds?}`；`generate({facts,settings,intent,signal,requestId,basisVersion}) => Promise<{requestId,basisVersion,cacheHit,draft}>`。

- [x] 修改/新增失败检查：正式规则按钮名为“重新计算规则”，AI 入口默认禁用；注入提供者时规则操作不触发它。

```js
const generate = vi.fn()
harness(SessionAdviceModal, { generate, modelState: { status: 'ready', revision: 'verified-1' } })
fireEvent.click(screen.getByRole('button', { name: '重新计算规则' }))
expect(generate).not.toHaveBeenCalled()
expect(screen.getByRole('button', { name: '生成 AI 建议' })).toBeEnabled()
```

- [x] 运行 `npm test -- --maxWorkers=2 src/components/SessionAdviceModal.test.jsx`，确认新增行为因实现缺失而失败。
- [x] 实现纯状态文案/就绪判断及两个独立操作；删除并排确认按钮，保留 disabled 采用与说明。未知状态拒绝，合法服务次数才显示。
- [x] 实现请求绑定和原有迟到防护；有效返回须满足 `response.requestId === requestId && response.basisVersion === basisVersion && typeof response.cacheHit === 'boolean'`，草稿只接受 source=model。任何失败/取消记住发生时当前已观察的状态 revision，明确事后新 ready revision 才解锁手动请求；本地规则操作仍可用。
- [x] 运行相关组件/规则检查；验证原存储、原入口与冻结任务保护。

### Task 2：接口交接、回归与生产预览

**Files:** `docs/p03b-ui-component-handoff.md`、`docs/p03b-ui-verification.md`、表面契约；版本截图留在既有交付目录。

- [x] 更新参数、返回形状、状态/错误表、恢复条件及 B 的后端职责；标明规则/UI 已实施与服务器未实施。
- [x] `npm test -- --maxWorkers=2`、`npm run lint`、`npm run build`、`git diff --check`；要求完整回归0失败、lint/build退出0（如既有警告准确记录）。
- [x] 批次复核桌面和390×844窄屏：规则来源、两个生成入口、一个禁用采用入口、内部滚动及原学习按钮可达；只修复本批发现的问题，最多一次补充确认。
- [ ] 最终交付：记录本地提交和重新构建元数据，截图对应源码版本；生产确认及当步动作写在可视化目录 p03b-generation-delivery.md。此步骤状态以该最终记录为准，不上传。
- [ ] 完成逐步人工验收；当前 G1 待用户“1”，不提前标记其他步骤通过。
