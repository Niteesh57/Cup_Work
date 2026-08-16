# Mouse Interaction Actions Module

function Invoke-MouseMove ($params) {
    $x = [int]$params.x
    $y = [int]$params.y
    [NativeBridge]::MoveCursor($x, $y)
    try {
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
    } catch {}
    return @{ success = $true; message = "Moved cursor to ($x, $y)" }
}

function Invoke-MouseClick ($params) {
    $x = [int]$params.x
    $y = [int]$params.y
    $button = if ($params.button) { $params.button } else { "left" }
    try {
        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x, $y)
    } catch {}
    [NativeBridge]::ClickMouse($x, $y, $button)
    return @{ success = $true; message = "Executed $button click at ($x, $y)" }
}

function Invoke-Scroll ($params) {
    $delta = [int]$params.delta
    $x = if ($null -ne $params.x) { [Nullable[int]]$params.x } else { $null }
    $y = if ($null -ne $params.y) { [Nullable[int]]$params.y } else { $null }
    if ($x.HasValue -and $y.HasValue) {
        try {
            [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point($x.Value, $y.Value)
        } catch {}
    }
    [NativeBridge]::ScrollMouse($delta, $x, $y)
    return @{ success = $true; message = "Scrolled mouse wheel by $delta" }
}
