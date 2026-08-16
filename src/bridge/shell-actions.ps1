# Shell Command & Process Management Actions Module

function Invoke-ExecuteCommand ($params) {
    $command = [string]$params.command
    if ([string]::IsNullOrWhiteSpace($command)) {
        return @{ success = $false; message = "Missing command" }
    }

    $timeoutSec = if ($params.timeoutSeconds) { [int]$params.timeoutSeconds } else { 30 }

    try {
        $psi = New-Object System.Diagnostics.ProcessStartInfo
        $psi.FileName = "cmd.exe"
        $psi.Arguments = "/c `"$command`""
        $psi.RedirectStandardOutput = $true
        $psi.RedirectStandardError = $true
        $psi.UseShellExecute = $false
        $psi.CreateNoWindow = $true

        $proc = New-Object System.Diagnostics.Process
        $proc.StartInfo = $psi
        [void]$proc.Start()

        $stdoutTask = $proc.StandardOutput.ReadToEndAsync()
        $stderrTask = $proc.StandardError.ReadToEndAsync()

        if (-not $proc.WaitForExit($timeoutSec * 1000)) {
            $proc.Kill()
            return @{ success = $false; message = "Command timed out after $timeoutSec seconds" }
        }

        $stdout = $stdoutTask.Result
        $stderr = $stderrTask.Result

        return @{
            success = ($proc.ExitCode -eq 0)
            stdout = $stdout
            stderr = $stderr
            exitCode = $proc.ExitCode
            message = "Command exited with code $($proc.ExitCode)"
        }
    } catch {
        return @{ success = $false; message = "Failed to execute command: $_" }
    }
}

function Invoke-GetProcessList {
    try {
        $processes = @()
        foreach ($p in Get-Process | Select-Object Name, Id, CPU, WorkingSet64) {
            $processes += @{
                name = $p.Name
                pid = $p.Id
                cpu = [math]::Round($p.CPU, 2)
                memBytes = $p.WorkingSet64
            }
        }
        return @{ success = $true; processes = $processes; message = "Retrieved process list" }
    } catch {
        return @{ success = $false; message = "Failed to get process list: $_" }
    }
}

function Invoke-KillProcess ($params) {
    $name = [string]$params.name
    $pidValue = if ($null -ne $params.pid) { [int]$params.pid } else { $null }

    try {
        if ($pidValue) {
            Stop-Process -Id $pidValue -Force -ErrorAction Stop
            return @{ success = $true; message = "Terminated process PID $pidValue" }
        }
        if ($name) {
            Stop-Process -Name $name -Force -ErrorAction Stop
            return @{ success = $true; message = "Terminated process(es) named '$name'" }
        }
        return @{ success = $false; message = "Provide either name or pid" }
    } catch {
        return @{ success = $false; message = "Failed to kill process: $_" }
    }
}
