# P-03-A 验证记录与待发布安排

2026-10-02，分支 `codex/p03a-local-foundation`，产品验证基线 `36e3262`。当前实现完成，本轮自动验证通过；整项实际在线验收未完成。Tasks 1–4 已分别独立审查，全分支独立审查与人工界面验证由控制者随后完成，本文不预填通过。

## 本轮实际检查

下列五项完整命令各执行一次，退出码均为 0。前端测试开始于本机时间 21:41:55；测试和打包在同一已提交产品基线上执行，随后只新增交付文档。

| 命令 | 实际结果 |
| --- | --- |
| `npm test -- --maxWorkers=2` | 49 文件、520 测试通过，88.03 秒；无失败或测试警告 |
| `npm run lint` | 退出 0；`LearningSetupModal.jsx:67:27` 有 `react-hooks(exhaustive-deps)` 的 ref cleanup 提示，不能称无告警 |
| `npm run build -- --base=/cet4-vocabulary-app/` | 145 模块，25.99 秒成功；`audioManifest-GD5KWoaY.js` 856.14 kB（gzip 114.65 kB），有压缩后 chunk 大于 500 kB 的提示；另有插件耗时提示 |
| `backend/.venv/Scripts/python.exe -m pytest backend/tests -q` | 66 passed, 1 warning in 2.26s |
| `backend/.venv/Scripts/python.exe -m pip check` | `No broken requirements found.` |

后端警告原文：`StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` 工具实际输出给包名加反引号。未屏蔽提醒、替换运输层或升级依赖。lint 指向的已有文件未在本分支改动（控制者核对基线 diff）；本轮不扩大范围修复。未核对旧版打包尺寸，不把 chunk 尺寸提示称为已确认的旧问题。

实际环境：Node 24.18.1、npm 11.16.0、Python 3.13.14、pip 26.1.2、React/React DOM 19.2.8、Vite 8.2.1、Vitest 4.1.10、oxlint 1.77.0；FastAPI 0.142.2、Pydantic 2.13.5、Uvicorn 0.54.0、Starlette 1.7.0、httpx 0.28.1、pytest 9.1.1。完整 Python 锁定版本见 [requirements.lock](../backend/requirements.lock)。发布工作流使用 Node 22，与本机版本不同；上述本机成功不等于 CI 已运行。

既有基线依赖审计记录了开发/测试依赖 `@vitest/mocker`、`vitest` moderate 和 `undici` high；基线生产依赖审计为 0。本轮没有重跑审计或升级依赖，因此这些是基线时点记录，不是当前注册表的最新安全结论。

## 真实 HTTP 证据的范围

复用控制者在 2026-10-02 执行的独立服务进程探针，后端此后未变：health 200、OPTIONS 204、pair 200、合成前端合法摘要 200、多字段摘要 422、码重放 401、非法 Origin 403，退出 0。未打印或保存凭证及摘要正文，探针只终止自己的子进程。早期探针误读根层 snapshotToken，改为实际 basis 层后成功；只修探针，未改产品。

已有启动探针另验证实际 HTTP health 与占用同端口时第二次启动退出 1、无新连接码。以上证明实际服务请求和固定端口行为，不证明 Edge 的跨站请求头、浏览器权限或实际键盘 Ctrl+C；后者明确未验。

## 逐项证据映射

编号定义取自 [批准详细方案第 8.3 节](superpowers/specs/2026-10-02-p03a-local-foundation-design.md)。自动测试使用合成或隔离夹具，不改原在线学习记录。

