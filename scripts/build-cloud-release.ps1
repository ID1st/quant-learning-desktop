[CmdletBinding()]
param(
  [string]$OutputDirectory = "release/cloud"
)

$ErrorActionPreference = "Stop"
$workspaceRoot = Split-Path -Parent $PSScriptRoot
$resolvedOutput = Join-Path $workspaceRoot $OutputDirectory
New-Item -ItemType Directory -Force -Path $resolvedOutput | Out-Null

$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMddTHHmmssZ")
$temporaryArchive = Join-Path $resolvedOutput ".quant-auth-$timestamp.tar.gz"

Push-Location $workspaceRoot
try {
  & npm.cmd run build:admin-web
  if ($LASTEXITCODE -ne 0) {
    throw "admin web build failed with exit code $LASTEXITCODE"
  }

  & tar.exe `
    --exclude="node_modules" `
    --exclude="out" `
    --exclude="release" `
    --exclude=".git" `
    -czf $temporaryArchive `
    .dockerignore `
    package.json `
    package-lock.json `
    tsconfig.base.json `
    apps/cloud-server/Dockerfile `
    apps/cloud-server/package.json `
    apps/cloud-server/tsconfig.json `
    apps/cloud-server/migrations `
    apps/cloud-server/src `
    apps/admin-web/dist `
    packages/shared/package.json `
    packages/shared/src `
    deploy/cloud
  if ($LASTEXITCODE -ne 0) {
    throw "tar failed with exit code $LASTEXITCODE"
  }
}
finally {
  Pop-Location
}

$digest = (Get-FileHash -Algorithm SHA256 -LiteralPath $temporaryArchive).Hash.ToLowerInvariant()
$releaseId = "$timestamp-$($digest.Substring(0, 12))"
$archive = Join-Path $resolvedOutput "quant-auth-$releaseId.tar.gz"
Move-Item -LiteralPath $temporaryArchive -Destination $archive

[pscustomobject]@{
  releaseId = $releaseId
  archive = $archive
  sha256 = $digest
}
