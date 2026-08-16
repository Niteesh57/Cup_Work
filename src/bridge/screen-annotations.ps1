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

    # Auto-dismiss timeout in seconds (0 = wait for user click/ESC)
    [Parameter()]
    [double]$DurationSeconds = 6.0,

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

# Register this overlay process so it can be programmatically closed.
[System.IO.File]::WriteAllText($annotationPidFile, [string]$PID)

# Parse JSON input if provided
if (-not [string]::IsNullOrWhiteSpace($InputJson)) {
    try {
        $parsed = $InputJson | ConvertFrom-Json
        if ($parsed.boxes) { $Boxes = @($parsed.boxes) }
        if ($parsed.arrows) { $Arrows = @($parsed.arrows) }
        if ($parsed.durationSeconds) { $DurationSeconds = [double]$parsed.durationSeconds }
        if ($parsed.params) {
            if ($parsed.params.boxes) { $Boxes = @($parsed.params.boxes) }
            if ($parsed.params.arrows) { $Arrows = @($parsed.params.arrows) }
            if ($parsed.params.durationSeconds) { $DurationSeconds = [double]$parsed.params.durationSeconds }
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

# If no boxes or arrows specified, render demo elements
if ($Boxes.Count -eq 0 -and $Arrows.Count -eq 0) {
    $Boxes = @(
        @{ x = 120; y = 160; width = 280; height = 80; color = "cyan"; label = "Step 1: Primary Action Box"; stepNumber = 1 },
        @{ x = 460; y = 280; width = 340; height = 110; color = "green"; label = "Step 2: Input Field / Target"; stepNumber = 2 },
        @{ x = 860; y = 160; width = 240; height = 80; color = "yellow"; label = "Step 3: Verification"; stepNumber = 3 }
    )
    $Arrows = @(
        @{ fromX = 260; fromY = 240; toX = 460; toY = 320; color = "cyan"; label = "Next Step" },
        @{ fromX = 800; fromY = 320; toX = 860; toY = 220; color = "green"; label = "Proceed" }
    )
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
    <Grid Name="MainGrid" Background="#01000000" Cursor="Hand">
        <Canvas Name="AnnotationCanvas" Background="Transparent" IsHitTestVisible="False"/>
        
        <!-- Bottom Dismiss Banner -->
        <Border HorizontalAlignment="Center" VerticalAlignment="Bottom" Margin="0,0,0,24"
                Background="#E6141517" BorderBrush="#35383F" BorderThickness="1.5" CornerRadius="20" Padding="18,8">
            <Border.Effect>
                <DropShadowEffect Color="#000000" BlurRadius="20" ShadowDepth="4" Opacity="0.8"/>
            </Border.Effect>
            <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                <Border Background="#23252A" CornerRadius="5" Padding="6,2" Margin="0,0,8,0" BorderBrush="#35383F" BorderThickness="1">
                    <TextBlock Text="SCREEN GUIDE" FontSize="10" FontWeight="Bold" Foreground="#A0A5B0"/>
                </Border>
                <TextBlock Text="Click anywhere or press ESC to dismiss" FontSize="12.5" FontWeight="SemiBold" Foreground="#FFFFFF" VerticalAlignment="Center"/>
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

# 1. Render Boxes
foreach ($b in $Boxes) {
    $bx = [double]$b.x
    $by = [double]$b.y
    $bw = [double]$b.width
    $bh = [double]$b.height
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
    $fx = [double]$a.fromX
    $fy = [double]$a.fromY
    $tx = [double]$a.toX
    $ty = [double]$a.toY
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

# Dismiss Handlers: Click or ESC key
$mainGrid.Add_MouseLeftButtonDown({
    $window.Close()
})

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