| 编号 | 实际证据与判断 | 仍待完成 |
| --- | --- | --- |
| F01 | `facts.test.js` 合法命令夹具涵盖学习/复习更正、两批额外、旧无事件、异书、到期差；`LearningFactsPanel.test.jsx` 验证真实自评/更正明细；本轮全部通过 | 用户真实记录到卡片对账归 E03 |
| F02 | facts 测试覆盖重复去重、冲突变 null、非法引用与缺事件，不补造反馈；页面冲突明细及不可计算显示通过 | 人工阅读明细 |
| F03 | facts/snapshotToken 测试覆盖日历边界、空值和异书；实际 America/New_York 子进程跨夏令时 143/145 小时但仍按六个日历日取范围 | 当前真实记录核对 |
| F04 | 到期集合差、任意未来 cutoff、无写入/不创建任务，以及发送前与响应后到期变化失效测试通过 | 实际用户观察 |
| R01 | facts/TodayLearningPage 测试覆盖未来/当日/过去/缺考试日期、全书完成、缺值和合法超范围，复用只读规则建议 | 用户理解与人工展示 |
| S01 | `backend/tests/test_api.py` 严格类型、计数/空值关系、未知字段、重复键及非法 JSON；真实合成合法 200/额外字段 422 | 线上页面合法/非法两项显示 |
| S02 | 后端测试覆盖 Origin/Host/Fetch-Site/Bearer、预检无会话、错误 CORS；真实 OPTIONS 204/非法来源 403 | 实际 Edge 头和权限归 E01/E02 |
| S03 | 后端时钟测试覆盖错码/过期/重放/重启/固定 12 小时及限流；客户端/页面测试覆盖刷新生命周期、失效和恢复提示；真实码重放 401 | 实际刷新、权限恢复、键盘停止 |
| S04 | `snapshotToken.test.js`、`localClient.test.js`、`LocalBackendCheckPanel.test.jsx` 覆盖反馈/更正/换书/存储/跨日/到期、断开、新操作及迟到结果；不显示旧成功 | 在线实操 |
| S05 | 后端正文 4 KiB/256 KiB 边界、类型/错误统一化；客户端非 JSON/错误 token/响应绑定及有限等待；UI query+health 60 秒、pair 独立 5 秒测试通过 | Edge 实际网络等待 |
| U01 | 组件测试验证默认关闭、不请求直到明确连接、码清空、导航连接、失效/双结果清除、只读；暂无人工视觉完成记录 | 1280×800、360×640、键盘、减少动态效果 |
| G01 | 本轮 520 前端/66 后端、lint、Pages base build；P-01/P-02 学习/复习/额外/更正/音频回归包含在全套前端测试中 | 实际 Pages 资源/浏览器操作；全分支审查 |
| G02 | 白名单构造、no setItem、凭证页面内存、统一脱敏错误和无摘要日志由自动检查覆盖；实际 HTTP 探针未留秘密/正文；本项无模型调用 | 全分支独立审查与在线网络观察 |
| E01 | 未完成 | 授权发布后实际 Edge 在线 HTTPS→本机，记录版本/URL/实际头与 CORS/权限结果；合法成功与非法 422 |
| E02 | 未完成；仅端口和合成服务停止有开发证据 | Edge 拒绝/允许/恢复本地网络权限、服务停止后继续学习、实际 Ctrl+C、不换地址 |
| E03 | 未完成 | 用户在原在线站点核对真实进度/明细，停止后端继续学习，确认原记录保留 |

## 可审查的发布与回退提案（尚未执行）

1. 控制者完成全分支独立审查，解决功能/保护发现并运行对应检查；完成隔离合成数据的本地人工视觉检查，补充实际证据。开发预览不作为用户学习入口、不访问原在线记录。
2. 向用户展示文档、代码差异、测试与剩余风险；单独取得 GitHub Pages 发布授权。方案实施授权不自动授权 main 合并、push 或部署。
3. 授权后由控制者核对工作区及远端，记录发布前 main 的完整提交号和现有 Pages 版本/部署记录，确认准确的待发布提交；显式选取本阶段文件。保留原 main 无关未跟踪文件和工作树三份整体路线/上下文文件，不使用清理命令、不将它们夹带提交。
4. 按获准范围合入并推送 main。现有 `.github/workflows/deploy.yml` 在 push main 或 workflow_dispatch 时运行前端测试、lint、Pages base build，再上传 dist。它不部署 Python 后端，后端仍由用户本机启动。此次未改 CI、未 merge/push/发布。
5. 等工作流实际成功后，在原 GitHub 地址做 E01–E03，记录实际 Edge 版本、地址、请求保护头、页面结果与用户对账，不记录秘密/正文。如果 Sec-Fetch-Site 与预期 cross-site 不同，停止该验收并询问，不能放宽保护。
6. 若发布失败或在线保护/功能验收失败，先停止继续发布并断开本机连接；保留浏览器学习记录。按发布前已记录版本，使用单独获准的 revert 提交撤销本次前端发布改动并经既有流程部署，核对恢复版本与资源。不要 force-push/reset 覆盖无关 main 改动。后端需停止本机进程并选择批准的旧代码重新准备/启动，与 Pages 回退分开处理；没有学习数据库迁移可回退。

三份保留上下文文件位于 `docs/superpowers/plans/2026-10-02-personal-learning-assistant-roadmap.md`、`docs/superpowers/specs/2026-10-02-personal-learning-assistant-roadmap-design.md`、`docs/superpowers/specs/2026-10-02-linguajet-obsidian-roadmap-update-proposal.md`，当前未跟踪。本交付三份文档不链接依赖它们；批准方案/交接中的整体路线链接在未纳入仓库时可能仅本地可用，发布前由控制者判断，不擅加入本提交。

## 保留问题

测试运输层弃用提醒、原有 lint 提示、打包尺寸/耗时提示及基线开发依赖审计风险如上；未升级、未屏蔽。每秒只读全历史投影在大量记录下的性能未实测，尚无已证实性能失败，留给全分支审查评估。真实在线权限、键盘和用户对账均未完成；本项不能标为整体验收通过。未写 Obsidian 或迁移原记录。
