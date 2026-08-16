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
