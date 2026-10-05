---
version: 1
slug: "src-components-settingspage-jsx"
primary_target: "src/components/SettingsPage.jsx"
related_targets: ["src/components/SettingsWheel.jsx","src/components/VocabularyPage.jsx","src/components/TodayLearningPage.jsx"]
---

# 三处已审核界面：实施方向

Scope: 设置、词表、今日学习建议。Mode: Operate。用户已明确批准同步开工。

## Direction contract

THESIS: 用少量可见文字和清楚的控件形状帮助用户调整计划、查词和查看建议。设置原位变形，不用展开行推动其他内容；建议独立居中面板。
OWN-WORLD: 沿用暖纸、深蓝、柔金、五项导航和既有字族；词卡英文衬线。A胶囊金色细边与中央浅金选中带；图形为语义SVG，不加入装饰图。
STORY: 先看真实设置或词条，再编辑草稿或浏览详情；建议与依据分开，用户决定是否另行调整设置。
FIRST VIEWPORT: 设置左学习目标三行、右每日计划2×2，固定卡位，保存与维护在下。词表简洁标题、搜索/排序工具栏、桌面三列词卡；真实21条不缩减。建议面板中央，三项真实数值、两条方法与短提示，长依据内部滚动。
FORM: 精确指定的已批准A胶囊、词表图及居中建议图；不运行新概念抽选。设置外框在原位连续收窄/恢复，快速切换接续；其他已有交互保留。Approved comps referenced by docs/settings-vocabulary-visual-review.md, no illustrative numbers copied.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
