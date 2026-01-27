# Modules/Transaction.ps1

function Invoke-TransactionFlow {
    Write-Log ">>> 進入 [交易明細錄入] 流程..." -Level Info

    # 1. 載入基本設定
    $config = $Script:Config
    $feeRate = if ($config.Transaction.FeeRate) { $config.Transaction.FeeRate } else { 0.001425 }
    $taxRate = if ($config.Transaction.TaxRate) { $config.Transaction.TaxRate } else { 0.003 }
    $minFee = if ($config.Transaction.MinFee) { $config.Transaction.MinFee } else { 20 }

    # 2. 準備輸出路徑
    $outputDir = if ($config.OutputDirectory) { $config.OutputDirectory } else { "output" }
    $transDir = Join-Path $outputDir "history_data/Transactions"
    if (-not (Test-Path $transDir)) {
        New-Item -ItemType Directory -Path $transDir -Force | Out-Null
    }
    $csvPath = Join-Path $transDir "transactions.csv"

    # 3. 檢查或建立 CSV Header
    if (-not (Test-Path $csvPath) -or (Get-Item $csvPath).Length -eq 0) {
        # 定義欄位: 日期, 代號, 名稱, 類別, 價格, 股數, 手續費, 交易稅, 總金額, 備註
        "日期,代號,名稱,類別,價格,股數,手續費,交易稅,總金額,備註" | Out-File -FilePath $csvPath -Encoding Unicode
    }

    # 4. 載入股票清單 (用於選取)
    $stockList = Load-StockList
    $lastDate = Get-Date -Format "yyyyMMdd"
    
    while ($true) {
        Clear-Host
        Write-Host "Create New Transaction Record" -ForegroundColor Cyan
        Write-Host "--------------------------------"

        # --- A. 輸入日期 ---
        $date = Get-ValidDate -Prompt "請輸入交易日期 (YYYYMMDD)" -DefaultDate $lastDate
        $lastDate = $date # 更新預設日期為本次輸入值

        # --- B. 選擇股票 ---
        $selectedStock = Select-Stock -StockList $stockList
        if (-not $selectedStock) { break }

        # --- C. 選擇動作 (買/賣) ---
        $type = ""
        while ($type -notin "買進", "賣出") {
            $t = Read-Host "請選擇交易類別 (1: 買進 Buy, 2: 賣出 Sell)"
            if ($t -eq '1') { $type = "買進" }
            elseif ($t -eq '2') { $type = "賣出" }
        }

        # --- D. 輸入價格與股數 ---
        $priceStr = Get-CleanInput -Prompt "請輸入成交單價" -IsNumber $true
        $qtyStr = Get-CleanInput -Prompt "請輸入成交股數" -IsNumber $true
        
        try {
            $price = [decimal]$priceStr
            $qty = [int]$qtyStr
        }
        catch {
            Write-Host "❌ 輸入格式錯誤，請輸入有效數字" -ForegroundColor Red
            Pause
            continue
        }
        
        if ($price -le 0 -or $qty -le 0) {
            Write-Host "❌ 價格與股數必須大於 0" -ForegroundColor Red
            Pause
            continue
        }

        # --- (New) 幣別與匯率處理 ---
        $currency = "TWD"
        $stockType = $selectedStock.Type
        
        if ($stockType -match "HK" -or $stockType -match "港") { $currency = "HKD" }
        elseif ($stockType -match "US" -or $stockType -match "美") { $currency = "USD" }
        
        $exchRate = 1.0
        if ($currency -ne "TWD") {
            # 提示輸入匯率 (未來可整合 PriceFetcher 自動抓用)
            $exchRate = Get-CleanInput -Prompt "請輸入匯率 ($currency -> TWD)" -DefaultValue "4.0" -IsNumber $true
        }

        # --- E. 試算費用 ---
        # 1. 小計
        $subTotal = $price * $qty
        
        # 2. 手續費 (買賣都要) -> 無條件捨去 (通常) 但建議保留整數
        # [Fix] 港美股手續費結構不同，這裡暫時維持通用，但至少費率可調
        $calFee = [Math]::Floor($subTotal * $feeRate)
        if ($calFee -lt $minFee) { $calFee = $minFee }

        # 3. 交易稅 (僅賣出) -> 四捨五入
        $calTax = 0
        if ($type -eq "賣出") {
            $calTax = [Math]::Floor($subTotal * $taxRate)
        }

        Write-Host "`n📊 費用試算 ($currency):" -ForegroundColor Yellow
        Write-Host "   成交金額: $subTotal"
        Write-Host "   預估手續費: $calFee (費率: $($feeRate*100)%, 低消: $minFee)"
        if ($type -eq "賣出") {
            Write-Host "   預估交易稅: $calTax (稅率: $($taxRate*100)%)"
        }
        if ($currency -ne "TWD") {
            Write-Host "   預估總額(台幣): $([math]::Round(($subTotal * $exchRate),0)) (匯率: $exchRate)"
        }

        # --- F. 確認或修正費用 ---
        $finalFee = Get-CleanInput -Prompt "確認手續費 (直接按 Enter 使用試算值 $calFee)" -DefaultValue $calFee -IsNumber $true
        $finalTax = 0
        if ($type -eq "賣出") {
            $finalTax = Get-CleanInput -Prompt "確認交易稅 (直接按 Enter 使用試算值 $calTax)" -DefaultValue $calTax -IsNumber $true
        }

        # --- G. 計算總交割金額 ---
        # 買入 = 價金 + 費
        # 賣出 = 價金 - 費 - 稅
        $totalAmount = 0
        if ($type -eq "買進") {
            $totalAmount = $subTotal + $finalFee
        }
        else {
            $totalAmount = $subTotal - $finalFee - $finalTax
        }

        Write-Host "`n💰 最終交割金額: $totalAmount ($currency)" -ForegroundColor Green
        
        # --- H. 確認寫入 ---
        $note = Read-Host "備註 (選填)"
        
        $confirm = Get-CleanInput -Prompt "確認寫入檔案? (Y/n)" -DefaultValue "Y"
        if ($confirm -match "^[Yy]") {
            # 格式化日期: yyyyMMdd -> yyyy/MM/dd
            $dateFormatted = [datetime]::ParseExact($date, "yyyyMMdd", $null).ToString("yyyy/MM/dd")
            # 總金額捨棄小數點
            $finalTotal = [math]::Floor($totalAmount)

            # [Fix] 使用 PSCustomObject 確保 CSV 格式正確 (自動處理換行與引號)
            $recordObj = [PSCustomObject]@{
                '日期'  = $dateFormatted
                '代號'  = $selectedStock.Code
                '名稱'  = $selectedStock.Name
                '類別'  = $type
                '幣別'  = $currency
                '匯率'  = $exchRate
                '價格'  = $price
                '股數'  = $qty
                '手續費' = $finalFee
                '交易稅' = $finalTax
                '總金額' = $finalTotal
                '備註'  = $note
            }
            
            # 使用 Export-Csv 寫入 (Unicode 編碼, 追加模式)
            $recordObj | Export-Csv -Path $csvPath -Append -NoTypeInformation -Encoding Unicode -Force
            
            Write-Log "已新增交易紀錄: $($recordObj.日期) | $($recordObj.代號) | $($recordObj.名稱) | $($recordObj.類別) ..." -Level Info
            Write-Host "✅ 儲存成功！" -ForegroundColor Green
        }
        else {
            Write-Host "❌ 已取消" -ForegroundColor Yellow
        }

        $next = Read-Host "`n繼續輸入下一筆? (Y/N) [預設 Y]"
        if ($next -match "^[Nn]") { break }
    }
}

