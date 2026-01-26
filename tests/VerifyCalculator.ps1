# tests/VerifyCalculator.ps1
$ErrorActionPreference = "Stop"

# Mock Config & Paths
$Script:RootPath = Split-Path $PSScriptRoot -Parent
$Script:Config = @{
    OutputDirectory = "output"
}

# Load Module
. (Join-Path $Script:RootPath "modules/CostCalculator.ps1")

# Mock Transactions CSV logic
function Set-MockData {
    param($csvContent)
    $mockDir = Join-Path $Script:RootPath "output/history_data/Transactions"
    if (-not (Test-Path $mockDir)) { New-Item -ItemType Directory -Path $mockDir -Force | Out-Null }
    $mockFile = Join-Path $mockDir "transactions.csv"
    $csvContent | Out-File -FilePath $mockFile -Encoding Unicode
}

# Define Test Scenario
# 1. Buy 1000 @ 100 (+Fee)
# 2. Buy 1000 @ 200 (+Fee)
# 3. Sell 1000 @ 150 (-Fee -Tax)

# Assume Config: Fee=0.001425, Tax=0.003
# T1: 1000*100 = 100,000. Fee = 142. Total = 100,142
# T2: 1000*200 = 200,000. Fee = 285. Total = 200,285
# Avg Cost Checked: TotalCost = 300,427. Qty=2000. Avg = 150.2135

# T3: Sell 1000 @ 150 = 150,000. Fee=213, Tax=450. Net = 149,337.
# COGS = 150.2135 * 1000 = 150,213.5
# PnL = 149,337 - 150,213.5 = -876.5 (Loss)

$csvHeader = "日期,代號,名稱,類別,價格,股數,手續費,交易稅,總金額,備註"
$t1 = "20260101,TEST,TestStock,買進,100,1000,142,0,100142,Init"
$t2 = "20260102,TEST,TestStock,買進,200,1000,285,0,200285,Add"
$t3 = "20260103,TEST,TestStock,賣出,150,1000,213,450,149337,SellHalf"

Set-MockData "$csvHeader`n$t1`n$t2`n$t3"

Write-Host "Running Calculator..." -ForegroundColor Cyan
$portfolio = Get-PortfolioStatus -TargetDate "20261231"
$p = $portfolio["TEST"]

Write-Host "Code: $($p.Code)"
Write-Host "Qty:  $($p.Quantity) (Expected 1000)"
Write-Host "Avg:  $($p.AvgCost) (Expected ~150.21)"
Write-Host "PnL:  $($p.RealizedPnL) (Expected ~ -876.5)"

if ($p.Quantity -eq 1000 -and $p.RealizedPnL -lt 0) {
    Write-Host "✅ Test Passed" -ForegroundColor Green
}
else {
    Write-Host "❌ Test Failed" -ForegroundColor Red
}
