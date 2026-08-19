# Interactive Desktop Scratchpad, Markdown Viewer & Question Overlay for Hey Jave
# Supports:
# 1. Rich Markdown Rendering (Headings, Bold, Bullet Lists, Code Blocks)
# 2. Shell Commands (Copy / Direct Execute)
# 3. Interactive Questions with Selectable Options & Custom Answers
# 4. Expandable / Resizable Windows Desktop Overlay

[CmdletBinding()]
param (
    [Parameter(Position=0, ValueFromPipeline=$true)]
    [string]$InputJson,

    [Parameter()]
    [string]$Title = "Scratchpad",

    [Parameter()]
    [string]$Message = "",

    [Parameter()]
    [string]$Question = "",

    [Parameter()]
    [string]$Command = "",

    [Parameter()]
    [string[]]$Options = @(),

    [Parameter(ValueFromRemainingArguments=$true)]
    [string[]]$RemainingOptions,

    [Parameter()]
    [string]$Type = "auto", # "markdown" | "command" | "code" | "question" | "auto"

    [Parameter()]
    [string]$Base64
)

$ErrorActionPreference = 'Stop'

# Decode Base64 payload if provided
if (-not [string]::IsNullOrWhiteSpace($Base64)) {
    try {
        $bytes = [Convert]::FromBase64String($Base64)
        $InputJson = [System.Text.Encoding]::UTF8.GetString($bytes)
    } catch {}
}

# Merge any remaining unparsed arguments into options
if ($RemainingOptions) {
    $Options += $RemainingOptions
}

# Parse parameters from InputJson if provided
if (-not [string]::IsNullOrWhiteSpace($InputJson)) {
    try {
        $parsed = $InputJson | ConvertFrom-Json
        if ($parsed.title) { $Title = $parsed.title }
        if ($parsed.message) { $Message = $parsed.message }
        if ($parsed.question) { $Question = $parsed.question }
        if ($parsed.command) { $Command = $parsed.command }
        if ($parsed.content) { $Command = $parsed.content }
        if ($parsed.type) { $Type = $parsed.type }
        if ($parsed.options) { $Options = @($parsed.options) }
        if ($parsed.params) {
            if ($parsed.params.title) { $Title = $parsed.params.title }
            if ($parsed.params.message) { $Message = $parsed.params.message }
            if ($parsed.params.question) { $Question = $parsed.params.question }
            if ($parsed.params.command) { $Command = $parsed.params.command }
            if ($parsed.params.content) { $Command = $parsed.params.content }
            if ($parsed.params.type) { $Type = $parsed.params.type }
            if ($parsed.params.options) { $Options = @($parsed.params.options) }
        }
    } catch {}
}

# Normalize options
$normalizedOptions = @()
foreach ($item in $Options) {
    if ($item -is [string] -and $item.Contains(",") -and (-not $item.StartsWith("{"))) {
        $parts = $item -split ','
        foreach ($p in $parts) {
            $cleaned = $p.Trim().Trim('"').Trim("'")
            if (-not [string]::IsNullOrWhiteSpace($cleaned)) {
                $normalizedOptions += $cleaned
            }
        }
    } else {
        $cleaned = ("$item").Trim().Trim('"').Trim("'")
        if (-not [string]::IsNullOrWhiteSpace($cleaned)) {
            $normalizedOptions += $cleaned
        }
    }
}
$Options = $normalizedOptions

# Auto-detect mode
$isQuestionMode = ($Type -eq "question") -or (-not [string]::IsNullOrWhiteSpace($Question)) -or ($Options.Count -gt 0)
$isMarkdownMode = ($Type -eq "markdown") -or ($Type -eq "code") -or ($Command -match '(?m)^#{1,6}\s|^\s*[-*]\s|\*\*|```')

