# Maakt het icoon (icon.ico) en een snelkoppeling "Spaans oefenen" op het bureaublad.
$root = $PSScriptRoot
$ico  = Join-Path $root 'icon.ico'

# --- icoon tekenen: oranje afgerond vlak met een wit ¡ ---
Add-Type -AssemblyName System.Drawing
$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = 'AntiAlias'
$g.TextRenderingHint = 'AntiAliasGridFit'
$g.Clear([System.Drawing.Color]::Transparent)
$r = 56; $path = New-Object System.Drawing.Drawing2D.GraphicsPath
$path.AddArc(0, 0, $r, $r, 180, 90); $path.AddArc($size - $r, 0, $r, $r, 270, 90)
$path.AddArc($size - $r, $size - $r, $r, $r, 0, 90); $path.AddArc(0, $size - $r, $r, $r, 90, 90); $path.CloseFigure()
$g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(36, 72, 184))), $path)
$font = New-Object System.Drawing.Font('Segoe UI', 150, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'; $fmt.LineAlignment = 'Center'
$g.DrawString([string][char]0x00A1, $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF 0, 8, $size, $size), $fmt)
$g.Dispose()
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
$png = $ms.ToArray()
# ICO-bestand met daarin de PNG (werkt vanaf Windows Vista)
$fs = [System.IO.File]::Create($ico); $w = New-Object System.IO.BinaryWriter $fs
$w.Write([UInt16]0); $w.Write([UInt16]1); $w.Write([UInt16]1)
$w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0); $w.Write([Byte]0)
$w.Write([UInt16]1); $w.Write([UInt16]32); $w.Write([UInt32]$png.Length); $w.Write([UInt32]22)
$w.Write($png); $w.Close()

# --- snelkoppeling ---
$desktop = [Environment]::GetFolderPath('Desktop')
$lnk = Join-Path $desktop 'Spaans oefenen.lnk'
$sh = New-Object -ComObject WScript.Shell
$s = $sh.CreateShortcut($lnk)
$s.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$s.Arguments = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$root\start.ps1`""
$s.WorkingDirectory = $root
$s.IconLocation = "$ico,0"
$s.WindowStyle = 7
$s.Description = 'Spaans oefenen'
$s.Save()
Write-Output "Snelkoppeling gemaakt: $lnk"
