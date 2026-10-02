# LinguaJet 本机服务

固定地址 `http://127.0.0.1:5280`，仅提供摘要校验，不保存学习记录。

首次准备（在项目根目录的 PowerShell 中；安装仅用于项目隔离环境）：

```powershell
py -3 -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock
backend/.venv/Scripts/python.exe -m pip check
```

验证环境使用 Python 3.13，pip 26.1.2；所有实际包版本见 requirements.lock。
日常启动不安装依赖、不联网安装：

```powershell
powershell -NoProfile -File scripts/start-local.ps1
```

保持窗口开启，把窗口里的一次性连接码输入在线页面开发验收区；Ctrl+C 停止。连接码5分钟有效，成功后不可重用，会话12小时到期、不滑动延长。刷新、断开、过期后停止再启动配对。端口占用即退出，请自行确认占用原因，程序不会换端口或结束其他进程。

开发接口：GET `/api/v1/health`，POST `/api/v1/session`（connectionCode），POST `/api/v1/facts/check`（严格白名单摘要），已知接口 OPTIONS。要求 Host `127.0.0.1:5280`、Origin `https://yang-ss-stack.github.io`，实际业务请求 Sec-Fetch-Site `cross-site`；检查摘要另需 Bearer。错误仅返回通用中文说明。create_app(state=SessionState(clock=...)) 可注入独立时钟/状态用于测试，无测试接口。

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests -q
```

已验证的测试环境有一条兼容性弃用提醒：`StarletteDeprecationWarning: Using httpx with starlette.testclient is deprecated; install httpx2 instead.` 当前 Starlette 1.7.0 明确保留此兼容路径；测试正常通过，未增加无必要依赖或隐藏警告。维护时参考 https://starlette.dev/testclient/ 和 https://starlette.dev/release-notes/，更新需重新验证与锁定。

真实 Edge 在线联调尚待单独发布授权；自动测试头不代表实际浏览器权限或头已验证。
