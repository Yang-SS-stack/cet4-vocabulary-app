---
name: "捷语 · LinguaJet"
description: "安静、稳定的纸面式学习空间；记录当前暖纸色、深蓝、柔金与清楚的数据状态。"
colors:
  paper: "#f2f0ec"
  paper-deep: "#e7e3dc"
  ink: "#0b2244"
  ink-soft: "#526176"
  gold: "#96762e"
  gold-soft: "#d8c89b"
  white: "#fffefa"
  line: "rgba(11, 34, 68, 0.16)"
  ink-hover: "#204168"
  chart-learning: "#123e68"
  chart-extra: "#b89647"
  chart-review: "#589bd0"
  chart-known: "#3f938b"
  chart-unknown: "#df8175"
  chart-answer: "#b6b5b1"
  warning-ink: "#795816"
  warning-paper: "#f2e6ca"
typography:
  headline:
    fontFamily: "'Manrope Variable', 'Microsoft YaHei', 'PingFang SC', sans-serif"
    fontSize: "clamp(30px, 3.5vw, 46px)"
    fontWeight: 750
    lineHeight: 1.2
    letterSpacing: "-.03em"
  numeric:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "clamp(38px, 4.4vw, 60px)"
    fontWeight: 750
    lineHeight: 1.05
    letterSpacing: "-.035em"
  title:
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "16px"
    lineHeight: 1.5
  label:
    fontSize: "14px"
  word:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "25px"
    fontWeight: 400
    lineHeight: 1.25
rounded:
  card: "4px"
  data-bar: "6px"
  toggle: "7px"
  action: "8px"
  disclosure: "10px"
  panel: "14px"
  pill: "999px"
spacing:
  compact: "8px"
  small: "12px"
  field: "16px"
  content: "22px"
  panel: "24px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
    rounded: "{rounded.action}"
    padding: "12px 22px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
    textColor: "{colors.white}"
  button-outline:
    backgroundColor: "transparent"
    textColor: "{colors.gold}"
    rounded: "{rounded.action}"
    padding: "12px 22px"
  button-outline-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.white}"
  button-neutral:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
    padding: "9px 16px"
  input-search:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "10px 12px"
  navigation:
    textColor: "{colors.ink-soft}"
    backgroundColor: "transparent"
  warning-tag:
    backgroundColor: "{colors.warning-paper}"
    textColor: "{colors.warning-ink}"
    rounded: "{rounded.data-bar}"
    padding: "5px 10px"
  settings-panel:
    backgroundColor: "{colors.white}"
    rounded: "{rounded.panel}"
    padding: "10px 24px"
  statistics-toggle:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.toggle}"
  progress-ring:
    textColor: "{colors.ink}"
    width: "min(100%, 244px)"
  segmented-bar:
    rounded: "{rounded.data-bar}"
    height: "19px"
---

# Design System: 捷语 · LinguaJet

## Overview

**Creative North Star: "安静、稳定的纸面式学习空间"**

沿用 PRODUCT.md 的品牌承诺和 2026-10-05 已批准方案中的暖纸色、深蓝、柔金与五项导航；没有另取新隐喻。纸底承载内容，深蓝组织阅读和主要动作，金色标记导航与局部重点。开放、细线分隔的概览与原有浅色词卡并存。

这是实现后的扫描记录，依据源码 `9fe307e` 的样式与组件，以及四张最终桌面/手机截图。两页构图来自用户指定底稿，方向合同位于 index.html；没有概念随机抽选或虚构种子。具体构图仍归属 [已批准方案](docs/superpowers/specs/2026-10-05-today-statistics-visual-design.md)，不强制推广到所有页面。

**Key Characteristics:**

- 暖纸底、深蓝文字、柔金重点与细线边界。
- 紧凑中文概览标题、强数字层级与等宽数字。
- 任务环、条形与图例保留单位、范围和真实数据状态。
- 可取消的数据揭示；减少动态效果时直接显示终值。
- 桌面侧栏与手机横向五项导航保持相同入口。

证据范围：`src/index.css`、`src/App.css`、TodayLearningPage、StatisticsPage、DataCharts、DataMotion、SettingsPage、DevelopmentMaintenancePage 的 JSX/CSS，以及抽样词卡、搜索和导航。截图为 `.superpowers/sdd/{today,statistics}-{desktop,mobile}-final.png`；横幅标明隔离验收样本，数字不是生产事实。视觉复审 `visual-finish-verdict.md` 将 F1/F2 判为 resolved、disposition 为 ship；这不代表用户人工验收或独立运行时动效验证。PRODUCT.md 的旧阶段快照未修订。

## Colors

暖中性底与偏冷深蓝形成稳定对比，金色承担提示。统计类别色是数据编码，不扩展为品牌主色。规范值以 frontmatter 为准。

### Primary

- **深蓝墨色（ink）**：主文字、概览数字、主要学习入口和选中统计切换。
- **柔金（gold）**：当前导航、额外任务环、复习入口边框和焦点；**浅金（gold-soft）**：轻提示与悬停。
- **深蓝悬停（ink-hover）**：填充动作与选中统计按钮的悬停。

