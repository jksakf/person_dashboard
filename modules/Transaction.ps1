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
    if (-not (Test-Path $csvPath)) {
        # 定義欄位: 日期, 代號, 名稱, 動作(Buy/Sell), 單價, 股數, 手續費, 交易稅, 總金額, 備註
        "Date,Code,Name,Type,Price,Quantity,Fee,Tax,TotalAmount,Note" | Out-File -FilePath $csvPath -Encoding Unicode
    }

    # 4. 載入股票清單 (用於選取)
    $stockList = Load-StockList
    
    while ($true) {
        Clear-Host
        Write-Host "Create New Transaction Record" -ForegroundColor Cyan
        Write-Host "--------------------------------"

        # --- A. 輸入日期 ---
        $date = Get-DateInput -Prompt "請輸入交易日期 (YYYYMMDD)"

        # --- B. 選擇股票 ---
        $selectedStock = Select-Stock -StockList $stockList
        if (-not $selectedStock) { break }

        # --- C. 選擇動作 (買/賣) ---
        $type = ""
        while ($type -notin "Buy", "Sell") {
            $t = Read-Host "請選擇交易類別 (1: 買進 Buy, 2: 賣出 Sell)"
            if ($t -eq '1') { $type = "Buy" }
            elseif ($t -eq '2') { $type = "Sell" }
        }

        # --- D. 輸入價格與股數 ---
        $price = Get-CleanInput -Prompt "請輸入成交單價" -IsNumber $true
        $qty = Get-CleanInput -Prompt "請輸入成交股數" -IsNumber $true
        
        if ($price -le 0 -or $qty -le 0) {
            Write-Host "❌ 價格與股數必須大於 0" -ForegroundColor Red
            Pause
            continue
        }

        # --- E. 試算費用 ---
        # 1. 小計
        $subTotal = $price * $qty
        
        # 2. 手續費 (買賣都要) -> 無條件捨去 (通常) 但建議保留整數
        $calFee = [Math]::Floor($subTotal * $feeRate)
        if ($calFee -lt $minFee) { $calFee = $minFee }

        # 3. 交易稅 (僅賣出) -> 四捨五入
        $calTax = 0
        if ($type -eq "Sell") {
            $calTax = [Math]::Floor($subTotal * $taxRate)
        }

        Write-Host "`n📊 費用試算:" -ForegroundColor Yellow
        Write-Host "   成交金額: $subTotal"
        Write-Host "   預估手續費: $calFee (費率: $($feeRate*100)%, 低消: $minFee)"
        if ($type -eq "Sell") {
            Write-Host "   預估交易稅: $calTax (稅率: $($taxRate*100)%)"
        }

        # --- F. 確認或修正費用 ---
        $finalFee = Get-CleanInput -Prompt "確認手續費 (直接按 Enter 使用試算值 $calFee)" -DefaultValue $calFee -IsNumber $true
        $finalTax = 0
        if ($type -eq "Sell") {
            $finalTax = Get-CleanInput -Prompt "確認交易稅 (直接按 Enter 使用試算值 $calTax)" -DefaultValue $calTax -IsNumber $true
        }

        # --- G. 計算總交割金額 ---
        # 買入 = 價金 + 費
        # 賣出 = 價金 - 費 - 稅
        $totalAmount = 0
        if ($type -eq "Buy") {
            $totalAmount = $subTotal + $finalFee
        }
        else {
            $totalAmount = $subTotal - $finalFee - $finalTax
        }

        Write-Host "`n💰 最終交割金額: $totalAmount" -ForegroundColor Green
        
        # --- H. 確認寫入 ---
        $note = Read-Host "備註 (選填)"
        
        $confirm = Read-Host "`n確認寫入檔案? (Y/N)"
        if ($confirm -match "^[Yy]") {
            # Date,Code,Name,Type,Price,Quantity,Fee,Tax,TotalAmount,Note
            $record = "$date,$($selectedStock.Code),$($selectedStock.Name),$type,$price,$qty,$finalFee,$finalTax,$totalAmount,$note"
            $record | Out-File -FilePath $csvPath -Append -Encoding Unicode
            Write-Log "已新增交易紀錄: $record" -Level Info
            Write-Host "✅ 儲存成功！" -ForegroundColor Green
        }
        else {
            Write-Host "❌ 已取消" -ForegroundColor Yellow
        }

        $next = Read-Host "`n繼續輸入下一筆? (Y/N) [預設 Y]"
        if ($next -match "^[Nn]") { break }
    }
}
