# Interactive Desktop Screen Annotations: Boxes, Arrows, Step Guides & Callouts
# Renders multi-colored highlights, bounding boxes, and directional pointer arrows directly on screen.

[CmdletBinding()]
param (
    [Parameter(Position=0, ValueFromPipeline=$true)]
    [string]$InputJson,

    # Array of boxes: @( @{ x=100; y=200; width=300; height=80; color="cyan"; label="Step 1: Click Save"; stepNumber=1 } )
    [Parameter()]
    [object[]]$Boxes = @(),

    # Array of arrows: @( @{ fromX=100; fromY=100; toX=300; toY=300; color="yellow"; label="Look here" } )
    [Parameter()]
    [object[]]$Arrows = @(),

    # Direct single-box shorthand parameters
    [Parameter()]
    [int]$X = -1,

    [Parameter()]
    [int]$Y = -1,

    [Parameter()]
    [int]$Width = -1,

    [Parameter()]
    [int]$Height = -1,

    [Parameter()]
    [string]$Color = "cyan",

    [Parameter()]
    [string]$Label = "",

    [Parameter()]
    [int]$StepNumber = 0,

    # Direct single-arrow shorthand parameters
    [Parameter()]
    [int]$FromX = -1,

    [Parameter()]
    [int]$FromY = -1,

    [Parameter()]
    [int]$ToX = -1,

    [Parameter()]
    [int]$ToY = -1,

    # Auto-dismiss timeout in seconds (0 = persist until user clicks Erase/Close or presses ESC)
    [Parameter()]
    [double]$DurationSeconds = 0.0,

    # Base64-encoded JSON payload for reliable cross-process CLI transport
    [Parameter()]
    [string]$Base64,

    # Programmatically close any active annotation overlay and exit
    [Parameter()]
    [switch]$ClearOnly
)

$ErrorActionPreference = 'Stop'

$annotationPidFile = Join-Path $env:TEMP "hey-jave-annotations.pid"

if ($ClearOnly) {
    if (Test-Path $annotationPidFile) {
        try {
            $pidToKill = [int](Get-Content $annotationPidFile -Raw)
            if ($pidToKill -gt 0) {
                Stop-Process -Id $pidToKill -Force -ErrorAction SilentlyContinue
            }
        } catch {}
        Remove-Item $annotationPidFile -Force -ErrorAction SilentlyContinue
    }
    Write-Output (@{ success = $true; message = "Annotations cleared" } | ConvertTo-Json -Compress)
    return
}

# Decode Base64 payload if provided
if (-not [string]::IsNullOrWhiteSpace($Base64)) {
    try {
        $bytes = [Convert]::FromBase64String($Base64)
        $InputJson = [System.Text.Encoding]::UTF8.GetString($bytes)
    } catch {}
}

# Register this overlay process so it can be programmatically closed.
[System.IO.File]::WriteAllText($annotationPidFile, [string]$PID)

# Parse JSON input if provided
if (-not [string]::IsNullOrWhiteSpace($InputJson)) {
    try {
        $parsed = $InputJson | ConvertFrom-Json
        if ($parsed.boxes) { $Boxes = @($parsed.boxes) }
        if ($parsed.arrows) { $Arrows = @($parsed.arrows) }
        if ($parsed.durationSeconds -ne $null) { $DurationSeconds = [double]$parsed.durationSeconds }
        if ($parsed.imageWidth) { $ImageWidth = [int]$parsed.imageWidth }
        if ($parsed.imageHeight) { $ImageHeight = [int]$parsed.imageHeight }
        if ($parsed.params) {
            if ($parsed.params.boxes) { $Boxes = @($parsed.params.boxes) }
            if ($parsed.params.arrows) { $Arrows = @($parsed.params.arrows) }
            if ($parsed.params.durationSeconds -ne $null) { $DurationSeconds = [double]$parsed.params.durationSeconds }
            if ($parsed.params.imageWidth) { $ImageWidth = [int]$parsed.params.imageWidth }
            if ($parsed.params.imageHeight) { $ImageHeight = [int]$parsed.params.imageHeight }
            if ($parsed.params.x) { $X = [int]$parsed.params.x }
            if ($parsed.params.y) { $Y = [int]$parsed.params.y }
            if ($parsed.params.width) { $Width = [int]$parsed.params.width }
            if ($parsed.params.height) { $Height = [int]$parsed.params.height }
            if ($parsed.params.color) { $Color = [string]$parsed.params.color }
            if ($parsed.params.label) { $Label = [string]$parsed.params.label }
        }
        if ($parsed.x) { $X = [int]$parsed.x }
        if ($parsed.y) { $Y = [int]$parsed.y }
        if ($parsed.width) { $Width = [int]$parsed.width }
        if ($parsed.height) { $Height = [int]$parsed.height }
        if ($parsed.color) { $Color = [string]$parsed.color }
        if ($parsed.label) { $Label = [string]$parsed.label }
    } catch {}
}

