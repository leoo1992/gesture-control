using System.Buffers.Binary;
using System.Globalization;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.Json;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Threading;
using Microsoft.Win32;

namespace GestureControl.Windows;

internal static class Program
{
    internal const string HostName = "com.leoo1992.gesture_control";
    internal const string ExtensionId = "omoapppjfbgjbbnheapehgcnllcanjfk";

    [STAThread]
    private static void Main(string[] args)
    {
        if (args.Contains("--uninstall", StringComparer.OrdinalIgnoreCase))
        {
            Installer.Uninstall();
            MessageBox.Show(
                "Gesture Control foi removido do Chrome e Edge.",
                "Gesture Control",
                MessageBoxButton.OK,
                MessageBoxImage.Information);
            return;
        }

        if (!Installer.IsNativeMessagingLaunch())
        {
            try
            {
                Installer.Install();
                MessageBox.Show(
                    "Gesture Control para Windows foi instalado.\n\nVolte ao navegador. O status deve mudar para “Controle global ativo”.\n\nAtalho de segurança: Ctrl + Alt + G pausa ou retoma o controle.",
                    "Gesture Control instalado",
                    MessageBoxButton.OK,
                    MessageBoxImage.Information);
            }
            catch (Exception ex)
            {
                MessageBox.Show(
                    $"Não foi possível instalar o Gesture Control.\n\n{ex.Message}",
                    "Gesture Control",
                    MessageBoxButton.OK,
                    MessageBoxImage.Error);
            }

            return;
        }

        var application = new Application
        {
            ShutdownMode = ShutdownMode.OnExplicitShutdown
        };

        var state = new GlobalControlState();
        var input = new InputController(state);
        var overlay = new OverlayWindow(state);
        var host = new NativeHost(overlay, input, state);

        overlay.Closed += (_, _) => application.Shutdown();
        overlay.Show();
        host.Start();

        application.Run();
    }
}

internal static class Installer
{
    private const uint FileTypePipe = 0x0003;
    private static readonly IntPtr InvalidHandleValue = new(-1);

    public static bool IsNativeMessagingLaunch()
    {
        var handle = GetStdHandle(-10);
        return handle != IntPtr.Zero &&
               handle != InvalidHandleValue &&
               GetFileType(handle) == FileTypePipe;
    }

    public static void Install()
    {
        var sourcePath = Environment.ProcessPath
            ?? throw new InvalidOperationException("Não foi possível localizar o executável atual.");

        var installDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "GestureControl");

        Directory.CreateDirectory(installDir);

        var installedExe = Path.Combine(installDir, "GestureControl.Windows.exe");
        var sourceFull = Path.GetFullPath(sourcePath);
        var targetFull = Path.GetFullPath(installedExe);

        if (!string.Equals(sourceFull, targetFull, StringComparison.OrdinalIgnoreCase))
        {
            File.Copy(sourceFull, targetFull, true);
        }

        var manifestPath = Path.Combine(installDir, $"{Program.HostName}.json");
        var manifest = JsonSerializer.Serialize(
            new
            {
                name = Program.HostName,
                description = "Gesture Control Windows native host",
                path = targetFull,
                type = "stdio",
                allowed_origins = new[]
                {
                    $"chrome-extension://{Program.ExtensionId}/"
                }
            },
            new JsonSerializerOptions { WriteIndented = true });

        File.WriteAllText(manifestPath, manifest, Encoding.UTF8);

        RegisterNativeHost(
            @"Software\Google\Chrome\NativeMessagingHosts\" + Program.HostName,
            manifestPath);

