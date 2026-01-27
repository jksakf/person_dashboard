# Simulate exact cost calculation with all transactions
Write-Host "=== Simulating Average Cost Method ===" -ForegroundColor Cyan

$portfolio_qty = 0
$portfolio_cost = 0.0

# Transaction 1: 2025/03/04 Buy 600
Write-Host "`n[1] 2025/03/04 買入 600股, 成本 23298"
$portfolio_qty += 600
$portfolio_cost += 23298
Write-Host "  庫存: $portfolio_qty 股, 總成本: $portfolio_cost"

# Transaction 2: 2025/03/26 Sell 600? (suspicious)
Write-Host "`n[2] 2025/03/26 賣出 600股"
$avg = $portfolio_cost / $portfolio_qty
$cogs = $avg * 600
Write-Host "  平均成本: $([math]::Round($avg, 2))"
Write-Host "  COGS: $([math]::Round($cogs, 0))"
$portfolio_qty -= 600
$portfolio_cost -= $cogs
Write-Host "  剩餘庫存: $portfolio_qty 股, 總成本: $([math]::Round($portfolio_cost, 0))"

# Transaction 3: 2025/05/26 Buy 600
Write-Host "`n[3] 2025/05/26 買入 600股, 成本 17383"
$portfolio_qty += 600
$portfolio_cost += 17383
Write-Host "  庫存: $portfolio_qty 股, 總成本: $portfolio_cost"

# Transaction 4: 2025/06/13 Buy 1200
Write-Host "`n[4] 2025/06/13 買入 1200股, 成本 31823"
$portfolio_qty += 1200
$portfolio_cost += 31823
Write-Host "  庫存: $portfolio_qty 股, 總成本: $portfolio_cost"

# Transaction 5: 2025/06/13 Buy 1800
Write-Host "`n[5] 2025/06/13 買入 1800股, 成本 46355"
$portfolio_qty += 1800
$portfolio_cost += 46355
Write-Host "  庫存: $portfolio_qty 股, 總成本: $portfolio_cost"

# Transaction 6: 2025/09/12 Buy 200
Write-Host "`n[6] 2025/09/12 買入 200股, 成本 29395"
$portfolio_qty += 200
$portfolio_cost += 29395
Write-Host "  庫存: $portfolio_qty 股, 總成本: $portfolio_cost"

# Transaction 7: 2026/01/07 Sell 1200
Write-Host "`n[7] 2026/01/07 賣出 1200股" -ForegroundColor Yellow
$avg = $portfolio_cost / $portfolio_qty
$cogs = $avg * 1200
Write-Host "  平均成本: $([math]::Round($avg, 2))"
Write-Host "  COGS (總成本): $([math]::Round($cogs, 0))" -ForegroundColor Green
Write-Host "  報表顯示: 33960" -ForegroundColor Red
Write-Host "  差異: $([math]::Round(33960 - $cogs, 0))"
