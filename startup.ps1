<#
.SYNOPSIS
    Cortex Brasil - Script de Inicializacao Completa.

.DESCRIPTION
    Levanta toda a infraestrutura do Cortex (Docker, PostgreSQL, Redis, Backend,
    Cloudflare Tunnel) e verifica o frontend hospedado na Vercel.
    Gera um relatorio detalhado com eventuais erros.

    Uso:
        .\startup.ps1              Inicializa tudo e gera relatorio
        .\startup.ps1 -Register   Registra como Scheduled Task (rodar no logon)
        .\startup.ps1 -Unregister Remove a Scheduled Task

.NOTES
    Requer Docker Desktop instalado.
#>

param(
    [switch]$Register,
    [switch]$Unregister
)

# -------------------------------------------------------------
# CONSTANTS
# -------------------------------------------------------------

$PROJECT_DIR       = Split-Path -Parent $MyInvocation.MyCommand.Definition
$REPORT_FILE       = Join-Path $PROJECT_DIR "startup_report.log"
$TASK_NAME         = "CortexStartup"
$DOCKER_DESKTOP    = "Docker Desktop"
$COMPOSE_FILE      = Join-Path $PROJECT_DIR "docker-compose.yml"
$FRONTEND_URL      = "https://www.cortexbrasil.com.br"

$MAX_DOCKER_WAIT_SECONDS   = 120
$MAX_SERVICE_WAIT_SECONDS  = 90
$HEALTH_CHECK_INTERVAL     = 5

# -------------------------------------------------------------
# STATE
# -------------------------------------------------------------

$StartTime = Get-Date
$Report = [System.Collections.Generic.List[PSCustomObject]]::new()

# -------------------------------------------------------------
# LOGGING
# -------------------------------------------------------------

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "WARN", "ERROR", "SUCCESS")]
        [string]$Level = "INFO"
    )

    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $prefix = switch ($Level) {
        "INFO"    { "[INFO]   " }
        "WARN"    { "[WARN]   " }
        "ERROR"   { "[ERROR]  " }
        "SUCCESS" { "[OK]     " }
    }

    $color = switch ($Level) {
        "INFO"    { "Cyan" }
        "WARN"    { "Yellow" }
        "ERROR"   { "Red" }
        "SUCCESS" { "Green" }
    }

    $line = "$timestamp $prefix $Message"
    Write-Host $line -ForegroundColor $color
    Add-Content -Path $REPORT_FILE -Value $line -ErrorAction SilentlyContinue
}

function Add-ServiceResult {
    param(
        [string]$ServiceName,
        [bool]$IsHealthy,
        [string]$ErrorDetail = "",
        [double]$ElapsedSeconds = 0
    )

    $Report.Add([PSCustomObject]@{
        Service  = $ServiceName
        Status   = if ($IsHealthy) { "OK" } else { "FALHOU" }
        Elapsed  = "{0:N1}s" -f $ElapsedSeconds
        Error    = $ErrorDetail
    })
}

# -------------------------------------------------------------
# SCHEDULED TASK MANAGEMENT
# -------------------------------------------------------------

function Register-StartupTask {
    $scriptPath = $MyInvocation.ScriptName
    if (-not $scriptPath) {
        $scriptPath = Join-Path $PROJECT_DIR "startup.ps1"
    }

    $action = New-ScheduledTaskAction `
        -Execute "powershell.exe" `
        -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File `"$scriptPath`"" `
        -WorkingDirectory $PROJECT_DIR

    $trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME

    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -ExecutionTimeLimit (New-TimeSpan -Minutes 10)

    Register-ScheduledTask `
        -TaskName $TASK_NAME `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Description "Inicializa toda a infraestrutura Cortex Brasil no logon." `
        -Force

    Write-Log "Scheduled Task '$TASK_NAME' registrada com sucesso." "SUCCESS"
    Write-Log "O script rodará automaticamente ao fazer logon como '$env:USERNAME'." "INFO"
}

