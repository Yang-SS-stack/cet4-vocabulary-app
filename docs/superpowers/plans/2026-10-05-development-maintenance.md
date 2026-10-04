# 开发验收与维护页面实施计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development 分职责执行，主智能体负责整合、专项审查及最终验证。下列勾选项同时作为恢复进度；详细记录在 `.superpowers/sdd/progress.md`。

**Goal:** 在设置中提供独立维护页，将已有汇总迁入统计，安全地保存和复制标签页临时检查记录。

**Architecture:** 原学习引擎和事实计算保持不变。复用 App 外层的同一个 AssistantProvider；统计、今日简要进度和对账各自展示同源事实；检查终态使用固定字段构造，保留内存最近20条。原始记录、凭证和摘要内容不能进入诊断列表或报告。

**Tech Stack:** 现有 React/Vite、Vitest/Testing Library、浏览器内存状态和 Clipboard API；不新增依赖或后端接口。

## 全局约束

- 用户2026-10-05已批准详细设计并要求“开始吧”；允许实现和本机预览，未授权合并、上传、公开发布或模型调用。
- 工作区：`C:\Users\29864\.codex\worktrees\development-maintenance\单词学习软件`，分支 `codex/development-maintenance`，起点 `8ab064e08341a5975194779323542563fc84931a`。
- 设计依据：`docs/superpowers/specs/2026-10-05-development-acceptance-maintenance-design.md`；主目录既有未跟踪文件与旧P-03-A环境保护。
- 不修改学习引擎、事实算法、摘要字段、后端、发布工作流或来源限制。
- 统计只包括已有今日/近7天；今日只保留必要进度及原建议；对账明细每页50条。
- 一个项目一次展示；构建信息未知不补造；历史技术成功不是当前检查通过或人工验收通过。
- 诊断最多20条、标签页内存；不进入任何存储、文件、后端或Obsidian。逐词、事件、原始快照、计数、考试日期、连接码、会话令牌、认证头及依据指纹不复制。
- 看记录、切范围、复制和清空诊断不发请求或写学习存储；只有连接/检查按钮执行已有接口。
- 人工验收一次一个操作，1表示完成当前步；不重复P-03-A已通过的操作。

## 文件责任与共享接口

任务1独占事实展示与统计组件；任务2独占 Provider、diagnostics 模块及其专项测试；任务3由主智能体负责 App、Settings、LineSidebar、LocalBackendCheckPanel、维护页和对应迁移测试；任务4为版本信息与全套验证。所有任务在同一工作区，不改他人负责文件，不操作共享Git索引；最终主智能体统一精确暂存和本机提交。

Provider新增接口（任务2产出，任务3使用）：

```js
// useAssistant() 中保留原字段，新增：
{ diagnostics, cancel, clearDiagnostics }
// diagnostics 为由以下函数返回的只读安全行数组，最新在前。
// cancel() 取消当前等待、使回调失效；检查取消保留会话，配对取消不保持会话。
// clearDiagnostics() 只清历史列表，不断开、不清当前检查结论、不写学习数据。
```

纯诊断模块接口（任务2产出）：

```js
createDiagnosticRecord({ operationId, kind, startedAt, finishedAt,
  durationMs, outcome, httpStatus, requestId, receivedAt,
  errorCode, retryAfter, restartRequired, basisState })
appendDiagnosticRecord(records, record) // 去重，同一编号一次终态，最新20条
invalidateDiagnosticRecords(records) // current -> stale，不追加行
formatDiagnosticReport(record, { buildInfo, generatedAt })
// kind: connect | real | illegal
// outcome: success | expected-rejection | failure | cancelled | invalidated
// basisState: current | stale | not-applicable
// 每个函数只保留明确字段；错误中文从固定错误码映射，不读取输入 message。
// nullable状态/请求号不补造；构建信息只允许 branch/commit/builtAt/dirty。
```

事实展示接口（任务1产出，任务3使用）：

```jsx
<TodayTaskProgress facts={facts} error={error} includeReview={false} />
<LearningFactsSummary facts={facts} error={error} />
<LearningFactsEvidence facts={facts} error={error} />
<StatisticsPage now={optionalFixedDate} />
// 均从 LearningFactsPanel.jsx 导出（StatisticsPage单独默认导出）。
// 默认 LearningFactsPanel 可保持组合展示用于独立复用；产品页用明确职责的组件。
```

### Task 1: 事实展示拆分与统计

