# Windows UI Automation (UIA) Tree Search & Semantic Control Actions Module
#
# Strategy: find a control by stable selector (AutomationId first, then Name +
# ControlType), then act through its supported UIA pattern (Invoke, Value,
# SelectionItem, Toggle, ExpandCollapse, Scroll, Drag, DropTarget). Physical
# mouse clicks are only a last-resort fallback, never the primary mechanism.

function Get-UiaElementBySelector {
    param(
        [string]$Name = "",
        [string]$AutomationId = "",
        [string]$ControlType = "",
        [string]$WindowTitle = ""
    )

    # Build the base root: the focused window, a specific window by title, or the desktop root.
    $root = $null
    try {
        if ($WindowTitle) {
            $winCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $WindowTitle)
            $win = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Children, $winCond)
            if ($null -ne $win) { $root = $win }
        }
        if ($null -eq $root) {
            $root = [System.Windows.Automation.AutomationElement]::FocusedElement
        }
    } catch {}
    if ($null -eq $root) {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
    }

    # Build conditions in priority order: AutomationId > Name (+ControlType).
    $conds = @()
    if ($AutomationId) {
        $conds += New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::AutomationIdProperty, $AutomationId)
    }
    if ($Name) {
        $conds += New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $Name)
    }
    if ($ControlType) {
        try {
            $type = [System.Windows.Automation.ControlType]::$ControlType
            $conds += New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $type)
        } catch {
            # Unknown control type — ignore.
        }
    }

    if ($conds.Count -eq 0) {
        return $null
    }

    $cond = $conds[0]
    for ($i = 1; $i -lt $conds.Count; $i++) {
        $cond = New-Object System.Windows.Automation.AndCondition($cond, $conds[$i])
    }

    # Search the chosen root first, then fall back to the desktop root.
    try {
        $el = $root.FindFirst([System.Windows.Automation.TreeScope]::Subtree, $cond)
        if ($null -ne $el) { return $el }
    } catch {}
    if ($root -ne [System.Windows.Automation.AutomationElement]::RootElement) {
        try {
            $el = [System.Windows.Automation.AutomationElement]::RootElement.FindFirst([System.Windows.Automation.TreeScope]::Subtree, $cond)
            if ($null -ne $el) { return $el }
        } catch {}
    }
    return $null
}function Get-UiaElementState {
    param($Element)
    if ($null -eq $Element) { return $null }
    
    $bx = 0; $by = 0; $bw = 0; $bh = 0; $cx = 0; $cy = 0
    try {
        $rect = $Element.Current.BoundingRectangle
        if ($null -ne $rect -and $rect.IsEmpty -eq $false -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
            $bx = [int]$rect.X
            $by = [int]$rect.Y
            $bw = [int]$rect.Width
            $bh = [int]$rect.Height
            $cx = [int]($bx + ($bw / 2))
            $cy = [int]($by + ($bh / 2))
        }
    } catch {}

    $ctrlType = ""
    try {
        $ctrlType = $Element.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
    } catch {}

    $state = @{
        name = $Element.Current.Name
        automationId = $Element.Current.AutomationId
        controlType = $ctrlType
        className = $Element.Current.ClassName
        enabled = $Element.Current.IsEnabled
        offscreen = $Element.Current.IsOffscreen
        bounds = @{
            x = $bx
            y = $by
            width = $bw
            height = $bh
            centerX = $cx
            centerY = $cy
        }
        patterns = @()
    }
    $patternList = @{
        "Invoke" = [System.Windows.Automation.InvokePattern]::Pattern
        "Value" = [System.Windows.Automation.ValuePattern]::Pattern
        "SelectionItem" = [System.Windows.Automation.SelectionItemPattern]::Pattern
        "Toggle" = [System.Windows.Automation.TogglePattern]::Pattern
        "ExpandCollapse" = [System.Windows.Automation.ExpandCollapsePattern]::Pattern
        "Scroll" = [System.Windows.Automation.ScrollPattern]::Pattern
        "RangeValue" = [System.Windows.Automation.RangeValuePattern]::Pattern
        "Text" = [System.Windows.Automation.TextPattern]::Pattern
    }
    foreach ($kv in $patternList.GetEnumerator()) {
        $p = $null
        if ($Element.TryGetCurrentPattern($kv.Value, [ref]$p)) {
            $state.patterns += $kv.Key
            if ($kv.Key -eq "Value") {
                try {
                    $state.value = ($p -as [System.Windows.Automation.ValuePattern]).Current.Value
                } catch {}
            }
        }
    }
    return $state
}

