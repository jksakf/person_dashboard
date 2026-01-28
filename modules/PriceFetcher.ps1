# Modules/PriceFetcher.ps1

function Get-RealTimePrice {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Code,

        [Parameter(Mandatory = $false)]
        [string]$MarketType = "台股" # 預設台股
    )

    try {
        # Safe Match for "台股" (台=53F0, 股=80A1)
        # Also support standard codes
        if ($MarketType -in "TW", "TSE", "OTC", "ETF" -or $MarketType -match [char]0x53F0) {
            return Get-TwsePrice -Code $Code
        }
        # Safe Match for "港股" (港=6E2F)
        elseif ($MarketType -match "HK" -or $MarketType -match [char]0x6E2F) {
            # Use Stooq as primary for HK (More reliable without key)
            $price = Get-StooqPrice -Code $Code
            if (-not $price) {
                Write-Log "Stooq HK failed for $Code, fallback to Yahoo" -Level Warning
                $price = Get-YahooPrice -Code $Code -MarketType $MarketType
            }
            return $price
        }
        # 美股 (美=7F8E)
        elseif ($MarketType -match "US" -or $MarketType -match [char]0x7F8E) {
            # Primary: Use Stooq (more stable, no key required)
            $price = Get-StooqUSPrice -Code $Code
            if (-not $price) {
                # Fallback: Yahoo (if Stooq fails)
                Write-Log "Stooq US failed for $Code, fallback to Yahoo" -Level Debug
                $price = Get-YahooPrice -Code $Code -MarketType $MarketType
            }
            return $price
        }
        else {
            Write-Log "不支援的市場類型: $MarketType" -Level Warning
            return $null
        }
    }
    catch {
        Write-Log "抓取股價失敗 ($Code): $_" -Level Warning
        return $null
    }
}

function Get-StooqPrice {
    param ([string]$Code)
    
    # Stooq format: 1810.HK (Uppdercase, no leading zero)
    $cleanCode = [int]$Code
    $symbol = "${cleanCode}.HK"
    
    $url = "https://stooq.com/q/l/?s=$symbol&f=sd2t2ohlc&h&e=csv"
    
    try {
        $content = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = "Mozilla/5.0" } -UseBasicParsing -ErrorAction Stop
        $csvText = $content.Content
        
        $lines = $csvText -split "`n"
        if ($lines.Count -ge 2) {
            $dataLine = $lines[1]
            $cols = $dataLine -split ","
            if ($cols.Count -ge 7) {
                $close = $cols[6]
                if ($close -and $close -ne "N/D" -and $close -ne "ND") {
                    $val = 0.0
                    if ([double]::TryParse($close, [ref]$val)) {
                        return $val
                    }
                }
            }
        }
    }
    catch {
        Write-Log "Stooq API Error ($symbol): $_" -Level Debug
    }
    
    return $null
}

function Get-StooqUSPrice {
    param ([string]$Code)
    
    # Stooq format for US stocks: AAPL.US, NVDA.US
    $symbol = "${Code}.US"
    
    $url = "https://stooq.com/q/l/?s=$symbol&f=sd2t2ohlc&h&e=csv"
    
    try {
        $content = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = "Mozilla/5.0" } -UseBasicParsing -ErrorAction Stop
        $csvText = $content.Content
        
        $lines = $csvText -split "`n"
        if ($lines.Count -ge 2) {
            $dataLine = $lines[1]
            $cols = $dataLine -split ","
            if ($cols.Count -ge 7) {
                $close = $cols[6]
                if ($close -and $close -ne "N/D" -and $close -ne "ND") {
                    $val = 0.0
                    if ([double]::TryParse($close, [ref]$val)) {
                        return $val
                    }
                }
            }
        }
    }
    catch {
        Write-Log "Stooq US API Error ($symbol): $_" -Level Debug
    }
    
    return $null
}

