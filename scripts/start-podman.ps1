# start-podman.ps1
# Ensures Podman is running and updates .env with the correct WSL IP address
# Note: The TCP API service (port 2375) auto-starts via systemd when the machine starts

$ErrorActionPreference = "Stop"

Write-Host "Starting Podman setup for Kova..." -ForegroundColor Cyan

# Check if Podman machine is running
$machineStatus = podman machine list --format "{{.Name}},{{.Running}}" | Where-Object { $_ -like "podman-machine-default*" }
if ($machineStatus -notlike "*true*") {
    Write-Host "Starting Podman machine..." -ForegroundColor Yellow
    podman machine start podman-machine-default
    Start-Sleep -Seconds 2
} else {
    Write-Host "Podman machine is already running." -ForegroundColor Green
}

# Get the WSL IP address
$ipOutput = podman machine ssh podman-machine-default "ip addr show eth0 | grep 'inet '"
$ip = ($ipOutput -replace '.*inet\s+(\d+\.\d+\.\d+\.\d+).*', '$1').Trim()

if (-not $ip) {
    Write-Host "ERROR: Could not get WSL IP address" -ForegroundColor Red
    exit 1
}

Write-Host "Podman WSL IP: $ip" -ForegroundColor Green

# Update .env file if IP changed
$envFile = Join-Path $PSScriptRoot "../.env"
if (Test-Path $envFile) {
    $content = Get-Content $envFile -Raw

    if ($content -match "DOCKER_HOST=tcp://[\d\.]+:2375") {
        $currentIp = [regex]::Match($content, "DOCKER_HOST=tcp://([\d\.]+):2375").Groups[1].Value
        if ($currentIp -eq $ip) {
            Write-Host "DOCKER_HOST already set to tcp://${ip}:2375" -ForegroundColor Green
        } else {
            $content = $content -replace "DOCKER_HOST=tcp://[\d\.]+:2375", "DOCKER_HOST=tcp://${ip}:2375"
            Set-Content $envFile $content -NoNewline
            Write-Host "Updated DOCKER_HOST in .env to tcp://${ip}:2375" -ForegroundColor Green
        }
    } elseif ($content -match "DOCKER_HOST=") {
        Write-Host "WARNING: DOCKER_HOST exists but in unexpected format. Please update manually." -ForegroundColor Yellow
    } else {
        Add-Content $envFile "`nDOCKER_HOST=tcp://${ip}:2375"
        Write-Host "Added DOCKER_HOST=tcp://${ip}:2375 to .env" -ForegroundColor Green
    }
} else {
    Write-Host "WARNING: .env file not found at $envFile" -ForegroundColor Yellow
}

# Verify connection
Write-Host "`nVerifying Podman API connection..." -ForegroundColor Yellow

try {
    $response = Invoke-RestMethod -Uri "http://${ip}:2375/version" -TimeoutSec 5
    Write-Host "Connected to Podman $($response.Version)" -ForegroundColor Green
} catch {
    Write-Host "WARNING: Could not verify connection. The TCP service may not be running." -ForegroundColor Yellow
    Write-Host "Run: podman machine ssh podman-machine-default 'systemctl --user status podman-tcp.service'" -ForegroundColor Yellow
}

Write-Host "`nPodman is ready! You can now run: bun run dev:backend" -ForegroundColor Cyan
