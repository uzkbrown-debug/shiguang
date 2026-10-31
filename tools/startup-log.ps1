# 记录启动进度：start.bat 每过一个阶段就调一次，写进 backend\data\startup.json
# 前端开场动画会读这个文件，把命令行真正做过的事按真实耗时展示出来。
# 注意：这个文件必须以 UTF-8 BOM 保存，Windows PowerShell 5.1 才会正确读出中文。
# 用法: powershell -NoProfile -ExecutionPolicy Bypass -File tools\startup-log.ps1 -Stage backend -State done -Seconds 12.4
# 清空: powershell -NoProfile -ExecutionPolicy Bypass -File tools\startup-log.ps1 -Reset
param(
  [ValidateSet("backend", "build", "site")][string]$Stage,
  [string]$State = "running",
  [double]$Seconds = 0,
  [switch]$Reset
)

$ErrorActionPreference = "SilentlyContinue"

$labels = @{
  backend = "启动记忆服务"
  build   = "检查并构建页面"
  site    = "启动站点"
}

$root = Split-Path $PSScriptRoot -Parent
$dir = Join-Path $root "backend\data"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
$file = Join-Path $dir "startup.json"

# 每次启动先清空：否则上一次残留的耗时（比如中断的构建）会被开场动画读出来
if ($Reset) {
  [System.IO.File]::WriteAllText($file, "[]", (New-Object System.Text.UTF8Encoding($false)))
  exit 0
}

if (-not $Stage) { exit 0 }

$list = New-Object System.Collections.ArrayList
if (Test-Path $file) {
  $raw = [System.IO.File]::ReadAllText($file, [System.Text.Encoding]::UTF8)
  if ($raw.Trim()) {
    try {
      $parsed = ConvertFrom-Json -InputObject $raw
      foreach ($item in @($parsed)) {
        if ($null -ne $item -and $item.stage) { [void]$list.Add($item) }
      }
    } catch { }
  }
}

$now = (Get-Date).ToString("s")
$hit = $null
foreach ($item in $list) { if ($item.stage -eq $Stage) { $hit = $item } }

if ($null -ne $hit) {
  $hit.state = $State
  $hit.label = $labels[$Stage]
  if ($Seconds -gt 0 -or $State -eq "done") { $hit.seconds = [math]::Round($Seconds, 1) }
  $hit.at = $now
} else {
  [void]$list.Add([pscustomobject]@{
    stage   = $Stage
    label   = $labels[$Stage]
    state   = $State
    seconds = [math]::Round($Seconds, 1)
    at      = $now
  })
}

$json = ConvertTo-Json -InputObject @($list) -Depth 4 -Compress
[System.IO.File]::WriteAllText($file, $json, (New-Object System.Text.UTF8Encoding($false)))