        RegisterNativeHost(
            @"Software\Microsoft\Edge\NativeMessagingHosts\" + Program.HostName,
            manifestPath);
    }

    public static void Uninstall()
    {
        Registry.CurrentUser.DeleteSubKeyTree(
            @"Software\Google\Chrome\NativeMessagingHosts\" + Program.HostName,
            false);

        Registry.CurrentUser.DeleteSubKeyTree(
            @"Software\Microsoft\Edge\NativeMessagingHosts\" + Program.HostName,
            false);

        var installDir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "GestureControl");

        try
        {
            Directory.Delete(installDir, true);
        }
        catch
        {
            // The running executable may still be locked. Registry removal is enough
            // to disable the native host immediately.
        }
    }

    private static void RegisterNativeHost(string keyPath, string manifestPath)
    {
        using var key = Registry.CurrentUser.CreateSubKey(keyPath, true)
            ?? throw new InvalidOperationException($"Não foi possível criar {keyPath}.");

        key.SetValue(string.Empty, manifestPath, RegistryValueKind.String);
    }

    [DllImport("kernel32.dll")]
    private static extern IntPtr GetStdHandle(int nStdHandle);

    [DllImport("kernel32.dll")]
    private static extern uint GetFileType(IntPtr hFile);
}

internal sealed class NativeHost
{
    private readonly Stream _input = Console.OpenStandardInput();
    private readonly Stream _output = Console.OpenStandardOutput();
    private readonly object _outputLock = new();
    private readonly OverlayWindow _overlay;
    private readonly InputController _inputController;
    private readonly GlobalControlState _state;

    public NativeHost(
        OverlayWindow overlay,
        InputController inputController,
        GlobalControlState state)
    {
        _overlay = overlay;
        _inputController = inputController;
        _state = state;
        _state.Changed += enabled =>
            SendMessage(new { type = "status", enabled });
    }

    public void Start()
    {
        SendMessage(new
        {
            type = "ready",
            version = 1,
            globalControl = true,
            enabled = _state.Enabled
        });

        _ = Task.Run(ReadLoopAsync);
    }

    private async Task ReadLoopAsync()
    {
        try
        {
            while (true)
            {
                var lengthBuffer = new byte[4];
                if (!await ReadExactlyAsync(_input, lengthBuffer))
                {
                    break;
                }

                var length = BinaryPrimitives.ReadInt32LittleEndian(lengthBuffer);

                if (length <= 0 || length > 1_048_576)
                {
                    break;
                }

                var payload = new byte[length];

                if (!await ReadExactlyAsync(_input, payload))
                {
                    break;
                }

                using var document = JsonDocument.Parse(payload);
                HandleMessage(document.RootElement);
            }
        }
        catch
        {
            // Chrome closes the pipes when the extension disconnects. The host
            // should simply terminate and remove the overlay.
        }
        finally
        {
            _overlay.Dispatcher.BeginInvoke(() =>
            {
                _overlay.Close();
                Application.Current?.Shutdown();
            });
        }
    }

    private void HandleMessage(JsonElement root)
    {
        if (!root.TryGetProperty("type", out var typeElement))
        {
            return;
        }

        var type = typeElement.GetString();

        switch (type)
        {
            case "ping":
                SendMessage(new
                {
                    type = "ready",
                    version = 1,
                    globalControl = true,
                    enabled = _state.Enabled
                });
                break;

            case "command":
                if (root.TryGetProperty("command", out var command))
                {
                    _inputController.Apply(command);
                }
                break;

            case "frame":
                if (root.TryGetProperty("frame", out var frame))
                {
                    HandleFrame(frame);
                }
                break;
        }
    }

    private void HandleFrame(JsonElement frame)
    {
        if (!frame.TryGetProperty("landmarks", out var landmarks) ||
            landmarks.ValueKind != JsonValueKind.Array)
        {
            return;
        }

        var points = new List<NormalizedPoint>(21);

        foreach (var point in landmarks.EnumerateArray())
        {
            if (!point.TryGetProperty("x", out var xElement) ||
                !point.TryGetProperty("y", out var yElement))
            {
                continue;
            }

            points.Add(new NormalizedPoint(
                Math.Clamp(xElement.GetDouble(), 0, 1),
                Math.Clamp(yElement.GetDouble(), 0, 1)));
        }

        _overlay.Dispatcher.BeginInvoke(() => _overlay.SetLandmarks(points));
    }

    private void SendMessage(object value)
    {
        try
        {
            var payload = JsonSerializer.SerializeToUtf8Bytes(value);
            Span<byte> length = stackalloc byte[4];
            BinaryPrimitives.WriteInt32LittleEndian(length, payload.Length);

            lock (_outputLock)
            {
                _output.Write(length);
                _output.Write(payload);
                _output.Flush();
            }
        }
        catch
        {
            // If stdout is closed Chrome has already disconnected.
        }
    }

