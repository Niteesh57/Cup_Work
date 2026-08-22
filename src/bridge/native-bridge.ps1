# Shared Native Windows API & UI Automation P/Invoke Layer

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

    public const uint MOUSEEVENTF_LEFTDOWN = 0x0002;
    public const uint MOUSEEVENTF_LEFTUP = 0x0004;
    public const uint MOUSEEVENTF_RIGHTDOWN = 0x0008;
    public const uint MOUSEEVENTF_RIGHTUP = 0x0010;
    public const uint MOUSEEVENTF_WHEEL = 0x0800;
    public const int WHEEL_DELTA = 120;

    [DllImport("user32.dll")]
    public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);

    [DllImport("user32.dll")]
    public static extern bool MoveWindow(IntPtr hWnd, int X, int Y, int nWidth, int nHeight, bool bRepaint);

    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern bool IsIconic(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    public static extern int GetWindowText(IntPtr hWnd, StringBuilder lpString, int nMaxCount);

    [DllImport("user32.dll")]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, int dwExtraInfo);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, IntPtr ProcessId);

    [DllImport("kernel32.dll")]
    public static extern uint GetCurrentThreadId();

    [DllImport("user32.dll")]
    public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);

    [DllImport("user32.dll")]
    public static extern bool BringWindowToTop(IntPtr hWnd);

    public delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);

    [DllImport("user32.dll")]
    public static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    public struct WindowEntry {
        public string Title;
        public IntPtr Handle;
        public RECT Bounds;
    }

    public const int SW_HIDE = 0;
    public const int SW_SHOWNORMAL = 1;
    public const int SW_SHOWMINIMIZED = 2;
    public const int SW_SHOWMAXIMIZED = 3;
    public const int SW_SHOW = 5;
    public const int SW_MINIMIZE = 6;
    public const int SW_RESTORE = 9;

    public const uint KEYEVENTF_KEYUP = 0x0002;

    public static void Initialize() {
        try {
            SetProcessDpiAwarenessContext(-4); // DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
        } catch {}
    }

    public static List<WindowEntry> GetTopLevelWindows() {
        List<WindowEntry> list = new List<WindowEntry>();
        EnumWindows((hWnd, lParam) => {
            if (IsWindowVisible(hWnd)) {
                StringBuilder sb = new StringBuilder(512);
                GetWindowText(hWnd, sb, 512);
                string title = sb.ToString().Trim();
                if (!string.IsNullOrEmpty(title)) {
                    RECT rect;
                    GetWindowRect(hWnd, out rect);
                    if (rect.Right > rect.Left && rect.Bottom > rect.Top) {
                        list.Add(new WindowEntry {
                            Title = title,
                            Handle = hWnd,
                            Bounds = rect
                        });
                    }
                }
            }
            return true;
        }, IntPtr.Zero);
        return list;
    }

    public static WindowEntry GetActiveWindowEntry() {
        IntPtr hWnd = GetForegroundWindow();
        if (hWnd != IntPtr.Zero) {
            StringBuilder sb = new StringBuilder(512);
            GetWindowText(hWnd, sb, 512);
            RECT rect;
            GetWindowRect(hWnd, out rect);
            return new WindowEntry {
                Title = sb.ToString().Trim(),
                Handle = hWnd,
                Bounds = rect
            };
        }
        return new WindowEntry { Title = "", Handle = IntPtr.Zero, Bounds = new RECT() };
    }

    public static bool RestoreWindowByTitle(string titleSubstring) {
        var windows = GetTopLevelWindows();
        foreach (var win in windows) {
            if (win.Title.IndexOf(titleSubstring, StringComparison.OrdinalIgnoreCase) >= 0) {
                ShowWindow(win.Handle, SW_RESTORE);
                return true;
            }
        }
        return false;
    }

    public static bool ResizeWindowByTitle(string titleSubstring, int x, int y, int width, int height) {
        var windows = GetTopLevelWindows();
        foreach (var win in windows) {
            if (win.Title.IndexOf(titleSubstring, StringComparison.OrdinalIgnoreCase) >= 0) {
                return MoveWindow(win.Handle, x, y, width, height, true);
            }
        }
        return false;
    }

    public static bool DragDrop(int x1, int y1, int x2, int y2) {
        SetCursorPos(x1, y1);
        System.Threading.Thread.Sleep(30);
        mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x1, (uint)y1, 0, 0);
        System.Threading.Thread.Sleep(60);
        int steps = 40;
        for (int i = 1; i <= steps; i++) {
            int mx = x1 + (x2 - x1) * i / steps;
            int my = y1 + (y2 - y1) * i / steps;
            SetCursorPos(mx, my);
            System.Threading.Thread.Sleep(8);
        }
        SetCursorPos(x2, y2);
        System.Threading.Thread.Sleep(30);
        mouse_event(MOUSEEVENTF_LEFTUP, (uint)x2, (uint)y2, 0, 0);
        return true;
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

    public static string CaptureRegionBase64(int x, int y, int width, int height) {
        try {
            if (width <= 0 || height <= 0) return "ERROR: invalid region dimensions";
            using (Bitmap bitmap = new Bitmap(width, height)) {
                using (Graphics g = Graphics.FromImage(bitmap)) {
                    g.CopyFromScreen(x, y, 0, 0, new Size(width, height));
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

    public static string GetPrimaryScreenResolution() {
        Rectangle bounds = Screen.PrimaryScreen.Bounds;
        return bounds.Width + "x" + bounds.Height;
    }

    public static bool FocusWindowByTitle(string titleSubstring, bool maximize = false) {
        IntPtr targetHwnd = IntPtr.Zero;
        var windows = GetTopLevelWindows();
        foreach (var win in windows) {
            if (win.Title.IndexOf(titleSubstring, StringComparison.OrdinalIgnoreCase) >= 0) {
                targetHwnd = win.Handle;
                break;
            }
        }

        // Fallback to UIA search
        if (targetHwnd == IntPtr.Zero) {
            try {
                AutomationElementCollection uiaWindows = AutomationElement.RootElement.FindAll(
                    TreeScope.Children,
                    new PropertyCondition(AutomationElement.ControlTypeProperty, ControlType.Window)
                );
                foreach (AutomationElement win in uiaWindows) {
                    string name = win.Current.Name;
                    if (!string.IsNullOrEmpty(name) && name.IndexOf(titleSubstring, StringComparison.OrdinalIgnoreCase) >= 0) {
                        targetHwnd = new IntPtr(win.Current.NativeWindowHandle);
                        break;
                    }
                }
            } catch {}
        }

        if (targetHwnd != IntPtr.Zero) {
            if (maximize) {
                ShowWindow(targetHwnd, SW_SHOWMAXIMIZED);
            } else if (IsIconic(targetHwnd)) {
                ShowWindow(targetHwnd, SW_RESTORE);
            } else {
                ShowWindow(targetHwnd, SW_SHOW);
            }

            try {
                uint foreThread = GetWindowThreadProcessId(GetForegroundWindow(), IntPtr.Zero);
                uint appThread = GetCurrentThreadId();
                if (foreThread != 0 && foreThread != appThread) {
                    AttachThreadInput(foreThread, appThread, true);
                    BringWindowToTop(targetHwnd);
                    SetForegroundWindow(targetHwnd);
                    AttachThreadInput(foreThread, appThread, false);
                } else {
                    BringWindowToTop(targetHwnd);
                    SetForegroundWindow(targetHwnd);
                }
            } catch {
                SetForegroundWindow(targetHwnd);
            }
            return true;
        }
        return false;
    }

    public static bool MaximizeWindowByTitle(string titleSubstring) {
        return FocusWindowByTitle(titleSubstring, true);
    }

    public static bool MinimizeWindowByTitle(string titleSubstring) {
        var windows = GetTopLevelWindows();
        foreach (var win in windows) {
            if (win.Title.IndexOf(titleSubstring, StringComparison.OrdinalIgnoreCase) >= 0) {
                ShowWindow(win.Handle, SW_MINIMIZE);
                return true;
            }
        }
        return false;
    }

    public static void MoveCursor(int x, int y) {
        MoveHumanized(x, y);
    }

    // Human-like cursor movement: a cubic Bezier path with slight overshoot /
    // jitter and variable speed so clicks feel natural instead of teleporting.
    private static void MoveHumanized(int targetX, int targetY) {
        System.Drawing.Point start = System.Windows.Forms.Cursor.Position;
        int sx = start.X, sy = start.Y;

        int dist = Math.Max(1, (int)Math.Sqrt((targetX - sx) * (targetX - sx) + (targetY - sy) * (targetY - sy)));
        // Larger moves take slightly longer but still feel quick.
        int steps = Math.Max(12, Math.Min(40, dist / 8));
        // Randomize control points a bit for a curved, human path.
        var rnd = new Random();
        int bendX = (sx + targetX) / 2 + rnd.Next(-dist / 6, dist / 6 + 1);
        int bendY = (sx + targetY) / 2 + rnd.Next(-dist / 6, dist / 6 + 1);
        int bendX2 = (sx + targetX) / 2 + rnd.Next(-dist / 8, dist / 8 + 1);
        int bendY2 = (sx + targetY) / 2 + rnd.Next(-dist / 8, dist / 8 + 1);

        for (int i = 1; i <= steps; i++) {
            double t = (double)i / steps;
            // Ease-out so the cursor slows down as it approaches the target.
            double e = 1 - (1 - t) * (1 - t) * (1 - t);
            double oneMinus = 1 - e;
            int px = (int)(oneMinus * oneMinus * oneMinus * sx
                        + 3 * oneMinus * oneMinus * e * bendX
                        + 3 * oneMinus * e * e * bendX2
                        + e * e * e * targetX);
            int py = (int)(oneMinus * oneMinus * oneMinus * sy
                        + 3 * oneMinus * oneMinus * e * bendY
                        + 3 * oneMinus * e * e * bendY2
                        + e * e * e * targetY);
            // Small jitter near the end looks human, but snap exactly on the last step.
            if (i < steps) {
                px += rnd.Next(-1, 2);
                py += rnd.Next(-1, 2);
            } else {
                px = targetX;
                py = targetY;
            }
            SetCursorPos(px, py);
            // Variable sleep: faster mid-path, brief pause right before the click.
            int sleepMs = (i < steps / 2) ? 4 : (i < steps - 3 ? 6 : 12);
            System.Threading.Thread.Sleep(sleepMs);
        }
    }

    public static void ClickMouse(int x, int y, string button) {
        MoveHumanized(x, y);
        System.Threading.Thread.Sleep(60 + new Random().Next(0, 80));
        if (button != null && button.Equals("right", StringComparison.OrdinalIgnoreCase)) {
            mouse_event(MOUSEEVENTF_RIGHTDOWN, (uint)x, (uint)y, 0, 0);
            System.Threading.Thread.Sleep(30);
            mouse_event(MOUSEEVENTF_RIGHTUP, (uint)x, (uint)y, 0, 0);
        } else if (button != null && button.Equals("double", StringComparison.OrdinalIgnoreCase)) {
            mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
            System.Threading.Thread.Sleep(30);
            mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
            System.Threading.Thread.Sleep(60);
            mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
            System.Threading.Thread.Sleep(30);
            mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
        } else {
            mouse_event(MOUSEEVENTF_LEFTDOWN, (uint)x, (uint)y, 0, 0);
            System.Threading.Thread.Sleep(30);
            mouse_event(MOUSEEVENTF_LEFTUP, (uint)x, (uint)y, 0, 0);
        }
    }

    public static void ClickAt(int x, int y) {
        ClickMouse(x, y, "left");
    }

    public static void ScrollMouse(int delta, int? x, int? y) {
        if (x.HasValue && y.HasValue) {
            SetCursorPos(x.Value, y.Value);
            System.Threading.Thread.Sleep(30);
        }
        int amount = delta * WHEEL_DELTA;
        mouse_event(MOUSEEVENTF_WHEEL, 0, 0, (uint)amount, 0);
    }

    public static void SendHotkey(string modifier, string keyStr) {
        string sendStr = "";
        string modPrefix = "";
        if (string.Equals(modifier, "CTRL", StringComparison.OrdinalIgnoreCase)) modPrefix = "^";
        else if (string.Equals(modifier, "ALT", StringComparison.OrdinalIgnoreCase)) modPrefix = "%";
        else if (string.Equals(modifier, "SHIFT", StringComparison.OrdinalIgnoreCase)) modPrefix = "+";
        else if (string.Equals(modifier, "WIN", StringComparison.OrdinalIgnoreCase)) {
            byte vk = 0;
            if (string.Equals(keyStr, "d", StringComparison.OrdinalIgnoreCase)) vk = 0x44;
            else if (string.Equals(keyStr, "r", StringComparison.OrdinalIgnoreCase)) vk = 0x52;
            else if (string.Equals(keyStr, "e", StringComparison.OrdinalIgnoreCase)) vk = 0x45;
            else if (string.Equals(keyStr, "l", StringComparison.OrdinalIgnoreCase)) vk = 0x4C;
            else if (keyStr.Length == 1) vk = (byte)char.ToUpper(keyStr[0]);

            if (vk != 0) {
                keybd_event(0x5B, 0, 0, 0);
                keybd_event(vk, 0, 0, 0);
                System.Threading.Thread.Sleep(50);
                keybd_event(vk, 0, KEYEVENTF_KEYUP, 0);
                keybd_event(0x5B, 0, KEYEVENTF_KEYUP, 0);
                return;
            }
        }

        if (keyStr.Length > 1) {
            sendStr = modPrefix + "{" + keyStr + "}";
        } else {
            sendStr = modPrefix + keyStr.ToLower();
        }

        System.Windows.Forms.SendKeys.SendWait(sendStr);
    }
}
"@

if (-not ([System.Management.Automation.PSTypeName]'NativeBridge').Type) {
    Add-Type -TypeDefinition $csharpSource -ReferencedAssemblies @("UIAutomationClient", "UIAutomationTypes", "System.Drawing", "System.Windows.Forms")
}
[NativeBridge]::Initialize()