if ($isQuestionMode) {
    if ([string]::IsNullOrWhiteSpace($Question)) { $Question = $Message }
    if ([string]::IsNullOrWhiteSpace($Title) -or $Title -eq "Scratchpad") { $Title = "Question" }
} else {
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = if ($isMarkdownMode) { "Insights & Analysis" } else { "Suggested Command" }
    }
    if ([string]::IsNullOrWhiteSpace($Command)) {
        $Command = "Get-Process | Select-Object -First 10"
    }
}

# Ensure PresentationFramework Assemblies are loaded
Add-Type -AssemblyName PresentationFramework
Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase
Add-Type -AssemblyName System.Drawing

[xml]$xaml = @"
<Window xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation"
        xmlns:x="http://schemas.microsoft.com/winfx/2006/xaml"
        Title="$Title"
        Width="640" Height="500" MinWidth="480" MinHeight="360" MaxWidth="1400" MaxHeight="1000"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        WindowStartupLocation="CenterScreen">
    <Border CornerRadius="14" Background="#141517" BorderBrush="#2E3035" BorderThickness="1.5" Margin="10">
        <Border.Effect>
            <DropShadowEffect Color="#000000" BlurRadius="30" ShadowDepth="8" Opacity="0.85"/>
        </Border.Effect>
        <Grid Margin="18">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <!-- Header with Drag Area, Title, Expand & Close Buttons -->
            <Grid Name="HeaderGrid" Grid.Row="0" Margin="0,0,0,12" Background="Transparent" Cursor="SizeAll">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                    <Border Background="#23252A" CornerRadius="5" Padding="6,2" Margin="0,0,8,0" BorderBrush="#35383F" BorderThickness="1">
                        <TextBlock Name="BadgeText" Text="HEY JAVE" FontSize="10" FontWeight="Bold" Foreground="#A0A5B0"/>
                    </Border>
                    <TextBlock Name="TitleText" Text="$Title" FontSize="14" FontWeight="SemiBold" Foreground="#FFFFFF" VerticalAlignment="Center" TextTrimming="CharacterEllipsis"/>
                </StackPanel>
                <StackPanel Orientation="Horizontal" Grid.Column="1" VerticalAlignment="Center">
                    <Button Name="BtnExpand" Content="⛶" ToolTip="Expand / Restore Window" Width="28" Height="28" Margin="0,0,6,0"
                            Background="#23252A" Foreground="#A0A5B0" BorderThickness="1" BorderBrush="#35383F" Cursor="Hand" FontWeight="Bold" FontSize="12">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="7"/>
                            </Style>
                        </Button.Resources>
                    </Button>
                    <Button Name="BtnCloseHeader" Content="✕" Width="28" Height="28" 
                            Background="#23252A" Foreground="#A0A5B0" BorderThickness="1" BorderBrush="#35383F" Cursor="Hand" FontWeight="Bold" FontSize="11">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="7"/>
                            </Style>
                        </Button.Resources>
                    </Button>
                </StackPanel>
            </Grid>

            <!-- Message / Subtitle Text -->
            <TextBlock Name="PromptText" Grid.Row="1" Text="" 
                       TextWrapping="Wrap" FontSize="13" Foreground="#B0B5C0" Margin="0,0,0,12"/>

            <!-- Main Content Area: Switchable between Markdown Viewer, Command Box, or Question Options -->
            <Grid Grid.Row="2" Margin="0,0,0,14">
                <!-- 1. Rich Markdown Viewer Container -->
                <Border Name="MarkdownContainer" Background="#0C0D0E" CornerRadius="9" BorderBrush="#25272B" BorderThickness="1" Padding="12" Visibility="Collapsed">
                    <FlowDocumentScrollViewer Name="MarkdownViewer" 
                                              Background="Transparent" 
                                              Foreground="#E1E4EA" 
                                              VerticalScrollBarVisibility="Auto" 
                                              HorizontalScrollBarVisibility="Disabled"
                                              IsToolBarVisible="False"/>
                </Border>

                <!-- 2. Raw Command Box Container -->
                <Border Name="CommandContainer" Background="#0C0D0E" CornerRadius="9" BorderBrush="#25272B" BorderThickness="1" Padding="12" Visibility="Collapsed">
                    <Grid>
                        <Grid.RowDefinitions>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="*"/>
                        </Grid.RowDefinitions>
                        <TextBlock Text="SUGGESTED COMMAND:" FontSize="10" FontWeight="Bold" Foreground="#787E8A" Margin="0,0,0,6"/>
                        <TextBox Name="CodeBox" Grid.Row="1" Text="" 
                                 FontFamily="Cascadia Code, Consolas, Courier New" FontSize="12.5" 
                                 Foreground="#8BE9FD" Background="Transparent" BorderThickness="0" 
                                 IsReadOnly="False" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto"
                                 AcceptsReturn="True" CaretBrush="#FFFFFF"/>
                    </Grid>
                </Border>

                <!-- 3. Question Options Container -->
                <ScrollViewer Name="QuestionContainer" VerticalScrollBarVisibility="Auto" Visibility="Collapsed">
                    <StackPanel>
                        <TextBlock Name="OptionsLabel" Text="SELECT AN OPTION:" FontSize="10" FontWeight="Bold" Foreground="#787E8A" Margin="0,0,0,8"/>
                        <StackPanel Name="OptionsList" Margin="0,0,0,10"/>
                        
                        <!-- Optional Custom Text Input -->
                        <TextBlock Text="OR TYPE CUSTOM ANSWER:" FontSize="10" FontWeight="Bold" Foreground="#787E8A" Margin="0,4,0,6"/>
                        <Border Background="#0C0D0E" CornerRadius="8" BorderBrush="#25272B" BorderThickness="1" Padding="10">
                            <TextBox Name="CustomAnswerBox" Text="" FontSize="13" 
                                     Foreground="#FFFFFF" Background="Transparent" BorderThickness="0" 
                                     CaretBrush="#FFFFFF"/>
                        </Border>
                    </StackPanel>
                </ScrollViewer>
            </Grid>

            <!-- Action Button Rows -->
            <Grid Grid.Row="3">
                <!-- Action Buttons: Copy, Execute, Close -->
                <Grid Name="ActionButtonsGrid" Visibility="Visible">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="10"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="10"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>

                    <Button Name="BtnCopy" Grid.Column="0" Content="Copy Content" Height="36"
                            Background="#23252A" Foreground="#FFFFFF" FontWeight="SemiBold" FontSize="12.5" BorderThickness="1" BorderBrush="#35383F" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="8"/>
                            </Style>
                        </Button.Resources>
                    </Button>

                    <Button Name="BtnExecute" Grid.Column="2" Content="Execute Command" Height="36"
                            Background="#FFFFFF" Foreground="#0D0E10" FontWeight="Bold" FontSize="12.5" BorderThickness="0" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="8"/>
                            </Style>
                        </Button.Resources>
                    </Button>

                    <Button Name="BtnClose" Grid.Column="4" Content="Close" Height="36" Width="80"
                            Background="#1C1D21" Foreground="#9DA3AE" FontWeight="SemiBold" FontSize="12.5" BorderThickness="1" BorderBrush="#2C2E33" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="8"/>
                            </Style>
                        </Button.Resources>
                    </Button>
                </Grid>

                <!-- Question Mode Buttons -->
                <Grid Name="QuestionButtonsGrid" Visibility="Collapsed">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="10"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>

                    <Button Name="BtnSubmitAnswer" Grid.Column="0" Content="Submit Answer" Height="36"
                            Background="#FFFFFF" Foreground="#0D0E10" FontWeight="Bold" FontSize="12.5" BorderThickness="0" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="8"/>
                            </Style>
                        </Button.Resources>
                    </Button>

                    <Button Name="BtnCancelQuestion" Grid.Column="2" Content="Cancel" Height="36" Width="80"
                            Background="#1C1D21" Foreground="#9DA3AE" FontWeight="SemiBold" FontSize="12.5" BorderThickness="1" BorderBrush="#2C2E33" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="8"/>
                            </Style>
                        </Button.Resources>
                    </Button>
                </Grid>
            </Grid>
        </Grid>
    </Border>
