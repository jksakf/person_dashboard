$data = Import-Csv output/history_data/Transactions/transactions.csv -Encoding Unicode

Write-Host "=== All transactions sorted by date ===" -ForegroundColor Cyan
$data | Sort-Object { [datetime]::Parse($_.'日期') } | Format-Table 日期, 代號, 名稱, 類別, 股數, 總金額 -AutoSize | Out-String -Width 200

Write-Host "`n=== Searching for Horizon (09660) ===" -ForegroundColor Yellow
$horizon = $data | Where-Object { $_.'代號' -eq '09660' }

if ($horizon.Count -gt 0) {
    Write-Host "Found by code 09660:"
    $horizon | Format-Table 日期, 代號, 名稱, 類別, 股數, 總金額 -AutoSize
}
else {
    Write-Host "No transactions with code 09660"
    
    # Try searching all codes starting with 0
    Write-Host "`nTrying codes starting with '0':"
    $data | Where-Object { $_.'代號' -like '0*' } | Select-Object -First 5 | Format-Table 日期, 代號, 名稱, 類別 -AutoSize
}
