# 导航层次优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有四级单词学习网页的导航改为“书脊细线”视觉，并移除鼠标靠近时的多项位移动效。

**Architecture:** 保留 `App` 负责页面选择与导航栏收起状态，保留 `LineSidebar` 负责导航按钮和当前项语义状态。删除 `LineSidebar` 中的鼠标距离计算、requestAnimationFrame 循环和位移变量；用 CSS 的导航底色、书脊细线、固定活动标记和颜色过渡完成视觉反馈。

**Tech Stack:** React、Vite、Vitest、React Testing Library、CSS

## Global Constraints

- 导航栏使用比主内容区略深一档的暖纸色；主内容区继续使用现有暖纸底色。
- 两区交界采用一根金色极细线与一根低对比藏青细线，不使用明显的宽幅渐变。
- 当前项使用金色文字、轻微向右伸展和变长标记线；悬停和键盘焦点不改变导航项位置。
- 保留现有页面切换、导航收起/恢复、移动端横向导航和可访问性属性。
- 本次不加入词卡、今日进度、学习按钮、词库或其他新功能。

---

### Task 1: 锁定安静导航的行为测试

**Files:**
- Modify: `src/components/LineSidebar.test.jsx`

**Interfaces:**
- Consumes: 现有 `LineSidebar` 的 `items`、`onItemClick` 和 `aria-current` 行为。
- Produces: 能证明导航点击仍报告正确项、当前项可识别、指针移动不会启动动态位移循环的测试。

- [ ] **Step 1: 写当前会失败的测试**

在现有测试文件中补充：

```jsx
import { fireEvent } from '@testing-library/react'

test('pointer movement does not start a navigation motion loop', () => {
  const requestFrame = vi
    .spyOn(window, 'requestAnimationFrame')
    .mockImplementation(() => 1)

  render(<LineSidebar items={['今日学习', '词表']} />)
  requestFrame.mockClear()

  fireEvent.pointerMove(screen.getByRole('navigation'), { clientY: 48 })

  expect(requestFrame).not.toHaveBeenCalled()
  requestFrame.mockRestore()
})

test('the selected navigation item exposes the current page state', async () => {
  const user = userEvent.setup()

  render(<LineSidebar items={['今日学习', '词表']} />)
  await user.click(screen.getByRole('button', { name: '词表' }))

  expect(screen.getByRole('button', { name: '词表' })).toHaveAttribute(
    'aria-current',
    'page',
  )
})
```

预期：第一项测试在当前实现中失败，因为指针事件会启动 `requestAnimationFrame`；第二项测试应保持通过。

- [ ] **Step 2: 运行测试确认失败原因正确**

Run: `npm test -- src/components/LineSidebar.test.jsx`

Expected: 新增的指针测试 FAIL，错误原因指向 `requestAnimationFrame` 被调用；原有点击测试和当前项测试 PASS。

- [ ] **Step 3: 提交行为测试**

Run:

```bash
git add src/components/LineSidebar.test.jsx
git commit -m "test: define stable navigation behavior"
```

### Task 2: 实现书脊细线和静态导航状态

**Files:**
- Modify: `src/components/LineSidebar.jsx`
- Modify: `src/components/LineSidebar.css`
- Modify: `src/App.css`
- Modify: `src/App.jsx`

**Interfaces:**
- Consumes: Task 1 的测试约束和现有 `App` 页面选择状态。
- Produces: 不响应指针距离的 `LineSidebar`；使用固定活动标记的导航；有暖纸色差和双细线书脊的应用外壳。

- [ ] **Step 1: 删除 LineSidebar 的动态计算接口**

在 `LineSidebar.jsx` 中：

- 将 React 导入收窄为 `useState`。
- 删除 `falloffCurves`、所有 `useRef`、`useCallback`、`useEffect`、`runFrame`、`startLoop`、`handlePointerMove` 和 `handlePointerLeave`。
- 从参数中删除 `proximityRadius`、`maxShift`、`falloff` 和 `smoothing`。
- 保留 `defaultActive`、`onItemClick`、`ariaHidden`、`showMarker`、`showIndex` 和现有按钮点击逻辑。
- 从 `<ul>` 移除 `onPointerMove` 与 `onPointerLeave`。
- 从导航内联样式移除 `--max-shift`。

