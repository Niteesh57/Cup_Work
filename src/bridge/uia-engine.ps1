# Windows UI Automation & Native Input Execution Bridge Engine Router
# Production-Grade JSON-RPC Worker for Node.js / Electron

[CmdletBinding()]
param (
    [Parameter(Position=0, ValueFromPipeline=$true)]
    [string]$InputJson,

    [Parameter()]
    [string]$Base64,

    [Parameter()]
    [string]$Action,

    [Parameter()]
    [string]$Params
)

$ErrorActionPreference = 'Stop'

# Dot-source all modular domain scripts relative to this script directory
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

. (Join-Path $scriptDir "native-bridge.ps1")
. (Join-Path $scriptDir "window-actions.ps1")
. (Join-Path $scriptDir "mouse-actions.ps1")
. (Join-Path $scriptDir "keyboard-actions.ps1")
. (Join-Path $scriptDir "uia-actions.ps1")
. (Join-Path $scriptDir "screen-capture.ps1")
. (Join-Path $scriptDir "clipboard-actions.ps1")
. (Join-Path $scriptDir "shell-actions.ps1")

function Parse-CommandPayload {
    # 1. Direct -Base64 parameter
    if (-not [string]::IsNullOrWhiteSpace($Base64)) {
        $bytes = [Convert]::FromBase64String($Base64)
        $decoded = [System.Text.Encoding]::UTF8.GetString($bytes)
        return ($decoded | ConvertFrom-Json)
    }

    # 2. Direct -Action parameter (with optional -Params)
    if (-not [string]::IsNullOrWhiteSpace($Action)) {
        $paramsObj = @{}
        if (-not [string]::IsNullOrWhiteSpace($Params)) {
            try {
                $paramsObj = $Params | ConvertFrom-Json
            } catch {
                # Parse simple key:value pairs if unquoted JSON
                $pContent = $Params.Trim().TrimStart('{').TrimEnd('}')
                $pairs = $pContent -split ','
                foreach ($pair in $pairs) {
                    if ($pair -match '([a-zA-Z0-9_]+):(.*)') {
                        $k = $matches[1].Trim().Trim('"').Trim("'")
                        $v = $matches[2].Trim().Trim('"').Trim("'")
                        $paramsObj[$k] = $v
                    }
                }
            }
        }
        return @{ action = $Action; params = $paramsObj }
    }

    # 3. -InputJson parameter (or pipeline input)
    if (-not [string]::IsNullOrWhiteSpace($InputJson)) {
        $raw = $InputJson.Trim()
        
        # Try direct JSON parse
        try {
            return ($raw | ConvertFrom-Json)
        } catch {}

        # Check if InputJson is actually Base64 encoded
        try {
            $bytes = [Convert]::FromBase64String($raw)
            $decoded = [System.Text.Encoding]::UTF8.GetString($bytes)
            if ($decoded.Trim().StartsWith("{")) {
                return ($decoded | ConvertFrom-Json)
            }
        } catch {}

        # Fallback: Handle CLI quote-stripped JSON string e.g. {action:LAUNCH_APP,params:{appName:calc.exe}}
        if ($raw -match 'action:([a-zA-Z0-9_]+)') {
            $act = $matches[1]
            $pObj = @{}
            if ($raw -match 'params:\{([^}]*)\}') {
                $pContent = $matches[1]
                $pairs = $pContent -split ','
                foreach ($pair in $pairs) {
                    if ($pair -match '([a-zA-Z0-9_]+):(.*)') {
                        $k = $matches[1].Trim().Trim('"').Trim("'")
                        $v = $matches[2].Trim().Trim('"').Trim("'")
                        $pObj[$k] = $v
                    }
                }
            }
            return @{ action = $act; params = $pObj }
        }

        throw "Unable to parse InputJson payload: $raw"
    }

    return $null
}

