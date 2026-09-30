# P-02 UI task review

Date: 2026-09-30. Task-scoped review of `66f8a7fd9f3dd4febf57cef6ffebce617e0a24c7..b35b747471b91c491dcecc3598cdf5250bf7184c`.

## Spec Compliance

- ✅ **审查范围内符合需求。** 未发现缺失功能、越界功能或错误的接口调用。四轮流程、保存后展示详情、完成更正、固定任务与词书、退出保护及概览均有实现证据，详见下表。
- ⚠️ **仍需控制者完成浏览器与整体验收。** 本审查没有运行浏览器、完整测试或生产构建；真实 CET4 词书、五个到期词/数量三、窄屏底部按钮和长中文标题需在实际浏览器检查。`src/components/LearningSession.css:27` 只证明添加了响应式字体与滚动上限，不能证明实际版面没有遮挡。
- ⚠️ **引擎规则超出本 UI 差异。** 跨日未完成词从零开始、排期计算和完成更正的完整持久化语义依赖既有数据任务。本 UI 使用对应专用命令，不自行计算或改写规则；接口契约来自 `docs/p02-data-report.md`。UI 测试覆盖了新词初始二、未知后四轮和完成更正，但本审查不替代数据审查。

| 要求 | 差异证据与审查结果 |
| --- | --- |
| 尽量复用现有学习流程，保留学习/额外学习接口 | `src/components/ReviewSession.jsx:1` 为五行包装；`src/components/LearningSession.jsx:31` 保留现有公开参数并增加 review 分支。没有复制整份学习组件。 |
| 先保存任务，再加载任务词书与固定词列表 | `src/components/LearningSession.jsx:106` 先调用 `ensureTodayReview`；`:109` 取保存任务词书；`:117`、`:119`、`:120` 才加载详情。分配不读取学习顺序；`:199` 只为零次选择题加载候选池。 |
| 空任务/已结束任务离线进入；最后详情可恢复 | `src/components/LearningSession.jsx:111` 在 `currentItemId === null` 时直接建立本地完成视图；`:66`、`:179` 禁止这类任务请求音频。最后已完成但尚未推进的详情仍有 current item，因此保留恢复路径。`src/components/ReviewSession.test.jsx:32`、`:72`、`:147` 验证恢复/离线/不扩充分配。 |
| 0 选择、1 英文例句、2 英文词、3 中文、4 完成 | `src/components/LearningSession.jsx:273`、`:274` 定义中文问题和最大四次；`:323` 替换标题；`:345` 仅一次时显示英文例句。引擎命令路由在 `:223` 起。`src/components/ReviewSession.test.jsx:13`、`:45` 验证二到四、模糊回退及未知重走四轮。 |
| 中文问题无英文答案、音标、英文例句、读音控件或自动读音 | `src/components/LearningSession.jsx:323` 只渲染释义标题；`:332`、`:354` 移除重播与语音状态；`:335` 的音标属于选择题分支；`:301` 阻止自动朗读；`:286` 再防直接触发。`src/components/ReviewSession.test.jsx:24` 检查问题区域完整 HTML；`src/components/ReviewAudioExit.test.jsx:24`、`:47` 检查旧队列/晚到音频不能读出答案。旧退出动画帧在 `src/components/StudyTransition.jsx:29` 被 inert 和 aria-hidden 隔离。 |
| 反馈保存后详情揭示，首轮选择结果先继续 | `src/components/LearningSession.jsx:223` 起等待专用保存命令；`:277` 保留未揭示选择反馈；`:343` 到 `:350` 依照已保存 view 显示详情；`:359` 的“继续”调用 reveal。`src/components/ReviewSession.test.jsx:80` 验证保存失败时没有详情。 |
| 完成后的未来日期；未完成继续复习 | `src/components/LearningSession.jsx:350` 仅 completed 显示引擎保存的 nextReviewAt，其余显示“继续复习本词”。没有把未结算日期展示为已确定计划。 |
| 最近正反馈可更正一次；4→3 回滚引擎结算 | `src/components/LearningSession.jsx:226` 路由专用更正命令；`:262` 识别 review correction；`:362` 使用 `canCorrectReviewFeedback` 并禁止已更正按钮。`src/components/ReviewSession.test.jsx:32` 验证原 review 对象恢复、重开后禁止再次更正、推进后返回中文轮。 |
| 明确旧任务/设置/安全锁/冲突/跨日恢复 | `src/components/LearningSession.jsx:19` 起分类错误；`:108` 拒绝旧方法；`:239` 起重新读取且 review 不切到 learning。`src/components/ReviewSession.test.jsx:80`、`:90`、`:108`、`:114`、`:120` 分别覆盖冲突/日期/旧任务/锁/保存词书。 |
| 180ms 入口、240ms 进入退出、160/240 换词、减少动画 | `src/components/TodayLearningPage.jsx:43` 起复用入口计时与双击保护；`src/components/StudyTransition.jsx:16`、`:25`、`:26` 使用现有出入时长及 reduced motion；`src/components/LearningSession.jsx:72`、`:81` 保留进入退出。`src/components/StudyEntry.test.jsx:44` 起覆盖 review 入口、双击、退出时间、返回焦点；`:64` 起覆盖减少动画。 |
| 真实内容/音频就绪后自动播放，手动播放取消自动队列 | `src/components/LearningSession.jsx:184` 等待 manifest 成功或失败；`:301` 同时检查 entry、word、body 和音频；`:320`、`:328` 仅 review 等待实际进入结束。`src/components/ReviewAudioExit.test.jsx:36`、`:55`、`:94` 覆盖串行、手动取消、进入和重试资源就绪。 |
| 确认退出后晚到结果不再启动 UI 工作；已开始写入可结束 | `src/components/LearningSession.jsx:252` 先标记退出并取消语音；`:107`、`:118`、`:121`、`:184`、`:200`、`:202` 检查晚到返回。effects 在退出时也有入口防护。`src/components/ReviewAudioExit.test.jsx:70`、`:83`、`:104` 覆盖晚返回词书、选项顺序池和初始 ensure。实际晚返回详情/manifest 的测试缺口列为 Minor，不是代码防护缺失。 |
| 剩余数量、取消/Escape 焦点与进度 | `src/components/LearningSession.jsx:248` 读取保存任务；`:249` 计算未完成/未移除数量；`:372` 起沿用对话框恢复焦点。`src/components/ReviewSession.test.jsx:98` 验证数量、取消、Escape、确认与未增加事件。 |
| 实际概览、保存词书、未分配、历史投影与数量限制文案 | `src/components/TodayLearningPage.jsx:16` 纯读 overview；`:98` 显示保存词书与已完成/任务/未分配；`:157` 显示到期和投影状态，使用“在设定数量内”。`src/components/TodayLearningPage.test.jsx:126`、`:137` 验证数量/词书变化和纯读历史投影。 |
| 真加载 200ms 延迟，错误立刻消失 | `src/components/LearningSession.jsx:318` 继续使用 LoadingIndicator 并以 error/exiting 限制显示；`src/components/ReviewAudioExit.test.jsx:117` 检查 199/200ms 和失败后的即时消失。 |

