# P-02 数据任务审查

日期：2026-09-30。初审范围：`7c48914..fddfe249cb4d97a99319cb996c72e4a5e9d0af17`；修复复审范围：`fddfe249..66f8a7fd9f3dd4febf57cef6ffebce617e0a24c7`。依据 `docs/superpowers/plans/p02-data-brief.md`、实现报告和指定审查包。未重新生成 Git 差异，未改动生产代码、测试、分支或提交。

## Spec Compliance

- ✅ 修复后可核验的数据任务符合需求。初审的 P2 冲突缺口已关闭：`src/data/learning/store.js:165` 现在在复用已准备选项前验证保存快照，保持原有冲突错误和 no-op 行为。修复复审没有发现新问题。
- 其余可从本次差异核验的核心规则符合需求：默认 count2 且无虚构事件、跨日未完成归零、学习完成3／复习完成4、只在4结算、负面证据排期、来源及撤回边界、固定当日分配、历史投影／补录、版本迁移和浏览器锁。具体证据见下文。
- ⚠️ 阶段3仅显示中文且禁止单词声音属于后续界面任务，本次没有界面差异，不能验收；控制器应在下一任务逐项核对。
- ⚠️ 全项目测试和界面集成不能由此差异证明。`docs/p02-data-report.md:113` 明确交由控制器运行完整测试；本审查没有重跑已报告通过的数据测试套件。

## Strengths

以下为初审证据，行号对应初审 head `fddfe249`；文末修复复审行号对应 `66f8a7fd`。

- `src/data/learning/store.js:125` 根据最新历史复习记录决定初始0或2，创建时保存设置和稳定分配，事件数组为空；`store.js:113` 的历史补录和当日创建经过一次 `change`，既有分配不会扩展。`store.js:115` 的既有任务快速返回还明确检查保存快照，避免无写入时忽略存储冲突。
- `src/data/learning/reviewSession.js:25` 将复习反馈独立为明确的四次完成规则；该文件结算分支只在完成时更新排期、复习时间及次数，保存完整旧 review 对象。`src/data/learning/store.js:204` 的纠正流程恢复该对象，同时保留原事件并追加引用原 revision 的纠正事件。
- `src/data/learning/reviewLibrary.js:16` 对撤回同时检查完成身份、完整 pristine 记录及任何历史复习任务引用；`reviewLibrary.js:29` 仅投影真实学习完成且无 review 的记录，保留原完成时间，没有凭空生成反馈事件。
- `src/data/learning/reviewLibrary.js:43` 按截止时间、暂停／掌握状态、当前可纠正完成及词书筛选，再按到期时间和稳定 id 排序。`src/data/learning/store.js:141` 的只读总览按实际未完成 id 扣除已分配数。
- `src/data/learning/model.js:89` 新增的 `validateReviewHistory` 重放 count、fuzzy、unknown、完成时间及结算 revision；复习专属字段和上限仅对新复习方法生效，学习及旧任务仍以3为完成阈值。迁移接受v1至v5，并先按原版本校验。
- `src/data/learning/browserStore.js:8` 保持读操作同步，并将七个新复习写命令接入同一独占锁。新增测试通过真实存储实例覆盖完成回滚、旧版本保留、未知证据阈值、跨页重复操作和储存失败，没有用空断言代替行为核验。

## Issues

### Critical

无。

### Important — P2：已保存选项的快速返回遗漏冲突校验（初审历史，现已修复）

初审位置：`src/data/learning/store.js:160`–`164`，重点为164行。以下保留初审证据；当前修复结论见文末。

`prepareReviewChoice` 先以本地 state 验证 token，随后在 `task.choice !== null` 时直接返回。只有后面的 `change` 路径检查持久存储是否仍等于 `saved`。因此即使其他页已经提交了当前题目的答案，旧页的相同 token 仍会通过此命令，并返回旧的 question 视图、选项和 revision，而不是返回可由界面分类的存储冲突错误。

这条调用不覆盖新数据，但会把过期题目当作成功准备结果交给界面，且明确违反所要求的冲突拒绝边界；后续命令才会发现冲突，不能代替此处的拒绝。

修复建议：在已准备选项的快速返回前也验证 `storage.getItem(LEARNING_STORAGE_KEY) === saved`，使用与 `ensureTodayReview` 一致的错误；补充两个实例的定向回归测试，证明另一实例提交选项后，旧实例的重复准备在 reload 前被拒绝。

### Minor

无额外阻断项。实现报告提及的 LF→CRLF 提示属于差异检查工具噪声，未发现其对应的行为缺陷；实现报告的数据测试／lint 输出未报告警告。

## 定向核验记录（初审）

