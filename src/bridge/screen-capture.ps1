# Desktop Screen Capture Actions Module

function Invoke-TakeScreenshot {
    $b64 = [NativeBridge]::CapturePrimaryScreenBase64()
    if ($b64.StartsWith("ERROR")) {
        return @{ success = $false; message = $b64 }
    }
    return @{ success = $true; base64 = $b64; message = "Captured desktop screenshot" }
}
