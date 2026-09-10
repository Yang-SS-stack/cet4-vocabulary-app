# 学习系统数据基础

本阶段只新增 `src/data/learning/` 数据模块，没有接入或修改任何页面、词表组件和词表卡片。

## 保存方式

- 浏览器保存位置：`localStorage`
- 保存键：`linguajet.learning`
- 数据版本：`1`
- 每次修改先生成并校验完整快照，写入成功后才替换内存状态并通知订阅者。
- 保存失败时抛出错误，内存状态保持不变。
- 损坏数据或未知版本不会被自动清空或覆盖。
- 检测到其他实例先写入时，旧实例会拒绝覆盖并要求重新读取。

浏览器本地保存只属于当前浏览器和当前站点。清除站点数据会删除学习记录，本阶段不包含账号和云同步。

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
