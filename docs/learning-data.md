# 学习系统数据基础

本文保留 Prompt 1／2 的基础设计说明；P-01 的现行行为以文末章节为准。

Prompt 1 新增了 `src/data/learning/` 数据模块。Prompt 2 在不修改现有词表浏览页和词表卡片的前提下，接入了首次设置、设置页和“今日学习”概览；P-01 已接入真实新词自评流程，复习与错题本学习页面仍未实现。

## 保存方式

- 浏览器保存位置：`localStorage`
- 保存键：`linguajet.learning`
- 当前数据版本：`3`（兼容读取 `1`、`2`）
- 每次修改先生成并校验完整快照，写入成功后才替换内存状态并通知订阅者。
- 保存失败时抛出错误，内存状态保持不变。
- 损坏数据或未知版本不会被自动清空或覆盖。
- 检测到其他实例先写入时，旧实例会拒绝覆盖并要求重新读取。

浏览器本地保存只属于当前浏览器和当前站点。清除站点数据会删除学习记录，本阶段不包含账号和云同步。

## Prompt 2：首次设置与设置页

### 合并的首次设置

欢迎动画结束后，若考试日期、学习词表、每日新词数量、每日复习数量或每日学习时长有任一项未完成，网页会显示一个合并的五项设置弹窗。五项需要通过“保存并继续”一次性保存。“今日学习”和“今日复习”在本阶段仍是说明后续流程尚未启用的状态按钮，不再分别触发设置。

弹窗的“暂不开始”不会写入本地设置；刷新页面后会再次检查设置是否完整。首次设置成功后，后续修改统一从“设置”页进入。错题本每日学习数量可在设置页预先修改；Prompt 7 的错题本页面、右上角“学习”入口、自动入库和首次触发流程仍未实现。

### 滚动选择器与取值范围

所有设置采用类似 iPhone 闹钟的滚动选择器。每个弹窗或设置页同一时刻只展开一个选择器；切换另一项前，会先保留当前滚动位置到页面草稿，再收起原选择器并展开下一项。这样滚轮区域保持紧凑，不会因多个选择器同时展开而推高页面。

| 设置 | 可选范围 |
| --- | --- |
| 考试日期 | 年、月、日三列；年份从当前年（或已选更早年份）到当前年后 5 年（或已选更晚年份），日期按当月实际天数提供 |
| 学习词表 | 当前词书清单中的词表 |
| 每日新词、每日复习、错题本每日学习数量 | 1 至 100 词，逐个选择 |
| 每日学习时长 | 5 至 240 分钟，每 5 分钟一档 |
| 发音偏好 | 英音（`en-GB`，默认）或美音（`en-US`） |

### 建议、估算与用户决定

“今日学习”概览将研究原则、系统计划和用户设置分开显示。考试日期或学习词表改变时，会按当前词表剩余单词数与距离考试天数计算并自动带入每日新词数量；每日新词或每日复习数量改变时，会重新计算预计时长。用户仍可在这些自动更新后手动编辑最终计划时长。考试所需的原始数量计算为：

`向上取整（当前词表未完成单词数 ÷ 距离考试天数）`

仅当距离考试天数大于 0 时该计算可用。界面会显示这个未封顶的考试所需数量；系统可编辑建议将其限制在每天 1 至 100 个新词，超过 100 时显示考试前可能无法完成的提醒。系统不会在保存后自动写入或覆盖用户设置。预计每日学习时间为：

`向上取整到 5 分钟（每日新词数 × 60 秒 + 每日复习数 × 20 秒）`

其中“每个新词 60 秒、每个复习词 20 秒”是按当前日期、词表和用户选择形成的**产品个性化建议**，不是研究结论、固定每日词数或对所有学习者的承诺。研究依据只支持间隔学习和主动回忆的原则，不给出通用数值处方。当估算时间超过用户选定的每日学习时长，保存前只会显示“返回调整”或“仍然保存”的提示；系统不会自行降低、提高或以其他方式修改用户数量与时长。