**Files:** `src/components/LearningFactsPanel.jsx/.css`、`TodayLearningPage.jsx`、`StatisticsPage.jsx/.css`（新增）、对应事实/统计/今日测试。不得编辑 App、Provider、Settings 或 LocalBackendCheckPanel 的迁移测试。

- [x] 新增行为测试，先执行观察失败：统计呈现近7天及有效更正，今日没有完整反馈/原始字段，明细分页仍只读。

```jsx
render(<LearningStoreProvider store={store}><StatisticsPage now={now} /></LearningStoreProvider>)
await user.click(screen.getByRole('button', {name:'近 7 天'}))
expect(screen.getByText(/当前词书；按任务日期归属/)).toBeInTheDocument()
expect(screen.queryByText('原始对账字段')).not.toBeInTheDocument()
expect(storage.setItem).not.toHaveBeenCalled()
```

- [x] 抽出已有展示逻辑，保持数字口径及提示。TodayTaskProgress的区域名为“今日任务进度”，复用TaskProgress；includeReview=false让原今日复习进度解释避免重复。缺facts保留读失败提示，未创建与0分开。
- [x] 统计使用useLearningFacts的同源结果，保留当前词书/任务词书区分、到期投影、反馈完整性及异常；不绘新图或添筛选算法。
- [x] 对账组件自行选择今日/近7天，提供当前词书/任务日期说明及现有任务/事件/异常50条分页；不发送或保存任何资料。
- [x] 保留学习建议的事实读取，更新移位的组件断言；执行 `npm test -- src/components/LearningFactsPanel.test.jsx src/components/StatisticsPage.test.jsx src/components/TodayLearningPage.test.jsx --maxWorkers=2`，记录实际结果。
- [x] 自检写入 `.superpowers/sdd/task1-report.md`，不提交Git。

### Task 2: 安全终态记录与取消

**Files:** `src/data/assistant/diagnostics.js/.test.js`（新增）、`src/data/assistant/react.jsx`、`src/data/assistant/diagnosticProvider.test.jsx`（新增）。保留现有localClient及摘要构造的严格匹配校验；不编辑共享UI测试。

- [x] 新增关键测试，观察失败：21次只保留最近20次，同编号不重复；注入秘密/快照/任意message不能进入行和报告；缺失状态显示未取得。

```js
const record = createDiagnosticRecord({operationId:1,kind:'real',outcome:'success',
  startedAt:'2026-10-05T00:00:00.000Z',finishedAt:'2026-10-05T00:00:01.000Z',
  durationMs:1000,basisState:'current',sessionToken:'secret',snapshot:{private:true}})
expect(JSON.stringify(record)).not.toMatch(/secret|snapshot/)
expect(appendDiagnosticRecord([record],record)).toHaveLength(1)
```

- [x] 纯函数按显式枚举、有限数字、实际安全标识和固定字段构造新对象；不能扩散输入对象。报告显示项目/样本、时间/等待耗时、结果、可靠状态及请求编号、固定中文错误、依据适用性与版本，不显示内部指纹或用户计数。
- [x] Provider为每个开始动作保留编号/开始时间及单调时钟；结束最多追加一次，先将安全字段选出再交给记录函数。成功真实摘要才复制已严格验证的requestId/receivedAt且标200；连接只记总体结果、未取得阶段状态不填200。
- [x] 进行中依据变化记invalidated；已结束结果依据变化只标stale。新真实检查开始、断开、过期和重新连接使此前current标记失效。非法示例不替代真实摘要结论。
- [x] cancel更新操作代次并abort；真实检查取消不保持本次成功，非法取消保持此前有效真实结论；配对取消不能晚发请求或恢复连接。保留原60秒权限/健康等待及独立5秒配对/检查。
- [x] 新实例列表为空，clearDiagnostics只清列表；busy中仍可取消/断开。未知错误映射为固定提示，不把任意错误全文写诊断。失败合成响应不推断接受或伪造状态。
- [x] 执行 `npm test -- src/data/assistant/diagnostics.test.js src/data/assistant/diagnosticProvider.test.jsx src/data/assistant/localClient.test.js src/data/assistant/snapshotToken.test.js --maxWorkers=2`，并写 `.superpowers/sdd/task2-report.md`。

### Task 3: 独立维护页与导航/草稿保护

**Files:** `src/App.jsx/.test.jsx`、`SettingsPage.jsx/.test.jsx`、`LineSidebar.jsx/.test.jsx`、`LocalBackendCheckPanel.jsx/.css/.test.jsx`、`DevelopmentMaintenancePage.jsx/.css/.test.jsx`（新增）、`DiagnosticReport.jsx`（新增，若拆分有助于清晰）。