保留的核心状态和点击逻辑为：

```jsx
const [activeIndex, setActiveIndex] = useState(defaultActive)

const handleItemClick = (index, label) => {
  setActiveIndex(index)
  onItemClick?.(index, label)
}
```

- [ ] **Step 2: 用 CSS 固定活动标记并取消位移**

在 `LineSidebar.css` 中：

- 删除 `--effect`、按钮 `transform`、标记和刻度线的动态 `scaleX` 计算。
- 当前按钮使用稳定的活动类名向右轻微移动，并与颜色一起过渡。
- 活动项的标记线变长；悬停项只改变颜色，不改变长度或位置。
- 保留 `:focus-visible`，并让 `prefers-reduced-motion` 继续关闭必要过渡。

核心样式形态：

```css
.line-sidebar__button {
  transform: none;
  transition: color 160ms var(--ease-out);
}

.line-sidebar__marker {
  transform: translateY(-50%);
  transition: background-color 160ms var(--ease-out);
}
```

- [ ] **Step 3: 给应用外壳加入书脊层次**

在 `App.css` 中：

- 为 `.sidebar` 增加 `position: relative`，将背景改为 `var(--paper-deep)`。
- 用 `::after` 在侧栏右侧绘制金色极细线，旁边保留低对比藏青线；不要加入宽幅阴影或强渐变。
- 在 `:root` 增加 `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)`，供颜色和现有收起过渡使用。
- 让 `.nav-toggle` 在书脊处仍有清楚的边界和焦点状态。
- 保持移动端侧栏变为横向导航；移动端不显示桌面书脊伪元素。

关键样式形态：

```css
.sidebar {
  position: relative;
  background: var(--paper-deep);
}

.sidebar::after {
  position: absolute;
  top: 0;
  right: 0;
  width: 2px;
  height: 100%;
  background: linear-gradient(to right, var(--gold) 0 1px, var(--line) 1px 2px);
  content: '';
  pointer-events: none;
}

.nav-toggle {
  border: 1px solid var(--line);
  background: var(--paper);
}

@media (max-width: 800px) {
  .sidebar::after {
    display: none;
  }
}
```

- [ ] **Step 4: 清理 App 的动态参数**

在 `App.jsx` 移除传给 `LineSidebar` 的 `maxShift={16}`，其余页面和收起逻辑保持不变。

- [ ] **Step 5: 运行单元测试确认实现通过**

Run: `npm test -- src/components/LineSidebar.test.jsx src/App.test.jsx`

Expected: 2 个测试文件、5 个测试全部 PASS。

- [ ] **Step 6: 提交实现**

Run:

```bash
git add src/App.jsx src/App.css src/components/LineSidebar.jsx src/components/LineSidebar.css
git commit -m "feat: quiet navigation with book-spine divider"
```

### Task 3: 完成自动检查和浏览器验收

**Files:**
- No code changes required.

**Interfaces:**
- Consumes: Task 2 的稳定导航和书脊细线实现。
- Produces: 测试、规范检查、生产构建以及桌面/移动端手动验收结果。

- [ ] **Step 1: 运行完整自动检查**

Run: `npm test; npm run lint; npm run build`

Expected: 所有测试 PASS，lint 无错误，Vite 构建成功并生成 `dist`。

- [ ] **Step 2: 启动本地网页并检查桌面布局**

Run: `npm run dev -- --host 127.0.0.1`

在浏览器确认：导航栏与内容区存在克制色差；书脊双细线连续且不抢内容；鼠标经过导航项时文字和其他项目不位移；点击五个页面后标题和活动标记同步；收起后可以恢复。

- [ ] **Step 3: 检查窄屏布局和减少动态效果**

在 375px 左右的窗口宽度确认：导航变为紧凑横向布局、没有横向溢出、内容区仍可见。开启系统减少动态效果后，页面切换和导航状态仍可辨，但不发生位移过渡。

- [ ] **Step 4: 提交验收结果并回顾**

记录实际检查结果；若发现问题，只修正本计划涉及的文件，再重新运行对应检查。完成后向用户复述：React 负责状态与页面结构，CSS 负责书脊分界和静态视觉反馈。