</Window>
"@

$reader = (New-Object System.Xml.XmlNodeReader $xaml)
$window = [System.Windows.Markup.XamlReader]::Load($reader)

# Get Elements
$headerGrid = $window.FindName("HeaderGrid")
$titleText = $window.FindName("TitleText")
$badgeText = $window.FindName("BadgeText")
$promptText = $window.FindName("PromptText")

$markdownContainer = $window.FindName("MarkdownContainer")
$markdownViewer = $window.FindName("MarkdownViewer")
$commandContainer = $window.FindName("CommandContainer")
$questionContainer = $window.FindName("QuestionContainer")

$optionsList = $window.FindName("OptionsList")
$optionsLabel = $window.FindName("OptionsLabel")
$codeBox = $window.FindName("CodeBox")
$customAnswerBox = $window.FindName("CustomAnswerBox")

$actionButtonsGrid = $window.FindName("ActionButtonsGrid")
$questionButtonsGrid = $window.FindName("QuestionButtonsGrid")

$btnExpand = $window.FindName("BtnExpand")
$btnCopy = $window.FindName("BtnCopy")
$btnExecute = $window.FindName("BtnExecute")
$btnClose = $window.FindName("BtnClose")
$btnCloseHeader = $window.FindName("BtnCloseHeader")
$btnSubmitAnswer = $window.FindName("BtnSubmitAnswer")
$btnCancelQuestion = $window.FindName("BtnCancelQuestion")

