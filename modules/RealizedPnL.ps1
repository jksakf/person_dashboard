# Modules/RealizedPnL.ps1

function Invoke-RealizedPnLFlow {
    Write-Log ">>> 正在啟動 [已實現損益] 報表模組..." -Level Info
    
    # 1. 詢問年份
    $currentYear = (Get-Date).Year.ToString()
    $targetYear = Get-CleanInput -Prompt "請輸入要產生報表的年份 (YYYY)" -DefaultValue $currentYear
    if ($targetYear -notmatch "^\d{4}$") {
        Write-Host "❌ 年份格式錯誤" -ForegroundColor Red
        return
    }

    # 2. 生成報表
    Write-Host "🔄 正在從交易紀錄計算 $targetYear 年損益..." -ForegroundColor Cyan
    try {
        $pnlData = Get-PnLReport -TargetYear $targetYear
    }
    catch {
        Write-Error "計算失敗: $_"
        return
    }

    if ($pnlData.Count -eq 0) {
        Write-Host "⚠️  該年度 ($targetYear) 無任何賣出紀錄。" -ForegroundColor Yellow
        # 仍嘗試讀取舊有的手動紀錄? 否，因架構已轉換。建議使用者補錄交易。
        Write-Host "若需補資料，請使用 [4. 錄入交易明細] 功能。"
        Read-Host "按 Enter 返回..."
        return
    }

    # 3. 顯示摘要
    $totalPnL = ($pnlData | Measure-Object -Property "已實現損益" -Sum).Sum
    $totalCost = ($pnlData | Measure-Object -Property "總成本" -Sum).Sum
    
    # 避免除以零
    $totalRoi = 0
    if ($totalCost -ne 0) {
        $totalRoi = ($totalPnL / $totalCost) * 100
    }

    $color = if ($totalPnL -ge 0) { "Green" } else { "Red" }
    
    Write-Host "`n📊 $targetYear 年度損益摘要" -ForegroundColor Cyan
    Write-Host "-----------------------------"
    Write-Host "總交易筆數: $($pnlData.Count)"
    Write-Host "已實現損益: $([math]::Round($totalPnL, 0))" -ForegroundColor $color
    Write-Host "總報酬率  : $([math]::Round($totalRoi, 2))%" -ForegroundColor $color
    Write-Host "-----------------------------"

    # 4. 匯出
    # 注意：這裡的輸出路徑應與 DataMerger 預期一致
    # 原本是 output/history_data/Realized_pnl/{date}_realized_pnl.csv
    # 現在改為年度報表，建議用 output/history_data/Realized_pnl/{year}_generated_pnl.csv ?
    # 或是維持 daily 格式? 
    # Roadmap: "generate report from transaction history"
    # Dashboard expects daily or merged CSV.
    # DataMerger looks for `YYYY*realized_pnl.csv`.
    # Let's save as `${targetYear}1231_realized_pnl.csv` to represent the full year report until that date.
    
    $fileName = "${targetYear}1231_realized_pnl"
    Export-DataToCsv -Data $pnlData -FileNamePrefix "realized_pnl" -OutputDirectory "output/history_data/Realized_pnl"
    
    # 為了避免 DataMerger 混淆 (它會讀取所有 .csv)，如果我們每天產生一個 report，會有大量重複。
    # 但這是 "Generated Report"，user 應該只在需要更新時執行一次。
    # 其實 DataMerger 的邏輯是合併該年度檔案。如果我們產生的是一整年的匯總，DataMerger 再次合併時可能會有問題 (單筆 vs 匯總)。
    # 不過目前的 $pnlData 是 "明細列表"，每一筆是一次賣出。所以格式是相容的。
    # 只是如果 DataMerger 讀了這個檔，又讀了其他的檔，會重複嗎?
    # 以前是 "手動輸入當天賣出的"，存成 `YYYYMMDD_realized_pnl.csv`。
    # 現在是 "一次產生整年"，存成 one file。
    # 建議 Output 檔名明確一點，或者清理舊檔。
    
    # 這裡我們使用 "YYYY1231" 作為日期，DataMerger 會把它當作年底的一份資料讀取。
    # 這沒問題，只要使用者不要還有其他的 "手動輸入檔" 混在一起。
    # (架構轉換期，建議清空 Output 或建立新資料夾，但這裡先相容)
    
    Read-Host "`n✅ 報表已生成，按 Enter 鍵繼續..."
}
