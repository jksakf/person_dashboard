
$csvPath = "output/history_data/Transactions/transactions.csv"
Write-Host "Diagnostic: Deep Inspection for '$csvPath'" -ForegroundColor Cyan

$encodings = @("Unicode", "Default", "UTF8")

foreach ($enc in $encodings) {
    Write-Host "`n[$enc]" -ForegroundColor Yellow
    try {
        $firstLine = Get-Content -Path $csvPath -TotalCount 1 -Encoding $enc -ErrorAction Stop
        Write-Host "Raw Line 1: $firstLine"
        
        # Check bytes of first line to see BOM
        $bytes = [System.Text.Encoding]::GetEncoding($enc).GetBytes($firstLine)
        $hex = ($bytes | ForEach-Object { "{0:X2}" -f $_ }) -join " "
        Write-Host "Hex (First 30 bytes): $($hex.Substring(0, [math]::Min($hex.Length, 90)))" -ForegroundColor Gray

        # Import 
        $data = Import-Csv -Path $csvPath -Encoding $enc -Delimiter "," | Select-Object -First 1
        if (-not $data) {
            # Try Tab
            $data = Import-Csv -Path $csvPath -Encoding $enc -Delimiter "`t" | Select-Object -First 1
            if ($data) { Write-Host "  -> Successfully read with TAB delimiter" -ForegroundColor Green }
        }
        else {
            Write-Host "  -> Successfully read with COMMA delimiter" -ForegroundColor Green
        }

        if ($data) {
            $props = $data.PSObject.Properties.Name
            foreach ($p in $props) {
                # Print each char code to see hidden chars
                $charCodes = [char[]]$p | ForEach-Object { [int]$_ }
                Write-Host "  Property: '$p' (Codes: $($charCodes -join ' '))"
            }
        }
        else {
            Write-Host "  FAILED to import object." -ForegroundColor Red
        }

    }
    catch {
        Write-Host "  Error: $_" -ForegroundColor Red
    }
}
