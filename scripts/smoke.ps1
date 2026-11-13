$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = Split-Path -Parent $scriptDir
Set-Location $rootDir

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "     AI Gym Coach Docker Smoke Test       " -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

# 1. Verify Docker CLI and daemon
try {
    docker info > $null 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[-] Docker daemon is not running. Please start Docker Desktop first." -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[-] Docker CLI is not installed or not in PATH." -ForegroundColor Red
    exit 1
}

# 2. Check for port 8000/3000 conflicts with non-docker processes
$localListeners = Get-NetTCPConnection -LocalPort 8000, 3000 -State Listen -ErrorAction SilentlyContinue
if ($localListeners) {
    Write-Host "[!] Warning: Port 8000 or 3000 is currently in use by a local process." -ForegroundColor Yellow
    Write-Host "[!] Attempting to proceed with docker compose..." -ForegroundColor Yellow
}

$testPassed = $false

try {
    # 3. Bring up the stack with build in detached mode
    Write-Host "[+] Building and launching containers (docker compose up --build -d)..." -ForegroundColor Cyan
    docker compose up --build -d
    if ($LASTEXITCODE -ne 0) {
        throw "docker compose up --build failed"
    }

    # 4. Wait for backend /health (up to 40 seconds)
    Write-Host "[+] Waiting for backend health check at http://localhost:8000/health..." -ForegroundColor Cyan
    $backendHealthy = $false
    for ($i = 0; $i -lt 40; $i++) {
        Start-Sleep -Seconds 1
        try {
            $response = Invoke-RestMethod -Uri "http://localhost:8000/health" -Method Get -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($response.status -eq "ok") {
                $backendHealthy = $true
                Write-Host "    [✓] Backend is healthy!" -ForegroundColor Green
                break
            }
        } catch {
            # Still starting
        }
    }

    if (-not $backendHealthy) {
        throw "Backend failed to become healthy within 40 seconds."
    }

    # 5. Wait for frontend availability at http://localhost:3000 (up to 20 seconds)
    Write-Host "[+] Checking frontend availability at http://localhost:3000..." -ForegroundColor Cyan
    $frontendOk = $false
    for ($i = 0; $i -lt 20; $i++) {
        Start-Sleep -Seconds 1
        try {
            $resp = Invoke-WebRequest -Uri "http://localhost:3000" -Method Get -UseBasicParsing -TimeoutSec 3 -ErrorAction SilentlyContinue
            if ($resp.StatusCode -eq 200) {
                $frontendOk = $true
                Write-Host "    [✓] Frontend is responding (HTTP 200)!" -ForegroundColor Green
                break
            }
        } catch {
            # Still starting
        }
    }

    if (-not $frontendOk) {
        throw "Frontend failed to respond on http://localhost:3000."
    }

    # 6. Post a sample workout session to the backend
    Write-Host "[+] Posting sample workout session to http://localhost:8000/sessions..." -ForegroundColor Cyan
    $deviceId = "00000000-0000-4000-8000-000000000001"
    $headers = @{
        "Content-Type" = "application/json"
        "X-Device-Id"  = $deviceId
    }

    $samplePayload = @{
        started_at = "2026-11-13T10:00:00Z"
        ended_at   = "2026-11-13T10:05:00Z"
        sets       = @(
            @{
                exercise   = "squat"
                started_at = "2026-11-13T10:00:10Z"
                ended_at   = "2026-11-13T10:04:50Z"
                reps       = @(
                    @{
                        index       = 1
                        score       = 95
                        duration_ms = 2100
                        metrics     = @{ minKneeAngle = 88.5 }
                        violations  = @()
                        timestamp   = 1793700000000
                    },
                    @{
                        index       = 2
                        score       = 70
                        duration_ms = 2300
                        metrics     = @{ minKneeAngle = 105.0 }
                        violations  = @("depth")
                        timestamp   = 1793700005000
                    }
                )
            }
        )
    } | ConvertTo-Json -Depth 6

    $createdSession = Invoke-RestMethod -Uri "http://localhost:8000/sessions" -Method Post -Headers $headers -Body $samplePayload
    if (-not $createdSession.id) {
        throw "Failed to create session; no ID returned."
    }
    $createdId = $createdSession.id
    Write-Host "    [✓] Created test session #$createdId!" -ForegroundColor Green

    # 7. Read the session back and verify reps
    Write-Host "[+] Reading back session #$createdId via GET..." -ForegroundColor Cyan
    $readSession = Invoke-RestMethod -Uri "http://localhost:8000/sessions/$createdId" -Method Get -Headers $headers
    if ($readSession.sets.Count -ne 1 -or $readSession.sets[0].reps.Count -ne 2) {
        throw "Retrieved session data does not match posted data!"
    }
    Write-Host "    [✓] Successfully verified session #$createdId data and reps!" -ForegroundColor Green

    $testPassed = $true
} catch {
    Write-Host "[-] Smoke test FAILED: $_" -ForegroundColor Red
} finally {
    # 8. Bring the stack down
    Write-Host "[+] Tearing down containers (docker compose down -v)..." -ForegroundColor Cyan
    docker compose down -v
}

if ($testPassed) {
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "     ALL DOCKER SMOKE TESTS PASSED!       " -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    exit 0
} else {
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "        DOCKER SMOKE TEST FAILED          " -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Red
    exit 1
}
