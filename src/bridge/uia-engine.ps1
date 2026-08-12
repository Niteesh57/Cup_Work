# Windows UI Automation & Native Input Execution Bridge Engine
# Production-Grade JSON-RPC Worker for Node.js / Electron

[CmdletBinding()]
param (
    [string]$InputJson
)

$ErrorActionPreference = 'Stop'

# Load required UI Automation Assemblies
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

# Embedded C# Native Windows API & UIA Invocation Layer
$csharpSource = @"
using System;
using System.IO;
using System.Drawing;
using System.Drawing.Imaging;
using System.Text;
using System.Diagnostics;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Windows.Automation;
using System.Windows.Forms;

public class NativeBridge {
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetProcessDpiAwarenessContext(int dpiContext);

    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);

    [DllImport("user32.dll")]
    public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;

    public const int SW_HIDE = 0;
    public const int SW_SHOWNORMAL = 1;
    public const int SW_SHOWMINIMIZED = 2;
    public const int SW_SHOWMAXIMIZED = 3;
    public const int SW_RESTORE = 9;
    public const int SW_MINIMIZE = 6;

    public const uint KEYEVENTF_KEYUP = 0x0002;

    public static void Initialize() {
        try {
            SetProcessDpiAwarenessContext(-4); // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
        } catch {}
    }

    public static string CapturePrimaryScreenBase64() {
        try {
            Rectangle bounds = Screen.PrimaryScreen.Bounds;
            using (Bitmap bitmap = new Bitmap(bounds.Width, bounds.Height)) {
                using (Graphics g = Graphics.FromImage(bitmap)) {
                    g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size);
                }
                using (MemoryStream ms = new MemoryStream()) {
                    bitmap.Save(ms, ImageFormat.Png);
                    byte[] imageBytes = ms.ToArray();
                    return Convert.ToBase64String(imageBytes);
                }
            }
        } catch (Exception ex) {
            return "ERROR: " + ex.Message;
        }
    }

    public static bool FocusWindowByTitle(string titleSubstring) {
        IntPtr targetHwnd = IntPtr.Zero;
        AutomationElementCollection windows = AutomationElement.RootElement.FindAll(
            TreeScope.Children,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window)
        );

        foreach (AutomationElement win in windows) {
            string name = win.Current.Name;
            if (!string.IsNullOrEmpty(name) && name.IndexOf(titleSubstring, StringComparison.OrdinalIgnoreCase) >= 0) {
                targetHwnd = new IntPtr(win.Current.NativeWindowHandle);
                break;
            }
        }

        if (targetHwnd != IntPtr.Zero) {
            if (IsIconic(targetHwnd)) {
                ShowWindow(targetHwnd, SW_RESTORE);
            }
            SetForegroundWindow(targetHwnd);
            return true;
        }
        return false;
    }

    public static bool MinimizeWindowByTitle(string titleSubstring) {
        AutomationElementCollection windows = AutomationElement.RootElement.FindAll(
            TreeScope.Children,
            new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window)
        );

        foreach (AutomationElement win in windows) {
            string name = win.Current.Name;
            if (!string.IsNullOrEmpty(name) && name.IndexOf(titleSubstring, StringComparison.OrdinalIgnoreCase) >= 0) {
                IntPtr hwnd = new IntPtr(win.Current.NativeWindowHandle);
                ShowWindow(hwnd, SW_MINIMIZE);
                return true;
            }
        }
        return false;
    }

    public static void ClickAt(int x, int y) {
        SetCursorPos(x, y);
        System.Threading.Thread.Sleep(50);
        mouse_event(MOUSEEVENTF_LEFTDOWN | MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
    }

    public static void SendHotkey(string modifier, byte key) {
        byte modKey = 0;
        if (modifier == "WIN") modKey = 0x5B; // VK_LWIN
        else if (modifier == "ALT") modKey = 0x12; // VK_MENU
        else if (modifier == "CTRL") modKey = 0x11; // VK_CONTROL

        if (modKey != 0) keybd_event(modKey, 0, 0, 0);
        keybd_event(key, 0, 0, 0);
        System.Threading.Thread.Sleep(50);
        keybd_event(key, 0, KEYEVENTF_KEYUP, 0);
        if (modKey != 0) keybd_event(modKey, 0, KEYEVENTF_KEYUP, 0);
    }
}
"@