function Unregister-StartupTask {
    if (Get-ScheduledTask -TaskName $TASK_NAME -ErrorAction SilentlyContinue) {
        Unregister-ScheduledTask -TaskName $TASK_NAME -Confirm:$false
        Write-Log "Scheduled Task '$TASK_NAME' removida." "SUCCESS"
    } else {
        Write-Log "Scheduled Task '$TASK_NAME' nao encontrada." "WARN"
    }
}

# -------------------------------------------------------------
# HEALTH CHECK UTILITIES
# -------------------------------------------------------------

function Test-TcpPort {
    param(
        [string]$Host_ = "127.0.0.1",
        [int]$Port,
        [int]$TimeoutMs = 2000
    )

    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $result = $tcp.BeginConnect($Host_, $Port, $null, $null)
        $waited = $result.AsyncWaitHandle.WaitOne($TimeoutMs, $false)
        if ($waited -and $tcp.Connected) {
            $tcp.Close()
            return $true
        }
        $tcp.Close()
        return $false
    } catch {
        return $false
    }
}

function Test-HttpEndpoint {
    param(
        [string]$Url,
        [int]$TimeoutSeconds = 5
    )

    try {
        $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec $TimeoutSeconds -ErrorAction Stop
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400)
    } catch {
        return $false
    }
}

function Wait-ForCondition {
    param(
        [scriptblock]$Condition,
        [int]$MaxWaitSeconds,
        [int]$IntervalSeconds = $HEALTH_CHECK_INTERVAL,
        [string]$Description = "condição"
    )

    $elapsed = 0
    while ($elapsed -lt $MaxWaitSeconds) {
        if (& $Condition) {
            return $true
        }
        Write-Log "Aguardando $Description... (${elapsed}s / ${MaxWaitSeconds}s)" "INFO"
        Start-Sleep -Seconds $IntervalSeconds
        $elapsed += $IntervalSeconds
    }
    return $false
}

function Get-ContainerStatus {
    param([string]$ContainerName)

    try {
        $projectName = (Split-Path $PROJECT_DIR -Leaf).ToLower() -replace '[^a-z0-9]', ''
        $patterns = @(
            "${projectName}-${ContainerName}-1",
            "${projectName}_${ContainerName}_1",
            $ContainerName
        )

        foreach ($pattern in $patterns) {
            $status = docker inspect --format '{{.State.Status}}' $pattern 2>$null
            if ($LASTEXITCODE -eq 0 -and $status) {
                return $status.Trim()
            }
        }
        return "not_found"
    } catch {
        return "error"
    }
}

# -------------------------------------------------------------
# INITIALIZATION STEPS
# -------------------------------------------------------------

function Initialize-DockerEngine {
    $stepStart = Get-Date
    Write-Log "=== Verificando Docker Engine ===" "INFO"

    $dockerRunning = $false
    try {
        docker info 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            $dockerRunning = $true
        }
    } catch {
        $dockerRunning = $false
    }

    if ($dockerRunning) {
        Write-Log "Docker Engine já está rodando." "SUCCESS"
        $elapsed = ((Get-Date) - $stepStart).TotalSeconds
        Add-ServiceResult -ServiceName "Docker Engine" -IsHealthy $true -ElapsedSeconds $elapsed
        return $true
    }

    Write-Log "Docker Engine nao detectado. Tentando iniciar Docker Desktop..." "WARN"

    $possiblePaths = @(
        "$env:ProgramFiles\Docker\Docker\Docker Desktop.exe",
        "${env:ProgramFiles(x86)}\Docker\Docker\Docker Desktop.exe",
        "$env:LOCALAPPDATA\Docker\Docker Desktop.exe",
        "C:\Program Files\Docker\Docker\Docker Desktop.exe"
    )

    $exePath = $null
    foreach ($path in $possiblePaths) {
        if (Test-Path $path) {
            $exePath = $path
            break
        }
    }

    if (-not $exePath) {
        # Try finding via where.exe
        $whereResult = where.exe "Docker Desktop" 2>$null
        if ($whereResult) { $exePath = $whereResult[0] }
    }

    if (-not $exePath) {
        $errorMsg = "Docker Desktop nao encontrado. Por favor, abra o Docker Desktop manualmente."
        Write-Log $errorMsg "ERROR"
        $elapsed = ((Get-Date) - $stepStart).TotalSeconds
        Add-ServiceResult -ServiceName "Docker Engine" -IsHealthy $false -ErrorDetail $errorMsg -ElapsedSeconds $elapsed
        return $false
    }

    Write-Log "Iniciando Docker Desktop de: $exePath" "INFO"
    Start-Process $exePath -WindowStyle Minimized

    $ready = Wait-ForCondition -Description "Docker Engine" -MaxWaitSeconds $MAX_DOCKER_WAIT_SECONDS -Condition {
        try {
            docker info 2>&1 | Out-Null
            return ($LASTEXITCODE -eq 0)
        } catch {
            return $false
        }
    }

    $elapsed = ((Get-Date) - $stepStart).TotalSeconds

    if ($ready) {
        Write-Log "Docker Engine pronta." "SUCCESS"
        Add-ServiceResult -ServiceName "Docker Engine" -IsHealthy $true -ElapsedSeconds $elapsed
        return $true
    } else {
        $errorMsg = "Docker Engine nao ficou pronta dentro de ${MAX_DOCKER_WAIT_SECONDS}s."
        Write-Log $errorMsg "ERROR"
        Add-ServiceResult -ServiceName "Docker Engine" -IsHealthy $false -ErrorDetail $errorMsg -ElapsedSeconds $elapsed
        return $false
    }
}

