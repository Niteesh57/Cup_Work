# Clipboard Interaction Actions Module

function Invoke-ReadClipboard {
    try {
        Add-Type -AssemblyName System.Windows.Forms
        $text = [System.Windows.Forms.Clipboard]::GetText()
        return @{ success = $true; text = $text; message = "Read clipboard text" }
    } catch {
        return @{ success = $false; message = "Failed to read clipboard: $_" }
    }
}

function Invoke-WriteClipboard ($params) {
    $text = [string]$params.text
    try {
        Add-Type -AssemblyName System.Windows.Forms
        [System.Windows.Forms.Clipboard]::SetText($text)
        return @{ success = $true; message = "Wrote text to clipboard" }
    } catch {
        return @{ success = $false; message = "Failed to write clipboard: $_" }
    }
}