    private static async Task<bool> ReadExactlyAsync(
        Stream stream,
        Memory<byte> buffer)
    {
        var offset = 0;

        while (offset < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer[offset..]);

            if (read == 0)
            {
                return false;
            }

            offset += read;
        }

        return true;
    }
}

internal sealed class GlobalControlState
{
    public bool Enabled { get; private set; } = true;

    public event Action<bool>? Changed;

    public void Toggle()
    {
        Enabled = !Enabled;
        Changed?.Invoke(Enabled);
    }
}

internal readonly record struct NormalizedPoint(double X, double Y);

internal sealed class OverlayWindow : Window
{
    private const int HotKeyId = 0x4743;
    private const uint ModAlt = 0x0001;
    private const uint ModControl = 0x0002;
    private const uint VkG = 0x47;

    private readonly HandOverlay _overlay;
    private readonly GlobalControlState _state;
    private HwndSource? _source;
    private DateTime _lastFrameAt = DateTime.MinValue;
    private readonly DispatcherTimer _staleTimer;

    public OverlayWindow(GlobalControlState state)
    {
        _state = state;
        _overlay = new HandOverlay(state);

        WindowStyle = WindowStyle.None;
        ResizeMode = ResizeMode.NoResize;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        Topmost = true;
        ShowInTaskbar = false;
        ShowActivated = false;
        Focusable = false;

        Left = SystemParameters.VirtualScreenLeft;
        Top = SystemParameters.VirtualScreenTop;
        Width = SystemParameters.VirtualScreenWidth;
        Height = SystemParameters.VirtualScreenHeight;

        Content = _overlay;

        SourceInitialized += OnSourceInitialized;
        Closed += OnClosed;

        _state.Changed += enabled =>
            Dispatcher.BeginInvoke(() => _overlay.SetPaused(!enabled));

        _staleTimer = new DispatcherTimer
        {
            Interval = TimeSpan.FromMilliseconds(250)
        };

        _staleTimer.Tick += (_, _) =>
        {
            if (_lastFrameAt != DateTime.MinValue &&
                DateTime.UtcNow - _lastFrameAt > TimeSpan.FromMilliseconds(850))
            {
                _overlay.SetLandmarks(Array.Empty<NormalizedPoint>());
                _lastFrameAt = DateTime.MinValue;
            }
        };

        _staleTimer.Start();
    }

    public void SetLandmarks(IReadOnlyList<NormalizedPoint> points)
    {
        _lastFrameAt = DateTime.UtcNow;
        _overlay.SetLandmarks(points);
    }

    private void OnSourceInitialized(object? sender, EventArgs e)
    {
        var hwnd = new WindowInteropHelper(this).Handle;
        var styles = GetWindowLongPtr(hwnd, -20).ToInt64();

        const long WsExTransparent = 0x00000020L;
        const long WsExToolWindow = 0x00000080L;
        const long WsExNoActivate = 0x08000000L;

        SetWindowLongPtr(
            hwnd,
            -20,
            new IntPtr(styles | WsExTransparent | WsExToolWindow | WsExNoActivate));

        _source = HwndSource.FromHwnd(hwnd);
        _source?.AddHook(WndProc);

        RegisterHotKey(hwnd, HotKeyId, ModControl | ModAlt, VkG);
    }

    private void OnClosed(object? sender, EventArgs e)
    {
        _staleTimer.Stop();

        var hwnd = new WindowInteropHelper(this).Handle;

        if (hwnd != IntPtr.Zero)
        {
            UnregisterHotKey(hwnd, HotKeyId);
        }

        _source?.RemoveHook(WndProc);
    }

    private IntPtr WndProc(
        IntPtr hwnd,
        int msg,
        IntPtr wParam,
        IntPtr lParam,
        ref bool handled)
    {
        const int WmHotKey = 0x0312;

        if (msg == WmHotKey && wParam.ToInt32() == HotKeyId)
        {
            _state.Toggle();
            handled = true;
        }

        return IntPtr.Zero;
    }

