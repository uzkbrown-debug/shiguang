# 先把上一次残留的进程清掉，保证 start.bat 每次都能起来。
# 3000 / 8000 是本站专用端口：占着的必然是上次没退干净的自己人。

$ErrorActionPreference = "SilentlyContinue"

function Get-Listener([int]$port) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
}

foreach ($port in 3000, 8000) {
  $conn = Get-Listener $port
  if ($null -eq $conn) { continue }
  $pid2 = $conn.OwningProcess
  $proc = Get-Process -Id $pid2 -ErrorAction SilentlyContinue
  $name = if ($proc) { $proc.ProcessName } else { "unknown" }

  if ($name -in @("node", "python", "python3", "pythonw", "cmd")) {
    $what = if ($port -eq 3000) { "已有一个站点在跑（那是上一次开的窗口），现在把它换成新的" } else { "旧的记忆服务还占着端口" }
    Write-Host "      clean .............. $what  [$name pid $pid2]"
    # 连同子进程一起收掉，否则 uvicorn / next 的子进程会继续占端口
    & taskkill /PID $pid2 /T /F > $null 2>&1
    Start-Sleep -Milliseconds 800
  } else {
    Write-Host "      clean .............. 端口 $port 被 $name (pid $pid2) 占着，不是本站的进程，跳过"
  }
}

# 等一下端口真的空出来
foreach ($port in 3000, 8000) {
  for ($i = 0; $i -lt 10; $i++) {
    if ($null -eq (Get-Listener $port)) { break }
    Start-Sleep -Milliseconds 300
  }
}

exit 0
