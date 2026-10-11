# P-03-B UI → Qwen 组件接口交接

> 2026-10-10 更新：当前入口与职责以 [悬浮 Agent 当前交接](p03b-floating-ui-handoff.md) 为准。main 首次设置保留；默认入口是全局可选悬浮助手；采用进入草稿确认，确认应用禁用。以下 2026-10-09 入口说明及生成协议是保留组件的历史记录，不是当前默认入口，不应据此重建首次流程或直接接入模型。

日期：2026-10-09。当前是 UI 实现交付，人工验收待逐步完成。以 `p03b-chat-approved-ui-brief.md` 和本日用户的阶段边界为准；早期交接里的“尚未实施”是历史时点。

## 版本与整合

- 基线：本机 main `b46389224716052de39e567b89a8d652a31d5b35`，学习 schema 8。
- 工作区：`C:\Users\29864\.codex\worktrees\p03b-initial-ui\单词学习软件`，分支 `codex/p03b-initial-ui`。
- 交付源码提交和生产截图对应版本见 `p03b-ui-verification.md`。不得从旧 main 重做 UI；人工验收完成并取得整合授权后，B 再以用户认可的具体提交建立自己的隔离区。
- 原 main 的未提交文档未修改。所需五份批准/功能交接材料从原目录逐文件复制；没有把主目录其他未提交资料一并纳入。
- 未合并、推送、发布、接 Qwen、配置密钥、改 Origin、迁移记录或写 Obsidian。

## 实际入口与写入边界

`App → InitialLearningFlow → LearningSetupModal → 助手邀请 → SessionAdviceModal`。

六项普通设置保存仍调用 `store.updateSettings`；复用日期/词书/数量联动、滚轮、超负担确认、校验、保存失败及冲突处理。有效既有每日时长可为 120/240 分钟；不会被本次滑块截到 60。

本次意图和建议只在组件内存中。微调仅更新草稿；建议页只保留一个 disabled 的“采用此计划”，说明将来先确认再应用。真实确认与应用留 P-03-C。浏览、重新计算、微调不会调用任务命令。邀请跳过或建议页“按原设置开始学习” → App 的启动请求 / Today 的 `start('learning')` → 原 `LearningSession`。任务创建、恢复和进度写入仍由原系统负责，使用原设置及已冻结任务。

今日学习新增“安排本次学习”，保留旧“学习建议”及完整依据。旧首次弹窗代码保留；`?setup=legacy` 在欢迎动画完成后选择旧版。`?setup=initial` 强制打开新初始面板用于本机验收。参数只选入口，不清数据、不自动保存。正常无参数按原有效性判断是否初次设置。

## 组件参数

| 组件 | 实际参数及职责 |
| --- | --- |
| `InitialLearningFlow` | `onClose`, `onStart`, 可选 `now`；`saveSettings` 为检查替身，默认真实 `store.updateSettings`。状态 `setup / invite / advice`，成功普通保存才邀请。 |
| `LearningSetupModal` | 保留原参数；新增可选 `presentation='session'`, `beforeFields(draft)`, `afterFields`, `onSaved`。不传这些时旧界面/保存后关闭逻辑保留。 |
| `SessionIntentControls` | `intent`, `onChange(nextIntent)`；5～60、步长1，目标枚举见下。 |
| `SessionAdviceModal` | `onClose`, `onStart`, 可选 `now`, `initialIntent`, `generate`, `modelState`；默认无模型提供者，规则同步由 `buildSessionAdvice` 计算。读取当前真实 store/facts。 |
| `SessionDialog` | `title`, `onClose`, `children`, `footer`, `className`；原生 modal、Escape、锁滚、关闭按钮与焦点恢复。 |
| `TodayLearningPage` | 新增 `startLearningRequested`, `onLearningRequestConsumed`，消费一次 App 的跳过启动请求。 |

未来提供者需通过包装组件或调用处传入 `generate` 与明确的 `modelState`；仅注入函数不会自动启用。当前 App/Today 两条正式路径均不传它们，AI 入口 disabled。不要将“测试能注入模型替身”说成正式模型已接入。

## 点击与状态（UI 已实现，服务端尚未接入）