### Secondary

- **完成类别**：chart-learning / chart-extra / chart-review 分别对应新词、额外、复习；词书进度条使用 chart-extra。
- **反馈类别**：chart-known / chart-extra / chart-unknown 对应认识、模糊、不认识；选择作答用 chart-known / chart-unknown / chart-answer。
- **状态提示**：warning-paper 配 warning-ink，附明确缺失或冲突文字。

### Neutral

- **暖纸（paper）**：全页底；**深纸（paper-deep）**：侧栏与部分设置提示。
- **微暖白（white）**：词卡、设置面板、输入与维护按钮。
- **柔蓝灰（ink-soft）**：说明、单位、图例和未选导航。
- **透墨细线（line）**：分栏、分节和控件边界；任务环轨道再降为 0.65 不透明度，条形轨道为透墨 0.09。

**The 有文字的数据色 Rule.** 类别颜色始终伴随文字和数值，自评环不代表客观掌握率。

侧文件八阶 OKLCH 色阶仅为面板合成探索元数据，未写入应用，不是现有生产色阶。

## Typography

**Display Font:** 概览标题用 Manrope Variable、Microsoft YaHei、PingFang SC 与 sans-serif 回退。
**Body Font:** Inter、ui-sans-serif、system-ui 与平台回退。
**Word Font:** Georgia、Times New Roman 与 serif 保留在英文词卡及旧页面的既有衬线角色。

概览的紧凑粗标题和强数字层级与安静正文配合，不把概览标题替换规则推广到词卡。

### Hierarchy

- **Headline**：概览页头（750），响应大小见 frontmatter。
- **Numeric**：统计两主数字（750），640px 以下为 49px；任务环为 34–57px，560px 以下为 42px。分母/单位更小。
- **Title**：统计主要标题为 20px / 700；今日任务节标题为 23px，下部统计为 18px。
- **Body**：基础 16px / 1.5；长说明多用 1.7，建议依据段落上限 66ch。
- **Label**：图例主要 14px，范围与脚注 11–12px。完成图轴为独立 HTML 的 12 CSS px，不随 SVG 缩小。
- **Word**：词卡标题常规衬线字（400）；品牌字标保留 26px / 600 的 Manrope 栈。

**The 稳定数字 Rule.** 用等宽数字、千分位与终值占位保持布局稳定；只让统计“已学”和“累计完成”两主数字递增，单位和普通数字直接显示。

## Layout

桌面外壳为 220px 侧栏加弹性内容列。普通内容最大 1080px；两张概览最大 1320px，内边距为 35px、响应水平 26–58px、底部 42px。概览特定两列图表和三环不是全站模板。

今日状态双列、任务环三等分、动作双列；统计主区 1.1:1，中区 1.6:1，次区 1.4:1。以 1px 规则线分节。小间隔常见 8/12px，内边距 22/24px，分区间距 26/28px。

- **1120px 且 801px 以上**：统计中区 1.3:1；反馈环和图例竖排，环最大 165px。
- **800px 以下**：侧栏变顶部横向可滚动五项导航；短线隐藏，按钮最小高 44px；概览水平内边距 24px。
- **640px 以下**：今日状态、三环、动作和统计各区按顺序单列，竖线改横线；设置和维护也堆叠；统计切换最小高 42px。
- **560px 以下**：任务环宽 190px，完成绘图区高 200px（桌面 232px）。
- **480px 以下**：概览水平内边距 18px，页头说明 12px。
- **320px**：body 最低宽度，不是另一套构图。

## Elevation & Depth

概览以色层和细线表达深度，今日动作悬停也无阴影。设置/维护以浅底面板和边界组织；弹窗靠遮罩表达前后。现有排序选中面有极轻阴影，恢复错误通知/确认有环境影，不推广为图表卡片。

### Shadow Vocabulary

- **排序选中浅影**（`0 1px 2px rgba(11, 34, 68, 0.08)`）：仅词表排序选中面。
- **恢复通知环境影**（`0 20px 60px rgb(66 55 34 / 8%)`）：异常数据恢复通知。
- **恢复确认环境影**（`0 18px 46px rgb(11 34 68 / 20%)`）：恢复确认框；维护和额外学习确认框无此阴影。

**The 开放概览 Rule.** 今日和统计主数据区直接落在纸底上，以规则线分节，不为每项数值加带阴影的浮卡。

## Shapes

词卡/搜索用 card 小圆角，概览动作/维护输入用 action，折叠建议用 disclosure，设置面板/确认框用 panel。统计切换用 toggle，条形用 data-bar；设置保存/返回按钮保留 pill。按角色保留圆角，不能统一成单一大圆角。

任务环为 SVG 圆：圆心 100/100、半径 86、线宽 15、圆端帽；反馈环半径 77、线宽 36、平直分段边缘。图例圆点 11px，边界 1px。

## Components

### Buttons

