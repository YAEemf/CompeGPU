param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('Start', 'Stop')]
    [string]$Action,
    [ValidateRange(1, 65535)]
    [int]$Port = 8765,
    [switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $projectRoot 'server.py'
$runtimePath = Join-Path $projectRoot '.runtime'
$statePath = Join-Path $runtimePath 'server.json'
$lockHandle = $null

function Get-OwnedServer($State) {
    $candidate = Get-Process -Id $State.processId -ErrorAction SilentlyContinue
    if ($null -eq $candidate) { return $null }
    if ($candidate.StartTime.ToUniversalTime().Ticks.ToString() -ne $State.startedTicks) { return $null }
    $details = Get-CimInstance Win32_Process -Filter "ProcessId = $($State.processId)"
    if ($null -eq $details -or -not $details.CommandLine.Contains($serverPath)) { return $null }
    return $candidate
}

try {
    New-Item -ItemType Directory -Path $runtimePath -Force | Out-Null
    # Serialize start/stop operations, including double-clicks on start.bat.
    $lockHandle = [System.IO.File]::Open((Join-Path $runtimePath 'control.lock'), 'OpenOrCreate', 'ReadWrite', 'None')
    $state = $null
    $ownedServer = $null
    if (Test-Path -LiteralPath $statePath) {
        $state = Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json
        $ownedServer = Get-OwnedServer $state
        if ($null -eq $ownedServer) {
            Remove-Item -LiteralPath $statePath
        }
    }

    if ($Action -eq 'Stop') {
        if ($null -eq $ownedServer) {
            Write-Host 'GPU Compare is not running (no server started by start.bat).'
        } else {
            Stop-Process -Id $ownedServer.Id
            $ownedServer.WaitForExit()
            Remove-Item -LiteralPath $statePath
            Write-Host 'GPU Compare stopped. The browser tab can be closed.'
        }
    } elseif ($null -ne $ownedServer) {
        $localUrl = "http://127.0.0.1:$($state.port)"
        Write-Host "GPU Compare is already running: $localUrl"
        if (-not $NoBrowser) { Start-Process $localUrl }
    } else {
        $pythonPath = $null
        foreach ($commandName in @('python', 'py')) {
            $command = Get-Command $commandName -ErrorAction SilentlyContinue
            if ($null -eq $command) { continue }
            $pythonArgs = @('-c', 'import sys; assert sys.version_info >= (3,10); print(sys.executable)')
            if ($commandName -eq 'py') { $pythonArgs = @('-3') + $pythonArgs }
            $resolved = & $command.Source @pythonArgs 2>$null
            if ($LASTEXITCODE -eq 0 -and $resolved -and (Test-Path -LiteralPath "$resolved")) {
                $pythonPath = "$resolved"
                break
            }
        }
        if ($null -eq $pythonPath) { throw 'Python 3.10 or later was not found. Install Python and enable PATH.' }

        $probe = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
        try { $probe.Start() } catch { throw "Port $Port is already in use. No process was stopped. Try start.bat -Port 9000." }
        finally { $probe.Stop() }

        $stdoutPath = Join-Path $runtimePath 'server.log'
        $stderrPath = Join-Path $runtimePath 'server-error.log'
        $serverProcess = Start-Process -FilePath $pythonPath -ArgumentList @('-u', ('"' + $serverPath + '"'), '--port', $Port) -WorkingDirectory $projectRoot -WindowStyle Hidden -RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath -PassThru
        $state = @{processId = $serverProcess.Id; startedTicks = $serverProcess.StartTime.ToUniversalTime().Ticks.ToString(); port = $Port}
        $state | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
        $localUrl = "http://127.0.0.1:$Port"
        $ready = $false
        for ($attempt = 0; $attempt -lt 40; $attempt++) {
            if ($serverProcess.HasExited) { throw "The server exited. See $stderrPath" }
            try {
                $response = Invoke-WebRequest -Uri "$localUrl/api/data" -UseBasicParsing -TimeoutSec 1
                if ($response.StatusCode -eq 200 -and -not $serverProcess.HasExited) { $ready = $true; break }
            } catch { Start-Sleep -Milliseconds 250 }
        }
        if (-not $ready) { throw "Server startup timed out. See $stderrPath. Use stop.bat before retrying." }
        Write-Host "GPU Compare started: $localUrl"
        Write-Host 'Use stop.bat to stop the server. Save edits in the browser first.'
        if (-not $NoBrowser) { Start-Process $localUrl }
    }
} catch {
    Write-Host "ERROR: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
} finally {
    if ($null -ne $lockHandle) { $lockHandle.Dispose() }
}