- 打开/刷新、改本次意图、查看依据、微调、保存普通设置、按原设置学习：不调用提供者。
- “重新计算规则”：同步本地计算，即使注入模型提供者也不调用它；若正在等待，取消等待并回到规则，不能承诺供应商停止或退款。
- “生成 AI 建议”：仅在提供者存在、状态明确 ready、当前有可安排任务且未被失败阻断时允许用户请求。显示模型草稿后按钮称“重新生成 AI 建议”。是否调用上游仍由 B 的服务器决定；UI 不充当权限/次数保护。
- “采用此计划”：始终 disabled，没有确认或应用写入。普通学习入口继续原系统。

`modelState` 由 B 的客户端从受保护状态接口整理后提供；不得由网页自报角色/额度核查标记解除后端保护。

```js
{ status: 'ready', revision: 'opaque-server-state-version',
  remainingAttempts: { minute: 1, day: 7, phase: 80 }, // optional, nonnegative safe integers
  retryAfterSeconds: 12 } // optional, integer >= 0; service hint, not a countdown
```

数值是接口样例，不是当前可用量或批准限额。remainingAttempts 是请求次数，不是免费 Token 余额。缺失/非法值不展示，不填0。revision 为1～128字符非空字符串；同一失败状态不能通过前端反复生成新的 revision 恢复。

| status | 行为 |
| --- | --- |
| 未提供者 | “AI 尚未接入”；禁用；不展示假服务额度 |
| 缺失/未知状态或无有效 revision | 状态无法确认；禁用 |
| disabled | 尚未启用；禁用 |
| ready | 显式生成可用；发生失败/取消后需更新已核查的 ready revision |
| running | 服务忙碌；禁用，不排队 |
| awaiting-quota-check | 待核查免费额度/有效期；禁用 |
| quota-unavailable | 免费额度不可用；禁用，具体耗尽/过期按错误证据显示 |
| limit-reached | 次数达限；禁用 |
| blocked | 配置/服务异常；禁用 |

即使换标签页/重新打开绕过 UI 内存门槛，B 的统一持久保护也必须继续阻止不合规请求。服务端参数详见[保护审核草稿](superpowers/specs/2026-10-09-p03b-server-protection-design.md)，其中拟议值仍待 B 单独审核。

## 生成接口（当前已存在）

```js
generate({ facts, settings, intent, signal, requestId, basisVersion }) => Promise<response>
// intent
{ availableMinutes: 5 /* integer 5..60 */, goal: 'progress' /* review | lighter */ }
// 最小生成结果：UI 接受并再次核对
{ requestId, basisVersion, cacheHit: false,
  draft: { source: 'model', newWords: 12, reviewWords: 10,
    order: 'balanced', reasons: ['与摘要和本次目标一致的简短理由'] } }
```

本次接口替代 f170841 的裸 draft 形状。提供者返回 `draft.source` 只接受 `model`；本地草稿仍是 `rules`。`order`: `new-first | review-first | balanced | none`。模型理由必须 1～3 条非空字符串，每条最多240字符，由服务端按合法理由代码/事实引用生成，不能直接透传模型原文。示例数字仅说明接口，不是产品预置值。

requestId 是每次手动请求新建的 UUID；basisVersion 是当前完整依据对应的内存 UUID，依据变更即更换。响应必须逐字匹配二者、cacheHit 必须 boolean。缓存命中同样绑定本次请求；只有后端证据确实表示本次无新上游调用时才能报 true。它们不包含真实记录，也不证明身份/点击来自真人，不替代服务器摘要内容校验或 Facts v1 的事实绑定。

`facts` 是现有 `buildLearningFacts` 的摘要：`book / today / reviewLoad / history / ruleRecommendation`，已剔除 `evidence`，不包含逐词事件/原快照。`settings` 仅五项：`examDate / todayWordBookId / dailyNewWords / dailyReviewWords / dailyStudyMinutes`。不传发音、选词、错题数量、凭据或整个 storage。B 的服务端仍需按批准范围进一步选字段和严格核对；这不是已实现的供应商契约。B 的前端适配需复用 buildFactsRequest/isFactsRequestCurrent 构造/核对完整 Facts v1，不能把这里五项 settings 当作七字段完整契约。请求编号、basisVersion、本地/服务端事实 hash、凭据均不得发供应商。

