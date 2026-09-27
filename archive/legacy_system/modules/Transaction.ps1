# Modules/Transaction.ps1

# Helper function to calculate display width (Chinese chars = 2, others = 1)
function Get-DisplayWidth {
    param([string]$Text)
    $width = 0
    foreach ($char in $Text.ToCharArray()) {
        # Chinese/Japanese/Korean characters (CJK) typically have code points > 0x3000
        if ([int][char]$char -gt 0x3000) {
            $width += 2
        }
        else {
            $width += 1
        }
    }
    return $width
}

# Helper function to pad string based on display width
function Format-DisplayPad {
    param(
        [string]$Text,
        [int]$TargetWidth,
        [bool]$PadLeft = $false
    )
    $currentWidth = Get-DisplayWidth $Text
    $paddingNeeded = $TargetWidth - $currentWidth
    
    if ($paddingNeeded -le 0) {
        return $Text
    }
    
    $padding = " " * $paddingNeeded
    if ($PadLeft) {
        return $padding + $Text
    }
    else {
        return $Text + $padding
    }
}

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
        # 定義欄位: 日期, 代號, 名稱, 類別, 幣別, 匯率, 價格, 股數, 手續費, 交易稅, 總金額, 備註, 交割金額(台幣)
        "日期,代號,名稱,類別,幣別,匯率,價格,股數,手續費,交易稅,總金額,備註,交割金額(台幣)" | Out-File -FilePath $csvPath -Encoding Unicode
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

        # --- (New) 賣出庫存檢查 ---
        if ($type -eq "賣出") {
            Write-Host "🔍 正在檢查庫存..." -ForegroundColor DarkGray
            try {
                # 取得目前庫存 (截至今日)
                $inventory = Get-PortfolioStatus -TargetDate $date
                $holding = $inventory[$selectedStock.Code]
                
                $currentQty = 0
                if ($holding) { $currentQty = $holding.Quantity }

                if ($qty -gt $currentQty) {
                    Write-Host "`n⛔ 庫存不足警告！" -ForegroundColor Red
                    Write-Host "   代號: $($selectedStock.Code)"
                    Write-Host "   目前持有: $currentQty 股"
                    Write-Host "   欲賣出  : $qty 股"
                    Write-Host "   (短缺    : $($qty - $currentQty) 股)"
                    
                    Write-Host "`n您沒有足夠的股票可以賣出。" -ForegroundColor Yellow
                    $retry = Read-Host "是否重新輸入股數? (Y/N) [輸入 N 將取消此筆交易]"
                    if ($retry -match "^[Nn]") { continue }
                    
                    # 若要重試，簡單跳過本次 loop (或讓底下邏輯更複雜)
                    # 這裡簡單選擇 continue 回到 loop 開頭重來
                    continue
                }
                else {
                    Write-Host "   目前庫存: $currentQty 股 (充足)" -ForegroundColor DarkGray
                }
            }
            catch {
                Write-Host "⚠️  庫存檢查失敗，將跳過檢查 ($_) " -ForegroundColor Yellow
            }
        }

        # --- (New) 幣別與匯率處理 ---
        # 預設幣別邏輯
        $currency = "TWD"
        $stockType = $selectedStock.Type
        if ($stockType -match "HK" -or $stockType -match "港") { $currency = "HKD" }
        elseif ($stockType -match "US" -or $stockType -match "美") { $currency = "USD" }
        
        # 讓使用者確認幣別 (防止自動判斷錯誤)
        $validCurrencies = @("TWD", "USD", "HKD", "JPY", "CNY", "EUR", "AUD")
        do {
            $currencyInput = Get-CleanInput -Prompt "請確認幣別 ($( $validCurrencies -join '/' ))" -DefaultValue $currency
            $currencyInput = $currencyInput.ToUpper()
            
            if ($currencyInput -notin $validCurrencies) {
                Write-Host "❌ 無效的幣別！請輸入標準代碼 (例如 TWD, USD)" -ForegroundColor Red
            }
        } until ($currencyInput -in $validCurrencies)
        $currency = $currencyInput

        $exchRate = 1.0
        if ($currency -ne "TWD") {
            # 提示輸入匯率
            $exchRate = Get-CleanInput -Prompt "請輸入匯率 ($currency -> TWD)" -DefaultValue "4.0" -IsNumber $true
        }

        # --- E. 試算費用 ---
        # 1. 小計 (原幣)
        $subTotal = $price * $qty
        
        # 2. 手續費 (原幣)
        $calFee = [Math]::Floor($subTotal * $feeRate)
        if ($calFee -lt $minFee) { $calFee = $minFee }
        
        # 3. 交易稅 (原幣, 僅賣出)
        $calTax = 0
        if ($type -eq "賣出") {
            $calTax = [Math]::Floor($subTotal * $taxRate)
        }

        Write-Host "`n📊 費用試算 ($currency):" -ForegroundColor Yellow
        Write-Host "   成交金額: $subTotal ($currency)"
        Write-Host "   預估手續費: $calFee"
        if ($type -eq "賣出") {
            Write-Host "   預估交易稅: $calTax"
        }
        
        # 預估台幣交割金額
        $estTotalOrig = 0
        if ($type -eq "買進") { $estTotalOrig = $subTotal + $calFee }
        else { $estTotalOrig = $subTotal - $calFee - $calTax }
        
        # 原幣總金額 check
        if ($currency -eq "TWD") {
            $estTotalOrig = [math]::Floor($estTotalOrig)
            $estTotalTWD = $estTotalOrig
        }
        else {
            $estTotalOrig = [math]::Round($estTotalOrig, 2)
            $estTotalTWD = [math]::Round($estTotalOrig * $exchRate, 0)
        }

        if ($currency -ne "TWD") {
            Write-Host "   ------------------------"
            Write-Host "   預估總額(原幣): $estTotalOrig $currency"
            Write-Host "   預估總額(台幣): $estTotalTWD TWD (匯率: $exchRate)" -ForegroundColor Cyan
        }

        # --- F. 確認或修正費用 ---
        $finalFee = Get-CleanInput -Prompt "確認手續費 ($currency)" -DefaultValue $calFee -IsNumber $true
        $finalTax = 0
        if ($type -eq "賣出") {
            $finalTax = Get-CleanInput -Prompt "確認交易稅 ($currency)" -DefaultValue $calTax -IsNumber $true
        }

        # --- G. 計算總交割金額 (原幣) ---
        $totalAmount = 0
        if ($type -eq "買進") {
            $totalAmount = $subTotal + $finalFee
        }
        else {
            $totalAmount = $subTotal - $finalFee - $finalTax
        }
        
        # 確保小數點處理 (原幣)
        if ($currency -eq "TWD") {
            $finalTotal = [math]::Floor($totalAmount)
            $finalTotalTWDCalc = $finalTotal
        }
        else {
            $finalTotal = [math]::Round($totalAmount, 2)
            $finalTotalTWDCalc = [math]::Round($finalTotal * $exchRate, 0)
        }
        
        Write-Host "`n💰 最終金額確認:" -ForegroundColor Green
        Write-Host "   總額(原幣): $finalTotal ($currency)"
        
        # --- (Explicit TWD) 精確交割金額確認 ---
        $finalTotalTWD = $finalTotalTWDCalc
        if ($currency -ne "TWD") {
            Write-Host "   換算台幣  : $finalTotalTWDCalc (預估)"
        }
        
        # 開放所有幣別 (含 TWD) 都能確認最終交割金額
        $finalTotalTWD = Get-CleanInput -Prompt "確認交割金額 (台幣/存摺扣款)" -DefaultValue $finalTotalTWDCalc -IsNumber $true
        
        # --- H. 確認寫入 ---
        $note = Read-Host "備註 (選填)"
        
        $confirm = Get-CleanInput -Prompt "確認寫入檔案? (Y/n)" -DefaultValue "Y"
        if ($confirm -match "^[Yy]") {
            # 格式化日期: yyyyMMdd -> yyyy/MM/dd
            $dateFormatted = [datetime]::ParseExact($date, "yyyyMMdd", $null).ToString("yyyy/MM/dd")

            $recordObj = [PSCustomObject]@{
                '日期'       = $dateFormatted
                '代號'       = $selectedStock.Code
                '名稱'       = $selectedStock.Name
                '類別'       = $type
                '幣別'       = $currency
                '匯率'       = $exchRate
                '價格'       = $price       # 原幣價格
                '股數'       = $qty
                '手續費'      = $finalFee    # 原幣手續費
                '交易稅'      = $finalTax    # 原幣交易稅
                '總金額'      = $finalTotal  # 原幣總金額
                '備註'       = $note
                '交割金額(台幣)' = $finalTotalTWD
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
    
    $config = $Script:Config
    $outputDir = if ($config.OutputDirectory) { $config.OutputDirectory } else { "output" }
    $transDir = Join-Path $outputDir "history_data/Transactions"
    $csvPath = Join-Path $transDir "transactions.csv"
    
    if (-not (Test-Path $csvPath)) {
        Write-Host "⚠️  查無交易紀錄檔案" -ForegroundColor Yellow
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
    $data = Import-Csv $csvPath -Encoding Unicode
    
    if ($data.Count -eq 0) {
        Write-Host "⚠️  目前無交易紀錄" -ForegroundColor Yellow
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
    Clear-Host
    Write-Host "🗑️  刪除交易紀錄" -ForegroundColor Cyan
    Write-Host "================================" -ForegroundColor Cyan
    
    $displayCount = [Math]::Min(20, $data.Count)
    $recentData = $data | Select-Object -Last $displayCount
    [array]::Reverse($recentData)
    
    Write-Host "`n最近 $displayCount 筆交易紀錄：`n" -ForegroundColor Yellow
    Write-Host "編號  日期          代號        名稱                      類別        總金額" -ForegroundColor Gray
    Write-Host ("=" * 78) -ForegroundColor Gray
    
    for ($i = 0; $i -lt $recentData.Count; $i++) {
        $item = $recentData[$i]
        $num = Format-DisplayPad ($i + 1).ToString() 4
        $date = Format-DisplayPad $item.'日期' 12
        $code = Format-DisplayPad $item.'代號' 10
        $name = Format-DisplayPad $item.'名稱' 24
        $type = Format-DisplayPad $item.'類別' 10
        $amount = Format-DisplayPad $item.'總金額'.ToString() 10 $true
        
        Write-Host "$num  $date  $code  $name  $type  $amount"
    }
    
    Write-Host "`n" -NoNewline
    $userInput = Read-Host "請輸入要刪除的編號 (可用逗號分隔多筆，例如: 1,3,5 / 輸入 0 取消)"
    
    if ($userInput -eq '0' -or [string]::IsNullOrWhiteSpace($userInput)) {
        Write-Host "❌ 已取消" -ForegroundColor Yellow
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
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
    
    $toDelete = @()
    Write-Host "`n將刪除以下 $($indices.Count) 筆紀錄：`n" -ForegroundColor Red
    
    foreach ($idx in $indices | Sort-Object -Unique) {
        $item = $recentData[$idx - 1]
        $toDelete += $item
        Write-Host "  [$idx] $($item.'日期') | $($item.'代號') $($item.'名稱') | $($item.'類別') | $($item.'總金額')" -ForegroundColor Red
    }
    
    Write-Host "`n" -NoNewline
    $confirm = Read-Host "確認刪除? (Y/N)"
    
    if ($confirm -notmatch '^[Yy]') {
        Write-Host "❌ 已取消" -ForegroundColor Yellow
        Read-Host "`n按 Enter 鍵繼續..."
        return
    }
    
    $remainingData = @()
    foreach ($item in $data) {
        $shouldDelete = $false
        foreach ($delItem in $toDelete) {
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
    
    if ($remainingData.Count -gt 0) {
        $remainingData | Export-Csv $csvPath -NoTypeInformation -Encoding Unicode -Force
    }
    else {
        "日期,代號,名稱,類別,幣別,匯率,價格,股數,手續費,交易稅,總金額,備註" | Out-File -FilePath $csvPath -Encoding Unicode
    }
    
    Write-Host "`n✅ 成功刪除 $($toDelete.Count) 筆紀錄！" -ForegroundColor Green
    Write-Log "已刪除 $($toDelete.Count) 筆交易紀錄" -Level Info
    
    Read-Host "`n按 Enter 鍵繼續..."
}
