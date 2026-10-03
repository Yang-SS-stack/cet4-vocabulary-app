"""Regression coverage for the documented Windows PowerShell launcher."""
import shutil
import subprocess
import sys
from pathlib import Path

import pytest


@pytest.mark.skipif(
    sys.platform != "win32" or shutil.which("powershell") is None,
    reason="Requires Windows PowerShell",
)
def test_start_script_parses_in_windows_powershell():
    result = subprocess.run(
        [
            "powershell", "-NoProfile", "-NonInteractive", "-Command",
            "$tokens = $null; $errors = $null; "
            "[System.Management.Automation.Language.Parser]::ParseFile("
            "(Resolve-Path 'scripts/start-local.ps1').Path, "
            "[ref]$tokens, [ref]$errors) > $null; "
            "if ($errors.Count -gt 0) { "
            "$errors | ForEach-Object { Write-Output $_.ErrorId }; exit 1 }",
        ],
        cwd=Path(__file__).resolve().parents[2],
        capture_output=True,
        timeout=15,
    )
    assert result.returncode == 0, (result.stdout, result.stderr)
