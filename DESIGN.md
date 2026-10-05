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
  vocabulary-word:
    fontFamily: "Georgia, 'Times New Roman', serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.1
rounded:
  card: "4px"
  data-bar: "6px"
  toggle: "7px"
  action: "8px"
  disclosure: "10px"
  panel: "14px"
  capsule: "64px"
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
    padding: "11px 14px 11px 48px"
  navigation:
    textColor: "{colors.ink-soft}"
    backgroundColor: "transparent"
  warning-tag:
    backgroundColor: "{colors.warning-paper}"
    textColor: "{colors.warning-ink}"
    rounded: "{rounded.data-bar}"
    padding: "5px 10px"
  settings-panel:
    backgroundColor: "transparent"
    padding: "0"
  settings-wheel:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.action}"
    height: "210px"
    width: "100%"
  settings-wheel-open:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.capsule}"
    height: "228px"
    width: "min(88%, 168px)"
  settings-date-wheel-open:
    rounded: "{rounded.capsule}"
    height: "164px"
    width: "min(94%, 300px)"
  vocabulary-card:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    typography: "{typography.vocabulary-word}"
    rounded: "{rounded.card}"
    padding: "22px"
  learning-advice-entry:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.disclosure}"
    padding: "17px 22px"
  learning-advice-modal:
    backgroundColor: "{colors.white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.panel}"
    padding: "30px 32px 24px"
    width: "min(760px, calc(100vw - 40px))"
    height: "min(780px, calc(100dvh - 48px))"
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

2026-10-06 局部合并记录：按 [三处方向合同](.impeccable/surfaces/src-components-settingspage-jsx.md) 与 [实施交接卡](docs/settings-vocabulary-advice-implementation.md)，补充设置 A 胶囊、词表与今日学习建议的当前实现；其余视觉世界和既有记录保持原范围。值取自 SettingsPage/SettingsWheel、VocabularyPage/WordCard、LearningAdviceModal/TodayLearningPage 的 JSX/CSS，词表分页取自 `src/data/wordBookSession.js`。本次文档扫描未重新运行浏览器检查、检测器或完整测试；本轮 finish review 与用户人工验收由各自记录确认，不套用上述旧版 ship 结论。没有新增交付栅格资产，也不把审核参考图当成应用内图片。

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
- **Word**：旧页面的既有衬线角色保留 word；当前词表卡片标题使用 vocabulary-word（36px / 700 / 1.1），保持紧凑、清楚的英文阅读重心。品牌字标保留 26px / 600 的 Manrope 栈。

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

三处局部布局：设置学习目标为三行，每日计划为 2×2；桌面列比例为 `minmax(240px, .9fr) minmax(0, 1.7fr)`、间距 32px，1120px 以下间距与分隔内边距降至 22px，640px 以下按目标、计划、保存、维护顺序单列。数字字段卡位固定 254px，目标字段卡位固定 164px；只有卡位内部表面变化，打开不新增展开行。

词表按真实结果每页最多 21 条，搜索、排序、页码与翻页保持可见。三列网格间距 20px；以词表内容容器宽度判定，759px 以下两列/16px 间距，519px 以下一列，工具栏搜索和排序各占一行。这里是容器查询，不把 759/519px 当成全局视口断点。学习建议独立居中，长内容仅在内部主体滚动，页头、两项 tab 和底部关闭动作留在固定框架中；640px 以下外框为 `calc(100vw - 24px)` × `calc(100dvh - 24px)`，内边距 22px 18px 18px。

## Elevation & Depth

概览以色层和细线表达深度，今日动作悬停也无阴影。设置以各自浅底字段表面和分组规则线组织，维护保留既有边界；弹窗靠遮罩表达前后。学习建议遮罩为 `rgb(11 34 68 / 38%)`，面板无新增阴影；词表排序改为深蓝选中面。下列排序浅影属于先前扫描记录，不作为当前词表控件样式。恢复错误通知/确认的环境影不推广为图表卡片。

### Shadow Vocabulary