## Strengths

- 保存语义集中在引擎专用命令；UI 不写次数或复习快照。每次动作从当前显示任务构造 token，见 `src/components/LearningSession.jsx:27`、`:220`。包装组件和可选 `waitForEntry` 保留已有学习路径的默认行为，见 `src/components/ReviewSession.jsx:1`、`src/components/StudyTransition.jsx:5`。
- 中文轮通过条件渲染删掉答案与控制，并从语音入口和就绪条件两处防止播放；不是只用 CSS 隐藏。证据见 `src/components/LearningSession.jsx:286`、`:301`、`:323`、`:332`。
- 新测试多数经过真实 store、内存保存和内联词书，检查持久化结果与跨重开行为；fixture 见 `src/components/reviewTestFixture.jsx:14`，回滚测试见 `src/components/ReviewSession.test.jsx:32`。

## Issues

### Critical (Must Fix)

无。

### Important (Should Fix)

无。

### Minor (Nice to Have)

- **退出测试未真正覆盖已发起的详情/manifest 晚返回。** `src/components/ReviewAudioExit.test.jsx:70` 把 `loadBook` 挂起，在它返回前确认退出；由于 `src/components/LearningSession.jsx:66`、`:179` 的音频门槛，manifest 根本没有发起，`:78` 的 `resolveAudio?.(...)` 不执行。详情请求也只在退出后才可能开始，`:77`～`:79` 检查的是“不再发起详情”，不是“已发起详情晚返回”。因此测试名和报告的相关覆盖表述偏宽。建议保留/改名这个词书测试，再分别令真实 `loadWords` 或 manifest 已挂起，确认退出后 resolve 并断言不会重新出现题目、准备选项或朗读。生产代码的详情和 manifest 晚返回防护在 `src/components/LearningSession.jsx:121`、`:184` 均存在；该缺口不阻断本任务。

## Assessment

**Task quality: Approved。** 此处批准的是这一个 UI 任务的代码审查门槛，完整集成和真实浏览器验收仍待控制者完成。

**Reasoning:** 变更在要求的组件边界内实现四轮、持久化反馈、更正、概览和退出防护，沿用原学习结构，没有自行改变数据规则。唯一发现为非阻断的测试证据缺口。

## Review scope and verification

- 输入：任务 brief、UI 实现报告、实际数据 API 报告和提供的完整 diff 包。初始工具输出截断后只续读未收到的差异区段；未重新推导 Git diff。
- 差异切断了组件中的退出/时钟 effect；为具体的“复习是否保留 240ms 退出并在跨日停止”风险，仅补读 `src/components/LearningSession.jsx:77`～`:93`。退出计时/清理和时钟监听存在。另补读同一被截断初始化函数的 `:139`～`:149`，确认非 review 的 incumbent 加载分支未另行改变。
- 没有运行测试、lint 或 build，也没有修改生产代码、index、HEAD 或分支。已通过检查以实现者报告为证据，未冒称本审查重新执行：8 文件/75 测试、概览 9 测试、App 选定导航测试和 changed-file lint，见 `docs/p02-ui-report.md:68` 起。
- 控制者提供的 Impeccable detector 结果为 `[]`；本审查没有重复扫描，也没有据此声称真实浏览器视觉通过。
- 尚未独立确认主导航整合、所有已有学习/额外学习回归和真实浏览器媒体策略；实现者分别提供选定 App 检查与既有 focused regressions，见 `docs/p02-ui-report.md:68`、`:70`、`:75`。最终完整回归与实际预览属于控制者。
