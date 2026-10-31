# 起后端（记忆服务）。相比以前那版：
#   1. 不再依赖 backend\.env 是否存在
#   2. 逐个候选 Python 实测依赖能不能 import（这台机器上 py 启动器指向的那个环境是坏的，
#      旧逻辑只要 "import uvicorn" 成功就选了它，结果跑到 pydantic_core 才炸）
#   3. 不只看端口，而是等 /api/health 真的返回 ok
#   4. 起不来就把 backend.log 的尾巴打出来，别静默失败

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path $PSScriptRoot -Parent
$backend = Join-Path $root "backend"
$logFile = Join-Path $backend "backend.log"
$logTool = Join-Path $PSScriptRoot "startup-log.ps1"

function Test-Health {
  try {
    $res = Invoke-WebRequest -UseBasicParsing -TimeoutSec 3 "http://127.0.0.1:8000/api/health"
    return ($res.StatusCode -eq 200 -and $res.Content -match '"status"\s*:\s*"ok"')
  } catch {
    return $false
  }
}

function Test-Interp {
  param([string]$Exe, [string[]]$Prefix)
  if (-not (Test-Path $Exe)) { return $false }
  $code = "import sys,uvicorn,fastapi,pydantic_core,sqlalchemy,pymysql;print(sys.version.split()[0])"
  $out = & $Exe @Prefix -c $code 2>$null
  if ($LASTEXITCODE -ne 0) { return $false }
  return ("$out".Trim() -match '^3\.(9|1[0-9])')
}

function Find-Python {
  $candidates = New-Object System.Collections.ArrayList

  $patterns = @(
    (Join-Path $backend ".venv\Scripts\python.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python3*\python.exe"),
    "C:\Python3*\python.exe",
    "D:\python\python.exe",
    (Join-Path $env:USERPROFILE "anaconda3\python.exe"),
    (Join-Path $env:USERPROFILE "miniconda3\python.exe")
  )
  foreach ($pattern in $patterns) {
    Get-ChildItem $pattern -ErrorAction SilentlyContinue |
      Sort-Object FullName -Descending |
      ForEach-Object { [void]$candidates.Add(@{ exe = $_.FullName; prefix = @() }) }
  }
  foreach ($name in @("python", "python3")) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if ($cmd) { [void]$candidates.Add(@{ exe = $cmd.Source; prefix = @() }) }
  }
  $py = Get-Command "py" -ErrorAction SilentlyContinue
  if ($py) { [void]$candidates.Add(@{ exe = $py.Source; prefix = @("-3") }) }

  foreach ($c in $candidates) {
    if (Test-Interp -Exe $c.exe -Prefix $c.prefix) { return $c }
    Write-Host "      backend ............ skip python: $($c.exe)"
  }
  return $null
}

if (Test-Health) {
  Write-Host "      backend ............ already running"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $logTool -Stage backend -State done -Seconds 0 | Out-Null
  exit 0
}

& powershell -NoProfile -ExecutionPolicy Bypass -File $logTool -Stage backend -State running | Out-Null

$python = Find-Python
if ($null -eq $python) {
  Write-Host "      backend ............ SKIPPED: no usable Python found"
  Write-Host "                           need one with: pip install -r backend\requirements.txt"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $logTool -Stage backend -State failed -Seconds 0 | Out-Null
  exit 1
}
Write-Host "      backend ............ python: $($python.exe)"

$started = Get-Date
$quoted = '"' + $python.exe + '"'
$prefix = if ($python.prefix.Count) { ($python.prefix -join " ") + " " } else { "" }
$inner = "cd /d `"$backend`" && $quoted $prefix-m uvicorn main:app --host 127.0.0.1 --port 8000 >> `"$logFile`" 2>&1"
Start-Process -FilePath "cmd.exe" -WindowStyle Hidden -ArgumentList @("/c", $inner)

$up = $false
for ($i = 0; $i -lt 60; $i++) {
  if (Test-Health) { $up = $true; break }
  Start-Sleep -Milliseconds 1000
}
$sec = [math]::Round(((Get-Date) - $started).TotalSeconds, 1)

if ($up) {
  Write-Host "      backend ............ ready  ($sec s)"
  & powershell -NoProfile -ExecutionPolicy Bypass -File $logTool -Stage backend -State done -Seconds $sec | Out-Null
  exit 0
}

Write-Host "      backend ............ FAILED after $sec s"
if (Test-Path $logFile) {
  Write-Host "      --- backend\backend.log (last lines) ---"
  Get-Content $logFile -Tail 15 | ForEach-Object { Write-Host "      $_" }
}
& powershell -NoProfile -ExecutionPolicy Bypass -File $logTool -Stage backend -State failed -Seconds $sec | Out-Null
exit 1