- **排序选中浅影**（`0 1px 2px rgba(11, 34, 68, 0.08)`）：仅词表排序选中面。
- **恢复通知环境影**（`0 20px 60px rgb(66 55 34 / 8%)`）：异常数据恢复通知。
- **恢复确认环境影**（`0 18px 46px rgb(11 34 68 / 20%)`）：恢复确认框；维护和额外学习确认框无此阴影。

**The 开放概览 Rule.** 今日和统计主数据区直接落在纸底上，以规则线分节，不为每项数值加带阴影的浮卡。

## Shapes

词卡/搜索用 card 小圆角，概览动作/维护输入/设置保存用 action，学习建议入口用 disclosure，学习建议框/确认框用 panel；设置字段打开后使用 capsule。统计切换用 toggle，条形用 data-bar。旧 pill token 保留既有上下文，不再代表当前设置保存按钮。按角色保留圆角，不能统一成单一大圆角。

任务环为 SVG 圆：圆心 100/100、半径 86、线宽 15、圆端帽；反馈环半径 77、线宽 36、平直分段边缘。图例圆点 11px，边界 1px。

## Components

### Buttons

学习入口深蓝填充/暖白字，复习入口透明/柔金字与边框；最小高 57px、内边距 12px 22px。前者悬停加深蓝，后者悬停深蓝/暖白，180ms 缓出，无悬停阴影。箭头用内联线描 SVG。

维护按钮浅白底/细线边界，44px 最小高、9px 16px 内边距；支持悬停设备时转浅金面/金边（160ms ease-out），禁用 0.5 不透明度/默认指针。当前设置保存为 action 圆角，54px 最小高、12px 26px 内边距，确认按钮最小高 44px；填充悬停使用 ink-hover，160ms 缓出。保存禁用 0.62 与等待指针，期间字段不接受修改。设置维护入口满宽、最小高 56px，悬停浅金透明底/金边，禁用 0.5。

焦点主要为 2px 金线，偏移 3px；今日入口偏移 4px，导航 5px。没有通用按下缩放。

### Chips

统计提示为非交互轻色标签，12px 字、5px 10px 内边距、6px 圆角。缺失/冲突依靠明确文字，不编造筛选或悬停态。

### Cards / Containers

当前词表卡片暖白、细线、card 圆角、22px 内边距，最小高 360px；悬停/内部焦点仅强化金边，不横移。卡面翻转 420ms，背面长详情在卡内滚动；设置使用开放分组与独立字段表面。开放统计区不套词卡。

### Inputs / Fields

词表搜索暖白面/细线、card 圆角、48px 最小高、15px 字，左侧线描搜索图标在 48px 留白内；内边距见 input-search。占位和光标随柔蓝灰/深蓝，金色焦点轮廓。维护 textarea 同配色，8px 圆角、16px 内边距，可纵向调整。未观察到共用输入错误或禁用样式，不补设。

### Settings A capsules

每项由固定卡位承载关闭矩形与打开圆润胶囊，数值表面从满宽/210px 高连续变为 settings-wheel-open；日期、词书、发音关闭表面高 140px，打开高 164px，宽度分别为最多 300/260/168px。打开宽度同时受卡位占比约束：数字、词书、发音最多 88%，日期最多 94%，保证可用宽度比上限更窄时仍有内收空间，不把原先 `min(100%, …)` 的 920px 无宽差结果当作规范。日期保留三列可读性。数字选项主体高 180px、上下留白 66px；目标选项主体高 120px、上下留白 36px；每项 48px，中央同高浅金选中带（`rgba(216, 200, 155, .25)`），上下渐隐，数字使用等宽数字。

关闭的目标值附日历、词书或耳机线描 SVG，保存附箭头、维护附扳手；同一图形语言为 1.75px 圆端/圆接笔触。目标默认 24px，1120px 以下且 641px 以上缩至 18px，值和图标间距从 12px 降至 8px；动作图标 22px。数字胶囊在该中间宽度下把页头水平内边距降至 12px、标签字号降至 12px，避免窄控件拥挤。