# Add shorthand single box if supplied
if ($X -ge 0 -and $Y -ge 0 -and $Width -gt 0 -and $Height -gt 0) {
    $Boxes += @{
        x = $X
        y = $Y
        width = $Width
        height = $Height
        color = $Color
        label = $Label
        stepNumber = $StepNumber
    }
}

# Add shorthand single arrow if supplied
if ($FromX -ge 0 -and $FromY -ge 0 -and $ToX -ge 0 -and $ToY -ge 0) {
    $Arrows += @{
        fromX = $FromX
        fromY = $FromY
        toX = $ToX
        toY = $ToY
        color = $Color
        label = $Label
    }
}

# If no boxes or arrows specified, do not render anything
if ($Boxes.Count -eq 0 -and $Arrows.Count -eq 0) {
    Write-Output (@{ success = $true; message = "No annotations to display" } | ConvertTo-Json -Compress)
    return
}


# Ensure PresentationFramework Assemblies are loaded
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Drawing

function Get-ColorBrush ($colorStr) {
    if ([string]::IsNullOrWhiteSpace($colorStr)) { $colorStr = "cyan" }
    switch ($colorStr.ToLower()) {
        "red"     { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FF4466") }
        "green"   { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#10B981") }
        "blue"    { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#3B82F6") }
        "cyan"    { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#06B6D4") }
        "yellow"  { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F59E0B") }
        "purple"  { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#8B5CF6") }
        "magenta" { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#EC4899") }
        "orange"  { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F97316") }
        "white"   { return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF") }
        default {
            try {
                return [System.Windows.Media.BrushConverter]::new().ConvertFromString($colorStr)
            } catch {
                return [System.Windows.Media.BrushConverter]::new().ConvertFromString("#06B6D4")
            }
        }
    }
}

function Get-ColorHex ($colorStr) {
    if ([string]::IsNullOrWhiteSpace($colorStr)) { $colorStr = "cyan" }
    switch ($colorStr.ToLower()) {
        "red"     { return "#FF4466" }
        "green"   { return "#10B981" }
        "blue"    { return "#3B82F6" }
        "cyan"    { return "#06B6D4" }
        "yellow"  { return "#F59E0B" }
        "purple"  { return "#8B5CF6" }
        "magenta" { return "#EC4899" }
        "orange"  { return "#F97316" }
        "white"   { return "#FFFFFF" }
        default   { return $colorStr }
    }
}

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="Hey Jave Screen Annotations"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        ShowInTaskbar="False"
        WindowStartupLocation="Manual">
    <Grid Name="MainGrid" Background="#01000000">
        <Canvas Name="AnnotationCanvas" Background="Transparent" IsHitTestVisible="False"/>
    </Grid>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [System.Windows.Markup.XamlReader]::Load($reader)

# Set full virtual screen dimensions across multi-monitor setups
$vLeft = [System.Windows.SystemParameters]::VirtualScreenLeft
$vTop = [System.Windows.SystemParameters]::VirtualScreenTop
$vWidth = [System.Windows.SystemParameters]::VirtualScreenWidth
$vHeight = [System.Windows.SystemParameters]::VirtualScreenHeight

$window.Left = $vLeft
$window.Top = $vTop
$window.Width = $vWidth
$window.Height = $vHeight

$canvas = $window.FindName("AnnotationCanvas")
$mainGrid = $window.FindName("MainGrid")

# Coordinate conversion supporting Gemini Normalized 0..1000 coordinates, box arrays, and direct Screen Pixels
function Convert-BoxCoordinates($b, $targetW, $targetH, $imgW, $imgH) {
    if ($null -eq $b) {
        return @{ x = 0; y = 0; width = 60; height = 60 }
    }

    # Extract raw 4-element coordinate array if present (e.g. bounds: [640, 640, 715, 765] or box_2d: [...])
    $rawArray = $null
    if ($b.box_2d) {
        $rawArray = @($b.box_2d)
    } elseif ($b.bounds -is [System.Collections.IEnumerable] -and -not ($b.bounds -is [string] -or $b.bounds -is [System.Collections.IDictionary])) {
        $rawArray = @($b.bounds)
    } elseif ($b -is [System.Collections.IEnumerable] -and -not ($b -is [string] -or $b -is [System.Collections.IDictionary])) {
        $rawArray = @($b)
    }

    # Handle 4-number coordinate array [ymin, xmin, ymax, xmax] (standard Gemini visual grounding)
    if ($null -ne $rawArray -and $rawArray.Count -ge 4) {
        $v0 = [double]$rawArray[0]
        $v1 = [double]$rawArray[1]
        $v2 = [double]$rawArray[2]
        $v3 = [double]$rawArray[3]

        $ymin = [Math]::Min($v0, $v2)
        $ymax = [Math]::Max($v0, $v2)
        $xmin = [Math]::Min($v1, $v3)
        $xmax = [Math]::Max($v1, $v3)

        # Check if coordinates are 0..1 (relative fraction)
        if ($v0 -le 1.0 -and $v1 -le 1.0 -and $v2 -le 1.0 -and $v3 -le 1.0 -and ($v0 -gt 0.0 -or $v1 -gt 0.0 -or $v2 -gt 0.0 -or $v3 -gt 0.0)) {
            return @{
                x = $xmin * $targetW
                y = $ymin * $targetH
                width = [Math]::Max(16.0, ($xmax - $xmin) * $targetW)
                height = [Math]::Max(16.0, ($ymax - $ymin) * $targetH)
            }
        }

        # Check if coordinates are 0..1000 (Gemini visual grounding format)
        if ($v0 -le 1000.0 -and $v1 -le 1000.0 -and $v2 -le 1000.0 -and $v3 -le 1000.0) {
            return @{
                x = ($xmin / 1000.0) * $targetW
                y = ($ymin / 1000.0) * $targetH
                width = [Math]::Max(16.0, (($xmax - $xmin) / 1000.0) * $targetW)
                height = [Math]::Max(16.0, (($ymax - $ymin) / 1000.0) * $targetH)
            }
        }

        # Raw screen pixel rectangle [ymin, xmin, ymax, xmax]
        return @{
            x = $xmin
            y = $ymin
            width = [Math]::Max(16.0, ($xmax - $xmin))
            height = [Math]::Max(16.0, ($ymax - $ymin))
        }
    }

    # Extract dictionary object for bounds
    $bObj = if ($b.bounds -and -not ($b.bounds -is [System.Collections.IEnumerable] -and -not ($b.bounds -is [System.Collections.IDictionary]))) { $b.bounds } else { $b }

    # Check ymin/xmin/ymax/xmax named properties
    if ($null -ne $bObj.ymin -and $null -ne $bObj.xmin -and $null -ne $bObj.ymax -and $null -ne $bObj.xmax) {
        $ymin = [Math]::Min([double]$bObj.ymin, [double]$bObj.ymax)
        $ymax = [Math]::Max([double]$bObj.ymin, [double]$bObj.ymax)
        $xmin = [Math]::Min([double]$bObj.xmin, [double]$bObj.xmax)
        $xmax = [Math]::Max([double]$bObj.xmin, [double]$bObj.xmax)
        if ($ymin -le 1.0 -and $xmin -le 1.0 -and $ymax -le 1.0 -and $xmax -le 1.0) {
            return @{
                x = $xmin * $targetW
                y = $ymin * $targetH
                width = [Math]::Max(16.0, ($xmax - $xmin) * $targetW)
                height = [Math]::Max(16.0, ($ymax - $ymin) * $targetH)
            }
        }
        return @{
            x = ($xmin / 1000.0) * $targetW
            y = ($ymin / 1000.0) * $targetH
            width = [Math]::Max(16.0, (($xmax - $xmin) / 1000.0) * $targetW)
            height = [Math]::Max(16.0, (($ymax - $ymin) / 1000.0) * $targetH)
        }
    }

    # Check left/top/right/bottom properties
    if ($null -ne $bObj.left -and $null -ne $bObj.top -and ($null -ne $bObj.right -or $null -ne $bObj.bottom)) {
        $left = [double]$bObj.left
        $top = [double]$bObj.top
        $right = if ($null -ne $bObj.right) { [double]$bObj.right } else { $left + 100.0 }
        $bottom = if ($null -ne $bObj.bottom) { [double]$bObj.bottom } else { $top + 50.0 }
        return @{
            x = $left
            y = $top
            width = [Math]::Max(16.0, ($right - $left))
            height = [Math]::Max(16.0, ($bottom - $top))
        }
    }

    # Check x/y/width/height properties (with case-insensitivity)
    $rawX = if ($null -ne $bObj.x) { [double]$bObj.x } elseif ($null -ne $bObj.X) { [double]$bObj.X } else { 0.0 }
    $rawY = if ($null -ne $bObj.y) { [double]$bObj.y } elseif ($null -ne $bObj.Y) { [double]$bObj.Y } else { 0.0 }
    $rawW = if ($null -ne $bObj.width) { [double]$bObj.width } elseif ($null -ne $bObj.Width) { [double]$bObj.Width } else { 60.0 }
    $rawH = if ($null -ne $bObj.height) { [double]$bObj.height } elseif ($null -ne $bObj.Height) { [double]$bObj.Height } else { 60.0 }

    if ($b.normalized -eq $true -or $bObj.normalized -eq $true) {
        return @{
            x = ($rawX / 1000.0) * $targetW
            y = ($rawY / 1000.0) * $targetH
            width = [Math]::Max(16.0, ($rawW / 1000.0) * $targetW)
            height = [Math]::Max(16.0, ($rawH / 1000.0) * $targetH)
        }
    }

    return @{
        x = $rawX
        y = $rawY
        width = [Math]::Max(16.0, $rawW)
        height = [Math]::Max(16.0, $rawH)
    }
}

function Convert-ArrowCoordinates($a, $targetW, $targetH, $imgW, $imgH) {
    if ($null -eq $a) {
        return @{ fromX = 0; fromY = 0; toX = 0; toY = 0 }
    }

    # Support all naming conventions: fromX, start_x, startX, x1, etc.
    $fx = if ($null -ne $a.fromX) { [double]$a.fromX }
          elseif ($null -ne $a.start_x) { [double]$a.start_x }
          elseif ($null -ne $a.startX) { [double]$a.startX }
          elseif ($null -ne $a.from_x) { [double]$a.from_x }
          elseif ($null -ne $a.x1) { [double]$a.x1 }
          else { 0.0 }

    $fy = if ($null -ne $a.fromY) { [double]$a.fromY }
          elseif ($null -ne $a.start_y) { [double]$a.start_y }
          elseif ($null -ne $a.startY) { [double]$a.startY }
          elseif ($null -ne $a.from_y) { [double]$a.from_y }
          elseif ($null -ne $a.y1) { [double]$a.y1 }
          else { 0.0 }

    $tx = if ($null -ne $a.toX) { [double]$a.toX }
          elseif ($null -ne $a.end_x) { [double]$a.end_x }
          elseif ($null -ne $a.endX) { [double]$a.endX }
          elseif ($null -ne $a.to_x) { [double]$a.to_x }
          elseif ($null -ne $a.x2) { [double]$a.x2 }
          else { 0.0 }

    $ty = if ($null -ne $a.toY) { [double]$a.toY }
          elseif ($null -ne $a.end_y) { [double]$a.end_y }
          elseif ($null -ne $a.endY) { [double]$a.endY }
          elseif ($null -ne $a.to_y) { [double]$a.to_y }
          elseif ($null -ne $a.y2) { [double]$a.y2 }
          else { 0.0 }

    # If relative 0..1
    if ($fx -le 1.0 -and $fy -le 1.0 -and $tx -le 1.0 -and $ty -le 1.0 -and ($fx -gt 0.0 -or $fy -gt 0.0 -or $tx -gt 0.0 -or $ty -gt 0.0)) {
        return @{
            fromX = $fx * $targetW
            fromY = $fy * $targetH
            toX = $tx * $targetW
            toY = $ty * $targetH
        }
    }

    # If explicitly normalized
    if ($a.normalized -eq $true) {
        return @{
            fromX = ($fx / 1000.0) * $targetW
            fromY = ($fy / 1000.0) * $targetH
            toX = ($tx / 1000.0) * $targetW
            toY = ($ty / 1000.0) * $targetH
        }
    }

    # If coordinates are 0..1000 and target width/height is larger (e.g. 1920x1080) and all coords <= 1000
    if ($fx -le 1000.0 -and $fy -le 1000.0 -and $tx -le 1000.0 -and $ty -le 1000.0 -and ($fx -gt 0.0 -or $fy -gt 0.0) -and ($targetW -gt 1000.0 -or $targetH -gt 1000.0)) {
        # Check if coordinates look like 0..1000 scale relative to standard 1080p
        if ($fx -le 1000.0 -and $tx -le 1000.0 -and ($targetW -ge 1280.0)) {
            return @{
                fromX = ($fx / 1000.0) * $targetW
                fromY = ($fy / 1000.0) * $targetH
                toX = ($tx / 1000.0) * $targetW
                toY = ($ty / 1000.0) * $targetH
            }
        }
    }

    return @{
        fromX = $fx
        fromY = $fy
        toX = $tx
        toY = $ty
    }
}

# 1. Render Boxes
foreach ($b in $Boxes) {
    $coords = Convert-BoxCoordinates $b $vWidth $vHeight $ImageWidth $ImageHeight
    $bx = $coords.x
    $by = $coords.y
    $bw = $coords.width
    $bh = $coords.height
    $bColor = "$($b.color)"
    $bLabel = "$($b.label)"
    $bStep = if ($b.stepNumber) { [int]$b.stepNumber } else { 0 }

    $brush = Get-ColorBrush $bColor
    $hex = Get-ColorHex $bColor

    # Highlight Rectangle Box
    $rect = New-Object System.Windows.Shapes.Rectangle
    $rect.Width = $bw
    $rect.Height = $bh
    $rect.Stroke = $brush
    $rect.StrokeThickness = 3.0
    $rect.RadiusX = 8
    $rect.RadiusY = 8
    
    # Semi-transparent fill
    $fillColor = [System.Windows.Media.ColorConverter]::new().ConvertFromString($hex)
    $fillBrush = New-Object System.Windows.Media.SolidColorBrush([System.Windows.Media.Color]::FromArgb(28, $fillColor.R, $fillColor.G, $fillColor.B))
    $rect.Fill = $fillBrush

    # Glow / DropShadow Effect
    $glow = New-Object System.Windows.Media.Effects.DropShadowEffect
    $glow.Color = $fillColor
    $glow.BlurRadius = 18
    $glow.ShadowDepth = 0
    $glow.Opacity = 0.9
    $rect.Effect = $glow

    [System.Windows.Controls.Canvas]::SetLeft($rect, $bx)
    [System.Windows.Controls.Canvas]::SetTop($rect, $by)
    [void]$canvas.Children.Add($rect)

    # Step Label Badge (if specified)
    if (-not [string]::IsNullOrWhiteSpace($bLabel) -or $bStep -gt 0) {
        $badge = New-Object System.Windows.Controls.Border
        $badge.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#18191C")
        $badge.BorderBrush = $brush
        $badge.BorderThickness = [System.Windows.Thickness]::new(1.5)
        $badge.CornerRadius = [System.Windows.CornerRadius]::new(6)
        $badge.Padding = [System.Windows.Thickness]::new(10, 4, 10, 4)

        $badgeShadow = New-Object System.Windows.Media.Effects.DropShadowEffect
        $badgeShadow.Color = [System.Windows.Media.Color]::FromRgb(0, 0, 0)
        $badgeShadow.BlurRadius = 12
        $badgeShadow.ShadowDepth = 3
        $badgeShadow.Opacity = 0.8
        $badge.Effect = $badgeShadow

        $sp = New-Object System.Windows.Controls.StackPanel
        $sp.Orientation = [System.Windows.Controls.Orientation]::Horizontal

        if ($bStep -gt 0) {
            $stepPill = New-Object System.Windows.Controls.Border
            $stepPill.Background = $brush
            $stepPill.CornerRadius = [System.Windows.CornerRadius]::new(4)
            $stepPill.Padding = [System.Windows.Thickness]::new(5, 1, 5, 1)
            $stepPill.Margin = [System.Windows.Thickness]::new(0, 0, 6, 0)

            $stepTxt = New-Object System.Windows.Controls.TextBlock
            $stepTxt.Text = "$bStep"
            $stepTxt.FontWeight = [System.Windows.FontWeights]::Bold
            $stepTxt.FontSize = 11
            $stepTxt.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#0D0E10")
            $stepPill.Child = $stepTxt
            [void]$sp.Children.Add($stepPill)
        }

        if (-not [string]::IsNullOrWhiteSpace($bLabel)) {
            $lblTxt = New-Object System.Windows.Controls.TextBlock
            $lblTxt.Text = $bLabel
            $lblTxt.FontWeight = [System.Windows.FontWeights]::SemiBold
            $lblTxt.FontSize = 12
            $lblTxt.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF")
            $lblTxt.VerticalAlignment = [System.Windows.VerticalAlignment]::Center
            [void]$sp.Children.Add($lblTxt)
        }

        $badge.Child = $sp
        
        # Position label above the box (or inside if top is near screen edge)
        $badgeY = if ($by -ge 34) { $by - 32 } else { $by + 6 }
        [System.Windows.Controls.Canvas]::SetLeft($badge, $bx)
        [System.Windows.Controls.Canvas]::SetTop($badge, $badgeY)
        [void]$canvas.Children.Add($badge)
    }
}

# 2. Render Arrows
foreach ($a in $Arrows) {
    $coords = Convert-ArrowCoordinates $a $vWidth $vHeight $ImageWidth $ImageHeight
    $fx = $coords.fromX
    $fy = $coords.fromY
    $tx = $coords.toX
    $ty = $coords.toY
    $aColor = "$($a.color)"
    $aLabel = "$($a.label)"

    $brush = Get-ColorBrush $aColor
    $hex = Get-ColorHex $aColor

    # Main Arrow Shaft Line
    $line = New-Object System.Windows.Shapes.Line
    $line.X1 = $fx
    $line.Y1 = $fy
    $line.X2 = $tx
    $line.Y2 = $ty
    $line.Stroke = $brush
    $line.StrokeThickness = 3.5
    $line.StrokeStartLineCap = [System.Windows.Media.PenLineCap]::Round

    # Glow effect
    $arrowGlow = New-Object System.Windows.Media.Effects.DropShadowEffect
    $arrowGlow.Color = [System.Windows.Media.ColorConverter]::new().ConvertFromString($hex)
    $arrowGlow.BlurRadius = 14
    $arrowGlow.ShadowDepth = 0
    $arrowGlow.Opacity = 0.9
    $line.Effect = $arrowGlow

    [void]$canvas.Children.Add($line)

    # Arrow Head Triangle Calculation
    $dx = $tx - $fx
    $dy = $ty - $fy
    $theta = [Math]::Atan2($dy, $dx)
    $headLength = 18.0
    $headAngle = [Math]::PI / 6.0 # 30 degrees

    $p1 = New-Object System.Windows.Point($tx, $ty)
    $p2 = New-Object System.Windows.Point(
        ($tx - $headLength * [Math]::Cos($theta - $headAngle)),
        ($ty - $headLength * [Math]::Sin($theta - $headAngle))
    )
    $p3 = New-Object System.Windows.Point(
        ($tx - $headLength * [Math]::Cos($theta + $headAngle)),
        ($ty - $headLength * [Math]::Sin($theta + $headAngle))
    )

    $headPoly = New-Object System.Windows.Shapes.Polygon
    $points = New-Object System.Windows.Media.PointCollection
    [void]$points.Add($p1)
    [void]$points.Add($p2)
    [void]$points.Add($p3)
    $headPoly.Points = $points
    $headPoly.Fill = $brush
    $headPoly.Effect = $arrowGlow
    [void]$canvas.Children.Add($headPoly)

    # Optional Arrow Label Callout
    if (-not [string]::IsNullOrWhiteSpace($aLabel)) {
        $midX = ($fx + $tx) / 2.0
        $midY = ($fy + $ty) / 2.0

        $callout = New-Object System.Windows.Controls.Border
        $callout.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#E618191C")
        $callout.BorderBrush = $brush
        $callout.BorderThickness = [System.Windows.Thickness]::new(1)
        $callout.CornerRadius = [System.Windows.CornerRadius]::new(5)
        $callout.Padding = [System.Windows.Thickness]::new(8, 3, 8, 3)

        $calloutTxt = New-Object System.Windows.Controls.TextBlock
        $calloutTxt.Text = $aLabel
        $calloutTxt.FontSize = 11
        $calloutTxt.FontWeight = [System.Windows.FontWeights]::SemiBold
        $calloutTxt.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF")
        $callout.Child = $calloutTxt

        [System.Windows.Controls.Canvas]::SetLeft($callout, $midX + 8)
        [System.Windows.Controls.Canvas]::SetTop($callout, $midY - 12)
        [void]$canvas.Children.Add($callout)
    }
}

# Dismiss Handlers: ESC key or background click
$window.Add_KeyDown({
    if ($_.Key -eq [System.Windows.Input.Key]::Escape) {
        $window.Close()
    }
})

$mainGrid = $window.FindName("MainGrid")
if ($mainGrid) {
    $mainGrid.Add_MouseDown({
        $window.Close()
    })
}

# Auto-dismiss timer if DurationSeconds > 0
if ($DurationSeconds -gt 0) {
    $timer = New-Object System.Windows.Threading.DispatcherTimer
    $timer.Interval = [TimeSpan]::FromSeconds($DurationSeconds)
    $timer.Add_Tick({
        $timer.Stop()
        $window.Close()
    })
    $timer.Start()
}

# Display Modal Overlay
$null = $window.ShowDialog()

# Clean up the PID file after the overlay closes.
Remove-Item $annotationPidFile -Force -ErrorAction SilentlyContinue

# Output JSON status
$resultObj = @{
    success = $true
    boxesCount = $Boxes.Count
    arrowsCount = $Arrows.Count
    message = "Screen annotations overlay dismissed"
}
Write-Output ($resultObj | ConvertTo-Json -Compress)
