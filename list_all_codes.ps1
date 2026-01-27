$data = Import-Csv output/history_data/Transactions/transactions.csv -Encoding Unicode

Write-Host "All unique stock codes:"
$codes = $data | Select-Object -ExpandProperty '代號' -Unique | Sort-Object

$count = 0
foreach ($code in $codes) {
    $count++
    $name = ($data | Where-Object { $_.'代號' -eq $code } | Select-Object -First 1).'名稱'
    Write-Host "  $count. [$code] - $name"
    
    # Check for Horizon
    if ($name -like '*地平線*' -or $name -like '*機器人*') {
        Write-Host "    ^^ THIS IS HORIZON! Code: [$code], Length: $($code.Length)" -ForegroundColor Yellow
    }
}