# Synchronized State
$script:sharedState = [hashtable]::Synchronized(@{
    action = "CLOSE"
    command = ""
    answer = ""
})

# Helper function: Parse inline Markdown formatting (**bold**, `code`)
function Add-FormattedInlines {
    param(
        [System.Windows.Documents.Paragraph]$Paragraph,
        [string]$Text
    )
    $pattern = '(\*\*[^*]+\*\*|`[^`]+`)'
    $parts = [System.Text.RegularExpressions.Regex]::Split($Text, $pattern)
    
    foreach ($part in $parts) {
        if ([string]::IsNullOrEmpty($part)) { continue }
        if ($part.StartsWith('**') -and $part.EndsWith('**') -and $part.Length -gt 4) {
            $inner = $part.Substring(2, $part.Length - 4)
            $run = New-Object System.Windows.Documents.Run($inner)
            $run.FontWeight = [System.Windows.FontWeights]::Bold
            $run.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF")
            $Paragraph.Inlines.Add($run)
        } elseif ($part.StartsWith([char]96) -and $part.EndsWith([char]96) -and $part.Length -gt 2) {
            $inner = $part.Substring(1, $part.Length - 2)
            $run = New-Object System.Windows.Documents.Run(" " + $inner + " ")
            $run.FontFamily = New-Object System.Windows.Media.FontFamily("Cascadia Code, Consolas, Courier New")
            $run.FontSize = 12.0
            $run.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#F472B6")
            $run.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#1E1F24")
            $Paragraph.Inlines.Add($run)
        } else {
            $run = New-Object System.Windows.Documents.Run($part)
            $run.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#D1D5DB")
            $Paragraph.Inlines.Add($run)
        }
    }
}