外框宽、高、圆角过渡 280ms 使用既有 ease-out；切换字段时旧外框恢复与新外框收窄同时进行，不排队等待。选项从当前滚动位置以 180ms 三次缓出接续，初次定位直接显示真实值；关闭、切换、卸载、隐藏页面或减少动态效果时清理动画并结算最终草稿，多列状态聚合。鼠标、触摸、上下/Home/End 键保持可用；选中项单一 tab 停靠，焦点 2px 金线内收 4px。保存、超量确认、冲突及维护离开保护仍由当前真实设置状态控制。

### Vocabulary cards

简洁页头下集中搜索和字母/词频排序；排序选中深蓝/暖白，悬停为 ink-hover，其余悬停浅金。每页最多 21 条真实词条，不为视觉排版缩减数据。卡片保留粗衬线英文标题、词性、音标、简释、英美音与例句朗读；长词和释义可换行。英美音按钮配语义扬声器 SVG（20px、1.6px 圆端/圆接笔触），两项相隔 12px；例句左侧 44px 朗读动作列与正文紧凑并列，图标单独按钮仍保留完整朗读名称和提示。真实补充例句注明来源，缺失例句显示文字，不凭空补文案。查看详情可点击或用 Enter/Space，Escape/返回翻回；隐藏卡面同时 inert，不让不可见音频按钮进入焦点序列。

两卡面在平面透视容器内独立转动（1200px 透视，420ms `cubic-bezier(0.22, 1, 0.36, 1)`），保持背面原生滚动命中；不把可读背面放进 preserve-3d 容器。分页禁用为 0.55、不允许指针，语音禁用为柔蓝灰；缺少词频、加载、重试和空结果保留真实说明。此浏览操作不写学习进度。

### Learning advice dialog

今日学习通过 learning-advice-entry 的固定入口位置打开原生 dialog；入口最小高 62px，悬停浅金、焦点金线偏移 4px，打开不会延长原页。面板尺寸与内边距见 learning-advice-modal；开关及建议/依据 tab 切换不改变外框尺寸。首屏三列明确区分系统建议每日新词、当前每日新词和按当前设置估算的分钟；新词已完成、未设置、无法计算及日期不适用使用文字状态，真实零值保持为零。两条方法、必要计划提示和原研究依据保留，不自动改计划。

打开为 220ms 透明度/10px 上移归位，关闭为 180ms 透明度/向下 8px，使用 ease-out；快速关闭从当前可见状态接续，退出后恢复背景滚动、原位置与入口焦点。打开时锁 body 滚动并按已有滚动条槽补偿空间；原生 dialog 保持模态焦点，关闭按钮、Escape、我知道了均可退出，tab 支持方向/Home/End 键。页面隐藏、动画不可用或减少动态效果直接终态，卸载清理动画和滚动锁。主体内部滚动条为浅金/暖白，文本选择浅金/深蓝。

### Navigation

保留“今日学习、词表、模拟练习、统计、设置”。桌面竖排有短线，悬停/当前字为金色，当前项右移 10px、标记延长 10px。手机横排取消平移/标记。侧栏折叠按钮为 44px 圆形线描控件，悬停深纸色、金色焦点。

### Statistics switches

词书、时间、自评口径各自成组。选中深蓝/暖白，未选透明/深蓝；悬停分别加深蓝/浅金（150ms），焦点轮廓内收 4px。截图手机金色悬停不是第二个选中项。

### Task rings and charts

三个任务环开放排列，额外学习金色，其余深蓝。中心显示真实完成/分配与百分比；未创建、异常、暂无任务以文字表示，不能冒充 0%。“本轮进度”与不同于当前设置的已保存词书保留短标签。

统计保留词、词次、反馈次数的单位。分段条高 19px、圆角 6px，类别间暖白细线；反馈环伴文字图例。完成图保留共同底线和无活动日期空隙，轴文字为独立 HTML，网格/柱体用 SVG；明细可折叠展开。冲突是“不可计算”，真零为空轨道，无历史是文字空态。

### Disclosure and motion

学习建议现在由上述入口按钮打开居中 dialog，原延展 details 已被替换。数据说明/图表明细保留既有折叠行为；统计摘要悬停金色。未使用的 AnimatedDisclosure 与遗留学习建议 details 样式不作为当前组件规范。

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
