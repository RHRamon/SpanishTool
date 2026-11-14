# Start de Spaanstool: zet het opslagprogramma aan (als het nog niet draait) en opent de app in een eigen venster.
$root = $PSScriptRoot
$url  = 'http://127.0.0.1:8790/'

function Test-Up {
  try { (Invoke-WebRequest -UseBasicParsing -Uri ($url + 'api/ping') -TimeoutSec 1).StatusCode -eq 200 } catch { $false }
}

if (-not (Test-Up)) {
  $node = (Get-Command node -ErrorAction SilentlyContinue).Source
  if (-not $node) {
    Add-Type -AssemblyName PresentationFramework
    [System.Windows.MessageBox]::Show('Node.js is niet gevonden. Installeer Node.js (nodejs.org) en probeer het opnieuw.', 'Spaanstool') | Out-Null
    exit 1
  }
  Start-Process -FilePath $node -ArgumentList "`"$root\server.js`"" -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 50 -and -not (Test-Up); $i++) { Start-Sleep -Milliseconds 150 }
}

$browsers = @(
  "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
  "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
  "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe"
)
$browser = $browsers | Where-Object { Test-Path $_ } | Select-Object -First 1
if ($browser) { Start-Process -FilePath $browser -ArgumentList "--app=$url" }
else { Start-Process $url }
