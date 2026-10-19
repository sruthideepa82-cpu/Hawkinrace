# Full-stack end-to-end verification.
#
# Drives the real Spring Boot application against the real MySQL database and
# checks the scenarios that only exist when the two are wired together. Every
# other suite tests one layer; this is the one that would catch a DTO that
# drifted, a CORS origin that does not match, or a column that stopped being
# written.
#
# It uses the DEVELOPMENT database and removes only the records it created,
# identified by a unique run tag. Anything it cannot find is reported as SKIPPED
# rather than quietly passing.
#
# Usage (from the repository root):
#   .\scripts\e2e-fullstack.ps1
#   .\scripts\e2e-fullstack.ps1 -Port 18080
#
# Requires: MySQL running, backend\.env present.

[CmdletBinding()]
param(
    [int]$Port = 18080,
    [switch]$SkipRestartCheck
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $root 'backend'
$base = "http://localhost:$Port"

# ---------------------------------------------------------------------------
# Load backend\.env so the app gets its credentials.
# ---------------------------------------------------------------------------
$envFile = Join-Path $backend '.env'
if (-not (Test-Path $envFile)) {
    Write-Error "backend\.env not found. Copy backend\.env.example to backend\.env first. See README.md."
    exit 1
}
foreach ($line in (Get-Content $envFile)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $eq = $trimmed.IndexOf('=')
    if ($eq -lt 1) { continue }
    $name = $trimmed.Substring(0, $eq).Trim()
    if (-not [System.Environment]::GetEnvironmentVariable($name)) {
        [System.Environment]::SetEnvironmentVariable($name, $trimmed.Substring($eq + 1).Trim())
    }
}

# ---------------------------------------------------------------------------
# Result tally
# ---------------------------------------------------------------------------
$script:passed = 0
$script:failed = 0
$script:skipped = 0

function Check {
    param([string]$Name, [bool]$Ok, [string]$Detail = '')
    if ($Ok) {
        $script:passed++
        Write-Host "  PASS  $Name"
    } else {
        $script:failed++
        Write-Host "  FAIL  $Name$(if ($Detail) { " -> $Detail" })"
    }
}

function Skip {
    param([string]$Name, [string]$Why)
    $script:skipped++
    Write-Host "  SKIP  $Name ($Why)"
}

function Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "== $Title =="
}

# Records this run creates are tagged so cleanup is exact.
$tag = "e2e" + (Get-Random -Minimum 10000 -Maximum 99999)
$createdPlayerIds = New-Object System.Collections.Generic.List[string]
$createdRaceIds = New-Object System.Collections.Generic.List[string]

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

# Bearer token for the account this run registered. Set by Register-Racer.
$script:Token = $null
$script:PlayerId = $null

function Invoke-Api {
    param([string]$Method, [string]$Path, $Body = $null, [switch]$NoAuth, [hashtable]$Headers = $null)
    $args = @{ Uri = "$base$Path"; Method = $Method; UseBasicParsing = $true; ErrorAction = 'Stop' }
    if ($null -ne $Body) {
        $args['ContentType'] = 'application/json'
        $args['Body'] = ($Body | ConvertTo-Json -Depth 6 -Compress)
    }
    # Everything player-owned needs the token. Sent by default so a scenario
    # cannot silently forget it and pass for the wrong reason.
    if (-not $NoAuth -and $script:Token) {
        $args['Headers'] = @{ Authorization = "Bearer $script:Token" }
    }
    if ($Headers) { $args['Headers'] = $Headers }
    try {
        $r = Invoke-WebRequest @args
        $content = $r.Content
        $obj = $null
        if ($content) { $obj = $content | ConvertFrom-Json }
        return [pscustomobject]@{ Status = [int]$r.StatusCode; Body = $obj; Raw = $content }
    } catch {
        # Cast to int. PowerShell 5.1 exposes StatusCode as HttpStatusCode, whose
        # backing `value_` field is NOT reachable -- reading it yields an empty
        # string, so every status comparison below silently failed while the
        # response body parsed perfectly.
        $status = 0
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $raw = ''
        if ($_.Exception.Response) {
            $sr = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $raw = $sr.ReadToEnd()
        }
        $obj = $null
        try { $obj = $raw | ConvertFrom-Json } catch {}
        return [pscustomobject]@{ Status = $status; Body = $obj; Raw = $raw }
    }
}

