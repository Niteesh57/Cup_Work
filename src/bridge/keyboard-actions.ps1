# Keyboard Input & Shortcuts Actions Module

function Escape-SendKeysText ($rawText) {
    if ([string]::IsNullOrEmpty($rawText)) { return "" }
    # Escape { and } first
    $escaped = $rawText -replace '\{', '{{}' -replace '\}', '{}}'
    # Escape SendKeys special characters: +, ^, %, ~, (, ), [, ]
    $escaped = $escaped -replace '\+', '{+}' `
                        -replace '\^', '{^}' `
                        -replace '%', '{%}' `
                        -replace '~', '{~}' `
                        -replace '\(', '{(}' `
                        -replace '\)', '{)}' `
                        -replace '\[', '{[}' `
                        -replace '\]', '{]}'
    return $escaped
}

function Invoke-KeyboardType ($params) {
    $text = [string]$params.text
    try {
        $escaped = Escape-SendKeysText $text
        [System.Windows.Forms.SendKeys]::SendWait($escaped)
        return @{ success = $true; message = "Typed text '$text'" }
    } catch {
        return @{ success = $false; message = "Failed to type text '$text': $_" }
    }
}

function Invoke-KeyboardKey ($params) {
    $key = [string]$params.key
    try {
        if ($key.StartsWith("{") -and $key.EndsWith("}")) {
            [System.Windows.Forms.SendKeys]::SendWait($key)
        } else {
            [System.Windows.Forms.SendKeys]::SendWait("{$key}")
        }
        return @{ success = $true; message = "Pressed key '$key'" }
    } catch {
        return @{ success = $false; message = "Failed to press key '$key': $_" }
    }
}

function Invoke-PressHotkey ($params) {
    $modifier = [string]$params.modifier # 'WIN', 'ALT', 'CTRL', 'SHIFT'
    $keyChar = [string]$params.key # 'd', 'r', 'l', 't', 'w', 'tab', 'c', 'v', etc.
    try {
        [NativeBridge]::SendHotkey($modifier, $keyChar)
        return @{ success = $true; message = "Triggered hotkey ${modifier}+${keyChar}" }
    } catch {
        return @{ success = $false; message = "Failed to trigger hotkey ${modifier}+${keyChar}: $_" }
    }
}
