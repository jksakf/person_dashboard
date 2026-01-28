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
        
        if ($currency -eq "TWD") {
            $amountTWD = $amount
            $amountOrig = if ($rate -gt 0) { $amount / $rate } else { $amount }
        }
        else {
            $amountOrig = $amount
            $amountTWD = $amount * $rate
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

        # Regex Safe Match
        $isBuy = $type -match "Buy" -or $type -match [char]0x8CB7
        $isSell = $type -match "Sell" -or $type -match [char]0x8CE3

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

        if ($type -match "買") {
            # Simple "買" check covers Buy/買進/買入
            $batch = [PSCustomObject]@{
                Quantity  = $qty
                TotalCost = $amount
                UnitCost  = if ($qty -gt 0) { $amount / $qty } else { 0 }
            }
            $p.Batches.Enqueue($batch)
        }
        elseif ($type -match "賣") {
            if ($p.Batches.Count -eq 0) { continue }
            
            $remainingToSell = $qty
            $totalCogs = 0.0
            
            while ($remainingToSell -gt 0 -and $p.Batches.Count -gt 0) {
                $batch = $p.Batches.Peek()
                
                if ($batch.Quantity -le $remainingToSell) {
                    $totalCogs += $batch.TotalCost
                    $remainingToSell -= $batch.Quantity
                    $p.Batches.Dequeue() | Out-Null
                }
                else {
                    $partialCost = $batch.UnitCost * $remainingToSell
                    $totalCogs += $partialCost
                    
                    $batch.Quantity -= $remainingToSell
                    $batch.TotalCost -= $partialCost
                    $remainingToSell = 0
                }
            }
            
            $cogs = $totalCogs
            $pnl = $amount - $cogs
            
            if ($TargetYear -eq "ALL" -or $date.StartsWith($TargetYear)) {
                
                $roi = 0
                if ($cogs -ne 0) { $roi = ($pnl / $cogs) * 100 }
                
                $record = [ordered]@{
                    "日期"    = [datetime]::Parse($date).ToString("yyyy/MM/dd")
                    "市場"    = if ($currency -eq "TWD") { "台股" } else { "外幣" }
                    "股票代號"  = $code
                    "股票名稱"  = $p.Name
                    "幣別"    = $currency
                    "賣出股數"  = $qty
                    "總成本"   = [math]::Round($cogs, 2)    # 外幣可能會有小數
                    "賣出價"   = [math]::Round($amount, 2)
                    "已實現損益" = [math]::Round($pnl, 2)
                    "報酬率%"  = "$([math]::Round($roi, 2))%"
                }
                $pnlRecords.Add([PSCustomObject]$record) | Out-Null
            }
        }
    }
    
    return $pnlRecords
}
