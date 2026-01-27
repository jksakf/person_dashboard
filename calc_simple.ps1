$data = Import-Csv output/history_data/Transactions/transactions.csv -Encoding Unicode
$indices = @(53, 55, 56, 57, 59)

$qty = 0
$cost = 0.0

foreach ($i in $indices) {
    $t = $data[$i]
    $txQty = [int]$t.'股數'
    $txAmount = [double]$t.'總金額'
    $type = $t.'類別'
    
    if ($type -eq '買進') {
        $qty += $txQty
        $cost += $txAmount
    }
    elseif ($type -eq '賣出' -and $qty -gt 0) {
        $avg = $cost / $qty
        $cogs = $avg * $txQty
        Write-Host "COGS: $([math]::Round($cogs, 0))"
    }
}
