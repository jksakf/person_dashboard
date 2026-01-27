# reproduce_issue.ps1
$ErrorActionPreference = "Continue"

# Setup Context
$Script:RootPath = Resolve-Path "."
$Script:Config = @{ OutputDirectory = "output" }

. "./modules/CostCalculator.ps1"

# Mock Get-TransactionData
function Get-TransactionData {
    param([string]$TargetDate)
    
    $data = @()
    # Mock Object Creation (HKD)
    $o1 = [PSCustomObject]@{
        '日期'  = "20240101"
        '代號'  = "01810"
        '名稱'  = "小米"
        '類別'  = "買進"
        '幣別'  = "HKD"
        '匯率'  = "4.0"
        '股數'  = "100"
        '總金額' = "1000"
    }
    $o2 = [PSCustomObject]@{
        '日期'  = "20240201"
        '代號'  = "01810"
        '名稱'  = "小米"
        '類別'  = "賣出"
        '幣別'  = "HKD"
        '匯率'  = "4.1"
        '股數'  = "100"
        '總金額' = "1500"
    }
    $data += $o1
    $data += $o2
    return $data
}

Write-Host "Running Report..."
$report = Get-PnLReport -TargetYear "ALL"

if ($report.Count -gt 0) {
    $r = $report[0]
    Write-Host "Stock: $($r.'股票名稱')"
    Write-Host "Cost : $($r.'總成本')"
    Write-Host "Sell : $($r.'賣出價')"
    Write-Host "PnL  : $($r.'已實現損益')"
}
else {
    Write-Host "No report."
}
