# Windows UI Automation (UIA) Tree Search & Control Actions Module

function Invoke-UiaClick ($params) {
    $name = $params.name
    $controlTypeStr = $params.controlType

    # Search UIA Tree
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = [System.Windows.Automation.Condition]::TrueCondition

    if ($name) {
        $nameCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
        $cond = $nameCond
    }

    $element = $root.FindFirst([System.Windows.Automation.TreeScope]::Subtree, $cond)
    if ($null -ne $element) {
        # Try Invoke pattern
        $patternObj = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$patternObj)) {
            ($patternObj -as [System.Windows.Automation.InvokePattern]).Invoke()
            return @{ success = $true; method = "UIA_NATIVE"; message = "Invoked element '$name' via native UIA pattern" }
        }

        # Fallback to BoundingRectangle Click
        $rect = $element.Current.BoundingRectangle
        if ($rect.IsEmpty -eq $false) {
            $centerX = [int]($rect.X + ($rect.Width / 2))
            $centerY = [int]($rect.Y + ($rect.Height / 2))
            [NativeBridge]::ClickAt($centerX, $centerY)
            return @{ success = $true; method = "SEND_INPUT"; message = "Clicked element '$name' at center ($centerX, $centerY)"; bounds = @{ x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height } }
        }
    }
    return @{ success = $false; message = "Element '$name' not found in UIA tree" }
}

function Invoke-UiaType ($params) {
    $name = $params.name
    $text = $params.text

    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
    $element = $root.FindFirst([System.Windows.Automation.TreeScope]::Subtree, $cond)

    if ($null -ne $element) {
        $valPattern = $null
        if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valPattern)) {
            ($valPattern -as [System.Windows.Automation.ValuePattern]).SetValue($text)
            return @{ success = $true; method = "UIA_NATIVE"; message = "Set value for '$name' via UIA ValuePattern" }
        }
    }

    # Fallback to SendKeys
    try {
        [System.Windows.Forms.SendKeys]::SendWait($text)
        return @{ success = $true; method = "SEND_INPUT"; message = "Typed text using SendKeys" }
    } catch {
        return @{ success = $false; method = "SEND_INPUT"; message = "Failed to type text using SendKeys: $_" }
    }
}

function ConvertTo-UiaNode {
    param($Element, [int]$Depth = 0, [int]$MaxDepth = 6)
    if ($null -eq $Element -or $Depth -gt $MaxDepth) { return $null }

    $node = @{
        name = $Element.Current.Name
        controlType = $Element.Current.ControlType.ProgrammaticName
        automationId = $Element.Current.AutomationId
        className = $Element.Current.ClassName
    }

    $children = @()
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $child = $walker.GetFirstChild($Element)
    while ($null -ne $child -and $children.Count -lt 40) {
        $childNode = ConvertTo-UiaNode -Element $child -Depth ($Depth + 1) -MaxDepth $MaxDepth
        if ($null -ne $childNode) { $children += $childNode }
        $child = $walker.GetNextSibling($child)
    }
    if ($children.Count -gt 0) { $node.children = $children }

    return $node
}

function Invoke-UiaGetTree ($params) {
    try {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $window = [System.Windows.Automation.AutomationElement]::FocusedElement
        if ($null -eq $window) { $window = $root }
        $tree = ConvertTo-UiaNode -Element $window -MaxDepth 6
        return @{ success = $true; tree = $tree; message = "Captured UIA tree of focused element" }
    } catch {
        return @{ success = $false; message = "Failed to get UIA tree: $_" }
    }
}

function Invoke-UiaGetText ($params) {
    $name = $params.name
    if (-not $name) {
        return @{ success = $false; message = "Missing element name" }
    }

    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $cond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $name)
    $element = $root.FindFirst([System.Windows.Automation.TreeScope]::Subtree, $cond)

    if ($null -eq $element) {
        return @{ success = $false; message = "Element '$name' not found" }
    }

    $text = $element.Current.Name
    $valPattern = $null
    if ($element.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valPattern)) {
        $text = ($valPattern -as [System.Windows.Automation.ValuePattern]).Current.Value
    }
    return @{ success = $true; text = $text; message = "Read text from '$name'" }
}
