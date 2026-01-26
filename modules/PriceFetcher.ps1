# Modules/PriceFetcher.ps1

function Get-RealTimePrice {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Code,

        [Parameter(Mandatory = $false)]
        [string]$MarketType = "台股" # 預設台股
    )

    try {
        if ($MarketType -in "台股", "TW", "TSE", "OTC") {
            return Get-TwsePrice -Code $Code
        }
        elseif ($MarketType -match "港股|HK" -or $MarketType -match "美股|US") {
            return Get-YahooPrice -Code $Code -MarketType $MarketType
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

function Get-TwsePrice {
    param ([string]$Code)

    # TWSE MIS API (基本市況報導網站)
    # 嘗試同時查詢上市(tse)與上櫃(otc)
    $ts = [int][double]::Parse((Get-Date -UFormat %s)) * 1000
    $url = "https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${Code}.tw|otc_${Code}.tw&json=1&delay=0&_=$ts"

    try {
        $response = Invoke-RestMethod -Uri $url -Method Get -ErrorAction Stop
        
        if ($response.msgArray -and $response.msgArray.Count -gt 0) {
            # 找到有效資料 (z=成交價, y=昨收)
            # 優先找有成交價的
            $data = $response.msgArray | Where-Object { $_.z -ne "-" } | Select-Object -First 1
            
            # 如果盤中沒有成交價(z)，改用昨收(y)或最佳買賣價? 
            # 通常至少會有 y (昨收)
            # 但我們要的是 "Current Price"
            
            if (-not $data) {
                # 可能是剛開盤或沒成交，回退到第一筆資料
                $data = $response.msgArray[0]
            }

            $price = $data.z # 成交價
            if ($price -eq "-") { $price = $data.y } # 若無成交，用昨收

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
    if ($MarketType -match "港股|HK") {
        # 港股代號通常是 4 碼，Yahoo 需要 .HK 後綴
        # 轉成整數再轉字串可去零? 不，Yahoo 0700.HK
        $symbol = "${Code}.HK"
    }
    # 美股通常直接用代號 (AAPL, NVDA)

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
    }

    return $null
}