设置与学习记录继续保存到浏览器当前站点的 `localStorage`（键为 `linguajet.learning`）。刷新页面或再次打开同一浏览器时，已成功保存的设置会保留；清除站点数据会删除它们，本阶段没有账号或云同步。

### 当前边界

- Prompt 3 的真实今日新词任务创建、抽词、三次认识流程和完成状态联动尚未实现；设置完成后仅提示该流程将在下一阶段启用。
- Prompt 4 的到期／逾期复习任务、实际复习排程和按到期词更新的建议尚未实现；当前“今日复习”仅为提示后续阶段的状态按钮。每日复习数量在合并的首次设置弹窗或“设置”页配置，真实的到期／逾期复习任务仍留待 Prompt 4 实现。
- Prompt 7 的错题本页面、右上角“学习”入口、自动入错题本和错题本学习流程尚未实现。已有的错题本设置字段与弹窗模式只用于为后续流程保留配置能力。

## 单词标识

学习与复习使用“词表 + 单词”作为唯一标识。例如 `cet4` 中的 `apple` 和 `cet6` 中的 `apple` 是两条记录。因此，同一拼写在不同词表中的学习完成状态、复习阶段和复习时间彼此独立。

错题本只使用规范化后的单词拼写作为标识，两个词表中的 `Apple` 都归入全局唯一的 `apple` 错题记录。

单词拼写会先进行 Unicode NFKC 规范化、去除两端空格并转为小写。词表 ID 保留原大小写，只去除两端空格。

## 根数据结构

```text
version
settings
wordBooks
  词表 ID
    words
      单词 ID
mistakes
  全局单词 ID
days
  本地日期 YYYY-MM-DD
    learning
    review
    mistakes
```

### 用户设置

| 字段 | 含义 | 默认值 |
| --- | --- | --- |
| `examDate` | 考试日期，`YYYY-MM-DD` | `null` |
| `todayWordBookId` | 当前学习词表 ID | `null` |
| `dailyNewWords` | 每日新词数量 | `null` |
| `dailyReviewWords` | 每日复习数量 | `null` |
| `dailyStudyMinutes` | 每日计划学习时长，单位为分钟 | `null` |
| `pronunciation` | `en-GB` 英音或 `en-US` 美音 | `en-GB` |
| `mistakeStudyWords` | 错题本每日学习数量 | `null` |

除发音外，`null` 表示用户尚未完成对应设置。数量和时长必须为非负整数。数据中不保存每日固定开始时刻。

当日任务创建时会复制一份设置快照。之后修改全局设置，只影响尚未创建的任务，不改变已开始的当日任务。

### 词表内单词记录

每个 `wordBooks[词表 ID].words[单词 ID]` 保存：

- `learning.completed` 和 `learning.completedAt`：该词在该词表中是否完成学习及完成时间。
- `review.enteredAt`：进入复习库时间。
- `review.lastReviewedAt`：上次完成复习时间。
- `review.nextReviewAt`：下次复习时间。
- `review.stage`：当前复习阶段位置。
- `review.completedReviewCount`：累计完成复习次数。
- `review.mastered` 和 `review.paused`：长期掌握与暂停复习状态。

`review` 在尚未进入复习库时为 `null`。阶段位置如下：

| 阶段 | 含义 |
| --- | --- |
| `0` | 已进入复习库，等待首次复习 |
| `1` | 第 1 天阶段 |
| `2` | 第 2 天阶段 |
| `3` | 第 4 天阶段 |
| `4` | 第 7 天阶段 |
| `5` | 第 15 天阶段 |

阶段基准数组 `REVIEW_STAGE_DAYS` 为 `[1, 2, 4, 7, 15]`。具体的认识、模糊、不认识推进算法属于 Prompt 4；本阶段只保存阶段位置和实际时间。首次加入复习库时，默认下次复习时间为设备本地日期的次日 00:00。

`completedReviewCount` 用于后续区分“已进入复习库但从未完成复习”和“至少完成过一次复习”。

### 全局错题记录

每个 `mistakes[单词 ID]` 保存：