# ── Semantic actions ─────────────────────────────────────────────────────────

function Invoke-UiaInvoke ($params) {
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -eq $el) {
        return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
    }
    if (-not $el.Current.IsEnabled) {
        return @{ success = $false; message = "Element '$($el.Current.Name)' is disabled" }
    }
    $p = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$p)) {
        ($p -as [System.Windows.Automation.InvokePattern]).Invoke()
        return @{ success = $true; method = "UIA_INVOKE"; message = "Invoked '$($el.Current.Name)'"; element = Get-UiaElementState $el }
    }
    # SelectionItem fallback (e.g. a list row that acts when selected).
    $sel = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$sel)) {
        ($sel -as [System.Windows.Automation.SelectionItemPattern]).Select()
        return @{ success = $true; method = "UIA_SELECT"; message = "Selected '$($el.Current.Name)'"; element = Get-UiaElementState $el }
    }
    return @{ success = $false; message = "Element '$($el.Current.Name)' does not support Invoke or SelectionItem" }
}

function Invoke-UiaSetValue ($params) {
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -eq $el) {
        return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
    }
    $p = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$p)) {
        ($p -as [System.Windows.Automation.ValuePattern]).SetValue([string]$params.text)
        return @{ success = $true; method = "UIA_VALUE"; message = "Set value for '$($el.Current.Name)'"; element = Get-UiaElementState $el }
    }
    return @{ success = $false; message = "Element '$($el.Current.Name)' does not support ValuePattern" }
}

function Invoke-UiaSelect ($params) {
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -eq $el) {
        return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
    }
    $p = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$p)) {
        ($p -as [System.Windows.Automation.SelectionItemPattern]).Select()
        return @{ success = $true; method = "UIA_SELECT"; message = "Selected '$($el.Current.Name)'"; element = Get-UiaElementState $el }
    }
    return @{ success = $false; message = "Element '$($el.Current.Name)' does not support SelectionItem" }
}

function Invoke-UiaToggle ($params) {
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -eq $el) {
        return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
    }
    $p = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$p)) {
        ($p -as [System.Windows.Automation.TogglePattern]).Toggle()
        return @{ success = $true; method = "UIA_TOGGLE"; message = "Toggled '$($el.Current.Name)'"; element = Get-UiaElementState $el }
    }
    return @{ success = $false; message = "Element '$($el.Current.Name)' does not support Toggle" }
}

function Invoke-UiaExpand ($params) {
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -eq $el) {
        return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
    }
    $p = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.ExpandCollapsePattern]::Pattern, [ref]$p)) {
        ($p -as [System.Windows.Automation.ExpandCollapsePattern]).Expand()
        return @{ success = $true; method = "UIA_EXPAND"; message = "Expanded '$($el.Current.Name)'"; element = Get-UiaElementState $el }
    }
    return @{ success = $false; message = "Element '$($el.Current.Name)' does not support ExpandCollapse" }
}

function Invoke-UiaScrollIntoView ($params) {
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -eq $el) {
        return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
    }
    try {
        $el.SetFocus()
    } catch {}
    $scrollItem = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.ScrollItemPattern]::Pattern, [ref]$scrollItem)) {
        ($scrollItem -as [System.Windows.Automation.ScrollItemPattern]).ScrollIntoView()
        return @{ success = $true; method = "UIA_SCROLL_INTO_VIEW"; message = "Scrolled '$($el.Current.Name)' into view"; element = Get-UiaElementState $el }
    }
    return @{ success = $false; message = "Element '$($el.Current.Name)' does not support ScrollItem" }
}

function Invoke-UiaFind ($params) {
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -eq $el) {
        return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
    }
    return @{ success = $true; method = "UIA_FIND"; message = "Found '$($el.Current.Name)'"; element = Get-UiaElementState $el }
}

# ── Backward-compatible wrappers ─────────────────────────────────────────────

function Invoke-UiaClick ($params) {
    $invoke = Invoke-UiaInvoke -params $params
    if ($invoke.success) { return $invoke }

    # Fallback: if the element exists and has bounds but no Invoke pattern,
    # click its center as a last resort.
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -ne $el) {
        $rect = $el.Current.BoundingRectangle
        if ($rect.IsEmpty -eq $false) {
            $cx = [int]($rect.X + ($rect.Width / 2))
            $cy = [int]($rect.Y + ($rect.Height / 2))
            [NativeBridge]::ClickAt($cx, $cy)
            return @{ success = $true; method = "SEND_INPUT"; message = "Clicked element '$($el.Current.Name)' at center ($cx, $cy)"; bounds = @{ x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height; centerX = $cx; centerY = $cy } }
        }
    }
    return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
}