- [x] 用现有App测试入场助手新增入口/返回与统计替换测试；Settings新增未保存确认/保存后不误报/失败仍保护测试。先运行观察缺入口失败，再实现。

```jsx
await user.click(screen.getByRole('button',{name:'设置'}))
await user.click(screen.getByRole('button',{name:'开发验收与维护'}))
expect(screen.getByRole('heading',{name:'开发验收与维护'})).toBeInTheDocument()
expect(screen.getByRole('button',{name:'设置'})).toHaveAttribute('aria-current','location')
await user.click(screen.getByRole('button',{name:'返回设置'}))
await waitFor(()=>expect(screen.getByRole('button',{name:'开发验收与维护'})).toHaveFocus())
```

- [x] App采用内部页面名“开发验收与维护”，不添路由/独立URL。LineSidebar新增可选activeIndex/current类型，保留默认自管模式；维护页所属设置aria-current=location。
- [x] Settings新增onOpenMaintenance回调；以createDraft后的深层值基线比较draftRef。保存成功更新为实际提交草稿，显式重读成功更新，失败保留。滚轮变动期间及时禁用新入口，结算后再允许。页面内原生dialog默认“留在设置”，Escape保留草稿，确认丢弃只调用导航。
- [x] 维护页顶部返回/版本/连接与摘要状态；主体三视图“连接与检查/记录依据/检查记录”，连接视图一次一项目。LocalBackendCheckPanel接受project=connect/real/illegal及expanded属性；默认原导出行为保留，迁移原P03A测试为直接面板测试，不把旧面板重新挂回Settings。
- [x] 等待中禁用检查项目选择、保留取消/断开；切应用页面共享Provider仍存在。项目选择不重新配对或发送，所有网络动作保留主动按钮。
- [x] 检查记录显示当时结果/当前适用性，选一条预览后用户复制；空列表提供明确“演示报告，未执行请求”的独立预览，不插入真实记录。Clipboard失败提供可选中文本。报告根据最新安全行构造；清空按钮使用明确页面内确认，不碰学习存储。
- [x] 本页样式延续暖纸/深蓝/金色；长标识换行，窄屏按钮堆叠；tab/panel语义、焦点、状态live、减少动画兼容。
- [x] 运行本任务关联测试和任务1/2兼容测试；记录 `.superpowers/sdd/task3-report.md`。

### Task 4: 构建信息、整合审查与交付预览

**Files:** `scripts/build-info.mjs/.test`（如采用）、`src/data/buildInfo.js/.test.js`、`vite.config.js`、本阶段使用/验收文档。

- [ ] 从git命令参数数组读取branch、commit、dirty，构建时生成builtAt；失败返回null，不读全体环境变量或凭证；运行时读取编译常量并规范化固定字段。

```js
// vite define只提供公共构建元数据，不能展开process.env。
define: { __LINGUAJET_BUILD_INFO__: JSON.stringify(readBuildInfo()) }
```

- [ ] 完整检查需求覆盖与Git差异；两名专项审查分别看Provider/隐私及页面/草稿/导航，处理可行动问题。审查报告不代替测试。
- [ ] 执行 `npm test -- --maxWorkers=2`、`npm run lint`、`npm run build -- --base=/cet4-vocabulary-app/`；原提示如保留需准确记录。backend未改不另装环境/重跑全套。
- [ ] 精确暂存本任务文件并在制作分支本机提交，不推送；重新构建确保版本元数据与提交一致。日志和报告仅在忽略的`.superpowers/sdd/`。
- [ ] 启动本机生产预览，实际浏览器检查桌面/窄屏/键盘/确认框/减少动画；用隔离样本而非用户真实记录。记录预览地址、分支、提交与限制。原在线跨源联调如需要发布另行明确授权。
- [ ] 给用户第一个新增人工验收操作：进入预览的设置，确认能找到“开发验收与维护”入口。一次只给这一个操作及预期；等1再继续。
- [ ] 更新阶段恢复卡与验收记录，页面完成后才转入P03B设计；记忆更新另展示文本等待确认。

## 自检与恢复

计划已覆盖批准设计的三个页面、入口草稿、状态/失败、临时记录、复制边界、单项目、自动和人工验收与发布权限；接口名在任务之间统一。执行中状态写ledger和各任务报告，不因上下文恢复重做已完成工作。
