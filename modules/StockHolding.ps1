# Modules/StockHolding.ps1

function Invoke-StockHoldingFlow {
    Write-Log ">>> 正在啟動 [股票庫存] 模組..." -Level Info
    
    $data = [System.Collections.ArrayList]::new()
    $defaultDate = Get-Date -Format "yyyyMMdd"
    $stocks = Load-StockList

    # 1. 輸入日期
    $inputDate = Get-ValidDate -DefaultDate $defaultDate
    $dateStr = [datetime]::ParseExact($inputDate, "yyyyMMdd", $null).ToString("yyyy/MM/dd")

    # 2. 自動取得庫存狀態
    Write-Host "🔄 正在從交易紀錄計算庫存狀態..." -ForegroundColor Cyan
    try {
        $portfolio = Get-PortfolioStatus -TargetDate $inputDate
    }
    catch {
        Write-Log "計算失敗或尚未載入模組: $_" -Level Error
        $portfolio = @{}
    }

    # 3. 處理已存在的庫存 (依代號排序)
    $sortedCodes = $portfolio.Keys | Sort-Object
    foreach ($code in $sortedCodes) {
        $p = $portfolio[$code]
        if ($p.Quantity -le 0) { continue }

        # --- 預先處理幣別與匯率 (為了正確顯示成本) ---
        # 1. 判斷市場類型
        # 這裡需要匹配 stock_list.txt 裡的 "市場/類別"
        $market = "台股"
        $foundConfig = $stocks | Where-Object { $_.Code -eq $code } | Select-Object -First 1
        if ($foundConfig) { $market = $foundConfig.Type }

        # 2. 判斷幣別狀況
        $dataCurrency = if ($p.Currency) { $p.Currency.Trim() } else { "TWD" }
        
        $marketCurrency = "TWD"
        if ($market -match "港" -or $market -match "HK") { $marketCurrency = "HKD" }
        elseif ($market -match "美" -or $market -match "US") { $marketCurrency = "USD" }
        
        # 修正: 確保 currency 不為空且不是 " "
        if ([string]::IsNullOrWhiteSpace($dataCurrency)) { $dataCurrency = "TWD" }
        
        $exchRate = 1.0
        
        # 3. 若為外幣市場，優先嘗試取得匯率 (為了推算原幣成本)
        if ($marketCurrency -ne "TWD") {
            # 這裡先不印出 Log，避免打亂排版，改為最後顯示
            try {
                $rate = Get-ExchangeRate -FromCurrency $marketCurrency -ToCurrency "TWD"
                if ($rate) { $exchRate = $rate }
            }
            catch {}
        }

        # 4. 準備顯示用的成本數據 (從 Portfolio 直接取得)
        # CostCalculator 已經幫我們算好 Orig 和 TWD 兩種成本了
        
        $displayAvgCost = $p.AvgCostOrig
        $displayTotalCost = $p.TotalCostOrig
        $costCurrency = $p.Currency # 預設顯示 Portfolio 的主要幣別
        
        # [Case C: 混合型修正]
        # 若 StockList 定義為外幣 (HKD/USD)，但 Portfolio 可能是以 TWD 紀錄 (因舊資料 currency=TWD)
        # 即使如此，CostCalculator 已經嘗試計算 Orig 成本 (若有匯率)
        # 若無匯率 (Rate=1)，Orig 會等於 TWD。這時我們需要根據 Market Currency 來決定顯示什麼
        
        if ($dataCurrency -eq "TWD" -and $marketCurrency -ne "TWD") {
            $costCurrency = $marketCurrency
            # 若主要成本 (Orig) 異常大 (例如=TWD數字)，且有匯率，CostCalculator 應該已經處理了
            # 但如果 CostCalculator 沒讀到匯率 (舊資料)，Orig = TWD。
            # 這時候顯示會很怪 (207 HKD 本)。
            # 但這是資料問題，我們顯示出來讓使用者知道 "這是 TWD 當作 HKD"
            # 或者，我們在這裡做最後一道防線：如果 CostCalculator 算出的 Orig == TWD 且 ExchangeRate != 1
            # 代表 CostCalculator 沒除以匯率? 
            # 不，CostCalculator 邏輯是: if TWD, Orig = Amt / Rate.
            # 所以只要 Rate 正確，Orig 就是正確的。
        }
        else {
            # 一般情況
            $costCurrency = $dataCurrency
            if ($marketCurrency -ne "TWD" -and $dataCurrency -ne "TWD") {
                $costCurrency = $marketCurrency
            }
        }

        Write-Host "`n--------------------------------"
        Write-Host "📦 庫存股票: $($p.Name) ($code)" -ForegroundColor Green
        Write-Host "   持有股數: $($p.Quantity)"
        Write-Host "   平均成本: $([math]::Round($p.AvgCostOrig, 2)) ($($p.Currency))"
        Write-Host "   總成本  : $([math]::Round($p.TotalCostTWD, 0)) (TWD)"

        # 自動抓取股價 (New feature)
        $autoPrice = $null
        try {
            Write-Host "   ⏳ 正在查詢即時股價..." -NoNewline
            $autoPrice = Get-RealTimePrice -Code $code -MarketType $market
            if ($autoPrice) {
                Write-Host " ✅ $autoPrice" -ForegroundColor Green
            }
            else {
                Write-Host " ⚠️ 未取得" -ForegroundColor Gray
            }
        }
        catch {
            Write-Host " (查詢失敗)" -ForegroundColor Gray
        }

        # 詢問市價
        while ($true) {
            $promptMsg = "請輸入當前 [股價] (輸入 'skip' 跳過此檔)"

            
            $priceStr = Get-CleanInput -Prompt $promptMsg -Mandatory ($null -eq $autoPrice) -DefaultValue $autoPrice
            if ($priceStr -eq 'skip') { break }
            
            if ($priceStr -match "^\d+(\.\d+)?$") {
                $currentPrice = [double]$priceStr
                
                # 1. 計算原幣市值
                # [Fix] 強制轉型，避免 Object[] 導致 op_Multiply 失敗
                $qty = [double]$p.Quantity
                if ($qty -is [array]) { $qty = $qty[0] } 

                $marketValue = $currentPrice * $qty

                # 2. 匯率換算 (取得台幣市值)
                $exchRate = 1.0
                
                # [Fix] 使用 $costCurrency (或 $marketCurrency) 作為計算基準
                # 上面已經判斷過顯示用的幣別 $costCurrency
                $calcCurrency = $costCurrency
                
                if ($calcCurrency -ne "TWD") {
                    Write-Host "   💱 正在取得 $calcCurrency 匯率..." -NoNewline
                    try {
                        $rate = Get-ExchangeRate -FromCurrency $calcCurrency -ToCurrency "TWD"
                        if ($rate) { 
                            $exchRate = $rate
                            Write-Host " $exchRate" -ForegroundColor Green
                        }
                        else { Write-Host " (失敗, 使用 1.0)" -ForegroundColor Yellow }
                    }
                    catch { Write-Host " (Error)" -ForegroundColor Red }
                }
                
                $marketValueTWD = $marketValue * $exchRate

                # 3. 計算損益 (統一用台幣比較)
                # 使用 TotalCostTWD
                $totalCost = $p.TotalCostTWD
                if (-not $totalCost) { $totalCost = 0 } # 防呆

                $pnl = $marketValueTWD - $totalCost
                
                $roiStr = "0%"
                if ($totalCost -ne 0) {
                    $roi = ($pnl / $totalCost) * 100
                    $roiStr = "$([math]::Round($roi, 2))%"
                }

                $record = [ordered]@{
                    "日期"     = $dateStr
                    "市場"     = $market
                    "股票代號"   = $code
                    "股票名稱"   = $p.Name
                    "幣別"     = $calcCurrency
                    "持有股數"   = $p.Quantity
                    "總成本"    = [math]::Round($totalCost, 0)
                    "市值(原幣)" = [math]::Round($marketValue, 2)
                    "未實現損益"  = [math]::Round($pnl, 0)
                    "報酬率%"   = $roiStr
                    "匯率"     = $exchRate
                    "市值(台幣)" = [math]::Round($marketValueTWD, 0)
                }
                $data.Add([PSCustomObject]$record) | Out-Null
                
                $logMsg = "$($p.Name) | 市值: $([math]::Round($marketValue,2)) $calcCurrency"
                if ($calcCurrency -ne "TWD") { $logMsg += " -> $([math]::Round($marketValueTWD,0)) TWD" }
                Write-Log "✅ 已記錄: $logMsg | 損益: $([math]::Round($pnl,0))" -Level Info
                break 
            }
            else {
                Write-Host "❌ 價格格式錯誤" -ForegroundColor Red
            }
        }
    }

    # 4. 總結與引導
    if ($data.Count -eq 0) {
        Write-Host "`n⚠️  目前無庫存資料。" -ForegroundColor Yellow
        Write-Host "若您有交易紀錄尚未錄入，請使用主選單的 [4. 錄入交易明細] 功能。"
    }
    else {
        # 匯出結果
        Export-DataToCsv -Data $data -FileNamePrefix "stock_holdings" -OutputDirectory "output/history_data/Stock_holdings"
    }
    
    Read-Host "`n按 Enter 鍵繼續..."
}
