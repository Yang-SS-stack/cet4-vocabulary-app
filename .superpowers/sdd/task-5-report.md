# Task 5：完整验证、性能对比和最终分支审计

日期：2026-09-09  
工作区：`C:\Users\29864\Documents\单词学习软件\.worktrees\optimize-wordbook-loading`  
分支：`codex/optimize-wordbook-loading`

## 结论

- 发现并最小修复了一项测试夹具（`src/App.test.jsx`）与当前 manifest 加载协议不一致的问题：旧测试把整本 JSON 数组伪装成 manifest 响应，导致 CET-4 测试显示“词库读取失败”。修复后该测试文件 12/12 通过。
- `npm run lint` 和 `npm run build` 均以退出码 0 完成。
- 完整测试最终为 73/75 通过、2 个超时失败：已知的 `src/data/audioManifest.test.js`，以及本次全套并行负载下偶发的 `src/components/particleMotion.test.js`。后者单独复跑为 2/2 通过（2.717 秒），因此未改动任何音频或粒子文件。
- 生产构建只引用新的 manifest 路径，未发现旧整本 JSON 请求路径。
- 未合入 `main`，未推送远程。

## 执行记录

| 命令 | 结果 |
| --- | --- |
| `npm test -- --reporter=verbose`（初次） | 73/75 通过；`audioManifest.test.js` 超时；`App.test.jsx` 旧夹具与 manifest 协议不一致，失败。 |
| `npm test -- src/App.test.jsx --reporter=verbose` | 12/12 通过，退出码 0。 |
| `npm test -- --reporter=verbose`（修复后） | 73/75 通过、2 超时：`audioManifest.test.js` 和 `particleMotion.test.js`，退出码 1。 |
| `npm run lint` | 退出码 0。 |
| `npm test -- src/components/particleMotion.test.js --reporter=verbose` | 2/2 通过，耗时 2.717 秒，退出码 0。 |
| `npm run build` | 退出码 0；构建耗时 39.83 秒。Vite 提示主 JavaScript 压缩后为 1,207.61 kB（gzip 234.47 kB），超过其 500 kB 警戒值。 |
| `rg -n '/data/(cet4|cet4-high-frequency)\\.json' dist` | 无结果：构建产物不含旧整本 JSON 路径。 |
| `rg -n -o '/data/word-books/(cet4|cet4-high-frequency)/manifest\\.json' dist` | 找到 CET-4 与 CET-4 高频词书的 manifest 引用。 |
| `git status --short --branch` | 分支仍为 `codex/optimize-wordbook-loading`；除本任务测试与报告外，存在此前任务留下的未跟踪 `.superpowers/sdd` 文件。 |
| `git diff --check` | 无空白错误；PowerShell 提示 `src/App.test.jsx` 下次被 Git 写入时会由 LF 转为 CRLF。 |
| `git log --oneline --decorate main..HEAD` | HEAD 为 `5efbb78 test: cover word book page load failures`，分支领先 main 的任务提交链完整。 |
| `git diff --name-only main...HEAD` | 变更限于词书懒加载实现、生成资源、相关测试、计划和文档；音频范围命令无结果。 |
| `npm run preview -- --host 127.0.0.1 --port 4173` | 本地预览可访问。 |

后台预览启动尝试因执行环境策略被拦截，随后使用前台预览会话成功启动；这不是应用错误。

## 完整测试失败信息

### 已知音频基线问题

`src/data/audioManifest.test.js > audio manifest records the approved voices and every vocabulary audio file`

```text
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
❯ src/data/audioManifest.test.js:7:1
```

此次验证中它在 5.489 秒时失败；初次运行时在 7.239 秒时失败。依任务边界，未修改音频相关文件。

### 偶发粒子动画超时

`src/components/particleMotion.test.js > motion starts at the source and converges to the destination without a phase jump`

```text
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
❯ src/components/particleMotion.test.js:14:1
```

它只在第二次全量、并行运行 lint 的负载下超时（5.750 秒），随后单独复跑通过（2.717 秒）。本任务未找到稳定复现的实现缺陷，未改动该文件。

## 资源体积（原始字节）

| 词书 | 旧整本 JSON | 新 manifest | 新首屏详情分片 `chunks/00.json` | manifest + 首屏分片 | 初始请求体积减少 |
| --- | ---: | ---: | ---: | ---: | ---: |
| CET-4 | 1,813,232 B | 1,834 B | 63,141 B | 64,975 B | 96.42% |
| CET-4 高频词汇 | 1,243,631 B | 1,314 B | 76,029 B | 77,343 B | 93.78% |

构建产物包含以下边界文件：

- `dist/data/word-books/cet4/manifest.json`
- `dist/data/word-books/cet4/search-index.json`
- `dist/data/word-books/cet4-high-frequency/manifest.json`
- `dist/data/word-books/cet4-high-frequency/search-index.json`

清单数据：CET-4 共 4,544 词、36 个详情分片、默认字母排序；高频词书共 2,000 词、16 个详情分片、默认词频排序。

## 浏览器预览观察

已在 `http://127.0.0.1:4173/` 实际检查：

- 词书目录能显示 CET-4 与 CET-4 高频词汇入口。
- CET-4 打开后显示 21 张首屏词卡，总数为 4,544；未出现整页加载等待或词库错误。
- 高频词书默认选中“词频从高到低”；首项 `a` 的词频 50,252，后续项目数值递减。
- 输入 `n.` 后显示 1,171 条匹配结果，首屏卡片的词性均包含 `n`；搜索、分页、翻卡提示、例句与英音/美音按钮均可见。
- 返回词书目录后再打开高频词书正常。

没有采集网络节流条件下的“首张词卡出现时间”，因此不主张具体的时间改善值；本报告只给出可复算的资源体积比较。

## 可执行的手动验收步骤

1. 执行 `npm run preview -- --host 127.0.0.1 --port 4173`，打开显示的本地地址。
2. 进入“词表”，确认两本词书入口存在；进入 CET-4，确认首屏先出现词卡、搜索状态可随后完成。
3. 分别输入中文词义、英文单词、`n.`、`vt.`、`vi.` 和中文词性名称，确认可搜索完整词书。
4. 检查不存在的搜索词显示空结果；检查少于 21 条结果；切到最后一页；切换字母排序与词频排序。
5. 首次进入未访问页时确认仅有局部加载提示；返回词书目录再进入同一本，确认没有重复整页等待或错误。
6. 点击词卡正反面，确认例句、词组、英音与美音按钮仍在；返回目录后重新进入词书。
7. 在浏览器网络面板确认首次加载请求的是 `manifest.json` 与首屏详情分片，而不是 `/data/cet4.json` 或 `/data/cet4-high-frequency.json`。

## 疑虑与限制

- 完整测试目前不能达到全绿：音频清单超时为已知基线；粒子动画测试在一次高负载全量运行中也超时，但无法单独稳定复现。
- 生产构建存在 Vite 的主 JavaScript 包大小警告；它不改变本次词书数据按需加载的资源边界，但值得作为后续性能工作单独处理。
- 当前工作区含有本任务开始前就存在的未跟踪 `.superpowers/sdd` 工作文件；未删除或合并它们。
- 未测量真实首卡毫秒时间，不能由资源体积推导为具体交互耗时。

## 本任务提交

本任务提交仅包含 `src/App.test.jsx` 的 manifest 测试夹具修复与本报告；不包含音频文件，且不合入 main、不推送远程。
