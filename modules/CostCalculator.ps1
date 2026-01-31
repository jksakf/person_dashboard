# Modules/CostCalculator.ps1

function Get-TransactionData {
    param (
        [string]$TargetDate = (Get-Date -Format "yyyyMMdd")
    )
    
    $config = $Script:Config
    $outputDir = if ($config.OutputDirectory) { $config.OutputDirectory } else { "output" }
    
    # Ensure Absolute Path
    if (-not [System.IO.Path]::IsPathRooted($outputDir)) {
        if ($Script:RootPath) {
            $outputDir = Join-Path $Script:RootPath $outputDir
        }
        else {
            $outputDir = Resolve-Path $outputDir
        }
    }

    $csvPath = Join-Path $outputDir "history_data/Transactions/transactions.csv"

    if (-not (Test-Path $csvPath)) {
        Write-Warning "查無交易紀錄檔案: $csvPath"
        return @()
    }

    # Import CSV
    $data = Import-Csv -Path $csvPath -Encoding Unicode | Where-Object { $_.'日期' -le $TargetDate }
    
    # Sort by Date ASC (Important for FIFO/Avg Cost)
    $data = $data | Sort-Object '日期'
    return $data
}

function Get-PortfolioStatus {
    param (
        [string]$TargetDate = (Get-Date -Format "yyyyMMdd")
    )

    $transactions = Get-TransactionData -TargetDate $TargetDate
    $portfolio = @{} 

    foreach ($t in $transactions) {
        $code = $t.'代號'
        # [Fix] 防止 CSV 有空行或代號為空導致 Crash
        if ([string]::IsNullOrWhiteSpace($code)) { continue }

        $name = $t.'名稱'
        $type = $t.'類別'
        if (-not [string]::IsNullOrWhiteSpace($type)) { $type = $type.Trim() }
        
        # (New) 讀取幣別與匯率
        $currency = if ($t.'幣別') { $t.'幣別' } else { "TWD" }
        $rateStr = $t.'匯率'
        $rate = 1.0
        if (-not [string]::IsNullOrWhiteSpace($rateStr) -and $rateStr -match "^\d+(\.\d+)?$") {
            $rate = [double]$rateStr
        }

        $qty = [int]$t.'股數'
        $amount = [double]$t.'總金額' # 紀錄上的金額 (可能是 TWD 或 外幣)
        
        # 換算 原幣金額 與 台幣金額
        # Case 1: 紀錄為 TWD -> Orig = Amt / Rate, TWD = Amt
        # Case 2: 紀錄為 外幣 -> Orig = Amt, TWD = Amt * Rate
        $amountOrig = 0.0
        $amountTWD = 0.0
        
        # [Strategy] 優先讀取明確記錄的 "交割金額(台幣)" (若有)
        # 用於解決匯率換算誤差問題
        if ($t.PSObject.Properties.Match('交割金額(台幣)').Count -gt 0 -and 
            -not [string]::IsNullOrWhiteSpace($t.'交割金額(台幣)')) {
            $amountTWD = [double]$t.'交割金額(台幣)'
        }
        
        if ($currency -eq "TWD") {
            # 若為台幣且無明確記錄，則 Amt 從總金額來
            if ($amountTWD -eq 0) { $amountTWD = $amount }
            $amountOrig = if ($rate -gt 0) { $amount / $rate } else { $amount }
        }
        else {
            $amountOrig = $amount
            # 若無明確記錄，則用匯率算
            if ($amountTWD -eq 0) { $amountTWD = $amount * $rate }
        }

        if (-not $portfolio.ContainsKey($code)) {
            $portfolio[$code] = [PSCustomObject]@{
                Code          = $code
                Name          = $name
                Currency      = $currency
                Quantity      = 0
                TotalCostOrig = 0.0     # 剩餘庫存總成本 (原幣, FIFO)
                TotalCostTWD  = 0.0     # 剩餘庫存總成本 (台幣, FIFO)
                AvgCostOrig   = 0.0
                AvgCostTWD    = 0.0
                RealizedPnL   = 0.0
                Batches       = [System.Collections.Generic.Queue[PSCustomObject]]::new()
            }
        }

        $p = $portfolio[$code]

        # Regex Safe Match (使用直觀中文)
        $isBuy = $type -match "Buy" -or $type -match "買"
        $isSell = $type -match "Sell" -or $type -match "賣"

        if ($isBuy) {
            # 買入：建立新批次
            $batch = [PSCustomObject]@{
                Quantity      = $qty
                TotalCostOrig = $amountOrig
                TotalCostTWD  = $amountTWD
                UnitCostOrig  = if ($qty -gt 0) { $amountOrig / $qty } else { 0 }
                UnitCostTWD   = if ($qty -gt 0) { $amountTWD / $qty } else { 0 }
            }
            $p.Batches.Enqueue($batch)
            
            $p.Quantity += $qty
            $p.TotalCostOrig += $amountOrig
            $p.TotalCostTWD += $amountTWD
        }
        elseif ($isSell) {
            if ($p.Quantity -eq 0) { continue }

            $remainingToSell = $qty
            $cogsOrig = 0.0
            $cogsTWD = 0.0

            while ($remainingToSell -gt 0 -and $p.Batches.Count -gt 0) {
                $batch = $p.Batches.Peek()

                if ($batch.Quantity -le $remainingToSell) {
                    # 此批耗盡
                    $cogsOrig += $batch.TotalCostOrig
                    $cogsTWD += $batch.TotalCostTWD
                    $remainingToSell -= $batch.Quantity
                    $p.Batches.Dequeue() | Out-Null
                }
                else {
                    # 此批部分賣出
                    $partialOrig = $batch.UnitCostOrig * $remainingToSell
                    $partialTWD = $batch.UnitCostTWD * $remainingToSell
                    
                    $cogsOrig += $partialOrig
                    $cogsTWD += $partialTWD
                    
                    $batch.Quantity -= $remainingToSell
                    $batch.TotalCostOrig -= $partialOrig
                    $batch.TotalCostTWD -= $partialTWD
                    $remainingToSell = 0
                }
            }
            
            if ($remainingToSell -gt 0) {
                Write-Warning "庫存異常: $code 超賣 $remainingToSell 股 (持有量將變為負數)"
            }
            
            # 賣出時通常用 "成交金額" 減去 "成本" 算損益
            # 這裡 $amount 是成交金額 (依照 Currency)
            # 為了簡化 PnL 累積，我們先只算 "紀錄幣別" 的損益，詳盡報表由 Get-PnLReport 負責
            # 但這裡的 RealizedPnL 只是個概數
            $pnl = 0
            if ($currency -eq "TWD") { $pnl = $amount - $cogsTWD }
            else { $pnl = $amount - $cogsOrig }
            
            $p.Quantity -= $qty
            $p.TotalCostOrig -= $cogsOrig
            $p.TotalCostTWD -= $cogsTWD
            $p.RealizedPnL += $pnl

            if ($p.Quantity -le 0) {
                $p.Quantity = 0
                $p.TotalCostOrig = 0
                $p.TotalCostTWD = 0
                $p.Batches.Clear()
            }
        }
        
        # 更新平均成本
        if ($p.Quantity -gt 0) {
            $p.AvgCostOrig = $p.TotalCostOrig / $p.Quantity
            $p.AvgCostTWD = $p.TotalCostTWD / $p.Quantity
        }
        else {
            $p.AvgCostOrig = 0
            $p.AvgCostTWD = 0
        }
    }

    return $portfolio
}

