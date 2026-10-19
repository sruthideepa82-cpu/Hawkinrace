# Starts the Hawkins: Nitro Run backend.
#
# No database is required in Phase 4 -- players and race records live in memory
# and reset on restart. Do not start MySQL for this; that is a Phase 5 step.
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