# Helper function: Convert Markdown to WPF FlowDocument
function Convert-MarkdownToFlowDocument {
    param([string]$Markdown)
    
    $doc = New-Object System.Windows.Documents.FlowDocument
    $doc.Background = [System.Windows.Media.Brushes]::Transparent
    $doc.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#E1E4EA")
    $doc.FontFamily = New-Object System.Windows.Media.FontFamily("Segoe UI, Inter, sans-serif")
    $doc.FontSize = 13.0
    $doc.PagePadding = [System.Windows.Thickness]::new(4)
    
    $lines = $Markdown -split "`r?`n"
    $inCodeBlock = $false
    $codeLines = [System.Collections.Generic.List[string]]::new()
    
    foreach ($line in $lines) {
        $trimmed = $line.Trim()
        
        # Code fence
        if ($trimmed.StartsWith('```')) {
            if ($inCodeBlock) {
                $codeText = [string]::Join("`r`n", $codeLines)
                $codeBorder = New-Object System.Windows.Controls.Border
                $codeBorder.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#0C0D0E")
                $codeBorder.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#25272B")
                $codeBorder.BorderThickness = [System.Windows.Thickness]::new(1)
                $codeBorder.CornerRadius = [System.Windows.CornerRadius]::new(6)
                $codeBorder.Padding = [System.Windows.Thickness]::new(10, 8, 10, 8)
                $codeBorder.Margin = [System.Windows.Thickness]::new(0, 4, 0, 8)
                
                $codeTb = New-Object System.Windows.Controls.TextBox
                $codeTb.Text = $codeText
                $codeTb.IsReadOnly = $true
                $codeTb.Background = [System.Windows.Media.Brushes]::Transparent
                $codeTb.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#8BE9FD")
                $codeTb.FontFamily = New-Object System.Windows.Media.FontFamily("Cascadia Code, Consolas, Courier New")
                $codeTb.FontSize = 12.0
                $codeTb.BorderThickness = [System.Windows.Thickness]::new(0)
                $codeTb.TextWrapping = [System.Windows.TextWrapping]::Wrap
                $codeBorder.Child = $codeTb
                
                $container = New-Object System.Windows.Documents.BlockUIContainer($codeBorder)
                $doc.Blocks.Add($container)
                $codeLines.Clear()
                $inCodeBlock = $false
            } else {
                $inCodeBlock = $true
                $codeLines.Clear()
            }
            continue
        }
        
        if ($inCodeBlock) {
            $codeLines.Add($line)
            continue
        }
        
        if ([string]::IsNullOrWhiteSpace($trimmed)) {
            continue
        }
        
        # H1
        if ($trimmed.StartsWith("# ")) {
            $p = New-Object System.Windows.Documents.Paragraph
            $p.Margin = [System.Windows.Thickness]::new(0, 10, 0, 4)
            $run = New-Object System.Windows.Documents.Run($trimmed.Substring(2))
            $run.FontSize = 16.5
            $run.FontWeight = [System.Windows.FontWeights]::Bold
            $run.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF")
            $p.Inlines.Add($run)
            $doc.Blocks.Add($p)
            continue
        }
        
        # H2
        if ($trimmed.StartsWith("## ")) {
            $p = New-Object System.Windows.Documents.Paragraph
            $p.Margin = [System.Windows.Thickness]::new(0, 8, 0, 3)
            $run = New-Object System.Windows.Documents.Run($trimmed.Substring(3))
            $run.FontSize = 14.5
            $run.FontWeight = [System.Windows.FontWeights]::SemiBold
            $run.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#93C5FD")
            $p.Inlines.Add($run)
            $doc.Blocks.Add($p)
            continue
        }
        
        # H3
        if ($trimmed.StartsWith("### ")) {
            $p = New-Object System.Windows.Documents.Paragraph
            $p.Margin = [System.Windows.Thickness]::new(0, 6, 0, 2)
            $run = New-Object System.Windows.Documents.Run($trimmed.Substring(4))
            $run.FontSize = 13.5
            $run.FontWeight = [System.Windows.FontWeights]::SemiBold
            $run.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#60A5FA")
            $p.Inlines.Add($run)
            $doc.Blocks.Add($p)
            continue
        }
        
        # Bullet list item
        $isBullet = $trimmed.StartsWith("- ") -or $trimmed.StartsWith("* ")
        $contentLine = if ($isBullet) { $trimmed.Substring(2) } else { $trimmed }
        
        $p = New-Object System.Windows.Documents.Paragraph
        $p.Margin = [System.Windows.Thickness]::new(if ($isBullet) { 14 } else { 0 }, 2, 0, 3)
        
        if ($isBullet) {
            $bulletRun = New-Object System.Windows.Documents.Run([char]0x2022 + " ")
            $bulletRun.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#3B82F6")
            $bulletRun.FontWeight = [System.Windows.FontWeights]::Bold
            $p.Inlines.Add($bulletRun)
        }
        
        Add-FormattedInlines -Paragraph $p -Text $contentLine
        $doc.Blocks.Add($p)
    }
    
    return $doc
}

