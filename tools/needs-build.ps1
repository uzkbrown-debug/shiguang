# Tells start.bat whether the site needs a fresh production build.
# Exit 1 = rebuild, exit 0 = the existing build is up to date.
# ASCII only on purpose: Windows PowerShell 5.1 reads a BOM-less .ps1 as ANSI.
#
# IMPORTANT: never pass a *file* path to Get-ChildItem together with -Recurse.
# PowerShell then treats the file name as a filter and walks the whole tree
# looking for matches (it even enters .next), which cost ~100 s on every launch.

$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
$id = Join-Path (Join-Path $root '.next') 'BUILD_ID'

if (-not (Test-Path $id)) { exit 1 }

$built = (Get-Item $id).LastWriteTime

$dirs = @('app', 'components', 'lib', 'public') |
  ForEach-Object { Join-Path $root $_ }
$files = @('next.config.ts', 'package.json', 'middleware.ts', 'siteConfig.ts', 'tsconfig.json') |
  ForEach-Object { Join-Path $root $_ }

$newest = $null

foreach ($f in $files) {
  $item = Get-Item $f -ErrorAction SilentlyContinue
  if ($item -and ($null -eq $newest -or $item.LastWriteTime -gt $newest)) { $newest = $item.LastWriteTime }
}

foreach ($d in $dirs) {
  $item = Get-ChildItem -Path $d -Recurse -File -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($item -and ($null -eq $newest -or $item.LastWriteTime -gt $newest)) { $newest = $item.LastWriteTime }
}

if ($null -eq $newest) { exit 0 }
if ($newest -gt $built) { exit 1 }
exit 0
