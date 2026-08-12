# LinguaJet 欢迎启动页实施清单

**目标：** 将自动进入的“捷语”启动页改为需要用户点击才能进入的 LinguaJet 欢迎页。

**范围：** 只改品牌文字、启动页交互及其检查；词表、导航布局和既有页面切换效果保持不变。

## 任务 1：补充行为检查

- [x] 修改 `src/App.test.jsx`，断言启动页显示两段 LinguaJet 欢迎文字和“点击任意处继续”。
- [x] 断言启动页不会自行消失，点击启动页后才显示正式页面的“今日学习”导航。
- [x] 运行 `npm test -- src/App.test.jsx`，确认新检查会因为旧的自动跳转行为失败。

## 任务 2：实现文字与进入交互

- [x] 新增 `src/components/TextType.jsx` 与 `src/components/TextType.css`，提供可复用的逐字显示和光标闪烁效果。
- [x] 修改 `src/components/SplashScreen.jsx/.css`：依次显示两段欢迎文字，出现继续提示；点击后使用淡出动画调用 `onComplete`。
- [x] 修改 `src/App.jsx` 与 `index.html`：把正式页面品牌文字和浏览器标题改为 `LinguaJet`。
- [x] 运行 `npm test -- src/App.test.jsx`，确认检查通过。

## 任务 3：整体验证

- [x] 运行 `npm test`、`npm run lint`、`npm run build` 与 `git diff --check`。
- [x] 在浏览器检查：欢迎文字、闪烁提示、点击淡出、进入词表和导航栏动态效果。
