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

        Write-Host "`n--------------------------------"
        Write-Host "📦 庫存股票: $($p.Name) ($code)" -ForegroundColor Green
        Write-Host "   持有股數: $($p.Quantity)"
        Write-Host "   平均成本: $([math]::Round($p.AvgCost, 2))"
        Write-Host "   總成本  : $([math]::Round($p.TotalCost, 0))"

        # 這裡需要匹配 stock_list.txt 裡的 "市場/類別"
        # 嘗試從已載入的清單找，找不到預設 "台股"
        $market = "台股"
        $foundConfig = $stocks | Where-Object { $_.Code -eq $code } | Select-Object -First 1
        if ($foundConfig) { $market = $foundConfig.Type }

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
            if ($autoPrice) {
                $promptMsg += " [預設: $autoPrice]"
            }
            
            $priceStr = Get-CleanInput -Prompt $promptMsg -Mandatory ($autoPrice -eq $null) -DefaultValue $autoPrice
            if ($priceStr -eq 'skip') { break }
            
            if ($priceStr -match "^\d+(\.\d+)?$") {
                $currentPrice = [double]$priceStr
                
                # 計算
                $marketValue = $currentPrice * $p.Quantity
                $totalCost = $p.TotalCost
                $pnl = $marketValue - $totalCost
                
                $roiStr = "0%"
                if ($totalCost -ne 0) {
                    $roi = ($pnl / $totalCost) * 100
                    $roiStr = "$([math]::Round($roi, 2))%"
                }

                $record = [ordered]@{
                    "日期"    = $dateStr
                    "市場"    = $market
                    "股票代號"  = $code
                    "股票名稱"  = $p.Name
                    "持有股數"  = $p.Quantity
                    "總成本"   = [math]::Round($totalCost, 0)
                    "市值"    = [math]::Round($marketValue, 0)
                    "未實現損益" = [math]::Round($pnl, 0)
                    "報酬率%"  = $roiStr
                }
                $data.Add([PSCustomObject]$record) | Out-Null
                Write-Log "✅ 已記錄: $($p.Name) | 市值: $([math]::Round($marketValue,0)) | 損益: $([math]::Round($pnl,0))" -Level Info
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
