
$csvPath = "output/history_data/Transactions/transactions.csv"
Write-Host "Checking Separators in '$csvPath'" -ForegroundColor Cyan

# Read strictly as Default (since that's what worked)
$line = Get-Content -Path $csvPath -TotalCount 1 -Encoding Default
Write-Host "Header Line: $line"

# Helper to print char details
function Show-Chars ($str) {
    [char[]]$str | ForEach-Object {
        $otp = "Char: '$_' | Int: $([int]$_) | Hex: 0x$("{0:X}" -f [int]$_)"
        if ($_ -eq ',') { Write-Host $otp -ForegroundColor Green }
        elseif ($_ -eq "`t") { Write-Host $otp -ForegroundColor Magenta }
        else { Write-Host $otp -ForegroundColor Gray }
    }
}

Show-Chars $line

Write-Host "`nChecking Import-Csv behavior..."
$data = Import-Csv -Path $csvPath -Encoding Default -Delimiter "," | Select-Object -First 1
if ($data) {
    $props = $data.PSObject.Properties.Name
    Write-Host "Imported Properties count: $($props.Count)"
    foreach ($p in $props) {
        Write-Host " - Property: [$p]"
    }
}