| 字段 | 含义 |
| --- | --- |
| `unknownCount` | 历史不认识总次数，移出错题本后仍保留 |
| `unknownCountSinceRemoval` | 首次入库前或最近一次移除后重新累计的次数 |
| `lastErrorAt` | 最近一次不认识时间 |
| `entered` / `enteredAt` | 是否曾进入错题本及首次进入时间 |
| `removed` / `removedAt` | 当前是否已移除及最近移除时间 |

自动入错题本阈值 `MISTAKE_ENTRY_THRESHOLD` 为 `5`。自动判断属于后续错题本流程；本阶段提供累计数据以及显式的加入、移除操作。移除时只把 `unknownCountSinceRemoval` 清零，不清除历史总次数。

### 每日任务

`days[日期]` 下分别保存 `learning`、`review` 和 `mistakes` 三类任务。每个任务保存：

| 字段 | 含义 |
| --- | --- |
| `date` / `kind` / `createdAt` | 日期、任务类型和创建时间 |
| `wordBookId` | 今日学习所用词表；跨词表复习或错题任务可为 `null` |
| `settings` | 创建任务时的用户设置快照 |
| `itemIds` | 当天确定后的固定单词顺序 |
| `items` | 每个单词独立的当日任务状态 |
| `currentItemId` | 退出前正在查看的单词 |
| `previousItemId` | 上一个单词，用于后续尽量避免连续重复 |
| `view` | `question` 答题状态或 `feedback` 完整信息状态 |

每个任务单词保存认识次数、模糊次数、不认识次数、最近反馈、完成和移出状态及对应时间。

状态管理已实现以下基础规则：

- “认识”加 1，最高为 3；达到 3 时完成。
- “模糊”让认识次数减 1，最低为 0，同时记录模糊反馈。
- “不认识”把认识次数清零，同时更新当日次数和全局错题历史。
- 完成后仍保留在任务中，调用 `removeCompletedTaskItem` 才标记为已移出。
- 新的一天创建新任务状态，同一遗留词从 0 次认识开始；旧日期状态保留作为历史。
- 同一天重复调用 `ensureTask` 返回已保存任务，不替换单词集合、顺序或状态。

后续 Prompt 负责挑选候选词、随机切换、自动加入复习库、自动加入错题本、跨天积压分配和页面提示。本阶段没有提前实现这些页面流程。

## 公开接口

数据入口为 `createLearningStore()`。主要方法包括：

| 方法 | 用途 |
| --- | --- |
| `getSnapshot()` / `subscribe()` | 读取只读快照并订阅保存成功后的变化 |
| `updateSettings(patch)` | 修改用户设置 |
| `ensureTask(kind, entries, wordBookId)` | 创建或恢复当天某类任务 |
| `getTask(kind, date)` | 获取今天或指定日期的任务 |
| `setTaskSession(kind, patch)` | 保存当前词、上一个词和答题/反馈状态 |
| `recordFeedback(kind, entry, feedback)` | 原子记录认识、模糊或不认识反馈 |
| `removeCompletedTaskItem(kind, entry)` | 标记完成词已由“下一个”移出 |
| `getWord(wordBookId, word)` | 读取某词表内的学习和复习记录 |
| `addToReview` / `updateReview` | 建立或更新逐词复习记录 |
| `getReviewLibrary` / `getDueReviews` | 查询复习库或到期记录 |
| `getMistake` / `getMistakes` | 查询全局错题记录 |
| `addToMistakes` / `removeFromMistakes` | 显式加入或移出错题本 |
| `getDailyStats(date)` | 汇总指定日期任务中的词次和反馈次数 |

所有返回的快照均为深层只读对象。更新必须通过仓库方法完成。未来 React 页面可将 `getSnapshot` 和 `subscribe` 交给 `useSyncExternalStore` 使用。

## 本阶段验收

运行 `npm test -- src/data/learning/foundation.test.js`。测试覆盖设置、词表隔离、全局错题去重、反馈变化、跨天归零、同日恢复、复习记录、本地 00:00、三类任务、持久化失败、损坏数据和多实例覆盖保护。

## P-01：现行今日学习协议（2026-09-24）

### 任务事实和学习方式

