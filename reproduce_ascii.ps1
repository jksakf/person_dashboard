# reproduce_ascii.ps1
$ErrorActionPreference = "Continue"
$Script:RootPath = Resolve-Path "."
$Script:Config = @{ OutputDirectory = "output" }

. "./modules/CostCalculator.ps1"

function Get-TransactionData {
    param([string]$TargetDate)
    $data = @()
    # Cost 1000, Sell 1500, Rate 4.1
    $data += [PSCustomObject]@{ '日期' = "20240101"; '代號' = "01810"; '名稱' = "Xiaomi"; '類別' = "買進"; '幣別' = "HKD"; '匯率' = "4.0"; '股數' = "100"; '總金額' = "1000" }
    $data += [PSCustomObject]@{ '日期' = "20240201"; '代號' = "01810"; '名稱' = "Xiaomi"; '類別' = "賣出"; '幣別' = "HKD"; '匯率' = "4.1"; '股數' = "100"; '總金額' = "1500" }
    return $data
}

Write-Host "Running Report..."
$report = Get-PnLReport -TargetYear "ALL"

if ($report.Count -gt 0) {
    $r = $report[0]
    Write-Host "Cost : $($r.'總成本')"
    Write-Host "Sell : $($r.'賣出價')"
    Write-Host "PnL  : $($r.'已實現損益')"
}
else {
    Write-Host "No report."
}
