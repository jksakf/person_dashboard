# Modules/RealizedPnL.ps1

function Invoke-RealizedPnLFlow {
    Write-Log ">>> 正在啟動 [已實現損益] 報表模組..." -Level Info
    
    # 1. 詢問年份
    $currentYear = (Get-Date).Year.ToString()
    $targetYear = Get-CleanInput -Prompt "請輸入要產生報表的年份 (YYYY) 或輸入 'ALL' 查看全部歷史" -DefaultValue $currentYear
    
    if ($targetYear -ne "ALL" -and $targetYear -notmatch "^\d{4}$") {
        Write-Host "❌ 年份格式錯誤" -ForegroundColor Red
        return
    }

    # 2. 生成報表
    $msg = if ($targetYear -eq "ALL") { "全部歷史" } else { "$targetYear 年" }
    Write-Host "🔄 正在從交易紀錄計算 $msg 損益..." -ForegroundColor Cyan
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

    # 3. 顯示摘要 (分幣別統計)
    Write-Host "`n📊 $targetYear 年度損益摘要 (依幣別)" -ForegroundColor Cyan
    Write-Host "============================="
    
    # Group by Currency
    $groupedData = $pnlData | Group-Object "幣別"
    
    foreach ($group in $groupedData) {
        $currency = $group.Name
        $records = $group.Group
        
        $currPnL = ($records | Measure-Object -Property "已實現損益" -Sum).Sum
        $currCost = ($records | Measure-Object -Property "總成本" -Sum).Sum
        
        $currRoi = 0
        if ($currCost -ne 0) {
            $currRoi = ($currPnL / $currCost) * 100
        }

        $color = if ($currPnL -ge 0) { "Green" } else { "Red" }
        
        Write-Host "幣別: $currency" -ForegroundColor Yellow
        Write-Host "  交易筆數: $($records.Count)"
        Write-Host "  已實現損益: $([math]::Round($currPnL, 2))" -ForegroundColor $color
        Write-Host "  總報酬率  : $([math]::Round($currRoi, 2))%" -ForegroundColor $color
        
        # 簡易換算台幣參考 (若非 TWD)
        if ($currency -ne "TWD") {
            try {
                $rate = Get-ExchangeRate -FromCurrency $currency -ToCurrency "TWD"
                if ($rate) {
                    $estTWD = $currPnL * $rate
                    Write-Host "  (約合 TWD: $([math]::Round($estTWD, 0)))" -ForegroundColor DarkGray
                }
            }
            catch {}
        }
        Write-Host "-----------------------------"
    }
    
    # 4. 匯出
    $fileName = "${targetYear}1231_realized_pnl"
    Export-DataToCsv -Data $pnlData -FileNamePrefix $fileName -OutputDirectory "output/history_data/Realized_pnl"
    
    Read-Host "`n✅ 報表已生成，按 Enter 鍵繼續..."
}