没有重跑实现报告中已通过的测试套件。仅针对上述具体疑点，用 Node 和 Vite 的模块加载能力运行内存存储复现实验，未创建测试文件、修改源码或写入真实学习数据。

步骤：

1. 实例 A 建立到期单词的当日复习任务，提交 unknown、前进到 count0，再准备四个选项；A 的本地状态为 question／revision3。
2. 实例 B 从同一内存存储载入，以 revision3 提交正确选项；已保存状态变为 feedback／revision4。
3. A 使用其旧 token 再次调用 `prepareReviewChoice`。
4. 在相同冲突状态下，A 调用 `ensureTodayReview`，核对其已有任务快速返回。

实际结果，退出码0：

```json
{"stalePrepare":{"accepted":true,"view":"question","revision":3},"staleEnsure":{"accepted":false,"error":"Learning data changed elsewhere; reopen the store"},"actual":{"view":"feedback","revision":4}}
```

结论：`prepareReviewChoice` 问题已复现；`ensureTodayReview` 同类路径已有保存快照校验，正确拒绝冲突，不存在同一缺陷。

## 检查边界与未验证项

- 审查包初次提供时只有47字节及三行 `System.Object[]`；控制器修复序列化后，再按顺序完整读取一次实际差异。未自行运行 Git 重建。
- 差异外定向检查一：风险是新增多字段更新能否在存储失败时发布半成品。检查 `src/data/learning/store.js:29` 的未修改 `change`，确认先校验保存快照、复制及验证候选、成功存储后才替换并通知 state。该风险未发现问题。
- 被差异截断的函数补读：`src/data/learning/store.js:495` 的 `addToReview`。具体风险是旧通用接口是否会覆盖活动复习的结算记录；完整函数在 review 已存在时返回，因此不会替换已有记录。没有扩大到其他文件或重新通读已修改文件。
- 复习阶段3的显示和声音限制、完整界面调用令牌、生产构建、全项目集成测试，仍应由后续任务／控制器验收。此审查没有用实现报告的通过声明冒充当前重新运行结果。
- 未修改或新增 Obsidian 笔记。

## Assessment

**Task quality：Approved。** 原 P2 缺口已在保存选项的快速返回分支内修复，并以核心及浏览器双实例行为测试覆盖。全项目集成和界面约束仍由控制器及下一任务验收。

## P2 修复复审 — 2026-09-30

审查包：`C:/Users/29864/AppData/Local/Temp/p02-data-fix-review-66f8a7fd.diff`。完整读取该包一次及实现报告新增的修复说明，只复核这项修复；没有重读生产文件、检查差异外源码或运行额外实验／套件。

- **Spec compliance：✅。Quality：Approved。** 本次生产变更只有 `src/data/learning/store.js:164` 的快速返回分支增加持久存储与 `saved` 的一致性校验；165行使用已有存储冲突错误。该分支不修改 state、选项、revision 或持久数据，直接返回同一个 task 对象。因此既修复旧页的冲突漏检，又保持同实例复用时的对象身份及保存的选项顺序。
- `src/data/learning/todayReview.test.js:184` 的核心回归通过两个真实 `createLearningStore` 实例共用内存存储：另一实例实际提交答案后，旧实例连续两次复用都必须抛出冲突；同时验证原快照身份不变、存储无追加写入、订阅者未收到更新。显式 reload 后观察到已保存的 feedback／revision4，原 token 再使用时作为过期轮次拒绝。
- `src/data/learning/todayReview.test.js:210` 的浏览器回归通过两个真实 `createBrowserLearningStore` 实例和排队锁，把 B 的答案提交与 A 的选项复用按锁顺序执行。测试检查复用和重复尝试拒绝、三次锁请求均使用同一键及 exclusive 模式，并检查只有答案产生一次写入。锁仅模拟浏览器排队能力，存储及生产命令均真实执行，没有用伪造返回值满足断言。
- 两个新增回归均先用反向顺序保存选项，再以另一顺序请求复用，明确断言返回对象就是原 task 且保留原选项顺序。这覆盖了用户要求的 no-op 身份和顺序，而非只检查没有异常。
- 实现报告 `docs/p02-data-report.md:127`–`130` 声明 RED 两个失败、GREEN 两文件56项通过及 lint／差异检查通过；这些声明与新增用例和变更相符，但本审查没有重复运行，未将它们表述为本轮独立执行结果。
- **当前 Important／Critical 问题：无。** 初审中 `ensureTodayReview` 已有任务快速返回正确拒绝同类冲突的结论继续有效，该路径在修复差异中没有变化。
- **仍未验证：** 阶段3中文显示及禁音、界面调用／集成、生产构建、完整项目测试。维持原任务边界，交由控制器和下一界面任务验收。
