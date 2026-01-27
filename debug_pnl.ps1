$ErrorActionPreference = "Stop"
$Script:RootPath = Resolve-Path "$PSScriptRoot"
$Script:Config = @{ OutputDirectory = "output" }

. "$Script:RootPath/modules/CostCalculator.ps1"

Write-Host "=== Debug Get-PnLReport for 09660 ===" -ForegroundColor Cyan

$result = Get-PnLReport -TargetYear "ALL"

Write-Host "`nTotal records: $($result.Count)"

$horizon = $result | Where-Object { $_.'股票代號' -eq '09660' }

if ($horizon) {
    Write-Host "`nFound Horizon records:" -ForegroundColor Yellow
    $horizon | Format-Table -AutoSize
}
else {
    Write-Host "No Horizon records found in report" -ForegroundColor Red
}
