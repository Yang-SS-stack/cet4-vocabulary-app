# P-01 今日自评学习实施与恢复计划

用户已确认方案并授权直接实施。分支 codex/p01-today-learning，基于 main dc16c0a；不推送、不合并、不写 Obsidian。

目标：当天固定词集、三种自评、可靠持久化与退出恢复。沿用 React、本地存储、现有词书及发音组件。

- [x] 数据与事务：新增 todayLearning.test.js，先验证任务候选/幂等、规则、重复提交、跨天、失败/冲突、v1 迁移；在 store.js 中提供 ensureTodayLearning、submitSelfAssessment、advanceLearning，任务带方式/版本、会话序号及反馈事件。model.js 校验并无损迁移到 v2。浏览器所有写入经同一 Web Lock 串行执行，再比较原始快照，拒绝陈旧写入；不支持锁时拒绝写入并提示。
- [x] 词书接口：wordBookSession 提供默认顺序 ID 和按固定 ID 加载详情，不将全书详情载入；任务候选由程序按完成记录和每日数量选取。nextLearningItem 为单独的可替换纯函数，按顺序循环未完成词。
- [x] 页面：保留概览和复习占位，增加 LearningSession；先隐藏答案，自评成功后展示详情和发音，下一词成功后进入题面。重进先查任务，加载失败不创建任务；保存失败保留屏幕，冲突重新读取，跨天回到新任务入口。
- [x] 验证：专项测试先失败后通过；全量 npm test -- --maxWorkers=2、npm run lint、npm run build；检查生产预览可达和资源。更新 README、learning-data 及本恢复计划，提交并启动该提交本机预览。

架构边界：固定 itemIds 属于任务事实；method={id:'self-assessment',rulesVersion:1} 仅描述当前方式；feedbackEvents.source 明确为 self-assessment。无 Agent 执行器、无统一题型策略框架、无复习调度。

## 交付恢复记录（2026-09-26）

- 独立工作区：C:/Users/29864/.codex/worktrees/linguajet-p01/单词学习软件；分支 codex/p01-today-learning。原 main 工作区保持不变。
- 按用户后续说明，主智能体指定为 GPT-6 Astra，后续子任务按难度选择模型；不写入 Obsidian。
- 已完成数据、词书接口、自评页面、错误处理、设置异步保存及无损 v1 迁移。README 和 docs/learning-data.md 已更新。
- 独立只读审查发现的设置冲突恢复、旧任务已完成词题面卡住问题已加回归测试并修复；额外验证了等待写锁时设置发生变化、旧空当前位置恢复。
- 全量验证命令：npm test -- --maxWorkers=2；npm run lint；npm run build。最终结果见下面验证记录。
- 测试续跑发现原有首次设置焦点断言抢在 useEffect 之前执行；改为等待实际焦点到位，没有跳过测试、放宽超时或修改产品焦点逻辑。
- 本机生产预览：http://127.0.0.1:5191/；用 node 启动当前工作区的 Vite preview，监听 127.0.0.1，重启命令见 README。
- 2026-09-24 已在实际浏览器验证初始设置、两词创建、答案隐藏、认识后完整详情与当前窄窗口布局。Jev 2 次尝试（1 次超时、1 次低置信度），成功 0 次，均回退本地选择；其余 4 次明确控件选择直接执行。
- 2026-09-26 浏览器控制连接不可用，未宣称完成新的浏览器检查。HTTP 首页、词书 manifest 可达性已核对；刷新/重进详情、当前位置恢复、跨天及存储故障由自动化测试覆盖。最终实际发音试听、桌面和手机全面人工验收由用户完成。
- 未推送、未合并、未公开部署、未修改 Obsidian；下一步仅为用户审查和验收。

### 最终验证记录

2026-09-26：31 个测试文件、213 项测试通过（npm test -- --maxWorkers=2，62.52 秒）；npm run lint 退出码 0，保留 LearningSetupModal 原有 effect cleanup ref 提示；npm run build 退出码 0，保留按需音频清单超过 500 kB 提醒。git diff --check 通过。HTTP 首页与 dist/index.html 完全一致，首页、主脚本及词书 manifest 返回 200。

### 2026-09-27 后续实施入口

用户批准的三轮渐进学习和专注界面已在同一分支继续实施。恢复时请优先读取 [渐进学习实施与验证记录](2026-09-26-guided-learning.md) 和 README 的现行验收步骤；数据格式现为 v3，旧任务保留自评方式。
