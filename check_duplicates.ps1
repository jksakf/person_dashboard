
# check_duplicates.ps1
$csvPath = "output/history_data/Transactions/transactions.csv"
$data = Import-Csv $csvPath -Encoding Unicode

Write-Host "Total Rows: $($data.Count)"

$grouped = $data | Group-Object "日期", "代號", "類別", "股數", "價格" | Where-Object { $_.Count -gt 1 }

if ($grouped) {
    Write-Host "⚠️ Found Duplicates:" -ForegroundColor Red
    foreach ($g in $grouped) {
        Write-Host "  Count: $($g.Count) | Key: $($g.Name)"
    }
}
else {
    Write-Host "✅ No full-row duplicates found." -ForegroundColor Green
}

# Also check simply by code/qty summation for visual verify
$data | Group-Object "代號" | ForEach-Object {
    $code = $_.Name
    $buy = ($_.Group | Where-Object { $_.類別 -match "買" } | Measure-Object -Property 股數 -Sum).Sum
    $sell = ($_.Group | Where-Object { $_.類別 -match "賣" } | Measure-Object -Property 股數 -Sum).Sum
    Write-Host "Code: $code | Buy: $buy | Sell: $sell | Net: $($buy - $sell)"
}