    [DllImport("user32.dll", EntryPoint = "GetWindowLongPtrW")]
    private static extern IntPtr GetWindowLongPtr(IntPtr hWnd, int nIndex);

    [DllImport("user32.dll", EntryPoint = "SetWindowLongPtrW")]
    private static extern IntPtr SetWindowLongPtr(
        IntPtr hWnd,
        int nIndex,
        IntPtr dwNewLong);

    [DllImport("user32.dll")]
    private static extern bool RegisterHotKey(
        IntPtr hWnd,
        int id,
        uint fsModifiers,
        uint vk);

    [DllImport("user32.dll")]
    private static extern bool UnregisterHotKey(IntPtr hWnd, int id);
}

internal sealed class HandOverlay : FrameworkElement
{
    private static readonly (int A, int B)[] Connections =
    [
        (0, 1), (1, 2), (2, 3), (3, 4),
        (0, 5), (5, 6), (6, 7), (7, 8),
        (5, 9), (9, 10), (10, 11), (11, 12),
        (9, 13), (13, 14), (14, 15), (15, 16),
        (13, 17), (17, 18), (18, 19), (19, 20), (0, 17)
    ];

    private IReadOnlyList<NormalizedPoint> _points = Array.Empty<NormalizedPoint>();
    private bool _paused;

    public HandOverlay(GlobalControlState state)
    {
        IsHitTestVisible = false;
        _paused = !state.Enabled;
    }

    public void SetLandmarks(IReadOnlyList<NormalizedPoint> points)
    {
        _points = points;
        InvalidateVisual();
    }

    public void SetPaused(bool paused)
    {
        _paused = paused;
        InvalidateVisual();
    }

    protected override void OnRender(DrawingContext drawingContext)
    {
        base.OnRender(drawingContext);

        if (_points.Count == 21)
        {
            var lineBrush = new SolidColorBrush(Color.FromRgb(0, 255, 59));
            var pointBrush = new SolidColorBrush(Color.FromRgb(255, 37, 37));
            var pen = new Pen(lineBrush, 3.4)
            {
                StartLineCap = PenLineCap.Round,
                EndLineCap = PenLineCap.Round,
                LineJoin = PenLineJoin.Round
            };

            lineBrush.Freeze();
            pointBrush.Freeze();
            pen.Freeze();

            foreach (var (a, b) in Connections)
            {
                drawingContext.DrawLine(
                    pen,
                    ToPoint(_points[a]),
                    ToPoint(_points[b]));
            }

            foreach (var point in _points)
            {
                drawingContext.DrawEllipse(
                    pointBrush,
                    null,
                    ToPoint(point),
                    5.0,
                    5.0);
            }
        }

        if (_paused)
        {
            var dpi = VisualTreeHelper.GetDpi(this);
            var text = new FormattedText(
                "GESTURE CONTROL PAUSADO · Ctrl + Alt + G para retomar",
                CultureInfo.GetCultureInfo("pt-BR"),
                FlowDirection.LeftToRight,
                new Typeface("Segoe UI Semibold"),
                18,
                Brushes.White,
                dpi.PixelsPerDip);

            var background = new SolidColorBrush(Color.FromArgb(210, 5, 7, 13));
            background.Freeze();

            drawingContext.DrawRoundedRectangle(
                background,
                new Pen(Brushes.OrangeRed, 1.5),
                new Rect(18, 18, text.Width + 30, text.Height + 20),
                12,
                12);

            drawingContext.DrawText(text, new Point(33, 28));
        }
    }

    private Point ToPoint(NormalizedPoint point) =>
        new(point.X * ActualWidth, point.Y * ActualHeight);
}

internal sealed class InputController
{
    private readonly GlobalControlState _state;

    public InputController(GlobalControlState state)
    {
        _state = state;
    }