function Get-TwsePrice {
    param ([string]$Code)

    # TWSE MIS API 
    $ts = [int][double]::Parse((Get-Date -UFormat %s)) * 1000
    $url = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${Code}.tw|otc_${Code}.tw&json=1&delay=0&_=$ts"

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
        
        if ($response.msgArray -and $response.msgArray.Count -gt 0) {
            $data = $response.msgArray | Where-Object { $_.z -ne "-" } | Select-Object -First 1
            if (-not $data) {
                $data = $response.msgArray[0]
            }

            $price = $data.z 
            if ($price -eq "-") { $price = $data.y } 

            if ($price -and $price -ne "-") {
                return [double]$price
            }
        }
    }
    catch {
        Write-Log "TWSE API Error: $_" -Level Debug
    }

    return $null
}

function Get-YahooPrice {
    param (
        [string]$Code,
        [string]$MarketType
    )

    $symbol = $Code
    # Safe Match for "港股" (港=6E2F)
    if ($MarketType -match "HK" -or $MarketType -match [char]0x6E2F) {
        # Yahoo Finance expects HK tickers without leading zeros (e.g. 01810 -> 1810.HK)
        $cleanCode = [int]$Code
        $symbol = "${cleanCode}.HK"
    }
    
    # 支援 FX 模式
    if ($MarketType -eq "FX") {
        $symbol = $Code # 直接使用傳入的代號 (e.g. HKDTWD=X)
    }

    $url = "https://query1.finance.yahoo.com/v8/finance/chart/$symbol?interval=1d&range=1d"
    $headers = @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" }

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -Headers $headers -ErrorAction Stop
        
        if ($response.chart.result) {
            $meta = $response.chart.result[0].meta
            $price = $meta.regularMarketPrice
            return [double]$price
        }
    }
    catch {
        Write-Log "Yahoo API Error ($symbol): $_" -Level Debug
        
        # Fallback: HTML Scraping
        Write-Host "   ⚠️ API 失敗，嘗試網頁抓取..." -NoNewline
        return Get-YahooPriceScrape -Code $symbol
    }

    return $null
}

function Get-YahooPriceScrape {
    param ($Code)
    $url = "https://finance.yahoo.com/quote/$Code"
    try {
        $html = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" } -UseBasicParsing -ErrorAction Stop
        $content = $html.Content
        
        # Try fin-streamer regex
        if ($content -match '<fin-streamer[^>]*data-field="regularMarketPrice"[^>]*value="([\d\.]+)"') {
            return [double]$matches[1]
        }
        # Try JSON regex
        if ($content -match '"regularMarketPrice":{"raw":([\d\.]+),') {
            return [double]$matches[1]
        }
    }
    catch {
        Write-Log "Yahoo Scraping Error ($Code): $_" -Level Debug
    }
    return $null
}

function Get-ExchangeRate {
    param (
        [string]$FromCurrency,
        [string]$ToCurrency = "TWD"
    )

    if ($FromCurrency -eq $ToCurrency) { return 1.0 }

    # Stooq FX symbol: HKDTWD, USDTWD
    $symbol = "${FromCurrency}${ToCurrency}"
    
    $url = "https://stooq.com/q/l/?s=$symbol&f=sd2t2ohlc&h&e=csv"
    
    try {
        $content = Invoke-WebRequest -Uri $url -Headers @{ "User-Agent" = "Mozilla/5.0" } -UseBasicParsing -ErrorAction Stop
        $csvText = $content.Content
        
        $lines = $csvText -split "`n"
        if ($lines.Count -ge 2) {
            $dataLine = $lines[1]
            $cols = $dataLine -split ","
            if ($cols.Count -ge 7) {
                $close = $cols[6]
                if ($close -and $close -ne "N/D" -and $close -ne "ND") {
                    $val = 0.0
                    if ([double]::TryParse($close, [ref]$val)) {
                        return $val
                    }
                }
            }
        }
    }
    catch {
        Write-Log "Stooq FX Error ($symbol): $_" -Level Debug
    }
    
    # Fallback to Yahoo (Format: HKDTWD=X)
    Generate-YahooFX -From $FromCurrency -To $ToCurrency
    
    return $null
}

function Generate-YahooFX {
    param ($From, $To)
    $symbol = "${From}${To}=X"
    Write-Log "Fallback FX to Yahoo: $symbol" -Level Debug
    return Get-YahooPrice -Code $symbol -MarketType "FX"
}
