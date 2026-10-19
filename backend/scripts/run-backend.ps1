# Starts the Hawkins: Nitro Run backend.
#
# Requires a running MySQL and valid credentials in .env (copy from
# .env.example). The application will NOT start without a reachable database:
# silently losing every leaderboard entry on restart would be worse than
# refusing to boot.
#
# Flyway applies pending migrations on start. Nothing here drops or recreates
# anything.
#
# The project targets Java 21 (see <java.version> in pom.xml). A JDK 17 will
# NOT work: the compiler is told to target release 21 and refuses.
#
# Override the port or the allowed frontend origins with environment variables:
#   $env:SERVER_PORT = '9090'
#   $env:CORS_ALLOWED_ORIGINS = 'http://localhost:4173'
# Pick a profile other than dev (which allows the Vite dev origins) with:
#   $env:SPRING_PROFILES_ACTIVE = 'prod'

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$minimumMajor = 21

# ---------------------------------------------------------------------------
# Load .env, if present, into the process environment.
#
# .env is gitignored; .env.example is the committed template. Values already
# present in the environment win, so CI or a shell export overrides the file
# rather than being silently replaced by it.
# ---------------------------------------------------------------------------
$envFile = Join-Path $root '.env'
if (Test-Path $envFile) {
    $loaded = 0
    foreach ($line in (Get-Content $envFile)) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
        $eq = $trimmed.IndexOf('=')
        if ($eq -lt 1) { continue }
        $name = $trimmed.Substring(0, $eq).Trim()
        $value = $trimmed.Substring($eq + 1).Trim()
        if (-not [System.Environment]::GetEnvironmentVariable($name)) {
            [System.Environment]::SetEnvironmentVariable($name, $value)
            $loaded++
        }
    }
    Write-Host "Loaded $loaded value(s) from .env"
} else {
    Write-Warning "No .env found. Copy .env.example to .env and fill in DB_URL, DB_USERNAME and DB_PASSWORD."
    Write-Warning "The application will not start without them."
}

foreach ($required in @('DB_URL', 'DB_USERNAME', 'DB_PASSWORD')) {
    if (-not [System.Environment]::GetEnvironmentVariable($required)) {
        Write-Error "Missing $required. The backend needs database credentials to start; see backend\README.md."
        exit 1
    }
}

# Places a Java 21+ JDK is commonly found, most specific first. JAVA_HOME and the
# bundled Android Studio runtime are checked ahead of these.
$candidates = @(
    $env:JAVA_HOME
    'C:\Program Files\Android\Android Studio\jbr'
    'C:\Program Files\Eclipse Adoptium'
    'C:\Program Files\Java'
    'D:\hawkins-tools\jdk21'
)

function Test-Jdk([string]$home_) {
    if (-not $home_) { return $null }
    $javac = Join-Path $home_ 'bin\javac.exe'
    if (-not (Test-Path $javac)) { return $null }
    # `javac -version` prints e.g. "javac 21.0.10" on stderr.
    $raw = (& $javac -version 2>&1 | Select-Object -First 1)
    if ($raw -notmatch '(\d+)(?:\.(\d+))?') { return $null }
    $major = if ($Matches[2]) { $Matches[1] } else { $Matches[1] }
    if ([int]$major -lt $minimumMajor) { return $null }
    return [pscustomobject]@{ Home = $home_; Version = $raw.Trim() }
}

$jdk = $null
foreach ($candidate in $candidates) {
    $found = Test-Jdk $candidate
    if ($found) { $jdk = $found; break }
}

# Last resort: sweep the usual install roots for any 21+ JDK.
if (-not $jdk) {
    foreach ($base in @('C:\Program Files', 'D:\hawkins-tools')) {
        if (-not (Test-Path $base)) { continue }
        foreach ($dir in (Get-ChildItem $base -Directory -ErrorAction SilentlyContinue)) {
            foreach ($child in (Get-ChildItem $dir.FullName -Directory -ErrorAction SilentlyContinue)) {
                $found = Test-Jdk $child.FullName
                if ($found) { $jdk = $found; break }
            }
            if ($jdk) { break }
        }
        if ($jdk) { break }
    }
}

if (-not $jdk) {
    Write-Error @"
No Java $minimumMajor+ JDK found.

Searched JAVA_HOME and the usual install locations. Install a JDK 21 or newer
(Temurin, Zulu or Corretto all work), or set JAVA_HOME to one and re-run.
"@
    exit 1
}

Write-Host "Using $($jdk.Version)  [$($jdk.Home)]"
$env:JAVA_HOME = $jdk.Home
$env:Path = "$($jdk.Home)\bin;$env:Path"

Push-Location $root
try {
    # The dev profile allows the Vite dev origins; see application-dev.yml.
    if (-not $env:SPRING_PROFILES_ACTIVE) { $env:SPRING_PROFILES_ACTIVE = 'dev' }
    # Kept to PowerShell 5.1 syntax on purpose: no `??`, which only exists in 7+.
    $port = if ($env:SERVER_PORT) { $env:SERVER_PORT } else { '8080' }
    Write-Host "Starting backend on http://localhost:$port (profile: $env:SPRING_PROFILES_ACTIVE)"
    Write-Host 'In-memory storage: players and race records reset on restart.'
    Write-Host 'Press Ctrl+C to stop.'
    & .\mvnw.cmd spring-boot:run
}
finally {
    Pop-Location
}