# Populate dynamic values
$titleText.Text = $Title

if ($isQuestionMode) {
    $badgeText.Text = "QUESTION"
    $promptText.Text = $Question
    $markdownContainer.Visibility = [System.Windows.Visibility]::Collapsed
    $commandContainer.Visibility = [System.Windows.Visibility]::Collapsed
    $actionButtonsGrid.Visibility = [System.Windows.Visibility]::Collapsed
    $questionContainer.Visibility = [System.Windows.Visibility]::Visible
    $questionButtonsGrid.Visibility = [System.Windows.Visibility]::Visible

    if ($Options.Count -gt 0) {
        $optionsLabel.Visibility = [System.Windows.Visibility]::Visible
        foreach ($opt in $Options) {
            $optBtn = New-Object System.Windows.Controls.Button
            $optBtn.Content = "$opt"
            $optBtn.Tag = "$opt"
            $optBtn.Height = 36
            $optBtn.Margin = [System.Windows.Thickness]::new(0, 0, 0, 6)
            $optBtn.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#23252A")
            $optBtn.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF")
            $optBtn.BorderBrush = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#35383F")
            $optBtn.BorderThickness = [System.Windows.Thickness]::new(1)
            $optBtn.FontWeight = [System.Windows.FontWeights]::SemiBold
            $optBtn.FontSize = 12.5
            $optBtn.HorizontalContentAlignment = [System.Windows.HorizontalAlignment]::Left
            $optBtn.Padding = [System.Windows.Thickness]::new(14, 0, 14, 0)
            $optBtn.Cursor = [System.Windows.Input.Cursors]::Hand

            $style = New-Object System.Windows.Style([System.Windows.Controls.Button])
            $controlTemplate = [System.Windows.Markup.XamlReader]::Parse('<ControlTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation" TargetType="Button"><Border Background="{TemplateBinding Background}" BorderBrush="{TemplateBinding BorderBrush}" BorderThickness="{TemplateBinding BorderThickness}" CornerRadius="8"><ContentPresenter HorizontalAlignment="{TemplateBinding HorizontalContentAlignment}" VerticalAlignment="Center"/></Border></ControlTemplate>')
            $setter = New-Object System.Windows.Setter([System.Windows.Controls.Button]::TemplateProperty, $controlTemplate)
            [void]$style.Setters.Add($setter)
            $optBtn.Style = $style

            $optBtn.Add_Click({
                $script:sharedState.action = "ANSWER"
                $script:sharedState.answer = [string]$this.Tag
                $window.Close()
            })

            [void]$optionsList.Children.Add($optBtn)
        }
    } else {
        $optionsLabel.Visibility = [System.Windows.Visibility]::Collapsed
    }
} elseif ($isMarkdownMode) {
    $badgeText.Text = "INSIGHTS"
    $promptText.Text = $Message
    $markdownContainer.Visibility = [System.Windows.Visibility]::Visible
    $commandContainer.Visibility = [System.Windows.Visibility]::Collapsed
    $questionContainer.Visibility = [System.Windows.Visibility]::Collapsed
    $actionButtonsGrid.Visibility = [System.Windows.Visibility]::Visible
    $questionButtonsGrid.Visibility = [System.Windows.Visibility]::Collapsed
    
    $btnCopy.Content = "Copy Markdown"
    $btnExecute.Visibility = [System.Windows.Visibility]::Collapsed

    # Render formatted markdown
    $doc = Convert-MarkdownToFlowDocument -Markdown $Command
    $markdownViewer.Document = $doc
} else {
    $badgeText.Text = "COMMAND"
    $promptText.Text = $Message
    $codeBox.Text = $Command
    $markdownContainer.Visibility = [System.Windows.Visibility]::Collapsed
    $commandContainer.Visibility = [System.Windows.Visibility]::Visible
    $questionContainer.Visibility = [System.Windows.Visibility]::Collapsed
    $actionButtonsGrid.Visibility = [System.Windows.Visibility]::Visible
    $questionButtonsGrid.Visibility = [System.Windows.Visibility]::Collapsed

    $btnCopy.Content = "Copy Command"
    $btnExecute.Visibility = [System.Windows.Visibility]::Visible
}

