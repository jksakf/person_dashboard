
# debug_fx.ps1
# Test Stooq FX symbols

$pairs = @("HKDTWD", "USDTWD", "HKDTWD.v")

foreach ($p in $pairs) {
    $url = "https://stooq.com/q/l/?s=$p&f=sd2t2ohlc&h&e=csv"
    Write-Host "Testing $p ($url) ... " -NoNewline
    try {
        $content = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = "Mozilla/5.0" } -UseBasicParsing -ErrorAction Stop
        $csvText = $content.Content
        $lines = $csvText -split "`n"
        if ($lines.Count -ge 2) {
            $cols = $lines[1] -split ","
            if ($cols.Count -ge 7) {
                $close = $cols[6]
                if ($close -ne "N/D") {
                    Write-Host "✅ OK: $close" -ForegroundColor Green
                }
                else {
                    Write-Host "❌ N/D" -ForegroundColor Yellow
                }
            }
            else {
                Write-Host "❌ Format Error" -ForegroundColor Red
            }
        }
        else {
            Write-Host "❌ Empty" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "🔥 Error: $_" -ForegroundColor Red
    }
}
