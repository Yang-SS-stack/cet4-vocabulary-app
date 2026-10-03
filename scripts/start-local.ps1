$ErrorActionPreference = 'Stop'
$backendPath = Join-Path (Split-Path $PSScriptRoot -Parent) 'backend'
$pythonPath = Join-Path $backendPath '.venv/Scripts/python.exe'
if (-not (Test-Path -LiteralPath $pythonPath)) {
    throw '项目隔离环境尚未准备，请先按 backend/README.md 安装依赖。'
}
Push-Location -LiteralPath $backendPath
try {
    & $pythonPath -m linguajet_local
    $runExitCode = $LASTEXITCODE
} finally {
    Pop-Location
}
exit $runExitCode
