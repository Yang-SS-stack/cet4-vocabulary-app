# Today and Statistics Visual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Execute the two tasks sequentially, with independent task reviews. No implementation approval is pending: user said 可以开工了.

**Goal:** Deliver the approved Today and per-book all-history Statistics designs, real local data and bounded count/fill animations in one local preview.

**Architecture:** Extend local facts with a separate statistics-only function that shares the existing period aggregation, without changing the original facts payload. Implement accessible reusable SVG chart/reveal and count components, then integrate both pages while preserving learning/session behavior.

**Tech Stack:** Existing React19, CSS, SVG, browser animation APIs, Vitest/Testing Library. No new dependency.

## Global Constraints

- 继承现有暖纸色、深蓝、柔金和五项导航；只改两页主体。预览数字均为演示，生产界面读取真实本地数据，不复制演示值。
- 词书按钮只改变统计阅读范围，不修改学习设置，不合并跨词书词量。
- 现有汇总只有今日和近7天。实现需要新增本地只读全历史及时间分桶计算，复用现有汇总的去重和反馈更正规则；不能把全历史或逐日结果加入已有后端请求、依据指纹或安全检查报告。学习存储格式和结算规则不变。
- 固定任务使用任务创建时保存的词书和分配数量，不因之后修改设置而改写。
- 零值保持空轨道；未知、未创建、异常不启动数值动画。
- 开启减少动态效果时立即显示终值；页面不可见时停止无意义的动画工作。动效失败仍能直接看到真实内容。
- 用户人工验收一次只给一步，回复1只代表当步完成。不重复已通过的P-03-A验收，不开始P-03-B，不擅自合并、上传、发布或写Obsidian。
- Preserve the existing uncommitted maintenance hover fix. Commit task-owned files only; do not commit neighboring task changes.

### Task 1: Read-only all-history statistics projection

**Files:** Modify `src/data/assistant/facts.js`; create `src/data/assistant/statistics.test.js`. Existing `facts.test.js` and `snapshotToken.test.js` are compatibility checks.

**Interfaces:** Produce `buildStatisticsFacts(snapshot, { now, wordBooks, selectedWordBookId, period = 'all' })` with `{ book, reviewLoad, history, buckets, granularity }`. `history` uses existing period-result fields including fromDate/toDate/completions/selfAssessments/choices/corrections/effectiveSelfAssessments/coverage/issues. Each bucket is `{ fromDate, toDate, label, completions }`; granularity is day/week/month. Keep `buildLearningFacts` return shape and behavior unchanged.

- [ ] RED: Assert exported statistics function exists; construct saved tasks from several dates/books with real store APIs. Check all-history vs seven-day/today, no writes, unique book counts vs repeated review word-times, all extra batches, correction semantics, duplicate/conflicting sources, empty history, DST-safe dates, and bucket sums. Example assertion:

```js
expect(Facts.buildStatisticsFacts).toBeTypeOf('function')
const result = Facts.buildStatisticsFacts(snapshot, { ...context, period: 'all' })
expect(result.history.completions).toEqual({ learningWords: 2, extraLearningWords: 1, reviewWords: 2 })
expect(result.buckets.reduce((sum, row) => sum + row.completions.reviewWords, 0)).toBe(2)
expect(JSON.stringify(snapshot)).toBe(before)
```

- [ ] Run `npm test -- src/data/assistant/statistics.test.js --maxWorkers=2`, observe expected missing feature failure.
- [ ] GREEN: Reuse the existing `period` reducer inside the same module. All starts at the earliest saved selected-book task at/before today; empty range is today. Keep selected-book lifetime progress/current reviewLoad independent of period. Include zero-date buckets; <=62 days use daily, <=370 use 7-calendar-day bins, otherwise month bins (combine adjacent months when needed to bound visual bucket count). Preserve affected null fields in buckets and totals. Never send this result to backend.
- [ ] Run new tests and existing facts/snapshotToken tests, then commit only these task files and write `.superpowers/sdd/visual-task1-report.md` with RED/GREEN evidence and interfaces.
- [ ] Independent review and resolve actionable findings before Task2 implementation.

### Task 2: Both pages and shared motion/chart presentation

**Files:** `src/components/TodayLearningPage.jsx/.css`, `StatisticsPage.jsx/.css`; new focused chart/motion modules and tests under `src/components/`; adjust existing relevant overview tests for intentionally approved presentation changes. Preserve session modules/data store code.

**Interfaces:** Consume Task1 statistics function and the existing learning-store/provider. Use a shared, cancelable count/reveal implementation; final data always remains available to assistive reading. Chart primitive names are implementation choices, responsibilities must stay separated.

- [ ] RED: New behavior tests for book/time filters staying read-only, full history default, raw/effective feedback, unknown vs0, Today absent/empty/saved-book/current-extra-batch states and collapsed recommendations. Count/motion tests must cover target reached, interruption/unmount, replay key, reduced-motion preference changes and hidden document. Update old text assertions only where approved layout supersedes them.
- [ ] Run these selected tests before implementation and record missing feature failures.
- [ ] GREEN: Match the approved comps linked in the spec; capture visual authority in the emitted root comment or durable component contract. Today top strip, three open rings, two actions, collapsed existing recommendation. Statistics book/time controls, unique progress, activity totals, stacked date chart, self feedback toggle/donut, raw choice and corrections bars, current review strip, collapsed data notes. Zero/unknown/error states render honest labels; no demo data in production.
- [ ] Number duration600–1100ms based on magnitude, only2 primary stats values; chart fill700–900ms, Today rings700ms. Default final content, accessible real final value, no live per-frame announcements, stable tabular widths, reduced-motion direct final, cancel stale animations on rapid filters, hide/unmount cleanup. Re-render without dataset changes does not replay whole page. No blocking animation on learning/session navigation.
- [ ] Use transform/clip/SVG reveals for segmented/stacked charts to preserve ratios. No expensive independent React updates per bar. Complete keyboard/hover states and responsive stacking, no horizontal overflow.
- [ ] Run relevant page/motion/learning/review/assistant compatibility checks; commit only owned page/motion/test files, write `.superpowers/sdd/visual-task2-report.md`, then independent spec/quality review.

## Final local delivery

- [ ] Review approved design and implementation side by side at desktop/narrow viewports; one batched fix round, then confirm. Save screenshots, verify replay/interrupt/reduced-motion and real empty-state usability. Use isolated disposable local test sample only, label it in test evidence.
- [ ] Run one mechanical detector on changed UI targets, address meaningful findings; final whole-branch code review plus fresh screenshot-based design review.
- [ ] Run stable full tests, lint, diff check and production build with `--base=/cet4-vocabulary-app/`. Preserve existing lint/audio warnings if unchanged.
- [ ] Update approval/delivery handoff and ignored ledger/receipt, make local task commit if needed, rebuild to show current commit, retain local preview. No merge/push/publish.
- [ ] Give user only first new manual acceptance action; await1 before next. Maintenance manual/P-03-B sequencing remains in the spec.