UI 使用本地规则计算的 bounds 核对数量：非负整数、业务上限及取整后用时；忽略提供者扩大 limits、替换 intent 或自报估时。最终存于内存的草稿还含 `status / intent / limits / bookId / estimatedMinutes / newSeconds / reviewSeconds / adjusted`。服务端的严格结构、事实绑定、语义一致性校验仍是 B 的工作。

当前本地规则：

- 上限：已有任务读冻结剩余（包括0）；无任务时新词=min(每日新词,词书剩余)，复习=min(每日复习,已知到期量)，最多各100。未知/待对账/任务词书冲突拒绝量化，不伪造0，也不执行复习对账。
- 可用时间向下取5分钟整段；新词60秒/词，复习20秒/词，合计向上取5分钟，取整后不超输入时间。
- `progress`：先把六成时间给新词，其余用于复习，某项不足再补另一项。
- `review`：先填复习，余下给新词。
- `lighter`：只使用整段预算六成，再按进度策略兼顾两项；不强制填满。
- 零量正常显示；没有到期复习时不同目标可能收敛到同一合法结果，不能为展示差异制造复习词。

## 失效、取消和错误状态

`result={draft,basis,inputKey}`，`busy`，`message`，`adjustment` 都是 UI 内存状态。`basis` 本地绑定真实完整 snapshot、日期及复习负担；完整 snapshot 不发给生成者。输入/依据变化会取消当前 signal、递增代次并清理微调；旧结果标过期，禁止微调，需手动重生成。过期草稿的分配仍按其生成时的时间显示。

生成前与返回后还直接执行 `store.readAssistantSnapshot()` 检查，拒绝外部 storage 改动先于刷新计时器的迟到结果。关闭/卸载会 abort，返回结果同时核对代次、signal、依据、输入、请求编号与依据版本。一次等待不重复触发，无自动重试。初次展示即时本地规则，没有假等待。未来供应商取消是否真的撤销请求不能由此声称。

失败/取消/进行中的依据变化会记住发生时当前已观察到的 revision，AI 入口持续禁用；不能把等待期间提前收到的 ready 当作失败之后的恢复。本地计算不会清除此门槛。客户端必须由服务重新取得合规状态，完成真实上游失败后的额度核查后提供新的 ready revision，之后仍需用户点击，不自动补发。服务忙碌/本地拒绝按后端事实恢复，不声称这些场景已花免费额度。关闭组件清除的是 UI 内存，不能清除服务器保护。

| provider 抛出 `error.code` | 当前显示 |
| --- | --- |
| `TIMEOUT` | 超时、先核查再恢复请求、保留规则 |
| `QUOTA_EXHAUSTED` | 免费额度耗尽、核查控制台余量/有效期、保留规则 |
| `QUOTA_EXPIRED` | 免费额度过期、保留规则 |
| `NETWORK` | 连接失败、先核查再恢复请求、保留规则 |
| `RESPONSE_INVALID` | 绑定/结构/数量/时间校验未通过、核查后恢复、保留规则 |
| `QUOTA_CHECK_REQUIRED` | 待核查免费额度/有效期，暂停请求 |
| `BUSY / RATE_LIMITED / LIMIT_REACHED` | 分别提示忙碌/频繁/次数达限，等待服务恢复 |
| `AUTH_REQUIRED` | 服务连接失效，需重新连接 |
| `MODEL_DISABLED / MODEL_BLOCKED` | 分别提示未启用/服务不可用 |
| `REQUEST_CONFLICT` | 请求冲突，需核对服务状态 |
| 其他 | 暂无法生成、保留规则、可按原设置学习 |

本阶段没有真实请求、超时计时器、供应商余额查询或额度诊断；错误只在合成自动检查中注入，正式 UI 无模拟故障开关。B 必须审核并实现真实超时、鉴权、去重/并发、额度核查和错误分类；早期30/35秒等提案未因此获批。不能凭普通403/429推定免费额度耗尽。

## 后续阶段

本次人工 UI 验收一次一个动作，待用户回复“1”逐项记录。未执行真实手机软键盘、供应商请求/取消/余额、线上原数据联调。P-03-A 不重新人工验收；完整真实计划采用/确认/任务应用尚未实施，归 P-03-C。

B 先读取本交接、最终版本及人工验收结果，提交功能方案，不改变已批准布局。不得根据此文自行连接密钥、发送真实样本或开始 P-03-C。没有安装 NeMo/Pydantic AI/LiteLLM，保护方案只参考其规则划分。