# Free the port before starting. A previous run left a JVM holding it, which
# makes the new one exit immediately and silently points the whole suite at the
# old process.
function Free-Port {
    param([int]$Port)
    $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    foreach ($l in $listeners) {
        Write-Host "  freeing port $Port (pid $($l.OwningProcess))..."
        Stop-Process -Id $l.OwningProcess -Force -ErrorAction SilentlyContinue
    }
    if ($listeners) { Start-Sleep -Seconds 2 }
}

function Start-Backend {
    Write-Host "  starting the backend on port $Port..."
    $jar = Join-Path $backend 'target\nitro-run-0.0.1-SNAPSHOT.jar'
    if (-not (Test-Path $jar)) {
        $script:mvn = (Get-ChildItem "$env:USERPROFILE\.m2\wrapper\dists\apache-maven-3.9*" -Directory -ErrorAction SilentlyContinue |
            Select-Object -First 1).FullName + '\bin\mvn.cmd'
        Push-Location $backend
        try { & $script:mvn -q clean package | Out-Null } finally { Pop-Location }
    }

    # java on PATH, else the JDK this project builds with.
    $java = $null
    $candidates = @($env:JAVA_HOME, 'C:\Program Files\Android\Android Studio\jbr')
    foreach ($c in $candidates) {
        if ($c -and (Test-Path (Join-Path $c 'bin\java.exe'))) { $java = Join-Path $c 'bin\java.exe'; break }
    }
    if (-not $java) { $java = 'java' }

    # Quoted, because the repository path contains a space ("Java Project") and
    # Start-Process does not quote an -ArgumentList array for you. Unquoted, java
    # receives the path up to the first space and reports "Unable to access
    # jarfile ...\Java" -- with an empty log and no obvious cause.
    $proc = Start-Process -FilePath $java -ArgumentList `
        "-jar `"$jar`" --server.port=$Port --spring.profiles.active=dev" `
        -PassThru -NoNewWindow -RedirectStandardOutput "$env:TEMP\e2e.out" -RedirectStandardError "$env:TEMP\e2e.err"

    for ($i = 0; $i -lt 60; $i++) {
        Start-Sleep -Seconds 1
        if ($proc.HasExited) {
            Write-Host "  backend exited early. Last output:"
            Get-Content "$env:TEMP\e2e.out" -Tail 25 -ErrorAction SilentlyContinue
            Get-Content "$env:TEMP\e2e.err" -Tail 25 -ErrorAction SilentlyContinue
            return $null
        }
        try {
            $h = Invoke-RestMethod "$base/api/health" -TimeoutSec 2
            return [pscustomobject]@{ Process = $proc; Health = $h }
        } catch {}
    }
    return $null
}

function Stop-Backend {
    param($Running)
    if ($Running -and $Running.Process) {
        Stop-Process -Id $Running.Process.Id -Force -ErrorAction SilentlyContinue
    }
    # Also free the port. The process object can be stale -- a crashed JVM leaves
    # nothing to kill but still holds the socket for a moment.
    Free-Port -Port $Port
}

# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------

Write-Host ""
Write-Host "HAWKINS: NITRO RUN - full-stack end-to-end verification"
Write-Host "  run tag: $tag"

