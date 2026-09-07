# 词表浏览实施计划

**Goal:** 在独立工作区交付可预览的词表搜索、排序、翻转详情与发音。

**Architecture:** VocabularyPage 保留加载/分页，新增 WordCard 和 SpeechButton 隔离交互。所有数据来自当前词书，不新增学习存储。

**Tech Stack:** 当前 React、Vite、Vitest、Testing Library、CSS。

## 约束

沿用 2026-09-07-vocabulary-browser-design.md 已确认范围。每页最多 21 条；只有匹配结果；不修改 main、不合并旧分支、不做今日学习。

## 1. 搜索与排序

- [x] 在 VocabularyPage.test.jsx 用乱序词条验证默认字母、高频默认、词频同分/缺失置后。
- [x] 用中英文输入验证当前词书部分匹配、空结果、清空恢复、翻页后筛选/排序回第一页；切书重置。
- [x] 运行 `npm test -- src/components/VocabularyPage.test.jsx`，确认新增断言因缺少控件失败。
- [x] VocabularyPage.jsx 增加 query/sort 状态和 useMemo 筛选排序；截取 `filteredWords.slice(pageStart, pageStart + WORDS_PER_PAGE)`；补工具条和空状态样式。
- [x] 同一测试命令通过后进入下一项。

## 2. 可访问翻转词卡

- [x] 新增 WordCard.test.jsx，验证点击正反面、返回、Enter/Space/Escape、焦点、隐藏面 inert、详情/缺失提示。
- [x] 运行 `npm test -- src/components/WordCard.test.jsx` 确认未实现。
- [x] 新增 WordCard.jsx / WordCard.css，输入 `item`；内部翻转状态，正反面引用实现焦点交接；背面滚动内容与底部操作分开。
- [x] 在 VocabularyPage.jsx 用 WordCard 替换内联卡片；列表 key 纳入查询/排序/页码以重置翻转。
- [x] 同时运行页面与词卡测试，确认交互和原分页不回退。

## 3. 浏览器发音

- [x] 新增 SpeechButton.test.jsx，模拟浏览器语音边界验证英文朗读、连续取消、错误、不支持、卸载取消。
- [x] 运行 `npm test -- src/components/SpeechButton.test.jsx` 确认未实现。
- [x] 新增 SpeechButton.jsx，输入 `word`；显式点击时 cancel + speak，使用 en-US；错误文本 aria-live，卸载清理。
- [x] WordCard 背面接入发音按钮并验证点击不会翻转。
- [x] 运行发音和词卡测试。

## 4. 文档与交付核验

- [x] README 更新功能、词频缺失、语音依赖和预览/手动验收。
- [x] 两份 lazy-vocabulary 文档的 20 改为 21。
- [x] 完整运行 `npm test`、`npm run lint`、`npm run build`。
- [x] 独立端口启动预览，桌面/手机宽度核对搜索结果、翻转、滚动详情、键盘、减少动态效果。
- [x] 保留独立工作区供用户查看，报告结果及未完成范围，不发布或合并。
