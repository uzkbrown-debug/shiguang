# 站点窗口关掉之后，把后端一起收掉，避免留下占着 8000 的孤儿进程。
$ErrorActionPreference = "SilentlyContinue"

$conn = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $conn) { exit 0 }

$proc = Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue
if ($proc -and $proc.ProcessName -in @("python", "python3", "pythonw", "cmd")) {
  & taskkill /PID $conn.OwningProcess /T /F > $null 2>&1
  Write-Host "      backend ............ stopped"
}
exit 0