function Initialize-DockerCompose {
    Write-Log "=== Subindo containers (docker compose up) ===" "INFO"

    if (-not (Test-Path $COMPOSE_FILE)) {
        $errorMsg = "Arquivo docker-compose.yml nao encontrado em: $COMPOSE_FILE"
        Write-Log $errorMsg "ERROR"
        return $false
    }

    try {
        docker compose -f $COMPOSE_FILE up -d --build
        if ($LASTEXITCODE -ne 0) {
            Write-Log "docker compose up retornou erro (ExitCode: $LASTEXITCODE)" "ERROR"
            return $false
        }
        Write-Log "docker compose up executado com sucesso." "SUCCESS"
        return $true
    } catch {
        Write-Log "Excecao ao executar docker compose: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Initialize-ContainerService {
    param(
        [string]$ServiceName,
        [string]$ContainerName,
        [int]$Port = 0,
        [string]$HealthUrl = ""
    )

    $stepStart = Get-Date
    Write-Log "--- Verificando $ServiceName ---" "INFO"

    # Wait for container to be running
    $containerReady = Wait-ForCondition -Description "$ServiceName container" -MaxWaitSeconds $MAX_SERVICE_WAIT_SECONDS -Condition {
        $status = Get-ContainerStatus -ContainerName $ContainerName
        return ($status -eq "running")
    }

    if (-not $containerReady) {
        $status = Get-ContainerStatus -ContainerName $ContainerName
        $errorMsg = "Container '$ContainerName' nao ficou running. Status atual: $status"

        try {
            $logs = docker compose -f $COMPOSE_FILE logs --tail=30 $ContainerName 2>&1 | Out-String
            $errorMsg += "`n--- Últimas 30 linhas de log ---`n$logs"
        } catch {}

        Write-Log $errorMsg "ERROR"
        $elapsed = ((Get-Date) - $stepStart).TotalSeconds
        Add-ServiceResult -ServiceName $ServiceName -IsHealthy $false -ErrorDetail $errorMsg -ElapsedSeconds $elapsed
        return
    }

    # Port check
    if ($Port -gt 0) {
        $portReady = Wait-ForCondition -Description "$ServiceName porta $Port" -MaxWaitSeconds 30 -IntervalSeconds 3 -Condition {
            return (Test-TcpPort -Port $Port)
        }

        if (-not $portReady) {
            $errorMsg = "Porta $Port nao está acessível para $ServiceName."
            Write-Log $errorMsg "ERROR"
            $elapsed = ((Get-Date) - $stepStart).TotalSeconds
            Add-ServiceResult -ServiceName $ServiceName -IsHealthy $false -ErrorDetail $errorMsg -ElapsedSeconds $elapsed
            return
        }
    }

    # HTTP health check
    if ($HealthUrl) {
        $httpReady = Wait-ForCondition -Description "$ServiceName HTTP endpoint" -MaxWaitSeconds 60 -IntervalSeconds 3 -Condition {
            return (Test-HttpEndpoint -Url $HealthUrl)
        }

        if (-not $httpReady) {
            $errorMsg = "Endpoint $HealthUrl nao respondeu com sucesso para $ServiceName."
            Write-Log $errorMsg "WARN"
            $elapsed = ((Get-Date) - $stepStart).TotalSeconds
            Add-ServiceResult -ServiceName $ServiceName -IsHealthy $false -ErrorDetail $errorMsg -ElapsedSeconds $elapsed
            return
        }
    }

    Write-Log "$ServiceName está saudavel." "SUCCESS"
    $elapsed = ((Get-Date) - $stepStart).TotalSeconds
    Add-ServiceResult -ServiceName $ServiceName -IsHealthy $true -ElapsedSeconds $elapsed
}

function Test-VercelFrontend {
    $stepStart = Get-Date
    Write-Log "=== Verificando Frontend (Vercel - $FRONTEND_URL) ===" "INFO"

    try {
        $response = Invoke-WebRequest -Uri $FRONTEND_URL -UseBasicParsing -TimeoutSec 15 -ErrorAction Stop
        $statusCode = $response.StatusCode

        if ($statusCode -ge 200 -and $statusCode -lt 400) {
            Write-Log "Frontend Vercel respondeu com HTTP $statusCode." "SUCCESS"
            $elapsed = ((Get-Date) - $stepStart).TotalSeconds
            Add-ServiceResult -ServiceName "Frontend (Vercel)" -IsHealthy $true -ElapsedSeconds $elapsed
        } else {
            $errorMsg = "Frontend Vercel retornou HTTP $statusCode."
            Write-Log $errorMsg "WARN"
            $elapsed = ((Get-Date) - $stepStart).TotalSeconds
            Add-ServiceResult -ServiceName "Frontend (Vercel)" -IsHealthy $false -ErrorDetail $errorMsg -ElapsedSeconds $elapsed
        }
    } catch {
        $errorMsg = "Frontend Vercel inacessível em $FRONTEND_URL - $($_.Exception.Message)"
        Write-Log $errorMsg "ERROR"
        $elapsed = ((Get-Date) - $stepStart).TotalSeconds
        Add-ServiceResult -ServiceName "Frontend (Vercel)" -IsHealthy $false -ErrorDetail $errorMsg -ElapsedSeconds $elapsed
    }
}

# -------------------------------------------------------------
# REPORT
# -------------------------------------------------------------

function Show-FinalReport {
    $totalElapsed = ((Get-Date) - $StartTime).TotalSeconds

    $separator = "=" * 70
    Write-Host ""
    Write-Host $separator -ForegroundColor Magenta
    Write-Host "  CORTEX BRASIL - RELATORIO DE INICIALIZACAO" -ForegroundColor Magenta
    Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')  |  Tempo total: $("{0:N1}" -f $totalElapsed)s" -ForegroundColor DarkGray
    Write-Host $separator -ForegroundColor Magenta
    Write-Host ""

    $allHealthy = $true

    foreach ($entry in $Report) {
        if ($null -eq $entry -or $null -eq $entry.Service) { continue }
        
        $statusStr = if ($null -eq $entry.Status) { "FALHOU" } else { $entry.Status }
        $elapsedStr = if ($null -eq $entry.Elapsed) { "0s" } else { $entry.Elapsed }
        $serviceName = $entry.Service
        
        $icon = if ($statusStr -eq "OK") { "[OK]" } else { "[X]"; $allHealthy = $false }
        $line = "  $icon  $($serviceName.PadRight(25)) $($statusStr.PadRight(8)) ($elapsedStr)"
        $color = if ($statusStr -eq "OK") { "Green" } else { "Red" }
        Write-Host $line -ForegroundColor $color

        if ($entry.Error) {
            $errorLines = $entry.Error -split "`n"
            foreach ($errLine in $errorLines) {
                if ($null -ne $errLine -and $errLine.Trim()) {
                    Write-Host "       > $($errLine.Trim())" -ForegroundColor DarkRed
                }
            }
        }
    }

    Write-Host ""
    Write-Host $separator -ForegroundColor Magenta

    if ($allHealthy) {
        Write-Host "  [OK] Todos os servicos estao saudaveis!" -ForegroundColor Green
    } else {
        $failedCount = ($Report | Where-Object { $null -ne $_ -and $_.Status -ne "OK" }).Count
        Write-Host "  [ERRO] $failedCount servico(s) com problema. Verifique os detalhes acima." -ForegroundColor Red
    }

    Write-Host $separator -ForegroundColor Magenta
    Write-Host ""

    # Save structured report to file
    $reportContent = @()
    $reportContent += $separator
    $reportContent += "CORTEX BRASIL - RELATORIO DE INICIALIZACAO"
    $reportContent += "Data: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    $reportContent += "Tempo total: $("{0:N1}" -f $totalElapsed)s"
    $reportContent += $separator
    $reportContent += ""

    foreach ($entry in $Report) {
        $icon = if ($entry.Status -eq "OK") { "[OK]" } else { "[FALHOU]" }
        $reportContent += "$icon  $($entry.Service) - $($entry.Elapsed)"
        if ($entry.Error) {
            $reportContent += "  ERRO: $($entry.Error)"
        }
        $reportContent += ""
    }

    $reportContent += $separator
    if ($allHealthy) {
        $reportContent += "RESULTADO: Todos os servicos estao saudaveis."
    } else {
        $failedCount = ($Report | Where-Object { $_.Status -ne "OK" }).Count
        $reportContent += "RESULTADO: $failedCount servico(s) com problema."
    }
    $reportContent += $separator

    $reportContent | Out-File -FilePath $REPORT_FILE -Encoding UTF8 -Force
    Write-Log "Relatorio salvo em: $REPORT_FILE" "INFO"
}

# -------------------------------------------------------------
# MAIN
# -------------------------------------------------------------

function Start-CortexInfrastructure {
    # Clear previous report
    if (Test-Path $REPORT_FILE) {
        Remove-Item $REPORT_FILE -Force -ErrorAction SilentlyContinue
    }

    Write-Host ""
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host "  CORTEX BRASIL - INICIALIZAÇÃO" -ForegroundColor Cyan
    Write-Host "  $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor DarkGray
    Write-Host ("=" * 70) -ForegroundColor Cyan
    Write-Host ""

    # Step 1: Docker Engine
    $dockerOk = Initialize-DockerEngine
    if (-not $dockerOk) {
        Write-Log "Docker Engine indisponivel. Containers nao serao iniciados." "ERROR"
        Show-FinalReport
        return
    }

    # Step 2: Docker Compose
    $composeOk = Initialize-DockerCompose
    if (-not $composeOk) {
        Write-Log "Falha no docker compose up. Verificando containers individuais..." "WARN"
    }

    # Step 3: Verify each container service
    Initialize-ContainerService -ServiceName "PostgreSQL" -ContainerName "db" -Port 5432
    Initialize-ContainerService -ServiceName "Redis" -ContainerName "redis" -Port 6379
    Initialize-ContainerService -ServiceName "Backend (uvicorn)" -ContainerName "app" -Port 8000 -HealthUrl "http://localhost:8000/health"
    Initialize-ContainerService -ServiceName "Cloudflare Tunnel" -ContainerName "cloudflared"

    # Step 4: Frontend (Vercel - remoto)
    Test-VercelFrontend

    # Step 5: Final report
    Show-FinalReport
}

# -------------------------------------------------------------
# ENTRY POINT
# -------------------------------------------------------------

if ($Register) {
    Register-StartupTask
    exit 0
}

if ($Unregister) {
    Unregister-StartupTask
    exit 0
}

Start-CortexInfrastructure

# Keep window open so user can read the report
Write-Host ""
Write-Host "Pressione qualquer tecla para fechar..." -ForegroundColor DarkGray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
