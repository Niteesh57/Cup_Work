# Window & Application Management Actions Module

function Invoke-MinimizeAll {
    $shell = New-Object -ComObject Shell.Application
    $shell.MinimizeAll()
    return @{ success = $true; message = "Minimized all desktop windows" }
}

function Invoke-MinimizeWindow ($params) {
    $title = $params.title
    $res = [NativeBridge]::MinimizeWindowByTitle($title)
    if ($res) {
        return @{ success = $true; message = "Minimized window matching '$title'" }
    } else {
        return @{ success = $false; message = "No active window found matching '$title'" }
    }
}

function Invoke-FocusWindow ($params) {
    $title = $params.title
    $res = [NativeBridge]::FocusWindowByTitle($title)
    if ($res) {
        return @{ success = $true; message = "Brought window matching '$title' to foreground" }
    } else {
        return @{ success = $false; message = "Could not find window matching '$title'" }
    }
}

function Invoke-LaunchApp ($params) {
    $appName = $params.appName
    try {
        $proc = Start-Process -FilePath $appName -PassThru
        return @{ success = $true; message = "Launched process '$appName' (PID: $($proc.Id))" }
    } catch {
        return @{ success = $false; message = "Failed to launch app '$appName': $_" }
    }
}

function Invoke-GetWindows {
    $windowsList = @()
    $entries = [NativeBridge]::GetTopLevelWindows()
    foreach ($win in $entries) {
        $windowsList += @{
            title = $win.Title
            handle = $win.Handle.ToInt64()
            bounds = @{
                x = $win.Bounds.Left
                y = $win.Bounds.Top
                width = ($win.Bounds.Right - $win.Bounds.Left)
                height = ($win.Bounds.Bottom - $win.Bounds.Top)
            }
        }
    }
    return @{ success = $true; windows = $windowsList }
}