固定任务的 itemIds、wordBookId、date、settings 与 createdAt 属于程序事实，不由展示顺序或未来 Agent 建议改写。创建前通过词书 session.loadLearningOrder 读取资源默认顺序，按该书完成状态过滤、去重并限制到 dailyNewWords（1–100）。session.loadWords 按这些固定 ID 加载所需分片；加载失败不创建任务。没有候选词时也保存空任务，保证当日幂等。

学习任务增加 method={id:'self-assessment',rulesVersion:1}、sessionRevision 和 feedbackEvents；其他旧任务的 method 为 null。nextLearningItem(task) 是集中、可替换的下一词选择接口：从当前词之后按固定顺序循环，跳过完成／移除词。它不改变 itemIds。未接入通用策略引擎。

### 原子命令与权限边界

浏览器应用只通过 createBrowserLearningStore 暴露以下写操作，均返回 Promise：

| 方法 | 校验与结果 |
| --- | --- |
| updateSettings(patch) | 原有设置校验；只影响以后创建任务 |
| ensureTodayLearning(bookId, orderedWords, expectedDate, expectedSettings) | 先检查当天任务；无任务时校验加载时的日期和设置，过滤未完成词、限制数量，保存固定快照 |
| submitSelfAssessment({date,itemId,revision}, feedback) | 校验本地日期、任务、方式版本、当前词、序号和 question 状态；同一写入保存反馈、错误证据、完成标记、事件和 feedback 详情状态 |
| advanceLearning({date,itemId,revision}) | 只接受同日当前详情；原子保存 previousItemId、下一未完成词、question 状态和递增序号；全部完成时 currentItemId=null |
| reload() | 重新读取并完整校验；不写数据、不重放失败动作 |

所有浏览器写操作使用同一 Web Locks 名称 linguajet.learning，再比较存储原始快照，拒绝陈旧实例覆盖。锁内无异步存储间隙；localStorage.setItem 成功后才发布只读内存快照。浏览器不支持安全锁时拒绝写入；页面提供明确提示。页面禁用正在提交的控件，数据层仍独立拒绝重复或迟到 token，包括同一个词进入下一轮后的旧请求。

基础同步 createLearningStore 保留旧 API 以兼容基础层和历史测试；recordFeedback／setTaskSession 等低层接口不暴露给浏览器业务，不能用于新页面或未来 Agent。设置页等待异步保存结果，冲突时用户可重新读取已保存设置后核对；首次设置冲突提示退出并刷新。

### 自评规则与证据

认识 +1，3 次完成；模糊 -1，最低 0；不认识清零。当次不认识同时更新全局 unknownCount、unknownCountSinceRemoval、lastErrorAt；累计达到 5 时自动标记 entered，恢复 removed=false。移除操作仍保留历史总数并重新累计 5 次。没有实现错误证据库页面。

每个新反馈事件保存 source='self-assessment'、rulesVersion=1、itemId、feedback、at、revision。未来生成题目的答错必须使用独立来源和规则，不能调用自评不认识命令冒充自评。规则版本和“三次认识完成”不代表未来其他题型的完成条件。

完成学习只更新本词书 learning.completed，不自动创建复习任务或计算间隔。旧 getDailyStats 的 knownCount 是当前认识计数，原有 feedbackCount 由当前计数相加，并不等于历史逐次反馈总数；P-01 新任务的真实反馈次数可读取 feedbackEvents.length，统计页面不在本次范围。

### 日期、恢复及旧数据

本地年月日组成任务日期，00:00 跨天。提交和下一词都在获得写锁之后重新检查时钟；旧 token 不可写入当天或昨日任务。页面在焦点恢复、可见性变化和短周期检查日期，并在每次动作前验证。旧日任务和事件原样保留，未完成词在下一天的新快照中从 0 开始。

v1 迁移先严格验证整个旧快照，再克隆并增加方式、序号 0 和空事件数组。单词完成、复习库、错误证据、每日计数、设置和固定词集均保留。旧接口可能留下“已完成词 + question”，此时只把会话恢复为详情，使下一词可继续；currentItemId=null 但有未完成词时恢复首个未完成词。历史逐次反馈无法重建，保持空事件数组。迁移只发生在内存，首次正常写入成功才保存 v2；失败不覆盖 v1。损坏和未知版本不自动删除。

