$data = Import-Csv output/history_data/Transactions/transactions.csv -Encoding Unicode

# Get rows by index (CSV row numbers are 1-indexed with header, array is 0-indexed)
# Row 54 = Index 53, Row 56 = Index 55, etc.
$indices = @(53, 55, 56, 57, 59)  # 54, 56, 57, 58, 60

Write-Host "=== Horizon Transactions (Rows 54, 56, 57, 58, 60) ===" -ForegroundColor Cyan

$horizonTx = @()
foreach ($i in $indices) {
    if ($i -lt $data.Count) {
        $horizonTx += $data[$i]
    }
}

Write-Host "`nExtracted $($horizonTx.Count) transactions:"
$horizonTx | Select-Object 日期, 代號, 名稱, 類別, 股數, 總金額 | Format-Table -AutoSize

# Manual calculation
Write-Host "`n=== Manual Average Cost Calculation ===" -ForegroundColor Yellow

$qty = 0
$cost = 0.0

foreach ($t in ($horizonTx | Sort-Object 日期)) {
    $txQty = [int]$t.'股數'
    $txAmount = [double]$t.'總金額'
    $type = $t.'類別'
    
    Write-Host "`n$($t.'日期') $type $txQty 股"
    
    if ($type -eq '買進') {
        $qty += $txQty
        $cost += $txAmount
        Write-Host "  累計: $qty 股, 成本 $cost"
    }
    elseif ($type -eq '賣出') {
        if ($qty -gt 0) {
            $avg = $cost / $qty
            $cogs = $avg * $txQty
            Write-Host "  平均成本: $([math]::Round($avg, 2)) 元/股"
            Write-Host "  總成本 (COGS): $([math]::Round($cogs, 0)) 元" -ForegroundColor Green
            Write-Host "  報表顯示: 33960 元" -ForegroundColor Red
            Write-Host "  差異: $([math]::Round(33960 - $cogs, 0)) 元"
            
            $qty -= $txQty
            $cost -= $cogs
            Write-Host "  剩餘: $qty 股, 成本 $([math]::Round($cost, 0))"
        }
    }
}