function Invoke-UiaType ($params) {
    $setValue = Invoke-UiaSetValue -params $params
    if ($setValue.success) { return $setValue }

    # Fallback to focus + SendKeys only when ValuePattern is unavailable.
    try {
        $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
        if ($null -ne $el) { $el.SetFocus() }
        [System.Windows.Forms.SendKeys]::SendWait([string]$params.text)
        return @{ success = $true; method = "SEND_INPUT"; message = "Typed text using SendKeys" }
    } catch {
        return @{ success = $false; method = "SEND_INPUT"; message = "Failed to type text using SendKeys: $_" }
    }
}

function ConvertTo-UiaNode {
    param($Element, [int]$Depth = 0, [int]$MaxDepth = 6)
    if ($null -eq $Element -or $Depth -gt $MaxDepth) { return $null }

    $bx = 0; $by = 0; $bw = 0; $bh = 0; $cx = 0; $cy = 0
    try {
        $rect = $Element.Current.BoundingRectangle
        if ($null -ne $rect -and $rect.IsEmpty -eq $false -and $rect.Width -gt 0 -and $rect.Height -gt 0) {
            $bx = [int]$rect.X
            $by = [int]$rect.Y
            $bw = [int]$rect.Width
            $bh = [int]$rect.Height
            $cx = [int]($bx + ($bw / 2))
            $cy = [int]($by + ($bh / 2))
        }
    } catch {}

    $ctrlType = ""
    try {
        $ctrlType = $Element.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")
    } catch {}

    $node = @{
        name = $Element.Current.Name
        controlType = $ctrlType
        automationId = $Element.Current.AutomationId
        className = $Element.Current.ClassName
        enabled = $Element.Current.IsEnabled
        offscreen = $Element.Current.IsOffscreen
        bounds = @{
            x = $bx
            y = $by
            width = $bw
            height = $bh
            centerX = $cx
            centerY = $cy
        }
    }

    $children = @()
    $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
    $child = $walker.GetFirstChild($Element)
    while ($null -ne $child -and $children.Count -lt 50) {
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
        $window = $null
        if ($params.windowTitle) {
            $winCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $params.windowTitle)
            $window = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $winCond)
        }
        if ($null -eq $window) { $window = [System.Windows.Automation.AutomationElement]::FocusedElement }
        if ($null -eq $window) { $window = $root }
        $tree = ConvertTo-UiaNode -Element $window -MaxDepth 6
        return @{ success = $true; tree = $tree; message = "Captured UIA tree of focused element" }
    } catch {
        return @{ success = $false; message = "Failed to get UIA tree: $_" }
    }
}

function Invoke-UiaGetText ($params) {
    $el = Get-UiaElementBySelector -Name $params.name -AutomationId $params.automationId -ControlType $params.controlType -WindowTitle $params.windowTitle
    if ($null -eq $el) {
        return @{ success = $false; message = "Element not found (name='$($params.name)' automationId='$($params.automationId)')" }
    }
    $text = $el.Current.Name
    $valPattern = $null
    if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$valPattern)) {
        $text = ($valPattern -as [System.Windows.Automation.ValuePattern]).Current.Value
    }
    return @{ success = $true; text = $text; message = "Read text from '$($el.Current.Name)'" }
}