function Execute-Command ($cmdObj) {
    $action = $cmdObj.action
    $params = $cmdObj.params

    switch ($action) {
        # Window & Application Management
        "MINIMIZE_ALL"      { return Invoke-MinimizeAll }
        "MINIMIZE_WINDOW"   { return Invoke-MinimizeWindow -params $params }
        "FOCUS_WINDOW"      { return Invoke-FocusWindow -params $params }
        "LAUNCH_APP"        { return Invoke-LaunchApp -params $params }
        "GET_WINDOWS"       { return Invoke-GetWindows }
        "GET_ACTIVE_WINDOW" { return Invoke-GetActiveWindow }
        "RESTORE_WINDOW"    { return Invoke-RestoreWindow -params $params }
        "RESIZE_WINDOW"     { return Invoke-ResizeWindow -params $params }

        # Mouse Interactions
        "MOUSE_MOVE"       { return Invoke-MouseMove -params $params }
        "MOUSE_CLICK"      { return Invoke-MouseClick -params $params }
        "SCROLL"           { return Invoke-Scroll -params $params }
        "DRAG_DROP"        { return Invoke-DragDrop -params $params }

        # Keyboard Input & Shortcuts
        "KEYBOARD_TYPE"    { return Invoke-KeyboardType -params $params }
        "KEYBOARD_KEY"     { return Invoke-KeyboardKey -params $params }
        "PRESS_HOTKEY"     { return Invoke-PressHotkey -params $params }

        # UI Automation Tree
        "UIA_CLICK"        { return Invoke-UiaClick -params $params }
        "UIA_TYPE"         { return Invoke-UiaType -params $params }
        "UIA_GET_TREE"     { return Invoke-UiaGetTree -params $params }
        "UIA_GET_TEXT"     { return Invoke-UiaGetText -params $params }

        # Screen Capture
        "TAKE_SCREENSHOT"       { return Invoke-TakeScreenshot }
        "SCREENSHOT_REGION"     { return Invoke-ScreenshotRegion -params $params }
        "GET_SCREEN_RESOLUTION" { return Invoke-GetScreenResolution }

        # Clipboard
        "READ_CLIPBOARD"  { return Invoke-ReadClipboard }
        "WRITE_CLIPBOARD" { return Invoke-WriteClipboard -params $params }

        # Shell & Process Management
        "EXECUTE_COMMAND"  { return Invoke-ExecuteCommand -params $params }
        "GET_PROCESS_LIST" { return Invoke-GetProcessList }
        "KILL_PROCESS"     { return Invoke-KillProcess -params $params }

        # Interactive Scratchpad & Question Overlay
        "SHOW_SCRATCHPAD"  {
            $scratchpadPath = Join-Path $scriptDir "scratchpad.ps1"
            $jsonInput = ($params | ConvertTo-Json -Depth 5 -Compress)
            $res = & powershell -NoProfile -ExecutionPolicy Bypass -File $scratchpadPath -InputJson $jsonInput
            try {
                return ($res | ConvertFrom-Json)
            } catch {
                return @{ success = $true; message = "Overlay closed"; raw = $res }
            }
        }
        "ASK_HUMAN" {
            $scratchpadPath = Join-Path $scriptDir "scratchpad.ps1"
            $jsonInput = ($params | ConvertTo-Json -Depth 5 -Compress)
            $res = & powershell -NoProfile -ExecutionPolicy Bypass -File $scratchpadPath -InputJson $jsonInput
            try {
                return ($res | ConvertFrom-Json)
            } catch {
                return @{ success = $true; message = "Question closed"; raw = $res }
            }
        }

        # Screen Annotations: Boxes, Arrows & Highlights
        "SHOW_ANNOTATIONS" {
            $annotPath = Join-Path $scriptDir "screen-annotations.ps1"
            $jsonInput = ($params | ConvertTo-Json -Depth 5 -Compress)
            $res = & powershell -NoProfile -ExecutionPolicy Bypass -File $annotPath -InputJson $jsonInput
            try {
                return ($res | ConvertFrom-Json)
            } catch {
                return @{ success = $true; message = "Annotations closed"; raw = $res }
            }
        }
        "CLEAR_ANNOTATIONS" {
            $annotPath = Join-Path $scriptDir "screen-annotations.ps1"
            $res = & powershell -NoProfile -ExecutionPolicy Bypass -File $annotPath -ClearOnly
            try {
                return ($res | ConvertFrom-Json)
            } catch {
                return @{ success = $true; message = "Annotations cleared"; raw = $res }
            }
        }
        "HIGHLIGHT_BOX" {
            $annotPath = Join-Path $scriptDir "screen-annotations.ps1"
            $jsonInput = ($params | ConvertTo-Json -Depth 5 -Compress)
            $res = & powershell -NoProfile -ExecutionPolicy Bypass -File $annotPath -InputJson $jsonInput
            try {
                return ($res | ConvertFrom-Json)
            } catch {
                return @{ success = $true; message = "Highlight closed"; raw = $res }
            }
        }

        default {
            return @{ success = $false; message = "Unknown command action '$action'" }
        }
    }
}

# Main Execution Routine
try {
    $cmdObj = Parse-CommandPayload
    if ($null -ne $cmdObj) {
        $result = Execute-Command -cmdObj $cmdObj
        Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
    } else {
        Write-Output (@{ success = $false; message = "No valid command payload provided. Use -InputJson, -Base64, or -Action" } | ConvertTo-Json -Compress)
    }
} catch {
    Write-Output (@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
}