不同浏览器、主机名、协议和端口的存储相互独立。旧版代码不理解 v2；版本切换前关闭旧标签，保留新版处理的数据。Web Locks 保证使用该协议的新版页面互斥，不能锁住不遵守协议的旧版页面或外部脚本。

### 验证入口

运行 npm test -- --maxWorkers=2。P-01 重点文件：todayLearning.test.js（候选、规则、幂等、日期、迁移和保存失败）、browserStore.test.js（串行写入、重复提交、锁内跨天、无锁拒写）、wordBookLearning.test.js（默认顺序和分片重试）、LearningSession.test.jsx（隐藏答案、详情／位置恢复、加载／保存失败、冲突和完成）。设置与原有词书／页面测试继续执行。

程序负责事实、日期、持久化和校验。未来 Agent 仅输出结构化建议，由程序校验，重要计划变更由用户确认；本版没有模型请求、Agent 工具或后端。

## P-01 渐进式单词学习补充（2026-09-26）

新建“今日学习”可把 `ensureTodayLearning` 的第五个参数设为 `{id:'guided-recall',rulesVersion:1}`。不传时仍创建旧版 `self-assessment` 任务；当天任务一旦存在，重复调用原样返回，不能静默转换方式。v1、v2 历史任务迁移时保持自评方式和进度，仅为各任务加入 `choice:null`，迁移到 v3 仍只在下一次成功写入后落盘。

渐进式任务在单词 `knownCount===0` 时先调用 `prepareLearningChoice({date,itemId,revision}, options)`。`options` 必须是四个 `{word,meaning}`，包含当前单词，四个单词与四个释义各不重复。数据层按传入顺序保存为 `task.choice.options`；页面应先从已加载的词书事实组成选项，再调用此命令。题目一旦保存，当轮再次准备返回已存选项，保证刷新后顺序稳定。每次成功写入都会增加 `sessionRevision`，页面需使用新序号生成下一次操作的 token。

`submitLearningChoice(token, selectedWord)` 接受四个选项中的单词或 `null`（显示答案）。答对使当前词 `knownCount` 从 0 变为 1；答错或显示答案保持 0。该命令保存 `view:'feedback'`、`choice.selectedWord` 和独立的 `guided-choice` 事件，`outcome` 分别为 `correct`、`incorrect`、`show-answer`。选择后 `choice.revealed:false`，页面可先显示选项反馈；随后 `revealLearningDetails(token)` 将它改为 `true`，才显示完整释义和例句。显示答案直接保存 `revealed:true`。`advanceLearning(token)` 要求已揭示，切换到下一词时清空 `choice`。此类选择题事件不增加全局错题次数，也不伪装成自评的“不认识”。

同一词下一轮 `knownCount>=1` 时继续使用 `submitSelfAssessment(token, feedback)`，沿用认识加一、模糊减一、不认识清零以及自评不认识的错题计数。若模糊或不认识使认识次数回到 0，该词下次出现重新进入四选一。浏览器仓库对新增三个写命令同样使用 Web Locks，并在锁内校验当前日期、词、序号和保存快照；重复提交、跨天旧请求以及写入失败不会发布新进度。

页面边界：学习和未启用的复习页使用专注外壳，返回主界面不删除任务。单词标题、可滚动正文、底部操作分区；宽屏详情分栏。题面按当前认识次数递减提示，后两轮不显示音标或中文翻译。首次选项由词书默认顺序前80词与目标词构成候选池，确定性排除重复及相同释义片段；不足4项则报可重试错误，不生成虚构释义。选项仅在需要时加载，恢复已保存结果不依赖重新加载干扰词。

动画为表现状态，不参与学习计数：保存完成之后才开始旧内容淡出160ms、新内容淡入240ms；淡出时旧控件 inert，不能再次交互。系统减少动态效果时不播放过渡。
