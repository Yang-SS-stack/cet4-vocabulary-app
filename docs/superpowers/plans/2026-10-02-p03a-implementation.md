# LinguaJet P-03-A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在原在线前端增加只读学习事实及开发验收连接区，连接固定本机 API 检查必要摘要，保留全部原学习规则和记录。

**Architecture:** 浏览器是学习数据唯一权威。纯事实模块从一致快照投影摘要与浏览器内证据；独立 Python API 验证临时连接及严格摘要契约。页面不默认连接本机，未来模型与建议应用分别留给 P-03-B/C。

**Tech Stack:** 现有 React/Vite/Vitest；项目隔离 Python 3.13.14、FastAPI/Pydantic/Uvicorn、pytest/httpx，实际测试通过后锁定依赖。

**Approval:** 2026-10-02 用户明确“好的，批准当前完整 P-03-A 方案并开始制作”。[批准详细稿](../specs/2026-10-02-p03a-local-foundation-design.md)和[确认卡](2026-10-02-p03a-execution-approval.md)为需求来源。线上发布及 Obsidian 写入不在此次授权内。

## Global Constraints

- 固定 `http://127.0.0.1:5280`，只监听该环回地址；端口占用退出，不换端口、不杀进程、不开放公网或隧道。
- Origin 只允许 `https://yang-ss-stack.github.io`，Host 只允许 `127.0.0.1:5280`；业务请求要求预期 `Sec-Fetch-Site: cross-site`，实测不同先询问。
- 32 随机字节的一次性连接码和独立会话凭证；码 5 分钟，会话 12 小时不滑动；单次启动一次配对，凭证仅页面内存，Bearer、credentials: omit。
- 首次权限操作 60 秒，普通请求 5 秒；摘要正文 256 KiB、配对 4 KiB；每服务每分钟 10 次配对、每会话每分钟 30 次检查，失败请求计入适用限流，429 带 Retry-After。
- 概览和对账只读，不创建任务/排程、保存设置或修改学习历史；browserStore 只读方法加入读取白名单。
- 近 7 天为今日及前 6 个本地日历日，归属 task.date；当前书与固定任务书分别标明；真实反馈与选择/更正分开，完整性固定 not-provable。
- 摘要精确采用详细稿第 6.1 节；原始任务/事件、具体错题和浏览器内明细不上传，不落盘、不进日志、不送模型。
- snapshotToken/factsToken 是状态依据，不是身份；异步计算和响应后核对原文、日期、词书、派生事实，忽略旧返回。
- 错误统一 {error:{code,message}}，不得回显输入/秘密；允许来源的错误有 CORS，预检不要求会话；API no-store，无 docs/redoc/openapi。
- 保留 P-01/P-02 的固定任务、自评、更正、额外、间隔、音频和存储保护，无模型、数据库、导入导出、迁移或管理员系统。
- 不推送或更新 GitHub Pages、不写 Obsidian；真实在线 Edge 联调等待单独发布授权，不能预填通过。
- 执行出现需改变需求/保护或未核实的事实时向用户询问。代码内的实现拆分须保持批准契约；常规测试反馈可用于修复实现。

## Task 1: A1 — 一致只读事实与请求依据

**Files:** Modify `src/data/learning/store.js`, `browserStore.js` and their tests; create `src/data/assistant/facts.js`, `facts.test.js`, `snapshotToken.js`, `snapshotToken.test.js` and synthetic fixtures.

**Interfaces:**
- `store.readAssistantSnapshot()` → `{snapshot, raw}`，原始持久化值须与仓库保存基准相同；snapshot 为不可变或独立数据，raw 只在浏览器使用。
- `buildLearningFacts(snapshot, context)`，context 为 `{now: Date, timeZone: string|null, wordBooks: Array, selectedWordBookId: string|null}` → `{book,today,reviewLoad,history,ruleRecommendation,evidence}`。前五项及 history 精确采用详细稿契约，evidence 为浏览器内可对账明细并在报告中定义结构。
- `canonicalStringify(value)` 排序对象键，保留数组顺序及 null；`buildFactsRequest(store, context)` → 第 6.1 节请求 Promise；`isFactsRequestCurrent(store, context, request)` → Promise<boolean>。请求仅白名单字段，异步哈希前后核对原文与当前事实；UUID 与 SHA-256 使用 Web Crypto。

- [ ] 写失败用例，再运行 `npm test -- src/data/assistant/facts.test.js src/data/assistant/snapshotToken.test.js --maxWorkers=2`，确认失败由于缺少能力。

