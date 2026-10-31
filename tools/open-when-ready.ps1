# 站点端口一通就开浏览器，然后**再去起后端**——
# 这样开场动画播放的那几秒，正好是后端真正在启动的时间，进度条不是装样子。
# 单独放一个文件：塞在 start.bat 的引号里会被 cmd 的转义弄坏。

$ErrorActionPreference = "SilentlyContinue"
$root = Split-Path $PSScriptRoot -Parent

function Test-Port([int]$port) {
  try {
    $client = New-Object Net.Sockets.TcpClient("127.0.0.1", $port)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

# 1. 等站点起来，立刻打开浏览器
$opened = $false
for ($i = 0; $i -lt 180; $i++) {
  if (Test-Port 3000) {
    Start-Process "http://localhost:3000"
    Write-Host "      site ............... ready  (browser opened)"
    $opened = $true
    break
  }
  Start-Sleep -Milliseconds 1000
}

if (-not $opened) {
  Write-Host "      site ............... port 3000 never answered"
  exit 1
}

# 2. 页面已经在播动画了，这时候再起后端（真正等的是 /api/health）
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "start-backend.ps1")
exit 0