# Allow window dragging
$headerGrid.Add_MouseLeftButtonDown({
    $window.DragMove()
})

# Expand / Maximize Toggle Handler
$script:isExpanded = $false
$btnExpand.Add_Click({
    $script:isExpanded = -not $script:isExpanded
    if ($script:isExpanded) {
        $window.Width = [Math]::Min(960, [System.Windows.SystemParameters]::PrimaryScreenWidth - 60)
        $window.Height = [Math]::Min(740, [System.Windows.SystemParameters]::PrimaryScreenHeight - 100)
        $btnExpand.Content = "❐"
        $btnExpand.ToolTip = "Restore Normal Size"
    } else {
        $window.Width = 640
        $window.Height = 500
        $btnExpand.Content = "⛶"
        $btnExpand.ToolTip = "Expand Window"
    }
    $window.Left = ([System.Windows.SystemParameters]::PrimaryScreenWidth - $window.Width) / 2
    $window.Top = ([System.Windows.SystemParameters]::PrimaryScreenHeight - $window.Height) / 2
})

# Copy Button Event Handler
$btnCopy.Add_Click({
    try {
        $copyContent = if ($isMarkdownMode) { $Command } else { $codeBox.Text }
        [System.Windows.Clipboard]::SetText($copyContent)
        $btnCopy.Content = "Copied!"
        $btnCopy.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF")
        $btnCopy.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#0D0E10")
        
        $timer = New-Object System.Windows.Threading.DispatcherTimer
        $timer.Interval = [TimeSpan]::FromSeconds(1.5)
        $timer.Add_Tick({
            $btnCopy.Content = if ($isMarkdownMode) { "Copy Markdown" } else { "Copy Command" }
            $btnCopy.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#23252A")
            $btnCopy.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF")
            $timer.Stop()
        })
        $timer.Start()
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Failed to copy to clipboard: $_")
    }
})

# Execute Button Event Handler
$btnExecute.Add_Click({
    $script:sharedState.action = "EXECUTE"
    $script:sharedState.command = $codeBox.Text
    try {
        Start-Process powershell.exe -ArgumentList "-NoExit", "-Command", $codeBox.Text
    } catch {
        [System.Windows.Forms.MessageBox]::Show("Failed to execute command: $_")
    }
    $window.Close()
})

# Submit Answer Button
$btnSubmitAnswer.Add_Click({
    $script:sharedState.action = "ANSWER"
    $script:sharedState.answer = $customAnswerBox.Text
    $window.Close()
})

# Cancel / Close Handlers
$btnCancelQuestion.Add_Click({
    $script:sharedState.action = "CANCEL"
    $window.Close()
})

$btnClose.Add_Click({
    $script:sharedState.action = "CLOSE"
    $window.Close()
})

$btnCloseHeader.Add_Click({
    $script:sharedState.action = "CLOSE"
    $window.Close()
})

# Display Window as Modal Dialog
$null = $window.ShowDialog()

# Output JSON result
$outputObj = @{
    success = $true
    action = $script:sharedState.action
    command = $script:sharedState.command
    answer = $script:sharedState.answer
}
Write-Output ($outputObj | ConvertTo-Json -Compress)