    public void Apply(JsonElement command)
    {
        if (!_state.Enabled ||
            !command.TryGetProperty("action", out var actionElement))
        {
            return;
        }

        var action = actionElement.GetString();

        switch (action)
        {
            case "pointer":
                MovePointer(command);
                break;

            case "click":
                MovePointer(command);
                MouseClick();
                break;

            case "scroll":
                Scroll(command);
                break;

            case "history_back":
                SendChord([(ushort)0x12], 0x25);
                break;

            case "history_forward":
                SendChord([(ushort)0x12], 0x27);
                break;

            case "next_tab":
                SendChord([(ushort)0x11], 0x09);
                break;

            case "prev_tab":
                SendChord([(ushort)0x11, (ushort)0x10], 0x09);
                break;

            case "new_tab":
                SendChord([(ushort)0x11], 0x54);
                break;

            case "close_tab":
                SendChord([(ushort)0x11], 0x57);
                break;

            case "reload":
                SendChord([(ushort)0x11], 0x52);
                break;
        }
    }

    private static void MovePointer(JsonElement command)
    {
        if (!command.TryGetProperty("x", out var xElement) ||
            !command.TryGetProperty("y", out var yElement))
        {
            return;
        }

        var x = Math.Clamp(xElement.GetDouble(), 0, 1);
        var y = Math.Clamp(yElement.GetDouble(), 0, 1);

        var left = GetSystemMetrics(76);
        var top = GetSystemMetrics(77);
        var width = Math.Max(1, GetSystemMetrics(78));
        var height = Math.Max(1, GetSystemMetrics(79));

        var screenX = left + (int)Math.Round(x * (width - 1));
        var screenY = top + (int)Math.Round(y * (height - 1));

        SetCursorPos(screenX, screenY);
    }

    private static void MouseClick()
    {
        var inputs = new[]
        {
            MouseInput(0x0002, 0),
            MouseInput(0x0004, 0)
        };

        SendInput((uint)inputs.Length, inputs, Marshal.SizeOf<INPUT>());
    }

    private static void Scroll(JsonElement command)
    {
        if (!command.TryGetProperty("deltaY", out var deltaElement))
        {
            return;
        }

        var deltaY = deltaElement.GetInt32();

        if (deltaY == 0)
        {
            return;
        }

        var wheel = Math.Clamp(-deltaY, -360, 360);

        if (Math.Abs(wheel) < 30)
        {
            wheel = Math.Sign(wheel) * 30;
        }

        var inputs = new[]
        {
            MouseInput(0x0800, unchecked((uint)wheel))
        };

        SendInput(1, inputs, Marshal.SizeOf<INPUT>());
    }

    private static void SendChord(ushort[] modifiers, ushort key)
    {
        var inputs = new List<INPUT>();

        foreach (var modifier in modifiers)
        {
            inputs.Add(KeyInput(modifier, false));
        }

        inputs.Add(KeyInput(key, false));
        inputs.Add(KeyInput(key, true));

        for (var i = modifiers.Length - 1; i >= 0; i--)
        {
            inputs.Add(KeyInput(modifiers[i], true));
        }

        SendInput(
            (uint)inputs.Count,
            inputs.ToArray(),
            Marshal.SizeOf<INPUT>());
    }

    private static INPUT MouseInput(uint flags, uint data) =>
        new()
        {
            type = 0,
            U = new InputUnion
            {
                mi = new MOUSEINPUT
                {
                    dwFlags = flags,
                    mouseData = data
                }
            }
        };

    private static INPUT KeyInput(ushort key, bool keyUp) =>
        new()
        {
            type = 1,
            U = new InputUnion
            {
                ki = new KEYBDINPUT
                {
                    wVk = key,
                    dwFlags = keyUp ? 0x0002u : 0u
                }
            }
        };

    [StructLayout(LayoutKind.Sequential)]
    private struct INPUT
    {
        public uint type;
        public InputUnion U;
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct InputUnion
    {
        [FieldOffset(0)] public MOUSEINPUT mi;
        [FieldOffset(0)] public KEYBDINPUT ki;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct MOUSEINPUT
    {
        public int dx;
        public int dy;
        public uint mouseData;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    private struct KEYBDINPUT
    {
        public ushort wVk;
        public ushort wScan;
        public uint dwFlags;
        public uint time;
        public IntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern uint SendInput(
        uint nInputs,
        INPUT[] pInputs,
        int cbSize);

    [DllImport("user32.dll")]
    private static extern bool SetCursorPos(int x, int y);

    [DllImport("user32.dll")]
    private static extern int GetSystemMetrics(int nIndex);
}