学习入口深蓝填充/暖白字，复习入口透明/柔金字与边框；最小高 57px、内边距 12px 22px。前者悬停加深蓝，后者悬停深蓝/暖白，180ms 缓出，无悬停阴影。箭头用内联线描 SVG。

维护按钮浅白底/细线边界，44px 最小高、9px 16px 内边距；支持悬停设备时转浅金面/金边（160ms ease-out），禁用 0.5 不透明度/默认指针。设置保存/确认是 44px 胶囊按钮，没有自定义悬停变体；保存禁用 0.62 与等待指针。

焦点主要为 2px 金线，偏移 3px；今日入口偏移 4px，导航 5px。没有通用按下缩放。

### Chips

统计提示为非交互轻色标签，12px 字、5px 10px 内边距、6px 圆角。缺失/冲突依靠明确文字，不编造筛选或悬停态。

### Cards / Containers

原词卡暖白、细线、4px 圆角、22px 内边距；悬停金边/横移 6px，卡面翻转 420ms。设置面板暖白、14px 圆角、10px 24px 内边距，手机水平缩至 16px。开放统计区不套该卡片。

### Inputs / Fields

词表搜索暖白面/细线，4px 圆角、44px 最小高、10px 12px 内边距、15px 字，柔蓝灰占位和金色焦点轮廓。维护 textarea 同配色，8px 圆角、16px 内边距，可纵向调整。未观察到共用输入错误或禁用样式，不补设。

### Navigation

保留“今日学习、词表、模拟练习、统计、设置”。桌面竖排有短线，悬停/当前字为金色，当前项右移 10px、标记延长 10px。手机横排取消平移/标记。侧栏折叠按钮为 44px 圆形线描控件，悬停深纸色、金色焦点。

### Statistics switches

词书、时间、自评口径各自成组。选中深蓝/暖白，未选透明/深蓝；悬停分别加深蓝/浅金（150ms），焦点轮廓内收 4px。截图手机金色悬停不是第二个选中项。

### Task rings and charts

三个任务环开放排列，额外学习金色，其余深蓝。中心显示真实完成/分配与百分比；未创建、异常、暂无任务以文字表示，不能冒充 0%。“本轮进度”与不同于当前设置的已保存词书保留短标签。

统计保留词、词次、反馈次数的单位。分段条高 19px、圆角 6px，类别间暖白细线；反馈环伴文字图例。完成图保留共同底线和无活动日期空隙，轴文字为独立 HTML，网格/柱体用 SVG；明细可折叠展开。冲突是“不可计算”，真零为空轨道，无历史是文字空态。

### Disclosure and motion

建议/数据说明/图表明细默认折叠。今日摘要线描箭头随目标状态转 180 度（150ms），悬停浅金面配深蓝字（160ms），焦点金线；学习建议内容展开260ms、收起200ms，快速反向操作从当前可见高度接续，保留原生details/summary与键盘语义。统计摘要悬停金色。

任务环 700ms 填充；条/环形分布/柱图 800ms 协同揭示，条整体裁切、柱体从共同底线整体升起，自评圆环用SVG圆周遮罩从12点顺时针填充，中心数值始终可见。两数字时长 `min(1100, max(600, 250 + log10(value + 1) × 190))` 毫秒，使用三次缓出（先快后慢），精确落在终值。进入或主动范围切换揭示；同范围更新从旧几何过渡，不反复归零。

范围变化/离开取消旧动画；页面隐藏或减少动态效果取消并落终值。辅助阅读只读最终值，不逐帧播报。未知、未创建、零值不做伪填充，动画不可用仍显示内容。已有页级进入为 360ms / 8px，今日进出 240/180ms，侧栏 320ms；减少动态效果禁用非必要过渡。侧文件示例是静态结构和 CSS 交互状态，不宣称复现 React 可取消生命周期。

## Do's and Don'ts

### Do:

- **Do** 延续暖纸、深蓝、柔金和五项导航，保留词卡与概览的不同角色。
- **Do** 用文字、单位和范围解释图形，让缺失、冲突、未创建与真实零值各自可辨。
- **Do** 保持轴标签 12 CSS px、等宽数字与最终值占位。
- **Do** 保持键盘焦点、窄屏顺序堆叠和减少动态效果终值。
- **Do** 标注示例数值，生产数据取自本地保存记录。

### Don't:

- **Don't** 将已学、词次或自评次数说成已掌握或客观掌握率。
- **Don't** 给开放数据区加重复浮卡、硬阴影或妨碍动作的动效。
- **Don't** 给未知值补零/比例，或复制底稿/验收样本数字为生产事实。
- **Don't** 将概览构图强制用于全站，臆造概念抽选或用户人工验收。

**Not canonized:** 未使用的品牌 kicker / panel-label 样式和恢复页 eyebrow 为源码携带的眉题样式缺陷，不作为新界面规范。全局及旧页面系统/衬线大标题只记录既有上下文，不授权新显示标题套用。验收横幅、演示数值、合成色阶与未进行的人工验收不构成产品视觉事实。