function Invoke-UiaGetInteractiveElements ($params) {
    try {
        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $target = $null
        $windowTitle = ""
        
        if ($params.windowTitle) {
            $winCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $params.windowTitle)
            $target = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $winCond)
            if ($null -ne $target) { $windowTitle = $params.windowTitle }
        }
        
        if ($null -eq $target) {
            # Try active foreground window first
            try {
                $fgHwnd = [NativeBridge]::GetForegroundWindow()
                if ($fgHwnd -ne [IntPtr]::Zero) {
                    $target = [System.Windows.Automation.AutomationElement]::FromHandle($fgHwnd)
                    if ($null -ne $target) {
                        $windowTitle = $target.Current.Name
                    }
                }
            } catch {}
        }
        
        if ($null -eq $target) {
            try { $target = [System.Windows.Automation.AutomationElement]::FocusedElement } catch {}
        }
        if ($null -eq $target) { $target = $root }

        $maxElements = if ($params.maxElements) { [int]$params.maxElements } else { 60 }
        $elementsList = @()

        # Define all interactive control types to inspect
        $interactiveTypes = @(
            [System.Windows.Automation.ControlType]::Button,
            [System.Windows.Automation.ControlType]::Edit,
            [System.Windows.Automation.ControlType]::Hyperlink,
            [System.Windows.Automation.ControlType]::MenuItem,
            [System.Windows.Automation.ControlType]::TabItem,
            [System.Windows.Automation.ControlType]::CheckBox,
            [System.Windows.Automation.ControlType]::RadioButton,
            [System.Windows.Automation.ControlType]::ComboBox,
            [System.Windows.Automation.ControlType]::ListItem,
            [System.Windows.Automation.ControlType]::SplitButton,
            [System.Windows.Automation.ControlType]::TreeItem,
            [System.Windows.Automation.ControlType]::ToolBar,
            [System.Windows.Automation.ControlType]::Document
        )

        $conds = @()
        foreach ($t in $interactiveTypes) {
            $conds += New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, $t)
        }
        $orCond = New-Object System.Windows.Automation.OrCondition($conds)

        $found = $target.FindAll([System.Windows.Automation.TreeScope]::Subtree, $orCond)
        
        foreach ($el in $found) {
            if ($elementsList.Count -ge $maxElements) { break }
            try {
                if ($el.Current.IsOffscreen) { continue }
                $rect = $el.Current.BoundingRectangle
                if ($rect.IsEmpty -or $rect.Width -le 4 -or $rect.Height -le 4) { continue }

                $name = $el.Current.Name
                $autoId = $el.Current.AutomationId
                $cType = $el.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")

                # Skip completely nameless elements that have no automationId or actionable tag
                if ([string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace($autoId) -and $cType -eq "Document") {
                    continue
                }

                $scr = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
                $screenW = [Math]::Max(1.0, [double]$scr.Width)
                $screenH = [Math]::Max(1.0, [double]$scr.Height)

                $bx = [int]$rect.X
                $by = [int]$rect.Y
                $bw = [int]$rect.Width
                $bh = [int]$rect.Height
                $cx = [int]($bx + ($bw / 2))
                $cy = [int]($by + ($bh / 2))

                $yminNorm = [int][Math]::Round(($by / $screenH) * 1000.0)
                $xminNorm = [int][Math]::Round(($bx / $screenW) * 1000.0)
                $ymaxNorm = [int][Math]::Round((($by + $bh) / $screenH) * 1000.0)
                $xmaxNorm = [int][Math]::Round((($bx + $bw) / $screenW) * 1000.0)

                $item = @{
                    name = $name
                    controlType = $cType
                    automationId = $autoId
                    className = $el.Current.ClassName
                    enabled = $el.Current.IsEnabled
                    box_2d = @($yminNorm, $xminNorm, $ymaxNorm, $xmaxNorm)
                    bounds = @{
                        x = $bx
                        y = $by
                        width = $bw
                        height = $bh
                        centerX = $cx
                        centerY = $cy
                    }
                }

                $elementsList += $item
            } catch {}
        }

        # Sort top-to-bottom, then left-to-right
        $sorted = $elementsList | Sort-Object { $_.bounds.y }, { $_.bounds.x }

        return @{
            success = $true
            windowTitle = $windowTitle
            count = $sorted.Count
            elements = @($sorted)
            message = "Retrieved $($sorted.Count) interactive elements"
        }
    } catch {
        return @{ success = $false; message = "Failed to get interactive elements: $_" }
    }
}

