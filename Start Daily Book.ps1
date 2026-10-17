param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$dailyBookRoot = $PSScriptRoot
$dailyBookUrl = 'http://127.0.0.1:47831'
# Use the installed Node.js LTS.
$dailyBookNode = @(
    (Join-Path $env:ProgramFiles 'nodejs\node.exe'),
    (Get-Command node -ErrorAction SilentlyContinue).Source
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
if (-not $dailyBookNode) { throw 'Node.js was not found. Install it with: winget install OpenJS.NodeJS.LTS' }
$dailyBookRunning = $false
try {
    $dailyBookResponse = Invoke-RestMethod "$dailyBookUrl/api/book" -TimeoutSec 2
    $dailyBookRunning = $dailyBookResponse.book.version -eq 1 -and $dailyBookResponse.token
} catch {}
$dailyBookLaunched = Get-Date
if (-not $dailyBookRunning) {
    $dailyBookServer = Start-Process -FilePath $dailyBookNode -ArgumentList ('"' + (Join-Path $dailyBookRoot 'server.cjs') + '"') -WorkingDirectory $dailyBookRoot -WindowStyle Hidden -PassThru
    # Allow extra time when launched at Windows sign-in, while the disk is busy.
    for ($dailyBookAttempt = 0; $dailyBookAttempt -lt 75; $dailyBookAttempt++) {
        Start-Sleep -Milliseconds 200
        try { $dailyBookResponse = Invoke-RestMethod "$dailyBookUrl/api/book" -TimeoutSec 1; if ($dailyBookResponse.book.version -eq 1) { $dailyBookRunning = $true; break } } catch {}
        if ($dailyBookServer.HasExited) { break }
    }
}
if (-not $dailyBookRunning) {
    # The server writes its reason to data\server-error.log before it exits.
    $dailyBookLog = Join-Path $dailyBookRoot 'data\server-error.log'
    $dailyBookReason = 'Please check whether port 47831 is in use.'
    if ((Test-Path -LiteralPath $dailyBookLog) -and (Get-Item -LiteralPath $dailyBookLog).LastWriteTime -ge $dailyBookLaunched.AddSeconds(-1)) {
        $dailyBookReason = ((Get-Content -LiteralPath $dailyBookLog -Tail 1) -replace '^\S+ ', '') + " (log: $dailyBookLog)"
    }
    throw "Daily Book could not start. $dailyBookReason"
}
if (-not $NoBrowser) { Start-Process ($dailyBookUrl + '/?launch=' + [guid]::NewGuid().ToString('N')) }
