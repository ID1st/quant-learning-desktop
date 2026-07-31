[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$CurrentInstaller,

  [Parameter(Mandatory = $true)]
  [string]$CurrentApplication,

  [Parameter(Mandatory = $true)]
  [string]$PreviousInstaller,

  [Parameter(Mandatory = $true)]
  [string]$ProductName
)

$ErrorActionPreference = "Stop"
$temporaryRoot = [System.IO.Path]::GetFullPath([System.IO.Path]::GetTempPath()).TrimEnd("\")
$smokeRoot = [System.IO.Path]::GetFullPath(
  (Join-Path $temporaryRoot ("quant-release-smoke-" + [guid]::NewGuid().ToString("N")))
)
if (-not $smokeRoot.StartsWith($temporaryRoot + "\", [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Release smoke root must be inside the Windows temporary directory."
}

$installRoot = Join-Path $smokeRoot "application"
$userDataRoot = Join-Path $smokeRoot "user-data"
$probeOutput = Join-Path $smokeRoot "probe-output.log"
$probeError = Join-Path $smokeRoot "probe-error.log"
New-Item -ItemType Directory -Path $smokeRoot | Out-Null
New-Item -ItemType Directory -Path $userDataRoot | Out-Null

function Assert-ValidSignature {
  param([string]$Path)
  $signature = Get-AuthenticodeSignature -LiteralPath $Path
  if ($signature.Status -ne [System.Management.Automation.SignatureStatus]::Valid) {
    throw "Authenticode signature is $($signature.Status) for $([System.IO.Path]::GetFileName($Path))."
  }
}

function Invoke-Installer {
  param([string]$Path)
  $process = Start-Process `
    -FilePath $Path `
    -ArgumentList @("/S", "/D=$installRoot") `
    -PassThru `
    -Wait `
    -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Installer $([System.IO.Path]::GetFileName($Path)) exited with $($process.ExitCode)."
  }
}

function Get-InstalledApplication {
  $application = Join-Path $installRoot ($ProductName + ".exe")
  if (-not (Test-Path -LiteralPath $application -PathType Leaf)) {
    throw "Installed application executable was not found."
  }
  return $application
}

function Invoke-Uninstaller {
  $uninstaller = Get-ChildItem -LiteralPath $installRoot -File |
    Where-Object { $_.Name -like "Uninstall*.exe" } |
    Select-Object -First 1
  if (-not $uninstaller) {
    throw "NSIS uninstaller was not found."
  }
  $process = Start-Process `
    -FilePath $uninstaller.FullName `
    -ArgumentList "/S" `
    -PassThru `
    -Wait `
    -WindowStyle Hidden
  if ($process.ExitCode -ne 0) {
    throw "Uninstaller exited with $($process.ExitCode)."
  }
}

function Invoke-DuckDbProbe {
  param(
    [string]$Application,
    [ValidateSet("seed", "verify")]
    [string]$Mode
  )
  $previousUserData = $env:QUANT_RELEASE_SMOKE_USER_DATA
  $previousMode = $env:QUANT_RELEASE_SMOKE_MODE
  try {
    $env:QUANT_RELEASE_SMOKE_USER_DATA = $userDataRoot
    $env:QUANT_RELEASE_SMOKE_MODE = $Mode
    $process = Start-Process `
      -FilePath $Application `
      -ArgumentList "--release-smoke" `
      -PassThru `
      -Wait `
      -WindowStyle Hidden `
      -RedirectStandardOutput $probeOutput `
      -RedirectStandardError $probeError
    if ($process.ExitCode -ne 0) {
      throw "DuckDB $Mode probe exited with $($process.ExitCode)."
    }
    $output = Get-Content -LiteralPath $probeOutput -Raw
    if ($output -notmatch '"verified"\s*:\s*true') {
      throw "DuckDB $Mode probe did not confirm the persistence marker."
    }
  }
  finally {
    $env:QUANT_RELEASE_SMOKE_USER_DATA = $previousUserData
    $env:QUANT_RELEASE_SMOKE_MODE = $previousMode
  }
}

function Invoke-RollbackLaunch {
  param([string]$Application)
  $process = Start-Process `
    -FilePath $Application `
    -ArgumentList "--user-data-dir=$userDataRoot" `
    -PassThru `
    -WindowStyle Hidden
  if (-not $process.WaitForExit(8000)) {
    Stop-Process -Id $process.Id -Force
  }
  elseif ($process.ExitCode -ne 0) {
    throw "Rolled-back application exited with $($process.ExitCode)."
  }
}

try {
  Assert-ValidSignature $CurrentInstaller
  Assert-ValidSignature $CurrentApplication
  Assert-ValidSignature $PreviousInstaller

  # Clean install and uninstall the release candidate.
  Invoke-Installer $CurrentInstaller
  [void](Get-InstalledApplication)
  Invoke-Uninstaller

  # Upgrade from the previous signed release while preserving a DuckDB marker.
  Invoke-Installer $PreviousInstaller
  [void](Get-InstalledApplication)
  Invoke-DuckDbProbe -Application $CurrentApplication -Mode "seed"
  $databasePath = Join-Path $userDataRoot "data\market-cache.duckdb"
  if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
    throw "DuckDB market cache was not created before upgrade."
  }
  Invoke-Installer $CurrentInstaller
  $upgradedApplication = Get-InstalledApplication
  Invoke-DuckDbProbe -Application $upgradedApplication -Mode "verify"

  # Uninstall and reinstall the current release; userData must remain intact.
  Invoke-Uninstaller
  if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
    throw "DuckDB market cache was removed during uninstall."
  }
  Invoke-Installer $CurrentInstaller
  $reinstalledApplication = Get-InstalledApplication
  Invoke-DuckDbProbe -Application $reinstalledApplication -Mode "verify"

  # Roll back with the previous signed installer and prove it can still start.
  Invoke-Uninstaller
  Invoke-Installer $PreviousInstaller
  $rolledBackApplication = Get-InstalledApplication
  Invoke-RollbackLaunch $rolledBackApplication
  if (-not (Test-Path -LiteralPath $databasePath -PathType Leaf)) {
    throw "DuckDB market cache was lost during rollback."
  }
  Invoke-Uninstaller

  Write-Output "Windows release smoke passed: clean install, upgrade, DuckDB preservation, uninstall/reinstall, and rollback."
}
finally {
  if (
    (Test-Path -LiteralPath $smokeRoot) -and
    $smokeRoot.StartsWith($temporaryRoot + "\", [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    Remove-Item -LiteralPath $smokeRoot -Recurse -Force
  }
}
