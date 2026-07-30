[CmdletBinding()]
param(
  [ValidateRange(10, 300)]
  [int]$TimeoutSeconds = 90
)

$ErrorActionPreference = "Stop"
$auditProfileName = "quant-auth-codex"
$auditRegionId = "cn-hongkong"
$auditInstanceId = "i-j6c0kp5inx82hnn0f75w"
$auditCommandId = "c-hk06shckbtwjj7k"

$aliyunCommand = Get-Command aliyun -ErrorAction SilentlyContinue
if ($null -eq $aliyunCommand) {
  $fallback = Join-Path $env:LOCALAPPDATA "AliyunCLI\aliyun.exe"
  if (-not (Test-Path -LiteralPath $fallback -PathType Leaf)) {
    throw "Alibaba Cloud CLI was not found. Install it and restart the terminal."
  }
  $aliyun = $fallback
}
else {
  $aliyun = $aliyunCommand.Source
}

function Invoke-AliyunJson {
  param([Parameter(Mandatory)][string[]]$Arguments)

  $output = & $aliyun @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw ($output -join [Environment]::NewLine)
  }
  return (($output -join [Environment]::NewLine) | ConvertFrom-Json)
}

$invoke = Invoke-AliyunJson @(
  "ecs", "InvokeCommand",
  "--profile", $auditProfileName,
  "--RegionId", $auditRegionId,
  "--CommandId", $auditCommandId,
  "--InstanceId.1", $auditInstanceId,
  "--RepeatMode", "Once"
)
$invokeId = $invoke.InvokeId
if ([string]::IsNullOrWhiteSpace($invokeId)) {
  throw "Cloud Assistant did not return an invocation ID."
}

$deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
do {
  $result = Invoke-AliyunJson @(
    "ecs", "DescribeInvocationResults",
    "--profile", $auditProfileName,
    "--RegionId", $auditRegionId,
    "--InvokeId", $invokeId,
    "--InstanceId", $auditInstanceId
  )
  $items = @($result.Invocation.InvocationResults.InvocationResult)
  if ($items.Count -eq 1) {
    $item = $items[0]
    if ($item.InvokeRecordStatus -in @("Finished", "Stopped", "Failed") -or
        $item.InvocationStatus -in @("Success", "Failed", "Stopped")) {
      break
    }
  }
  Start-Sleep -Seconds 2
} while ([DateTimeOffset]::UtcNow -lt $deadline)

if ($items.Count -ne 1) {
  throw "No result was returned for Cloud Assistant invocation $invokeId."
}
if ([DateTimeOffset]::UtcNow -ge $deadline -and
    $item.InvocationStatus -notin @("Success", "Failed", "Stopped")) {
  throw "Timed out waiting for Cloud Assistant invocation $invokeId."
}

$decodedOutput = ""
if (-not [string]::IsNullOrWhiteSpace($item.Output)) {
  $decodedOutput = [Text.Encoding]::UTF8.GetString(
    [Convert]::FromBase64String($item.Output)
  )
}

[pscustomobject]@{
  InvokeId = $invokeId
  InstanceId = $auditInstanceId
  Status = $item.InvocationStatus
  ExitCode = $item.ExitCode
  Output = $decodedOutput.TrimEnd()
} | Format-List

if ($item.InvocationStatus -ne "Success" -or [int]$item.ExitCode -ne 0) {
  exit 1
}
