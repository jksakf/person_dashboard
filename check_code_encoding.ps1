$data = Import-Csv output/history_data/Transactions/transactions.csv -Encoding Unicode

Write-Host "Checking all unique codes containing '09660':"

foreach ($row in $data) {
    $code = $row.'代號'
    if ($code -like '*09660*' -or $code -like '*660*') {
        Write-Host "`nFound:"
        Write-Host "  Code: [$code]"
        Write-Host "  Name: $($row.'名稱')"
        Write-Host "  Date: $($row.'日期')"
        Write-Host "  Type: $($row.'類別')"
        Write-Host "  Code Length: $($code.Length)"
        Write-Host "  Code Bytes: $([int[]][char[]]$code -join ',')"
        
        # Test exact match
        if ($code -eq '09660') {
            Write-Host "  EXACT MATCH!" -ForegroundColor Green
        }
        else {
            Write-Host "  NOT exact match" -ForegroundColor Red
        }
    }
}
