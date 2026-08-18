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
        
        <!-- Top Floating Control Bar with explicit Erase / Close Button -->
        <Border HorizontalAlignment="Right" VerticalAlignment="Top" Margin="0,20,24,0"
                Background="#F0141517" BorderBrush="#35383F" BorderThickness="1.5" CornerRadius="12" Padding="14,8">
            <Border.Effect>
                <DropShadowEffect Color="#000000" BlurRadius="20" ShadowDepth="4" Opacity="0.85"/>
            </Border.Effect>
            <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                <Border Background="#10B981" CornerRadius="4" Padding="6,2" Margin="0,0,10,0">
                    <TextBlock Text="AI GUIDE ACTIVE" FontSize="10" FontWeight="Bold" Foreground="#000000"/>
                </Border>
                <Button Name="CloseButton" Background="#DC2626" Foreground="#FFFFFF" BorderThickness="0"
                        Padding="12,4" FontWeight="Bold" FontSize="12" Cursor="Hand">
                    <Button.Resources>
                        <Style TargetType="Border">
                            <Setter Property="CornerRadius" Value="6"/>
                        </Style>
                    </Button.Resources>
                    <TextBlock Text="Clear / Close (ESC)"/>
                </Button>
            </StackPanel>
        </Border>

        <!-- Bottom Informational Banner -->
        <Border HorizontalAlignment="Center" VerticalAlignment="Bottom" Margin="0,0,0,24"
                Background="#E6141517" BorderBrush="#35383F" BorderThickness="1.5" CornerRadius="20" Padding="18,8">
            <Border.Effect>
                <DropShadowEffect Color="#000000" BlurRadius="20" ShadowDepth="4" Opacity="0.8"/>
            </Border.Effect>
            <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                <Border Background="#23252A" CornerRadius="5" Padding="6,2" Margin="0,0,8,0" BorderBrush="#35383F" BorderThickness="1">
                    <TextBlock Text="SCREEN GUIDE" FontSize="10" FontWeight="Bold" Foreground="#A0A5B0"/>
                </Border>
                <TextBlock Text="Follow the boxes/arrows. Click Clear or press ESC when done." FontSize="12.5" FontWeight="SemiBold" Foreground="#FFFFFF" VerticalAlignment="Center"/>
            </StackPanel>
        </Border>
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

# Coordinate conversion supporting Gemini Normalized 0..1000 coordinates and direct Screen Pixels
function Convert-BoxCoordinates($b, $targetW, $targetH, $imgW, $imgH) {
    # 1. Direct bounds object from UI element tree: { bounds: { x, y, width, height } }
    if ($b.bounds) {
        $bx = if ($null -ne $b.bounds.x) { [double]$b.bounds.x } else { 0.0 }
        $by = if ($null -ne $b.bounds.y) { [double]$b.bounds.y } else { 0.0 }
        $bw = if ($null -ne $b.bounds.width) { [double]$b.bounds.width } else { 60.0 }
        $bh = if ($null -ne $b.bounds.height) { [double]$b.bounds.height } else { 60.0 }
        return @{
            x = $bx
            y = $by
            width = [Math]::Max(10.0, $bw)
            height = [Math]::Max(10.0, $bh)
        }
    }

    # 2. box_2d array: [ymin, xmin, ymax, xmax] in normalized 0..1000
    if ($b.box_2d) {
        $arr = @($b.box_2d)
        if ($arr.Count -ge 4) {
            $rawY1 = [double]$arr[0]
            $rawX1 = [double]$arr[1]
            $rawY2 = [double]$arr[2]
            $rawX2 = [double]$arr[3]
            $ymin = [Math]::Min($rawY1, $rawY2)
            $ymax = [Math]::Max($rawY1, $rawY2)
            $xmin = [Math]::Min($rawX1, $rawX2)
            $xmax = [Math]::Max($rawX1, $rawX2)
            return @{
                x = ($xmin / 1000.0) * $targetW
                y = ($ymin / 1000.0) * $targetH
                width = [Math]::Max(10.0, (($xmax - $xmin) / 1000.0) * $targetW)
                height = [Math]::Max(10.0, (($ymax - $ymin) / 1000.0) * $targetH)
            }
        }
    }

    # 3. ymin, xmin, ymax, xmax keys (0..1000)
    if ($null -ne $b.ymin -and $null -ne $b.xmin -and $null -ne $b.ymax -and $null -ne $b.xmax) {
        $ymin = [Math]::Min([double]$b.ymin, [double]$b.ymax)
        $ymax = [Math]::Max([double]$b.ymin, [double]$b.ymax)
        $xmin = [Math]::Min([double]$b.xmin, [double]$b.xmax)
        $xmax = [Math]::Max([double]$b.xmin, [double]$b.xmax)
        return @{
            x = ($xmin / 1000.0) * $targetW
            y = ($ymin / 1000.0) * $targetH
            width = [Math]::Max(10.0, (($xmax - $xmin) / 1000.0) * $targetW)
            height = [Math]::Max(10.0, (($ymax - $ymin) / 1000.0) * $targetH)
        }
    }

    $rawX = if ($null -ne $b.x) { [double]$b.x } else { 0.0 }
    $rawY = if ($null -ne $b.y) { [double]$b.y } else { 0.0 }
    $rawW = if ($null -ne $b.width) { [double]$b.width } else { 60.0 }
    $rawH = if ($null -ne $b.height) { [double]$b.height } else { 60.0 }

    # 4. Explicitly normalized coordinates
    if ($b.normalized -eq $true) {
        return @{
            x = ($rawX / 1000.0) * $targetW
            y = ($rawY / 1000.0) * $targetH
            width = [Math]::Max(10.0, ($rawW / 1000.0) * $targetW)
            height = [Math]::Max(10.0, ($rawH / 1000.0) * $targetH)
        }
    }

    # 5. Direct screen pixel coordinates (isPixels: true or default)
    return @{
        x = $rawX
        y = $rawY
        width = [Math]::Max(10.0, $rawW)
        height = [Math]::Max(10.0, $rawH)
    }
}

function Convert-ArrowCoordinates($a, $targetW, $targetH, $imgW, $imgH) {
    $fx = [double]$a.fromX
    $fy = [double]$a.fromY
    $tx = [double]$a.toX
    $ty = [double]$a.toY

    if ($a.normalized -eq $true) {
        return @{
            fromX = ($fx / 1000.0) * $targetW
            fromY = ($fy / 1000.0) * $targetH
            toX = ($tx / 1000.0) * $targetW
            toY = ($ty / 1000.0) * $targetH
        }
    }

    # If numbers are small <= 1.0 (relative 0..1), normalize:
    if ($fx -le 1.0 -and $fy -le 1.0 -and $tx -le 1.0 -and $ty -le 1.0 -and ($fx -gt 0.0 -or $fy -gt 0.0)) {
        return @{
            fromX = $fx * $targetW
            fromY = $fy * $targetH
            toX = $tx * $targetW
            toY = $ty * $targetH
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

# Dismiss Handlers: Explicit Close/Erase Button or ESC key
$closeBtn = $window.FindName("CloseButton")
if ($closeBtn) {
    $closeBtn.Add_Click({
        $window.Close()
    })
}

$window.Add_KeyDown({
    if ($_.Key -eq [System.Windows.Input.Key]::Escape) {
        $window.Close()
    }
})

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