function Invoke-UiaSearchElements ($params) {
    try {
        $query = [string]$params.query
        if ([string]::IsNullOrWhiteSpace($query)) {
            return @{ success = $false; message = "No search query provided" }
        }

        $scr = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $screenW = [Math]::Max(1.0, [double]$scr.Width)
        $screenH = [Math]::Max(1.0, [double]$scr.Height)

        $root = [System.Windows.Automation.AutomationElement]::RootElement
        $target = $null
        if ($params.windowTitle) {
            $winCond = New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::NameProperty, $params.windowTitle)
            $target = $root.FindFirst([System.Windows.Automation.TreeScope]::Children, $winCond)
        }
        if ($null -eq $target) {
            try {
                $fgHwnd = [NativeBridge]::GetForegroundWindow()
                if ($fgHwnd -ne [IntPtr]::Zero) {
                    $target = [System.Windows.Automation.AutomationElement]::FromHandle($fgHwnd)
                }
            } catch {}
        }
        if ($null -eq $target) { $target = $root }

        $maxResults = if ($params.maxResults) { [int]$params.maxResults } else { 30 }
        $results = @()

        # Use Walker to traverse control view and search
        $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
        $queue = New-Object System.Collections.Queue
        $queue.Enqueue($target)

        $visited = 0
        $maxTraverse = 300

        while ($queue.Count -gt 0 -and $visited -lt $maxTraverse -and $results.Count -lt $maxResults) {
            $curr = $queue.Dequeue()
            $visited++

            try {
                $name = $curr.Current.Name
                $autoId = $curr.Current.AutomationId
                $className = $curr.Current.ClassName
                $ctrlType = $curr.Current.ControlType.ProgrammaticName.Replace("ControlType.", "")

                $matchesQuery = ($name -and $name -like "*$query*") -or `
                                ($autoId -and $autoId -like "*$query*") -or `
                                ($className -and $className -like "*$query*") -or `
                                ($ctrlType -and $ctrlType -like "*$query*")

                if ($matchesQuery) {
                    $rect = $curr.Current.BoundingRectangle
                    $hasBounds = ($null -ne $rect -and $rect.IsEmpty -eq $false -and $rect.Width -gt 0 -and $rect.Height -gt 0)
                    $bx = if ($hasBounds) { [int]$rect.X } else { 0 }
                    $by = if ($hasBounds) { [int]$rect.Y } else { 0 }
                    $bw = if ($hasBounds) { [int]$rect.Width } else { 0 }
                    $bh = if ($hasBounds) { [int]$rect.Height } else { 0 }
                    $cx = if ($hasBounds) { [int]($bx + ($bw / 2)) } else { 0 }
                    $cy = if ($hasBounds) { [int]($by + ($bh / 2)) } else { 0 }

                    $yminNorm = [int][Math]::Round(($by / $screenH) * 1000.0)
                    $xminNorm = [int][Math]::Round(($bx / $screenW) * 1000.0)
                    $ymaxNorm = [int][Math]::Round((($by + $bh) / $screenH) * 1000.0)
                    $xmaxNorm = [int][Math]::Round((($bx + $bw) / $screenW) * 1000.0)

                    $results += @{
                        name = $name
                        controlType = $ctrlType
                        automationId = $autoId
                        className = $className
                        enabled = $curr.Current.IsEnabled
                        offscreen = $curr.Current.IsOffscreen
                        box_2d = @($yminNorm, $xminNorm, $ymaxNorm, $xmaxNorm)
                        bounds = @{
                            x = $bx
                            y = $by
                            width = $bw
                            height = $bh
                            centerX = $cx
                            centerY = $cy
                        }
                    }
                }
            } catch {}

            # Enqueue children
            try {
                $child = $walker.GetFirstChild($curr)
                while ($null -ne $child -and $queue.Count -lt 150) {
                    $queue.Enqueue($child)
                    $child = $walker.GetNextSibling($child)
                }
            } catch {}
        }

        return @{
            success = $true
            query = $query
            count = $results.Count
            elements = @($results)
            message = "Found $($results.Count) elements matching '$query'"
        }
    } catch {
        return @{ success = $false; message = "Search elements failed: $_" }
    }
}

function Invoke-UiaInspectElementAt ($params) {
    try {
        $x = [double]$params.x
        $y = [double]$params.y
        $scr = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
        $screenW = [Math]::Max(1.0, [double]$scr.Width)
        $screenH = [Math]::Max(1.0, [double]$scr.Height)

        if ($params.normalized -or ($x -le 1000.0 -and $y -le 1000.0 -and -not $params.isPixels)) {
            $x = ($x / 1000.0) * $screenW
            $y = ($y / 1000.0) * $screenH
        }

        $pt = New-Object System.Windows.Point([int]$x, [int]$y)
        $el = [System.Windows.Automation.AutomationElement]::FromPoint($pt)
        if ($null -eq $el) {
            return @{ success = $false; message = "No UI element found at ($x, $y)" }
        }

        $state = Get-UiaElementState $el
        $bx = $state.bounds.x
        $by = $state.bounds.y
        $bw = $state.bounds.width
        $bh = $state.bounds.height
        $box2d = @(
            [int][Math]::Round(($by / $screenH) * 1000.0),
            [int][Math]::Round(($bx / $screenW) * 1000.0),
            [int][Math]::Round((($by + $bh) / $screenH) * 1000.0),
            [int][Math]::Round((($bx + $bw) / $screenW) * 1000.0)
        )
        $state.box_2d = $box2d

        return @{
            success = $true
            x = [int]$x
            y = [int]$y
            element = $state
            message = "Inspected element '$($state.name)' ($($state.controlType)) at ($x, $y)"
        }
    } catch {
        return @{ success = $false; message = "Failed to inspect element at point: $_" }
    }
}

