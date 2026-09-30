# Settings wheels and loading motion implementation plan

> For agentic workers: Use superpowers:subagent-driven-development for the delegated wheel task and independent final review.

Goal: Deliver the user-approved wheel fixes, progressive disclosure, study entry transition and genuine loading indicator.
Architecture: Extend existing shared SettingsWheel in both setup modal and settings. Add small reusable loading indicator for vocabulary and study; keep existing learning/store semantics.
Tech Stack: React, CSS, Vitest.

## Global constraints
- Base a156c36, existing isolated branch codex/study-audio-extra. No push, merge, Obsidian edits, global redesign or P02.
- Maintain saved settings/task data and existing audio/feedback behavior.
- Respect prefers-reduced-motion. Real loading only for bouncing dots; page motion uses fades.

## Task 1: wheels
- [x] SettingsWheel.jsx/css/tests: mouse notch advances one adjacent option; prevent native multi-row wheel scroll and programmatic scroll feedback. Preserve touch scroll, keyboard, click, bounds, date changes and correct latest save.
- [x] All wheels: downward height expansion about280ms, collapse upward220ms; animate actual occupied height, chevron at value rotates on open; subtle row hover/focus.
- [x] SettingsPage and LearningSetupModal: switching closes old first then opens latest requested field, no extra idle gap; new wheel initializes directly to current value without scrollIntoView scrolling ancestors. Maintain flush of pending touch selection before switch/save and reduced-motion behavior.
- [x] Targeted regression tests wheel/notch/modes/bounds/programmatic init/rapid switching/immediate save, docs, local commit.

## Task 2: loading and study entry
- [x] Reusable LoadingIndicator JSX/CSS: 3 staggered bouncing dots with shadows adapted from user-supplied Uiverse mobinkakei CSS, navy palette, retain attribution comment. Display after200ms pending; no artificial minimum wait. Small descriptive status, static reducedmotion, compact variant for later loads.
- [x] VocabularyPage: initial book wait indicator; later page wait compact preserve old cards, search index preparation compact; errors/returns cancel loading immediately.
- [x] TodayLearningPage/LearningSession: overview exit180ms then session entry240ms slight upward motion; guard double clicks/timer cleanup, audio only after entry stable, real initial loading indicator. Preserve completion extra confirmation and scoped exit cancellation.
- [x] Meaningful lifecycle regression tests delayed/fast/error loading, entry timing/doubleclick/reducedmotion/audio gating; docs.

## Task 3: delivery
- [x] Independent final review; resolve defects, run appropriate tests/lint/build, commit docs, update localhost5193 production preview and verify resource hashes. Real UI automation only CUA; prior runtime unavailable, report actual verification boundary.
