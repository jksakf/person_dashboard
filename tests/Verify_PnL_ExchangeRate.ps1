# tests/Verify_PnL_ExchangeRate.ps1
$ErrorActionPreference = "Stop"
$Script:RootPath = Resolve-Path "$PSScriptRoot/.."
$Script:Config = @{ OutputDirectory = "output" }

. "$Script:RootPath/modules/CostCalculator.ps1"

# Mock Get-TransactionData
function Get-TransactionData {
    param([string]$TargetDate)
    
    $data = @()
    # Mock HKD Transaction
    # Buy: 100 shares @ 10 HKD = 1000 Total. Rate 4.0
    # Sell: 100 shares @ 15 HKD = 1500 Total. Rate 4.1
    # PnL (Native) = 1500 - 1000 = 500 HKD
    # Expected TWD:
    # Cost = 1000 * 4.1 = 4100
    # Sell = 1500 * 4.1 = 6150
    # PnL  = 500  * 4.1 = 2050
    
    $data += [PSCustomObject]@{
        '日期'  = "20240101"
        '代號'  = "01810"
        '名稱'  = "小米"
        '類別'  = "買進"
        '幣別'  = "HKD"
        '匯率'  = "4.0"
        '股數'  = "100"
        '總金額' = "1000"
    }
    $data += [PSCustomObject]@{
        '日期'  = "20240201"
        '代號'  = "01810"
        '名稱'  = "小米"
        '類別'  = "賣出"
        '幣別'  = "HKD"
        '匯率'  = "4.1"
        '股數'  = "100"
        '總金額' = "1500"
    }
    return $data
}

Write-Host ">>> Running PnL Report Verification..."
$report = Get-PnLReport -TargetYear "ALL"

if ($report.Count -gt 0) {
    $r = $report[0]
    Write-Host "Stock: $($r.'股票名稱')"
    Write-Host "Cost : $($r.'總成本')"
    Write-Host "Sell : $($r.'賣出價')"
    Write-Host "PnL  : $($r.'已實現損益')"

    # Verification Logic
    if ($r.'已實現損益' -eq 2050) {
        Write-Host "SUCCESS: PnL converted correctly (2050 TWD)." -ForegroundColor Green
    }
    elseif ($r.'已實現損益' -eq 500) {
        Write-Host "FAILURE: PnL is native (500 HKD). Conversion missing." -ForegroundColor Red
    }
    else {
        Write-Host "FAILURE: Unexpected value ($($r.'已實現損益'))." -ForegroundColor Red
    }
}
else {
    Write-Error "No report generated."
}