```js
const { snapshot } = store.readAssistantSnapshot()
const facts = buildLearningFacts(snapshot, context)
expect(facts.history.today.coverage.eventCompleteness).toBe('not-provable')
expect(storage.setItem).not.toHaveBeenCalled()
```

- [ ] 实现读方法、纯投影及请求依据。完成量按任务完成状态计且保留 removed 已完成项；复习按词次。当前到期使用 projectedMissingReviews/dueReviewWords。事件身份去重、冲突、非法更正、跨新词来源重复分别按详细稿第 5 节处理。
- [ ] 用实际 store 命令构造合法学习/复习、更正、额外夹具；异常事件另用独立纯投影夹具。覆盖第 8.2 节全部对账样本和 F01–F04/R01、null 与零、日历边界和陈旧存储拒绝。
- [ ] 验证规范化和两种哈希、白名单、换书/跨天/到期及存储变化；请求 ID 不参与 factsToken。
- [ ] 重跑新增测试及 `src/data/learning` 回归，记录实际红/绿证据，提交本任务文件。

## Task 2: A2 — 严格本机 API 与启动

**Files:** Create `backend/linguajet_local/{__init__,app,contracts,session,__main__}.py`, `backend/tests/`, `backend/pyproject.toml`, `backend/requirements.lock`, `scripts/start-local.ps1`; modify `.gitignore` only for Python environment/cache and task scratch.

**Interfaces:** `create_app()` creates independent in-memory session state; tests can inject clock/session state without adding production test endpoints. Package entry `python -m linguajet_local` pre-binds only fixed socket, then prints code once and runs one Uvicorn process. Start script executes package with isolated interpreter and backend on module path.

- [ ] 写 API/契约失败测试，运行 `backend/.venv/Scripts/python.exe -m pytest backend/tests -q` 并记录正确的失败。

```python
response = client.post('/api/v1/facts/check', json=valid_summary, headers=paired_headers)
assert response.status_code == 200
assert response.json()['status'] == 'validated'
invalid = {**valid_summary, 'extra': 'must reject'}
assert client.post('/api/v1/facts/check', json=invalid, headers=paired_headers).status_code == 422
```

- [ ] 用 Pydantic strict/extra=forbid 建立精确模型，整数拒绝 bool/float/string、限制安全整数、规范时间/日期/UUID/token，显式执行第 6.2 节关系。不复制前端统计或排程算法。
- [ ] 在解析前限制实际正文流、JSON 内容类型、重复键与非有限数。身份、来源和请求头按已批准顺序检查，合法错误均保留 CORS。
- [ ] 实现健康、配对和摘要检查及预检；内存码消费/会话/限流；可展示中文统一错误，禁用默认错误输入回显，未知路径 JSON 404，no-store。
- [ ] 覆盖 S01–S03/S05、完整契约空值关系、错误来源与 Bearer、预检、失效/重放/重启、正文大小、频率和无秘密日志。
- [ ] 验证前台启动、绑定失败退出、不热重载/多 worker；生成验证环境的精确 requirements.lock 和安装说明，普通启动不联网安装。
- [ ] 运行后端全量测试和 `pip check`，写实际红/绿证据并提交本任务文件。

## Task 3: A3 — 浏览器连接客户端

**Files:** Create `src/data/assistant/localClient.js`, `localClient.test.js`.

**Interfaces:** `createLocalClient({fetchImpl=globalThis.fetch, now=()=>new Date()})` returns `{connect(connectionCode, {signal}={}), check(request, {signal}={}), disconnect(), getState(), subscribe(listener)}`。state 至少 `{status,expiresAt}`，不公开凭证。connect 内先健康检查（首次权限操作），再配对；check 返回严格成功结构。模块不依赖 React，凭证仅闭包内存。

- [ ] 先测试默认构造/订阅无网络，成功健康和配对后多次请求带 Bearer/omit，断开删除凭证并取消请求。
- [ ] 每个响应严格验证对象键、值域、版本、标识与 token，错误信息从批准错误码映射；不显示未经验证的服务输入文案。无效JSON/超时/500/401/429失败有有限等待。
- [ ] 实现有限时 fetch、取消和操作 generation；旧配对/摘要结果不能改变新状态。检查凭证本地过期，不持久化，不自动无限重试。
- [ ] 覆盖主动取消、迟到响应、配对超时后需重启、两次请求竞争、固定非法示例的 422 区分于服务故障。客户端允许发送测试非法 body，但 UI 只使用明确合成固定例子。

```js
const client = createLocalClient({ fetchImpl: fakeFetch })
expect(fakeFetch).not.toHaveBeenCalled()
client.disconnect()
expect(client.getState().status).toBe('disconnected')
```

