# 随机选词实施计划

> 执行方式：使用 superpowers:executing-plans，在本对话逐项执行。

**目标：** 设置保存后的随机偏好决定新任务，今日与额外批次稳定恢复。
**架构：** 新纯函数选择候选；LearningSession 先抽取并加载，再在写锁内提交同一组 ID。v7 迁移严格验证旧版本，摘要请求固定七字段但校验值绑定完整状态。
**技术：** JavaScript、React、Vitest，服务契约维持 v1。

## 全局约束

- 默认 sequential，允许 random；旧 v1–v6 先完整验证再补默认字段。
- 词书内规范化去重，排除完成词；随机洗牌全部剩余候选，无放回，不跨词书。
- 新批次只抽一次；额外最多 10 词，继承今日快照。
- 加载与保存之间变化报告冲突，不静默替换已加载词集。
- 设置草稿共用保存、冲突与放弃流程，不修改滚轮算法。
- 不修改 Python 契约，不发布。

## 任务 1：纯函数与迁移

文件：src/data/learning/selection.js、selection.test.js、model.js、selectionMigration.test.js。
接口：selectLearningWords({ orderedWords, completedWords = [], count, mode = 'sequential', random = Math.random }) 返回规范化 wordId 数组。

- [x] 写可控随机测试（random=()=>0 从全书尾部抽取），去重、完成排除、不足、空值及非法模式测试；写 v1–v6 迁移及损坏拒绝测试。
- [x] npm test -- src/data/learning/selection.test.js src/data/learning/selectionMigration.test.js 确认失败。
- [x] 使用 Fisher–Yates；验证随机数 0 <= r < 1；验证 count 非负整数与合法 mode。
- [x] settingsValid(value, version) 仅 v7 接受新字段；所有旧版本检查传入实际 version，最后给全局、历史任务及额外快照补 sequential，验证 v7。
- [x] 重跑测试，确认保留原事件与进度。

## 任务 2：创建任务与快照

文件：LearningSession.jsx、LearningSession.test.jsx、store.js、todayLearning.test.js、extraLearning.test.js。

- [x] 测试 random 创建、刷新复用、额外继承今日模式、候选加载期间变化以及返回已有任务与已加载 ID 不一致。
- [x] 新任务以 initial snapshot 过滤并调用 selectLearningWords，额外用 daily.settings；调用保存前校验 snapshot 身份，传入 expectedSnapshot 在锁内再核对。
- [x] 数据层对已选候选严格核对去重、过滤、数量后的结果一致；保持旧直接调用选择接口兼容。已存在任务优先恢复，组件核对返回任务与详情一致，不展示另一组词条。
- [x] 重跑今日、额外、LearningSession 和 browserStore 专项。

## 任务 3：设置与摘要兼容

文件：SettingsPage.jsx、SettingsPage.css、SettingsPage.test.jsx、snapshotToken.js、snapshotToken.test.js。

- [x] 测试只改变草稿、保存、失败留草稿、放弃确认；请求仍只有七字段且模式修改使旧请求过期。
- [x] FIELDS 增加 newWordSelectionMode，面板顶部 role=group 两个 aria-pressed 按钮，isSaving 禁用，使用原 changeField 和 persist。
- [x] 摘要用显式七字段常量构建 settings，hash(initial.snapshot) 保持完整。
- [x] 完整 npm test、npm run lint、npm run build、git diff --check；用隔离样本对当前 Python 验证器核验请求。
- [x] 更新 docs/learning-data.md 和验收记录；提供制作分支预览及第一项人工验收操作。

实际验证与限制见 [验收记录](../../sidebar-random-selection-acceptance.md)。实施步骤已完成；用户人工验收单独进行。
