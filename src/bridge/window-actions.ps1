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

function Invoke-GetActiveWindow {
    $win = [NativeBridge]::GetActiveWindowEntry()
    if ($win.Handle -eq [IntPtr]::Zero) {
        return @{ success = $false; message = "No active window found" }
    }
    return @{
        success = $true
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

function Invoke-RestoreWindow ($params) {
    $title = $params.title
    $res = [NativeBridge]::RestoreWindowByTitle($title)
    if ($res) {
        return @{ success = $true; message = "Restored window matching '$title'" }
    } else {
        return @{ success = $false; message = "No minimized window found matching '$title'" }
    }
}

function Invoke-ResizeWindow ($params) {
    $title = $params.title
    $x = [int]$params.x
    $y = [int]$params.y
    $width = [int]$params.width
    $height = [int]$params.height
    $res = [NativeBridge]::ResizeWindowByTitle($title, $x, $y, $width, $height)
    if ($res) {
        return @{ success = $true; message = "Resized window matching '$title' to ($x,$y,$width,$height)" }
    } else {
        return @{ success = $false; message = "Could not find window matching '$title'" }
    }
}
