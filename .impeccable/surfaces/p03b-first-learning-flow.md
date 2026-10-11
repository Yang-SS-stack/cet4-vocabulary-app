---
version: 1
slug: "p03b-first-learning-flow"
primary_target: "src/components/FloatingLearningAssistant.jsx"
related_targets: ["src/components/FloatingAssistantWindow.jsx","src/components/AssistantConversation.jsx","src/components/AssistantPlan.jsx","src/components/FloatingLearningAssistant.css","src/components/TodayLearningPage.jsx","src/components/BrandFlightMark.jsx"]
---

# 悬浮对话与独立学习流程

2026-10-10 用户批准悬浮原型及今日页调整，并明确 main 首次六项设置不修改。当前 Scope: 真实项目中的可选悬浮 Agent、内存规则草稿和今日页布局。Mode: Operate；沿用暖灰纸、海军蓝、柔金及既有 SVG 图标系统。

THESIS: 学习流程保持独立，助手随时可选唤出，以真实摘要形成有来源、可核对的草稿。
STORY: 原首次设置 → 独立今日学习；悬浮入口 → 模拟对话或计划 → 规则/依据/微调 → 草稿确认，真实应用禁用。
FIRST VIEWPORT: 桌面约420×560可拖动缩放小窗，默认折叠；手机底部面板，顶部下拉超过自身高度50%收起，否则回弹；首次今日漫画提示5秒。快捷提示在窗口内输入框上方。今日任务三个进度环和两个学习操作在同一区域，手机两主环与紧凑额外任务。
FINISH: 行为测试、独立代码复核、生产版桌面/390px截图及一次一步人工验收；不接模型、不自动应用草稿。

权威：docs/superpowers/specs/2026-10-10-p03b-floating-assistant-design.md；批准图片 exec-21ece452-192a-452d-9bb8-99f093bb9a31.png、exec-44fb519c-35db-4511-9689-2459fb26be78.png。以下为保留的历史方案，不再作为默认首次界面依据。

2026-10-10 批注修订：权威补充 `docs/superpowers/specs/2026-10-10-p03b-assistant-feedback-design.md`。首次打开才加载问候；能力提示先提交请求，显示模拟等待/回复，准备真实规则草稿后切换。目标仅圆点深色，行保持纸色。桌面单X按真实可拖动入口展开/缩回，手机无标题栏X/最小化，保持原半高手势。展开导航也显示现有纸飞机。采用按参考实心箭头按钮做，仅进入草稿确认；真实应用继续禁用。e2ecff6工程检查和同版本生产预览完成，人工验收不自动通过。

2026-10-10 后续三项批注及失败卡片补充：权威 `docs/superpowers/specs/2026-10-10-p03b-assistant-stream-design.md`。450ms等待后每25ms增长实际字素，气泡自然增长；完整回复及900ms阅读后才切页。收起保留生成游标、同一消息重开续显，不重复问候或已有前缀。发送文字按实际输入与气泡矩形作350ms过渡。手动超时/额度耗尽显示独立暖灰卡、柔金图标和本地规则回退；成功采用区在失败时隐藏。样式沿用，不替换全站。自动行为与动画参数检查可用；本轮浏览器测试窗口受限，新桌面/手机截图与动效观感仍待人工，旧e2截图不冒充新版。

## 历史：2026-10-09 初始学习与本次建议

Scope: 已批准的初始设置替换、助手邀请、本次规则草稿。Mode: Operate。
设计权威：docs/p03b-chat-approved-ui-brief.md 与最新用户指令。没有可读的 Chat 原生界面截图，不声称像素复刻。不重新抽选或审批已确定方向；沿用 DESIGN.md 的纸色、海军蓝、柔金、Manrope 和触控/减少动画规范。

THESIS: 在真实学习入口先完成必要设置，再可选查看建议；数字、来源和动作清楚。
OWN-WORLD: 暖灰纸色、深蓝主操作、柔金来源与依据；原设置滚轮及学习卡片沿用。
STORY: 六项设置与本次输入 → 邀请或跳过 → 规则草稿、依据、内存微调 → 原学习入口。真实应用延期。
FIRST VIEWPORT: 桌面居中面板，左侧真实剩余量、本次时间与目标，右侧六项每日设置；固定完成按钮。手机依次为剩余量、时间与目标、六项设置单列，内部滚动与固定底部动作。建议三数量、分配条、顺序与来源。
FORM: 用户明确指定已批准流程；按文字说明直接实现，延续既有视觉系统，无新全站风格或独立 Demo。
FINISH: 自动行为回归、桌面与390px窄屏截图、机械检测、独立复核；人工验收一次一步。

2026-10-09 生成语义补充（用户要求开始）：本地“重新计算规则”与未来“生成 AI 建议”分开；未接入 AI 明示并禁用。建议页仅一个禁用“采用此计划”，说明将来进入确认再应用。保留六设置、三目标、来源/数量和原学习入口，不安装通用 Agent 框架，服务器保护参数另审。依据见 docs/superpowers/specs/2026-10-09-p03b-ui-generation-boundaries-design.md。

2026-10-11 用户六条验收反馈，当前权威补充docs/superpowers/plans/2026-10-11-assistant-failure-window-feedback.md及docs/p03b-window-feedback-delivery.md。超时卡改为按原设置学习与重试，额度卡只保留原设置学习；失败时隐藏时间/目标配置，演示控件放到学习入口下方。重试仍仅为明确模拟的本地规则草稿。桌面尺寸手柄沿用原控件、单独层级和底部空间，手机无该控件；收起先隐藏再取消动画，重开恢复显示；专项测试及独立源码复核通过，实机动效待验。颜色、图标、四项固定快捷键和独立学习流程沿用；物理动效/实际命中待用户验收，不能以自动测试冒充。此前历史规则回退文案保留供查证，以本日追加需求为准。
