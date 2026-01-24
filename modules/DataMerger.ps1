# Modules/DataMerger.ps1

function Invoke-DataMergerFlow {
    Write-Log ">>> 正在啟動 [資料合併] 模組..." -Level Info
    
    # 1. 詢問年份
    $currentYear = (Get-Date).Year.ToString()
    $targetYear = Get-CleanInput -Prompt "請輸入要合併的年份 (YYYY)" -DefaultValue $currentYear
    
    if ($targetYear -notmatch "^\d{4}$") {
        Write-Log "❌ 年份格式錯誤" -Level Error
        return
    }

    # 2. 載入最新股票清單 (用於統一股票代號)
    $stockList = Load-StockList
    $stockMap = @{}
    if ($stockList) {
        foreach ($s in $stockList) {
            # 建立 名稱 -> 代號 的對照表
            if (-not $stockMap.ContainsKey($s.Name)) {
                $stockMap[$s.Name] = $s.Code
            }
        }
        Write-Log "已載入股票對照表 (共 $($stockMap.Count) 筆)，將自動統一 CSV 代號格式" -Level Info
    }

    # 定義要處理的檔案類型與中文名稱
    $fileTypes = @{
        "bank_assets"    = "銀行資產"
        "stock_holdings" = "股票庫存"
        "realized_pnl"   = "已實現損益"
    }

    $outputDir = if ($Script:Config.OutputDirectory) { $Script:Config.OutputDirectory } else { "output" }
    if (-not (Test-Path $outputDir)) { 
        Write-Log "❌ 找不到輸出目錄: $outputDir" -Level Error
        return
    }

    Write-Host "`n🔍 正在搜尋 $outputDir 中 $targetYear 年的檔案..." -ForegroundColor Cyan

    foreach ($type in $fileTypes.Keys) {
        $name = $fileTypes[$type]
        $outputFilenamePrefix = $targetYear # 預設檔名前綴
        $pattern = "${targetYear}*_${type}.csv" # 預設搜尋樣式

        # --- 特殊邏輯：已實現損益可選擇合併所有歷史 ---
        if ($type -eq "realized_pnl") {
            Write-Host "`n[詢問] 針對 [$name]，您想要合併的範圍是？" -ForegroundColor Yellow
            Write-Host "   [1] 僅 $targetYear 年度 (預設)"
            Write-Host "   [2] 所有歷史交易紀錄"
            $pnlChoice = Read-Host "請選擇 [1/2]"
            
            if ($pnlChoice -eq '2') {
                Write-Host "   >>> 已選擇合併 [所有歷史] 資料" -ForegroundColor Green
                $pattern = "*_${type}.csv" # 搜尋所有年份
                $outputFilenamePrefix = "ALL_HISTORY"
            }
            else {
                Write-Host "   >>> 已選擇合併 [$targetYear] 年度資料" -ForegroundColor Cyan
            }
        }

        $files = Get-ChildItem -Path $outputDir -Filter $pattern | Where-Object { $_.Name -notmatch "ANNUAL" -and $_.Name -notmatch "ALL_HISTORY" }
        
        if ($files.Count -eq 0) {
            Write-Log "⚠️  無檔案: [$name] (找不到符合 $pattern 的檔案)" -Level Warning
            continue
        }

        Write-Host "   Processing [$name]... 找到 $($files.Count) 個檔案" -ForegroundColor Gray

        try {
            # 合併資料並統一日期格式
            $mergedData = @()
            
            foreach ($file in $files) {
                # Import-Csv 會自動處理 Headers
                $content = Import-Csv -Path $file.FullName -Encoding Unicode
                
                if ($content.Count -gt 0) {
                    $propNames = $content[0].PSObject.Properties.Name
                    $dateCol = $propNames | Where-Object { $_ -match "日期" } | Select-Object -First 1
                    $codeCol = $propNames | Where-Object { $_ -match "股票代號" } | Select-Object -First 1
                    $nameCol = $propNames | Where-Object { $_ -match "股票名稱" } | Select-Object -First 1
                }
                else {
                    $dateCol = "日期"
                    $codeCol = "股票代號"
                    $nameCol = "股票名稱"
                }

                foreach ($row in $content) {
                    # --- 1. 日期修正 (強力 Regex 解析) ---
                    if ($dateCol -and $row.$dateCol) {
                        $rawDate = $row.$dateCol
                        # 移除所有非數字、非斜線、非橫線的字元
                        $cleanDate = $rawDate -replace "[^0-9/\-]", ""
                        
                        $parsedDateKey = ""
                        
                        if ($cleanDate -match "^(\d{4})(\d{2})(\d{2})$") {
                            $y = $Matches[1]; $m = $Matches[2]; $d = $Matches[3]
                            $parsedDateKey = "$y/$m/$d"
                        }
                        elseif ($cleanDate -match "^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$") {
                            $y = $Matches[1]
                            $m = $Matches[2].PadLeft(2, '0')
                            $d = $Matches[3].PadLeft(2, '0')
                            $parsedDateKey = "$y/$m/$d"
                        }
                        
                        if ($parsedDateKey) {
                            $row.$dateCol = $parsedDateKey
                        }
                    }

                    # --- 2. 股票代號統一 ---
                    if ($codeCol -and $nameCol -and $row.$nameCol) {
                        $sName = $row.$nameCol.Trim()
                        if ($stockMap.ContainsKey($sName)) {
                            $correctCode = $stockMap[$sName]
                            # 如果目前的代號跟最新清單不一樣 (例如 6208 vs 006208)，就更新它
                            if ($row.$codeCol -ne $correctCode) {
                                $row.$codeCol = $correctCode
                            }
                        }
                    }

                    $mergedData += $row
                }
            }

            if ($mergedData.Count -gt 0) {
                # 再次偵測日期欄位 (針對合併後的物件)
                $firstRow = $mergedData[0]
                $propNames = $firstRow.PSObject.Properties.Name
                $dateCol = $propNames | Where-Object { $_ -match "日期" } | Select-Object -First 1
                if (-not $dateCol) { $dateCol = "日期" }

                # 排序
                $mergedData = $mergedData | Sort-Object $dateCol
            }

            # 產生輸出檔名: 2026_ANNUAL_bank_assets.csv 或 ALL_HISTORY_realized_pnl.csv
            $outputFilename = "${outputFilenamePrefix}_ANNUAL_${type}.csv"
            # 如果是全歷史，把 ANNUAL 拿掉比較好聽，改成 _ALL
            if ($outputFilenamePrefix -eq "ALL_HISTORY") {
                $outputFilename = "ALL_HISTORY_${type}.csv"
            }
            
            $outputPath = Join-Path $outputDir $outputFilename

            # 匯出
            $mergedData | Export-Csv -Path $outputPath -NoTypeInformation -Encoding Unicode
            
            Write-Log "✅ 合併成功: $outputFilename (共 $($mergedData.Count) 筆資料)" -Level Info
        }
        catch {
            Write-Log "❌ 合併失敗 [$name]: $_" -Level Error
        }
    }
    
    Read-Host "`n按 Enter 鍵繼續..."
}