Add-Type -TypeDefinition $csharpSource -ReferencedAssemblies @("UIAutomationClient", "UIAutomationTypes", "System.Drawing", "System.Windows.Forms")
[NativeBridge]::Initialize()

function Execute-Command ($cmdObj) {
    $action = $cmdObj.action
    $params = $cmdObj.params

    switch ($action) {
        "MINIMIZE_ALL" {
            $shell = New-Object -ComObject Shell.Application
            $shell.MinimizeAll()
            return @{ success = $true; message = "Minimized all desktop windows" }
        }

        "MINIMIZE_WINDOW" {
            $title = $params.title
            $res = [NativeBridge]::MinimizeWindowByTitle($title)
            if ($res) {
                return @{ success = $true; message = "Minimized window matching '$title'" }
            } else {
                return @{ success = $false; message = "No active window found matching '$title'" }
            }
        }

        "FOCUS_WINDOW" {
            $title = $params.title
            $res = [NativeBridge]::FocusWindowByTitle($title)
            if ($res) {
                return @{ success = $true; message = "Brought window matching '$title' to foreground" }
            } else {
                return @{ success = $false; message = "Could not find window matching '$title'" }
            }
        }

        "LAUNCH_APP" {
            $appName = $params.appName
            try {
                $proc = Start-Process -FilePath $appName -PassThru
                return @{ success = $true; message = "Launched process '$appName' (PID: $($proc.Id))" }
            } catch {
                return @{ success = $false; message = "Failed to launch app '$appName': $_" }
            }
        }

        "PRESS_HOTKEY" {
            $modifier = $params.modifier # 'WIN', 'ALT', 'CTRL'
            $keyChar = $params.key      # 'd', 'r', 'tab', 'c', 'v'
            
            if ($modifier -eq "WIN" -and $keyChar -eq "d") {
                [NativeBridge]::SendHotkey("WIN", 0x44) # Win+D
                return @{ success = $true; message = "Triggered Win+D (Show Desktop)" }
            }
            if ($modifier -eq "WIN" -and $keyChar -eq "r") {
                [NativeBridge]::SendHotkey("WIN", 0x52) # Win+R
                return @{ success = $true; message = "Triggered Win+R (Run Dialog)" }
            }
            if ($modifier -eq "ALT" -and $keyChar -eq "tab") {
                [NativeBridge]::SendHotkey("ALT", 0x09) # Alt+Tab
                return @{ success = $true; message = "Triggered Alt+Tab" }
            }

            return @{ success = $false; message = "Unsupported hotkey combination" }
        }

        "UIA_CLICK" {
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

        "UIA_TYPE" {
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
            [System.Windows.Forms.SendKeys]::SendWait($text)
            return @{ success = $true; method = "SEND_INPUT"; message = "Typed text using SendKeys" }
        }

        "TAKE_SCREENSHOT" {
            $b64 = [NativeBridge]::CapturePrimaryScreenBase64()
            if ($b64.StartsWith("ERROR")) {
                return @{ success = $false; message = $b64 }
            }
            return @{ success = $true; base64 = $b64; message = "Captured desktop screenshot" }
        }

        "GET_WINDOWS" {
            $windowsList = @()
            $windows = [System.Windows.Automation.AutomationElement]::RootElement.FindAll(
                [System.Windows.Automation.TreeScope]::Children,
                (New-Object System.Windows.Automation.PropertyCondition([System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Window))
            )

            foreach ($win in $windows) {
                $winName = $win.Current.Name
                if (-not [string]::IsNullOrWhiteSpace($winName)) {
                    $rect = $win.Current.BoundingRectangle
                    $windowsList += @{
                        title = $winName
                        handle = $win.Current.NativeWindowHandle
                        bounds = @{ x = $rect.X; y = $rect.Y; width = $rect.Width; height = $rect.Height }
                    }
                }
            }
            return @{ success = $true; windows = $windowsList }
        }

        default {
            return @{ success = $false; message = "Unknown command action '$action'" }
        }
    }
}

# Main Execution Routine
try {
    if ($InputJson) {
        $jsonObj = $InputJson | ConvertFrom-Json
        $result = Execute-Command -cmdObj $jsonObj
        Write-Output ($result | ConvertTo-Json -Depth 5 -Compress)
    } else {
        Write-Output (@{ success = $false; message = "No InputJson provided" } | ConvertTo-Json -Compress)
    }
} catch {
    Write-Output (@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress)
}
