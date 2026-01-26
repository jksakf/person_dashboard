
$csvPath = "output/history_data/Transactions/transactions.csv"
Write-Host "Diagnostic: Checking CSV Encoding for '$csvPath'" -ForegroundColor Cyan

$encodings = @("Unicode", "UTF8", "Default")

foreach ($enc in $encodings) {
    Write-Host "`n------------------------------------------------"
    Write-Host "Testing Encoding: [$enc]" -ForegroundColor Yellow
    try {
        $content = Get-Content -Path $csvPath -TotalCount 1 -Encoding $enc -ErrorAction Stop
        Write-Host "First Line Content: $content"
        
        $data = Import-Csv -Path $csvPath -Encoding $enc | Select-Object -First 1
        if ($data) {
            $props = $data.PSObject.Properties.Name -join ", "
            Write-Host "Detected Properties: $props" -ForegroundColor Green
            
            if ($props -match "日期" -and $props -match "代號") {
                Write-Host "✅ SUCCESS: Found correct headers!" -ForegroundColor Green
            }
            else {
                Write-Host "❌ FAILED: Headers likely garbled." -ForegroundColor Red
            }
        }
        else {
            Write-Host "❌ FAILED: No object imported." -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ ERROR: $_" -ForegroundColor Red
    }
}