function Invoke-DeleteTransactionFlow {
    Write-Log ">>> 進入 [刪除交易紀錄] 流程..." -Level Info
    
    # 1. 準備路徑
    $config = $Script:Config
    $outputDir = if ($config.OutputDirectory) { $config.OutputDirectory } else { "output" }
    $transDir = Join-Path $outputDir "history_data/Transactions"
    $csvPath = Join-Path $transDir "transactions.csv"
    
    # 2. 檢查檔案
    if (-not (Test-Path $csvPath)) {
        Write-Host "⚠️  查無交易紀錄檔案" -ForegroundColor Yellow
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
    # 3. 讀取資料
    $data = Import-Csv $csvPath -Encoding Unicode
    
    if ($data.Count -eq 0) {
        Write-Host "⚠️  目前無交易紀錄" -ForegroundColor Yellow
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
    Clear-Host
    Write-Host "🗑️  刪除交易紀錄" -ForegroundColor Cyan
    Write-Host "================================" -ForegroundColor Cyan
    
    # 4. 列出最近 20 筆（倒序）
    $displayCount = [Math]::Min(20, $data.Count)
    $recentData = $data | Select-Object -Last $displayCount
    [array]::Reverse($recentData)
    
    Write-Host "`n最近 $displayCount 筆交易紀錄：`n" -ForegroundColor Yellow
    Write-Host ("{0,-4} {1,-12} {2,-8} {3,-12} {4,-6} {5,12}" -f "編號", "日期", "代號", "名稱", "類別", "總金額") -ForegroundColor Gray
    Write-Host ("-" * 60) -ForegroundColor Gray
    
    for ($i = 0; $i -lt $recentData.Count; $i++) {
        $item = $recentData[$i]
        $num = $i + 1
        Write-Host ("{0,-4} {1,-12} {2,-8} {3,-12} {4,-6} {5,12}" -f $num, $item.'日期', $item.'代號', $item.'名稱', $item.'類別', $item.'總金額')
    }
    
    # 5. 輸入要刪除的編號
    Write-Host "`n" -NoNewline
    $userInput = Read-Host "請輸入要刪除的編號 (可用逗號分隔多筆，例如: 1,3,5 / 輸入 0 取消)"
    
    if ($userInput -eq '0' -or [string]::IsNullOrWhiteSpace($userInput)) {
        Write-Host "❌ 已取消" -ForegroundColor Yellow
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
    # 6. 解析輸入的編號
    $indices = @()
    $inputParts = $userInput -split ',' | ForEach-Object { $_.Trim() }
    
    foreach ($part in $inputParts) {
        if ($part -match '^\d+$') {
            $idx = [int]$part
            if ($idx -ge 1 -and $idx -le $recentData.Count) {
                $indices += $idx
            }
            else {
                Write-Host "⚠️  編號 $idx 超出範圍，已忽略" -ForegroundColor Yellow
            }
        }
    }
    
    if ($indices.Count -eq 0) {
        Write-Host "❌ 無有效的編號" -ForegroundColor Red
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
    # 7. 顯示選定項目
    $toDelete = @()
    Write-Host "`n將刪除以下 $($indices.Count) 筆紀錄：`n" -ForegroundColor Red
    
    foreach ($idx in $indices | Sort-Object -Unique) {
        $item = $recentData[$idx - 1]
        $toDelete += $item
        Write-Host "  [$idx] $($item.'日期') | $($item.'代號') $($item.'名稱') | $($item.'類別') | $($item.'總金額')" -ForegroundColor Red
    }
    
    # 8. 確認刪除
    Write-Host "`n" -NoNewline
    $confirm = Read-Host "確認刪除? (Y/N)"
    
    if ($confirm -notmatch '^[Yy]') {
        Write-Host "❌ 已取消" -ForegroundColor Yellow
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
    # 9. 執行刪除（從原始資料中移除）
    $remainingData = @()
    foreach ($item in $data) {
        $shouldDelete = $false
        foreach ($delItem in $toDelete) {
            # 比對多個欄位確保唯一性
            if ($item.'日期' -eq $delItem.'日期' -and 
                $item.'代號' -eq $delItem.'代號' -and
                $item.'名稱' -eq $delItem.'名稱' -and
                $item.'類別' -eq $delItem.'類別' -and
                $item.'總金額' -eq $delItem.'總金額') {
                $shouldDelete = $true
                break
            }
        }
        if (-not $shouldDelete) {
            $remainingData += $item
        }
    }
    
    # 10. 寫回檔案
    if ($remainingData.Count -gt 0) {
        $remainingData | Export-Csv $csvPath -NoTypeInformation -Encoding Unicode -Force
    }
    else {
        # 若刪除後為空，只保留標頭
        "日期,代號,名稱,類別,幣別,匯率,價格,股數,手續費,交易稅,總金額,備註" | Out-File -FilePath $csvPath -Encoding Unicode
    }
    
    Write-Host "`n✅ 成功刪除 $($toDelete.Count) 筆紀錄！" -ForegroundColor Green
    Write-Log "已刪除 $($toDelete.Count) 筆交易紀錄" -Level Info
    
    Read-Host "`n按 Enter 鍵繼續..."
}