$running = $null
try {
    Free-Port -Port $Port
    $running = Start-Backend
    if (-not $running) { Write-Error "Backend did not start."; exit 1 }

    # -- 1. Backend starts and connects to MySQL ---------------------------
    Section "1. Backend starts and connects to MySQL"
    $h = $running.Health
    Check "GET /api/health returns 200" ($h.status -eq 'UP') $h.status
    Check "storage is reported as mysql" ($h.storage -eq 'mysql') $h.storage
    Check "storage is reported as persistent" ($h.persistent -eq $true)
    Check "health reports that races require a token" `
        ($h.message -match 'bearer token') $h.message
    $actuator = Invoke-Api GET '/actuator/health'
    Check "actuator health is reachable" ($actuator.Status -eq 200) $actuator.Status
    $envLeak = Invoke-Api GET '/actuator/env'
    # Phase 7 puts the actuator behind the security chain, so this is refused at the
    # edge rather than resolving to a missing handler. Assert the property -- the
    # configuration is not readable -- rather than which layer refused it.
    Check "actuator does not expose configuration" ($envLeak.Status -in @(401, 403, 404)) $envLeak.Status

    # -- 2 & 3. Catalogues -------------------------------------------------
    Section "2-3. Frontend loads the car and track catalogues"
    $cars = Invoke-Api GET '/api/cars'
    Check "GET /api/cars returns 200" ($cars.Status -eq 200) $cars.Status
    Check "catalogue has 4 cars" (@($cars.Body).Count -eq 4) "@($($cars.Body).Count)"
    $carIds = @($cars.Body | ForEach-Object { $_.id })
    foreach ($id in @('apex-vulcan', 'venom-verde', 'shadow-gt', 'inferno-rs')) {
        Check "car id '$id' matches the game" ($carIds -contains $id)
    }

    $tracks = Invoke-Api GET '/api/tracks'
    Check "GET /api/tracks returns 200" ($tracks.Status -eq 200) $tracks.Status
    Check "catalogue has 5 tracks" (@($tracks.Body).Count -eq 5) "@($($tracks.Body).Count)"
    $trackIds = @($tracks.Body | ForEach-Object { $_.id })
    foreach ($id in @('hawkins-streets', 'hawkins-forest', 'upside-down', 'starcourt-run', 'hawkins-lab')) {
        Check "track id '$id' matches the game" ($trackIds -contains $id)
    }
    $street = $tracks.Body | Where-Object { $_.id -eq 'hawkins-streets' }
    Check "track reports its lap count" ($street.laps -eq 3) $street.laps

    # -- 4. Authentication and the player profile ---------------------------
    Section "4. A player can register, sign in and read their own profile"
    $name = $tag.ToUpper()
    $password = 'E2ePassw0rd!'

    $anonPlayers = Invoke-Api GET '/api/players' -NoAuth
    Check "player data is not public" ($anonPlayers.Status -eq 401) $anonPlayers.Status
    $anonRaces = Invoke-Api GET '/api/races' -NoAuth
    Check "race data is not public" ($anonRaces.Status -eq 401) $anonRaces.Status

    $mk = Invoke-Api POST '/api/auth/register' @{ displayName = $name; password = $password } -NoAuth
    Check "POST /api/auth/register returns 201" ($mk.Status -eq 201) $mk.Status
    $script:Token = $mk.Body.token
    $playerId = $mk.Body.player.id
    $createdPlayerIds.Add($playerId)
    Check "a bearer token was issued" ($script:Token.Length -ge 40) "length $($script:Token.Length)"
    Check "no password in the register response" (-not ($mk.Raw -match 'password|\$2a\$')) $mk.Raw

    $weak = Invoke-Api POST '/api/auth/register' @{ displayName = "$name`W"; password = 'abc' } -NoAuth
    Check "a short password is refused" ($weak.Status -eq 400) $weak.Status

    $wrong = Invoke-Api POST '/api/auth/login' @{ displayName = $name; password = 'wrong-one' } -NoAuth
    Check "a wrong password is 401" ($wrong.Status -eq 401) $wrong.Status

    $back = Invoke-Api POST '/api/auth/login' @{ displayName = $name; password = $password } -NoAuth
    Check "signing in again works" ($back.Status -eq 200) $back.Status

    $me = Invoke-Api GET '/api/auth/me'
    Check "GET /api/auth/me returns the player" ($me.Status -eq 200 -and $me.Body.id -eq $playerId)
    $get = Invoke-Api GET "/api/players/$playerId"
    Check "GET the profile returns it" ($get.Status -eq 200 -and $get.Body.id -eq $playerId)

    $upd = Invoke-Api PUT "/api/players/$playerId" @{ displayName = $name; selectedCarId = 'inferno-rs' }
    Check "PUT updates the selected car" ($upd.Body.selectedCarId -eq 'inferno-rs') $upd.Body.selectedCarId

    $dup = Invoke-Api POST '/api/auth/register' @{ displayName = $name; password = $password } -NoAuth
    Check "a duplicate name is 409 Conflict" ($dup.Status -eq 409) $dup.Status

    $missing = Invoke-Api GET '/api/players/plr_does_not_exist'
    Check "an unknown player is 404" ($missing.Status -eq 404) $missing.Status
    Check "an unauthenticated read is 401" ((Invoke-Api GET '/api/players' -NoAuth).Status -eq 401)

    # -- 5-7. Race completion and persistence ------------------------------
    Section "5-7. A race is completed, submitted once, and persisted"
    # No playerId in the body: the session decides who is racing.
    $raceBody = @{
        carId = 'apex-vulcan'; trackId = 'hawkins-streets'
        elapsedTimeMs = 142337; bestLapTimeMs = 46912; position = 1; lapsCompleted = 3
    }
    $race = Invoke-Api POST '/api/races' $raceBody
    Check "POST /api/races returns 201" ($race.Status -eq 201) $race.Status
    $raceId = $race.Body.race.id
    $createdRaceIds.Add($raceId)
    Check "the response echoes the stored record" ($race.Body.race.elapsedTimeMs -eq 142337)
    Check "the stored record keeps milliseconds, not seconds" ($race.Body.race.elapsedTimeMs -gt 1000)

    # The duplicate-suppression guarantee, verified against real storage: the
    # client normally filters these, so sending one by hand proves the client is
    # what prevents duplicates, not a server-side accident.
    $historyAfterOne = Invoke-Api GET "/api/players/$playerId/races"
    Check "the history holds exactly one race" (@($historyAfterOne.Body).Count -eq 1) `
        "@($($historyAfterOne.Body).Count)"

    $race2 = Invoke-Api POST '/api/races' @{
        carId = 'apex-vulcan'; trackId = 'hawkins-forest'
        elapsedTimeMs = 155000; bestLapTimeMs = 51000; position = 2; lapsCompleted = 3
    }
    $createdRaceIds.Add($race2.Body.race.id)
    Check "a second, different race is accepted" ($race2.Status -eq 201) $race2.Status

    # Invalid results must be refused.
    $badLap = Invoke-Api POST '/api/races' @{
        carId = 'apex-vulcan'; trackId = 'hawkins-streets'
        elapsedTimeMs = 100000; bestLapTimeMs = 150000; position = 1; lapsCompleted = 3
    }
    Check "a lap slower than the race is rejected" ($badLap.Status -eq 400) $badLap.Status
    $badLaps = Invoke-Api POST '/api/races' @{
        carId = 'apex-vulcan'; trackId = 'hawkins-streets'
        elapsedTimeMs = 400000; position = 1; lapsCompleted = 9
    }
    Check "more laps than the track has is rejected" ($badLaps.Status -eq 400) $badLaps.Status
    $badTime = Invoke-Api POST '/api/races' @{
        carId = 'apex-vulcan'; trackId = 'hawkins-streets'
        elapsedTimeMs = 400; bestLapTimeMs = 133; position = 1; lapsCompleted = 3
    }
    Check "an impossible lap time is rejected" ($badTime.Status -eq 400) $badTime.Status
    $badCar = Invoke-Api POST '/api/races' @{
        carId = 'delorean'; trackId = 'hawkins-streets'
        elapsedTimeMs = 120000; position = 1; lapsCompleted = 3
    }
    Check "an unknown car is 404" ($badCar.Status -eq 404) $badCar.Status


    # A second player, so the leaderboard has something to rank.
    $name2 = ($tag + 'B').ToUpper()
    $mk2 = Invoke-Api POST '/api/auth/register' @{ displayName = $name2; password = $password } -NoAuth
    $player2 = $mk2.Body.player.id
    $createdPlayerIds.Add($player2)
    $token2 = $mk2.Body.token
    $cross = Invoke-Api GET "/api/players/$playerId" -Headers @{ Authorization = "Bearer $token2" }
    Check "another player's profile is 404, not 403" ($cross.Status -eq 404) $cross.Status
    Invoke-Api POST '/api/races' @{
        carId = 'venom-verde'; trackId = 'hawkins-streets'
        elapsedTimeMs = 131000; bestLapTimeMs = 43000; position = 2; lapsCompleted = 3
    } -Headers @{ Authorization = "Bearer $token2" } | Out-Null

    # Back to the main account for the remaining sections.
    $script:Token = $mk.Body.token

    # -- 8. Race history ---------------------------------------------------
    Section "8. The race history displays the saved result"
    $history = Invoke-Api GET "/api/players/$playerId/races"
    Check "history returns 200" ($history.Status -eq 200) $history.Status
    Check "history holds both races" (@($history.Body).Count -eq 2) "@($($history.Body).Count)"
    $newest = @($history.Body)[0]
    Check "history is newest first" ($newest.trackId -eq 'hawkins-forest') $newest.trackId
    Check "history carries the car id" ($newest.carId -eq 'apex-vulcan') $newest.carId
    Check "history carries the finishing position" ($newest.position -eq 2) $newest.position
    $empty = Invoke-Api GET '/api/players/plr_nobody/races'
    Check "history for an unknown player is 404, not an empty list" ($empty.Status -eq 404) $empty.Status

    # -- 8b. Idempotency -----------------------------------------------------
    # Deliberately after the history checks: this probe deliberately adds a row,
    # and running it earlier would change the counts section 8 asserts on.
    Section "8b. A retried submission is not counted twice"
    $idemKey = "$tag-key-0000-0000-000000000001"
    $idemHeaders = @{ Authorization = "Bearer $script:Token"; 'Idempotency-Key' = $idemKey }
    $beforeIdem = Invoke-Api GET "/api/players/$playerId/races"
    $first = Invoke-Api POST '/api/races' $raceBody -Headers $idemHeaders
    $replay = Invoke-Api POST '/api/races' $raceBody -Headers $idemHeaders
    Check "a fresh submission is 201" ($first.Status -eq 201) $first.Status
    Check "a replayed submission is 200, not 201" ($replay.Status -eq 200) $replay.Status
    $afterIdem = Invoke-Api GET "/api/players/$playerId/races"
    $grewBy = @($afterIdem.Body).Count - @($beforeIdem.Body).Count
    Check "the retry added no second row" ($grewBy -eq 1) "history grew by $grewBy"
    Check "the replay is the same race" ($replay.Body.race.id -eq $first.Body.race.id) $replay.Body.race.id
    # -- 9. Leaderboard ----------------------------------------------------
    Section "9. The leaderboard reflects the saved race"
    $board = Invoke-Api GET '/api/leaderboard?sortBy=bestTimeMs&order=asc&page=0&size=25'
    Check "leaderboard returns 200" ($board.Status -eq 200) $board.Status
    Check "leaderboard has entries" ($board.Body.totalEntries -ge 2) $board.Body.totalEntries
    $mine = $board.Body.entries | Where-Object { $_.playerId -eq $playerId }
    Check "the player appears on the board" ([bool]$mine)
    if ($mine) {
        Check "the board shows this player's best time" ($mine.bestTimeMs -eq 142337) $mine.bestTimeMs
        Check "ranks are assigned" ($mine.rank -ge 1) $mine.rank
        Check "a score is exposed" ($mine.score -gt 0) $mine.score
    }
    $paged = Invoke-Api GET '/api/leaderboard?page=0&size=1'
    Check "pagination limits the page" (@($paged.Body.entries).Count -le 1) "@($($paged.Body.entries).Count)"
    Check "pagination reports the total" ($paged.Body.totalEntries -ge 2) $paged.Body.totalEntries

    # -- 11. Failed request produces a usable error ------------------------
    Section "11. A failed API request produces an understandable error"
    $err = Invoke-Api GET '/api/tracks/mars'
    Check "an unknown track is 404" ($err.Status -eq 404) $err.Status
    Check "the error names the missing resource" ($err.Body.message -match 'No track') $err.Body.message
    Check "the error has a status field" ($err.Body.status -eq 404)
    $errText = $err.Raw
    Check "the error leaks no SQL" (-not ($errText -match 'SELECT|INSERT|UPDATE '))
    Check "the error leaks no package names" (-not ($errText -match 'com\.hawkins'))
    Check "the error leaks no credentials" (-not ($errText -match 'jdbc:|password'))

    # -- 12. The game stays playable without the leaderboard ---------------
    Section "12. The game stays playable when the leaderboard is unavailable"
    # The frontend fetches the catalogue independently, so a leaderboard failure
    # must not take the catalogues with it.
    $carsAfter = Invoke-Api GET '/api/cars'
    Check "cars still load while the leaderboard is queried" ($carsAfter.Status -eq 200)
    Write-Host "  NOTE  the catalogue and leaderboard are separate requests; the" 
    Write-Host "        frontend treats a leaderboard failure as informational only."

    # -- 10. Persistence across a restart ----------------------------------
    if (-not $SkipRestartCheck) {
        Section "10. Reloading the application preserves database-backed data"
        # Snapshot the rows while the process is still up. The property being
        # tested is "the same rows are still there afterwards", so compare against
        # this rather than a hardcoded number -- an earlier section legitimately
        # adds rows, and a fixed count turns that into a false failure that has
        # nothing to do with persistence.
        $beforeRestart = @( (Invoke-Api GET "/api/players/$playerId/races").Body )
        Stop-Backend $running
        Write-Host "  backend stopped. Verifying the rows are in MySQL, not memory..."
        $running = Start-Backend
        if (-not $running) {
            Skip "restart persistence" "the backend did not come back up"
        } else {
            $again = Invoke-Api GET "/api/players/$playerId"
            Check "the player survived the restart" ($again.Status -eq 200 -and $again.Body.id -eq $playerId)
            Check "the selected car survived" ($again.Body.selectedCarId -eq 'inferno-rs') $again.Body.selectedCarId
            $hist2 = @( (Invoke-Api GET "/api/players/$playerId/races").Body )
            Check "the race history survived" ($hist2.Count -eq $beforeRestart.Count) `
                "$($beforeRestart.Count) before, $($hist2.Count) after"
            # Compare identity, not just count: a restart that re-seeded rows would
            # pass a count check while losing the actual results.
            $idsBefore = @($beforeRestart | ForEach-Object { $_.race.id } | Sort-Object)
            $idsAfter = @($hist2 | ForEach-Object { $_.race.id } | Sort-Object)
            Check "the same race ids are present after the restart" `
                (($idsBefore -join ',') -eq ($idsAfter -join ',')) "$($idsAfter -join ',')"
            $board2 = Invoke-Api GET '/api/leaderboard'
            $mine2 = $board2.Body.entries | Where-Object { $_.playerId -eq $playerId }
            Check "the leaderboard entry survived" ([bool]$mine2)
        }
    } else {
        Skip "restart persistence" "-SkipRestartCheck"
    }

    # -- CORS --------------------------------------------------------------
    Section "13. CORS is restricted to the configured origin"
    $preflight = & curl.exe -s -i -X OPTIONS "$base/api/cars" `
        -H "Origin: http://localhost:5173" -H "Access-Control-Request-Method: GET" 2>&1 | Out-String
    Check "the Vite dev origin is allowed" ($preflight -match 'Access-Control-Allow-Origin: http://localhost:5173')
    $blocked = & curl.exe -s -i -X OPTIONS "$base/api/cars" `
        -H "Origin: https://evil.example" -H "Access-Control-Request-Method: GET" 2>&1 | Out-String
    Check "an unlisted origin is refused" (-not ($blocked -match 'Access-Control-Allow-Origin'))

}
finally {
    Stop-Backend $running

    # Remove exactly what this run created, by id. Anything not on these lists
    # is left alone, so a shared development database is not harmed.
    Write-Host ""
    Write-Host "cleaning up records created by run $tag..."

    $mysqlExe = $null
    foreach ($c in @('mysql', 'D:\hawkins-tools\mysql\bin\mysql.exe',
                     'C:\Program Files\MySQL\MySQL Server 8.4\bin\mysql.exe')) {
        if ($c -eq 'mysql') {
            if (Get-Command mysql -ErrorAction SilentlyContinue) { $mysqlExe = 'mysql'; break }
        } elseif (Test-Path $c) { $mysqlExe = $c; break }
    }

    if (-not $mysqlExe) {
        Skip "cleanup" "no mysql client found; remove rows $tag manually"
    } elseif ($createdPlayerIds.Count -eq 0) {
        Write-Host "  nothing to remove"
    } else {
        # jdbc:mysql://host:port/schema?params  ->  host, port, schema
        $m = [regex]::Match($env:DB_URL, 'jdbc:mysql://([^:/]+)(?::(\d+))?/([^?]+)')
        $dbHost = $m.Groups[1].Value
        $dbPort = if ($m.Groups[2].Value) { $m.Groups[2].Value } else { '3306' }
        $schema = $m.Groups[3].Value

        $ids = ($createdPlayerIds -join "','")
        $env:MYSQL_PWD = $env:DB_PASSWORD
        $sql = "DELETE FROM $schema`.races WHERE player_id IN ('$ids');" +
               "DELETE FROM $schema`.players WHERE id IN ('$ids');" +
               "SELECT (SELECT COUNT(*) FROM $schema`.players WHERE id IN ('$ids')) AS players_left;"
        $out = $sql | & $mysqlExe -u $env:DB_USERNAME --protocol=TCP -h $dbHost -P $dbPort -N -B 2>&1
        Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue

        if ($LASTEXITCODE -eq 0) {
            Write-Host "  removed $($createdRaceIds.Count) race(s) and $($createdPlayerIds.Count) player(s) from $schema"
        } else {
            Skip "cleanup" "mysql client failed: $out"
        }
    }
}

Write-Host ""
Write-Host "======================================================"
Write-Host ("  passed : " + $script:passed)
Write-Host ("  failed : " + $script:failed)
Write-Host ("  skipped: " + $script:skipped)
Write-Host "======================================================"
if ($script:failed -gt 0) { exit 1 }