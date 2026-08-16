# Desktop Screen Capture Actions Module

function Invoke-TakeScreenshot {
    $b64 = [NativeBridge]::CapturePrimaryScreenBase64()
    if ($b64.StartsWith("ERROR")) {
        return @{ success = $false; message = $b64 }
    }
    return @{ success = $true; base64 = $b64; message = "Captured desktop screenshot" }
}

function Invoke-ScreenshotRegion ($params) {
    $x = [int]$params.x
    $y = [int]$params.y
    $width = [int]$params.width
    $height = [int]$params.height
    $b64 = [NativeBridge]::CaptureRegionBase64($x, $y, $width, $height)
    if ($b64.StartsWith("ERROR")) {
        return @{ success = $false; message = $b64 }
    }
    return @{ success = $true; base64 = $b64; message = "Captured screen region ($x,$y,$width,$height)" }
}

function Invoke-GetScreenResolution {
    $res = [NativeBridge]::GetPrimaryScreenResolution()
    $parts = $res -split 'x'
    return @{
        success = $true
        width = [int]$parts[0]
        height = [int]$parts[1]
        message = "Primary display resolution: $res"
    }
}
