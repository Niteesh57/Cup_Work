# Interactive Desktop Scratchpad & Question Overlay for Hey Jave
# Supports Commands (Copy/Execute) AND Questions with selectable Options & custom answers.

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
    [string]$Type = "auto" # "command" | "question" | "auto"
)

$ErrorActionPreference = 'Stop'

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

# Normalize options (split any comma-separated strings)
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

# Determine mode
$isQuestionMode = ($Type -eq "question") -or (-not [string]::IsNullOrWhiteSpace($Question)) -or ($Options.Count -gt 0)
if ($isQuestionMode) {
    if ([string]::IsNullOrWhiteSpace($Question)) { $Question = $Message }
    if ([string]::IsNullOrWhiteSpace($Title) -or $Title -eq "Scratchpad") { $Title = "Question" }
} else {
    if ([string]::IsNullOrWhiteSpace($Message)) { $Message = "I found a missing dependency." }
    if ([string]::IsNullOrWhiteSpace($Command)) { $Command = "npm install`r`nnpm run build" }
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
        Width="500" MinHeight="360" MaxHeight="560" SizeToContent="Height"
        WindowStyle="None"
        AllowsTransparency="True"
        Background="Transparent"
        Topmost="True"
        WindowStartupLocation="CenterScreen">
    <Border CornerRadius="14" Background="#141517" BorderBrush="#2E3035" BorderThickness="1.5" Margin="12">
        <Border.Effect>
            <DropShadowEffect Color="#000000" BlurRadius="30" ShadowDepth="8" Opacity="0.8"/>
        </Border.Effect>
        <Grid Margin="20">
            <Grid.RowDefinitions>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="Auto"/>
                <RowDefinition Height="*"/>
                <RowDefinition Height="Auto"/>
            </Grid.RowDefinitions>

            <!-- Header with Drag area and Close Button -->
            <Grid Name="HeaderGrid" Grid.Row="0" Margin="0,0,0,14" Background="Transparent" Cursor="SizeAll">
                <Grid.ColumnDefinitions>
                    <ColumnDefinition Width="*"/>
                    <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <StackPanel Orientation="Horizontal" VerticalAlignment="Center">
                    <Border Background="#23252A" CornerRadius="5" Padding="6,2" Margin="0,0,8,0" BorderBrush="#35383F" BorderThickness="1">
                        <TextBlock Name="BadgeText" Text="HEY JAVE" FontSize="10" FontWeight="Bold" Foreground="#A0A5B0"/>
                    </Border>
                    <TextBlock Name="TitleText" Text="$Title" FontSize="14" FontWeight="SemiBold" Foreground="#FFFFFF" VerticalAlignment="Center"/>
                </StackPanel>
                <Button Name="BtnCloseHeader" Grid.Column="1" Content="X" Width="28" Height="28" 
                        Background="#23252A" Foreground="#A0A5B0" BorderThickness="1" BorderBrush="#35383F" Cursor="Hand" FontWeight="Bold" FontSize="11">
                    <Button.Resources>
                        <Style TargetType="Border">
                            <Setter Property="CornerRadius" Value="7"/>
                        </Style>
                    </Button.Resources>
                </Button>
            </Grid>

            <!-- Message / Question Text -->
            <TextBlock Name="PromptText" Grid.Row="1" Text="" 
                       TextWrapping="Wrap" FontSize="13.5" Foreground="#E1E4EA" Margin="0,0,0,14"/>

            <!-- Main Content Area: Switchable between CodeBox or Question Options -->
            <StackPanel Name="ContentContainer" Grid.Row="2" Margin="0,0,0,16">
                <!-- Command Box Container -->
                <Border Name="CommandContainer" Background="#0C0D0E" CornerRadius="9" BorderBrush="#25272B" BorderThickness="1" Padding="12" Visibility="Visible">
                    <Grid>
                        <Grid.RowDefinitions>
                            <RowDefinition Height="Auto"/>
                            <RowDefinition Height="*"/>
                        </Grid.RowDefinitions>
                        <TextBlock Text="SUGGESTED COMMAND:" FontSize="10" FontWeight="Bold" Foreground="#787E8A" Margin="0,0,0,6"/>
                        <TextBox Name="CodeBox" Grid.Row="1" Text="" 
                                 FontFamily="Cascadia Code, Consolas, Courier New" FontSize="12.5" 
                                 Foreground="#FFFFFF" Background="Transparent" BorderThickness="0" 
                                 IsReadOnly="False" TextWrapping="Wrap" VerticalScrollBarVisibility="Auto"
                                 AcceptsReturn="True" CaretBrush="#FFFFFF" MaxHeight="180"/>
                    </Grid>
                </Border>

                <!-- Question Options Container -->
                <StackPanel Name="QuestionContainer" Visibility="Collapsed">
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
            </StackPanel>

            <!-- Action Button Rows -->
            <Grid Grid.Row="3">
                <!-- Command Mode Buttons -->
                <Grid Name="CommandButtonsGrid" Visibility="Visible">
                    <Grid.ColumnDefinitions>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="10"/>
                        <ColumnDefinition Width="*"/>
                        <ColumnDefinition Width="10"/>
                        <ColumnDefinition Width="Auto"/>
                    </Grid.ColumnDefinitions>

                    <Button Name="BtnCopy" Grid.Column="0" Content="Copy" Height="36"
                            Background="#23252A" Foreground="#FFFFFF" FontWeight="SemiBold" FontSize="12.5" BorderThickness="1" BorderBrush="#35383F" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="8"/>
                            </Style>
                        </Button.Resources>
                    </Button>

                    <Button Name="BtnExecute" Grid.Column="2" Content="Execute" Height="36"
                            Background="#FFFFFF" Foreground="#0D0E10" FontWeight="Bold" FontSize="12.5" BorderThickness="0" Cursor="Hand">
                        <Button.Resources>
                            <Style TargetType="Border">
                                <Setter Property="CornerRadius" Value="8"/>
                            </Style>
                        </Button.Resources>
                    </Button>

                    <Button Name="BtnClose" Grid.Column="4" Content="Close" Height="36" Width="72"
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
$commandContainer = $window.FindName("CommandContainer")
$questionContainer = $window.FindName("QuestionContainer")
$optionsList = $window.FindName("OptionsList")
$optionsLabel = $window.FindName("OptionsLabel")
$codeBox = $window.FindName("CodeBox")
$customAnswerBox = $window.FindName("CustomAnswerBox")

$commandButtonsGrid = $window.FindName("CommandButtonsGrid")
$questionButtonsGrid = $window.FindName("QuestionButtonsGrid")

$btnCopy = $window.FindName("BtnCopy")
$btnExecute = $window.FindName("BtnExecute")
$btnClose = $window.FindName("BtnClose")
$btnCloseHeader = $window.FindName("BtnCloseHeader")
$btnSubmitAnswer = $window.FindName("BtnSubmitAnswer")
$btnCancelQuestion = $window.FindName("BtnCancelQuestion")

# Synchronized State Object for Event Handlers
$script:sharedState = [hashtable]::Synchronized(@{
    action = "CLOSE"
    command = ""
    answer = ""
})

# Populate dynamic values
$titleText.Text = $Title

if ($isQuestionMode) {
    $badgeText.Text = "QUESTION"
    $promptText.Text = $Question
    $commandContainer.Visibility = [System.Windows.Visibility]::Collapsed
    $commandButtonsGrid.Visibility = [System.Windows.Visibility]::Collapsed
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

            # Rounded border style
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
} else {
    $badgeText.Text = "HEY JAVE"
    $promptText.Text = $Message
    $codeBox.Text = $Command
    $commandContainer.Visibility = [System.Windows.Visibility]::Visible
    $commandButtonsGrid.Visibility = [System.Windows.Visibility]::Visible
    $questionContainer.Visibility = [System.Windows.Visibility]::Collapsed
    $questionButtonsGrid.Visibility = [System.Windows.Visibility]::Collapsed
}

# Allow window dragging
$headerGrid.Add_MouseLeftButtonDown({
    $window.DragMove()
})

# Copy Button Event Handler
$btnCopy.Add_Click({
    try {
        [System.Windows.Clipboard]::SetText($codeBox.Text)
        $btnCopy.Content = "Copied!"
        $btnCopy.Background = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#FFFFFF")
        $btnCopy.Foreground = [System.Windows.Media.BrushConverter]::new().ConvertFromString("#0D0E10")
        
        $timer = New-Object System.Windows.Threading.DispatcherTimer
        $timer.Interval = [TimeSpan]::FromSeconds(1.5)
        $timer.Add_Tick({
            $btnCopy.Content = "Copy"
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

# Cancel / Close Button Event Handlers
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
