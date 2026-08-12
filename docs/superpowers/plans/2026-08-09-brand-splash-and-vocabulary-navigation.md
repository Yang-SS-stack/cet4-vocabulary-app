# 捷语品牌启动页与词书导航 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 为现有四级单词网页加入捷语启动页、GSAP 页面切换、固定导航和可扩展词书入口。

**Architecture:** `App` 负责启动页状态、品牌文案和页面选择；`FoldText` 只负责启动页标题动画；`FadeContent` 只负责页面内容切换动画；`VocabularyPage` 负责词书列表、当前词书和返回逻辑。现有导航组件和词表数据继续复用。

**Tech Stack:** React、Vite、GSAP、Vitest、React Testing Library、CSS

## Global Constraints

- 使用暖纸色和现有藏青、金色设计，不引入独立的深色启动页。
- 保留导航点击伸展、导航收起恢复和现有页面过渡感。
- 启动页每次重新加载显示一次，自动进入，不增加按钮。
- 所有动画尊重 `prefers-reduced-motion`。
- 不覆盖当前未提交的词表页面和单词数据改动。

### Task 1: 安装动画依赖并建立动画组件测试

**Files:**
- Modify: `package.json`, `package-lock.json`
- Create: `src/components/FoldText.test.jsx`
- Create: `src/components/FadeContent.test.jsx`

- [ ] 安装 `gsap`。
- [ ] 写测试：`FoldText` 渲染完整标题文字，`FadeContent` 渲染子内容。
- [ ] 运行测试确认新测试在组件尚不存在时失败。

### Task 2: 实现启动页动画组件

**Files:**
- Create: `src/components/FoldText.jsx`
- Create: `src/components/FoldText.css`
- Create: `src/components/SplashScreen.jsx`
- Create: `src/components/SplashScreen.css`
- Modify: `src/App.jsx`, `src/App.css`
- Modify: `src/App.test.jsx`

- [ ] `FoldText` 用 ref 保存字符节点，挂载时用 GSAP 顺序播放一次折叠展开；减少动态效果时直接显示文字。
- [ ] `SplashScreen` 显示“捷语”和“学语言，就图个「捷」”，约 1200ms 后调用 `onComplete`。
- [ ] `App` 在启动页完成前只显示启动页，完成后显示正式应用；品牌名改为“捷语”。
- [ ] 更新测试覆盖启动页文案、自动结束和品牌名称。

### Task 3: 实现页面切换动画与固定导航

**Files:**
- Create: `src/components/FadeContent.jsx`
- Create: `src/components/FadeContent.css`
- Modify: `src/App.jsx`, `src/App.css`
- Modify: `src/App.test.jsx`

- [ ] `FadeContent` 用 GSAP 对 keyed 内容做淡入和轻微上移，组件卸载时清理动画。
- [ ] 用 `FadeContent` 包住主内容，避免与旧 CSS 动画重复播放。
- [ ] 桌面侧栏使用 sticky 保持可见；移动端导航改为顶部 sticky，保留收起恢复按钮。
- [ ] 测试页面切换仍能显示对应标题和内容。

### Task 4: 增加词书入口与返回层级

**Files:**
- Modify: `src/components/VocabularyPage.jsx`
- Modify: `src/components/VocabularyPage.css`
- Modify: `src/App.test.jsx`

- [ ] 增加 `selectedBook` 状态；为空时显示 `CET-4` 词书入口。
- [ ] 点击 `CET-4` 后显示现有单词卡片；增加“返回词书”按钮。
- [ ] 测试词书入口、进入 CET-4、显示单词和返回动作。

### Task 5: 完整验证

- [ ] 运行 `npm test`、`npm run lint`、`npm run build`。
- [ ] 浏览器检查启动页、五个导航、词书进入/返回、桌面滚动和移动顶部导航。
- [ ] 检查减少动态效果时文字和按钮仍然可用。