- [ ] 跑新增客户端测试，记录红/绿证据并提交本任务文件；在报告中给出实际 state/status/error 接口，供 Task 4 精确复用。

## Task 4: A3 — 最小页面与应用状态

**Files:** Create `src/components/LearningFactsPanel.jsx`, `LocalBackendCheckPanel.jsx`, their CSS/tests and `src/data/assistant/react.jsx`; modify `src/components/TodayLearningPage.jsx`, `SettingsPage.jsx`, necessary `src/App.jsx` wiring and relevant tests.

**Interfaces:** 复用 Tasks 1/3 的实际输出。连接客户端生命周期在同一已初始化学习应用范围内，不因导航从设置切换到学习而丢失；刷新仍丢失。测试可注入独立客户端；事实生成通过 store.readAssistantSnapshot。

- [ ] 先测试渲染/切页不会请求本机或写记录，事实与证据可见、零/缺值区分；设置连接区折叠默认关闭且无需修改设置草稿。
- [ ] TodayLearningPage 复用统一规则事实显示计划依据和现有建议卡，保留既有学习/复习进入动画和音频；不保留另一套将 null 当 0 的建议计算。
- [ ] 事实今日/近 7 天切换，明细每页 50 条，标明任务书与当前书及旧事件覆盖限制；浏览器内证据不并入请求。
- [ ] 开发连接区显示固定地址、范围/权限提示；仅点击连接查询权限（能力检测）和请求健康。拒绝时不配对或发摘要；授权不明不伪称已拒绝。
- [ ] 输入连接码成功清空，当前摘要和固定非法示例分开。成功文案“连接正常，摘要格式检查通过”，非法示例预期 422 文案“错误输入已被拒绝”；已连接不等于已检查。
- [ ] 在请求前后调用 current-basis 检查，订阅反馈/更正和跨标签变化、处理换书/跨天/到期；陈旧结果失效且事实更新，断开/取消不回到已连接。超时/权限不可确定时准确显示通用失败。
- [ ] 可读状态、键盘、窄屏和减少动态效果沿用当前视觉；前端自动测试覆盖 U01/S04、停止/失效及 no setItem。

```jsx
expect(screen.getByRole('button', { name: '检查当前学习摘要' })).toBeDisabled()
expect(fetchSpy).not.toHaveBeenCalled()
expect(storageSpy).not.toHaveBeenCalled()
```

- [ ] 跑新增组件及既有 TodayLearningPage/SettingsPage/App 回归，记录红/绿证据并提交本任务文件。

## Task 5: A4 — 全量验证、用户手册与待发布交付

**Files:** Create `docs/p03a-local-foundation.md`, `docs/p03a-acceptance.md`, `docs/p03a-learning-handoff.md`. Test changes only for a concrete integration defect, with failing regression first.

- [ ] 运行 `npm test -- --maxWorkers=2`、`npm run lint`、`npm run build -- --base=/cet4-vocabulary-app/`、`backend/.venv/Scripts/python.exe -m pytest backend/tests -q`、`backend/.venv/Scripts/python.exe -m pip check`，记录实际结果和版本。
- [ ] 服务进程使用合成摘要验证真实 HTTP、OPTIONS、合法/非法返回；不打印或保存凭证/摘要正文。组件/API 测试不能标成 E01/E02 真实在线联调。
- [ ] 如需查看本地制作界面，只以合成/隔离数据作开发证据，不将它作为用户学习入口或在线验收替代；不写原 GitHub 站点记录。
- [ ] 手册含首次准备、日后启动/Ctrl+C、码和权限操作、刷新重启、端口占用、常见错误、记录仍在浏览器；没有导入导出或模型步骤。
- [ ] 验收报告逐项映射 F01–F04/R01/S01–S05/U01/G01/G02 的实际证据，并将 E01/E02/E03 和需实际浏览器验证的部分明确留为等待发布/用户验收，不预填通过。
- [ ] 完成独立全分支审查，解决影响功能/保护的发现，运行改动相关检查后提交手册和报告。
- [ ] 展示可审查成果和发布/回退安排，取得单独发布授权后才能推进 GitHub Pages 更新及真实 Edge 在线验收。本次不自动合并/推送 main 或写记忆。

## Execution ledger

执行状态及每项红/绿、提交与审查在 `.superpowers/sdd/progress.md` 和对应 task report 中记录。完整上线后的验收仍遵循批准稿，不把本机代码制作完成等同整项 P-03-A 验收通过。
