# Starts the whole stack for local development: MySQL (if needed), the Spring
# Boot backend, and the Vite frontend.
#
#   .\scripts\dev.ps1
#
# Two terminals open. Close them, or press Ctrl+C here, to stop. The database is
# never stopped for you -- it holds your data.
#
# Ports:
#   MySQL   3306
#   Backend 8080   (Vite proxies nothing; the browser calls it directly)
#   Frontend 5173
#
# Requirements: Node.js, a JDK 21, MySQL 8, and backend\.env.

[CmdletBinding()]
param(
    [switch]$NoDatabase,
    [int]$BackendPort = 8080,
    [int]$FrontendPort = 5173
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$frontend = Join-Path $root 'frontend'

function Info  { param($m) Write-Host "  $m" -ForegroundColor Cyan }
function Ok    { param($m) Write-Host "  $m" -ForegroundColor Green }
function Warn  { param($m) Write-Host "  $m" -ForegroundColor Yellow }
function Fail  { param($m) Write-Host "  $m" -ForegroundColor Red }

Write-Host ""
Write-Host "HAWKINS: NITRO RUN - local development" -ForegroundColor Magenta
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Database
# ---------------------------------------------------------------------------
if (-not $NoDatabase) {
    Info "checking MySQL on 127.0.0.1:3306..."
    $up = $null -ne (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)
    if ($up) {
        Ok "MySQL is already running."
    } else {
        # A portable install is used here; a Windows service needs no help.
        $portable = 'D:\hawkins-tools\mysql\bin\mysqld.exe'
        if (Test-Path $portable) {
            Warn "MySQL is not running. Starting the portable install..."
            Start-Process -FilePath $portable `
                -ArgumentList '--defaults-file=D:/hawkins-tools/mysql/my.ini', '--console' `
                -WindowStyle Minimized | Out-Null
            for ($i = 0; $i -lt 30; $i++) {
                Start-Sleep -Milliseconds 750
                if (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue) {
                    Ok "MySQL started."
                    $up = $true
                    break
                }
            }
            if (-not $up) { Warn "MySQL did not come up. Start it yourself and re-run." }
        } else {
            Warn "MySQL is not running and no portable install was found."
            Warn "Start MySQL 8 (or run backend\start-mysql equivalent) and try again."
        }
    }
    Write-Host ""
}

# ---------------------------------------------------------------------------
# 2. Backend configuration
# ---------------------------------------------------------------------------
if (-not (Test-Path (Join-Path $backend '.env'))) {
    Fail "backend\.env is missing."
    Info "Copy backend\.env.example to backend\.env and fill in your MySQL"
    Info "credentials, then create the database and user (see README.md)."
    exit 1
}
Ok "backend\.env found."

if (-not (Test-Path (Join-Path $frontend '.env'))) {
    Info "frontend\.env not found; the default API base URL will be used"
    Info "(http://localhost:$BackendPort). Copy frontend\.env.example to change it."
}

# The frontend dev server is the origin the backend must allow. If the port was
# changed here, the dev CORS profile has to agree or every request is blocked.
Write-Host ""

# ---------------------------------------------------------------------------
# 3. Start the backend
# ---------------------------------------------------------------------------
$javaHome = $null
foreach ($c in @($env:JAVA_HOME, 'C:\Program Files\Android\Android Studio\jbr')) {
    if ($c -and (Test-Path (Join-Path $c 'bin\java.exe'))) { $javaHome = $c; break }
}
if (-not $javaHome) {
    Fail "No JDK found. Install a JDK 21 or set JAVA_HOME."
    exit 1
}

$env:JAVA_HOME = $javaHome
$env:SERVER_PORT = "$BackendPort"
$env:SPRING_PROFILES_ACTIVE = 'dev'

Info "starting Spring Boot on http://localhost:$BackendPort ..."
Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit', '-Command',
    "`$env:JAVA_HOME='$javaHome'; " +
    "`$env:SERVER_PORT='$BackendPort'; " +
    "`$env:SPRING_PROFILES_ACTIVE='dev'; " +
    "Set-Location -LiteralPath '$backend'; .\scripts\run-backend.ps1"
) | Out-Null

# ---------------------------------------------------------------------------
# 4. Start the frontend
# ---------------------------------------------------------------------------
Info "starting Vite on http://localhost:$FrontendPort ..."
Start-Process -FilePath 'powershell.exe' -ArgumentList @(
    '-NoExit', '-Command',
    "Set-Location -LiteralPath '$frontend'; npm run dev -- --port $FrontendPort"
) | Out-Null

Write-Host ""
Ok "both windows are starting up."
Write-Host ""
Write-Host "  Frontend : http://localhost:$FrontendPort" -ForegroundColor White
Write-Host "  Backend  : http://localhost:$BackendPort/api/health" -ForegroundColor White
Write-Host ""
Write-Host "  The game is playable with the backend stopped; only saving and the"
Write-Host "  leaderboard depend on it."
Write-Host ""
Write-Host "  If the frontend shows CORS errors, the ports must agree: this script's"
Write-Host "  -FrontendPort and backend\src\main\resources\application-dev.yml."
Write-Host ""
Write-Host "  Close the two windows, or press Ctrl+C, to stop." -ForegroundColor DarkGray

try { while ($true) { Start-Sleep -Seconds 5 } } catch { }