function Get-PnLReport {
    param (
        [string]$TargetYear = (Get-Date -Format "yyyy")
    )

    # 取得所有歷史直到年底 (或現在)
    $queryDate = if ($TargetYear -eq "ALL") { "99991231" } else { "${TargetYear}1231" }
    $transactions = Get-TransactionData -TargetDate $queryDate
    
    $pnlRecords = [System.Collections.ArrayList]::new()
    $portfolio = @{} 

    foreach ($t in $transactions) {
        $code = $t.'代號'
        $name = $t.'名稱'
        $type = $t.'類別'
        $currency = if ($t.'幣別') { $t.'幣別' } else { "TWD" } # Get Currency
        $qty = [int]$t.'股數'
        $amount = [double]$t.'總金額'
        $date = $t.'日期'
        
        if (-not $portfolio.ContainsKey($code)) {
            $portfolio[$code] = [PSCustomObject]@{
                Batches = [System.Collections.Generic.Queue[PSCustomObject]]::new()
                Name    = $name
            }
        }
        $p = $portfolio[$code]

        # [Fix] 統一匯率處理邏輯 (參考 Get-PortfolioStatus)
        $rateStr = $t.'匯率'
        $rate = 1.0
        if (-not [string]::IsNullOrWhiteSpace($rateStr) -and $rateStr -match "^\d+(\.\d+)?$") {
            $rate = [double]$rateStr
        }

        # 換算
        $amountOrig = 0.0
        $amountTWD = 0.0
        
        # [Strategy] 優先讀取 "交割金額(台幣)"
        if ($t.PSObject.Properties.Match('交割金額(台幣)').Count -gt 0 -and 
            -not [string]::IsNullOrWhiteSpace($t.'交割金額(台幣)')) {
            $amountTWD = [double]$t.'交割金額(台幣)'
        }

        if ($currency -eq "TWD") {
            if ($amountTWD -eq 0) { $amountTWD = $amount }
            $amountOrig = if ($rate -gt 0) { $amount / $rate } else { $amount }
        }
        else {
            $amountOrig = $amount
            if ($amountTWD -eq 0) { $amountTWD = $amount * $rate }
        }

        if ($type -match "買") {
            $batch = [PSCustomObject]@{
                Quantity      = $qty
                TotalCostOrig = $amountOrig
                TotalCostTWD  = $amountTWD
                UnitCostOrig  = if ($qty -gt 0) { $amountOrig / $qty } else { 0 }
                UnitCostTWD   = if ($qty -gt 0) { $amountTWD / $qty } else { 0 }
            }
            $p.Batches.Enqueue($batch)
        }
        elseif ($type -match "賣") {
            if ($p.Batches.Count -eq 0) {
                Write-Warning "賣出異常: $code ($date) 無庫存可賣 (Qty: $qty)"
                continue 
            }
            
            $remainingToSell = $qty
            $totalCogsOrig = 0.0
            $totalCogsTWD = 0.0
            
            while ($remainingToSell -gt 0 -and $p.Batches.Count -gt 0) {
                $batch = $p.Batches.Peek()
                
                if ($batch.Quantity -le $remainingToSell) {
                    $totalCogsOrig += $batch.TotalCostOrig
                    $totalCogsTWD += $batch.TotalCostTWD
                    $remainingToSell -= $batch.Quantity
                    $p.Batches.Dequeue() | Out-Null
                }
                else {
                    $partialOrig = $batch.UnitCostOrig * $remainingToSell
                    $partialTWD = $batch.UnitCostTWD * $remainingToSell
                    
                    $totalCogsOrig += $partialOrig
                    $totalCogsTWD += $partialTWD
                    
                    $batch.Quantity -= $remainingToSell
                    $batch.TotalCostOrig -= $partialOrig
                    $batch.TotalCostTWD -= $partialTWD
                    $remainingToSell = 0
                }
            }
            
            if ($remainingToSell -gt 0) {
                Write-Warning "庫存不足: $code ($date) 超賣 $remainingToSell 股"
            }
            
            $cogsOrig = $totalCogsOrig
            $cogsTWD = $totalCogsTWD
            
            $pnlOrig = 0
            $pnlTWD = 0
            
            if ($currency -eq "TWD") {
                $pnlOrig = $amount - $cogsOrig
                $pnlTWD = $amount - $cogsTWD # TWD case: same
            }
            else {
                $pnlOrig = $amountOrig - $cogsOrig
                $pnlTWD = $amountTWD - $cogsTWD
            }
            
            if ($TargetYear -eq "ALL" -or $date.StartsWith($TargetYear)) {
                
                $roi = 0
                if ($cogsTWD -ne 0) { $roi = ($pnlTWD / $cogsTWD) * 100 }
                
                $record = [ordered]@{
                    "日期"        = [datetime]::Parse($date).ToString("yyyy/MM/dd")
                    "市場"        = if ($currency -eq "TWD") { "台股" } elseif ($currency -eq "HKD") { "港股" } elseif ($currency -eq "USD") { "美股" } else { "外幣" }
                    "股票代號"      = $code
                    "股票名稱"      = $p.Name
                    "幣別"        = $currency
                    "賣出股數"      = $qty
                    "匯率"        = $rate
                    "總成本(原幣)"   = [math]::Round($cogsOrig, 2)
                    "賣出價(原幣)"   = [math]::Round($amountOrig, 2)
                    "已實現損益(原幣)" = if ($currency -eq "TWD") { [math]::Floor($pnlOrig) } else { [math]::Round($pnlOrig, 2) }
                    "總成本(台幣)"   = [math]::Floor($cogsTWD)
                    "賣出價(台幣)"   = [math]::Floor($amountTWD)
                    "已實現損益(台幣)" = [math]::Floor($pnlTWD)
                    "報酬率%"      = "$([math]::Round($roi, 2))%"
                }
                $pnlRecords.Add([PSCustomObject]$record) | Out-Null
            }
        }
    }
    
    return $pnlRecords
}
