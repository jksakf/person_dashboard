$ErrorActionPreference = "Stop"
$Script:RootPath = Resolve-Path "$PSScriptRoot"
$Script:Config = @{ OutputDirectory = "output" }

. "$Script:RootPath/modules/CostCalculator.ps1"

Write-Host "=== Test Get-TransactionData ===" -ForegroundColor Cyan

$transactions = Get-TransactionData -TargetDate "20261231"

Write-Host "Total transactions: $($transactions.Count)"

$horizon = $transactions | Where-Object { $_.'代號' -eq '09660' }

Write-Host "Horizon transactions: $($horizon.Count)"

if ($horizon.Count -gt 0) {
    Write-Host "`nHorizon details:"
    $horizon | Select-Object 日期, 代號, 名稱, 類別, 股數, 總金額 | Format-Table -AutoSize
    
    Write-Host "`nGenerating PnL report for 2026..."
    $pnl = Get-PnLReport -TargetYear "2026"
    Write-Host "Total PnL records: $($pnl.Count)"
    
    $horizonPnL = $pnl | Where-Object { $_.'股票代號' -eq '09660' }
    if ($horizonPnL) {
        Write-Host "`nHorizon PnL:"
        $horizonPnL | Format-Table -AutoSize
    }
    else {
        Write-Host "No Horizon in PnL report" -ForegroundColor Yellow
    }
}
