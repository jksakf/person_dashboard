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
    # Structure: Code -> { Name, Quantity, TotalCost, RealizedPnL_Accumulated, DetailHistory }

    foreach ($t in $transactions) {
        $code = $t.'代號'
        
        # [Fix] 防止 CSV 有空行或代號為空導致 Crash
        if ([string]::IsNullOrWhiteSpace($code)) {
            continue
        }

        $name = $t.'名稱'
        $type = $t.'類別'
        if (-not [string]::IsNullOrWhiteSpace($type)) {
            $type = $type.Trim()
        }
        
        # (New) 讀取幣別
        $currency = if ($t.'幣別') { $t.'幣別' } else { "TWD" }

        $qty = [int]$t.'股數'
        $amount = [double]$t.'總金額' # Buy: Cost (inc fee), Sell: Net Proceeds (dec fee/tax)
        
        if (-not $portfolio.ContainsKey($code)) {
            $portfolio[$code] = [PSCustomObject]@{
                Code        = $code
                Name        = $name
                Currency    = $currency
                Quantity    = 0
                TotalCost   = 0.0
                RealizedPnL = 0.0
                AvgCost     = 0.0
            }
        }

        $p = $portfolio[$code]

        # Regex Safe Match:
        # Buy = 買 (8CB7) or Buy
        # Sell = 賣 (8CE3) or Sell
        $isBuy = $type -match "Buy" -or $type -match [char]0x8CB7
        $isSell = $type -match "Sell" -or $type -match [char]0x8CE3

        if ($isBuy) {
            # 買入：增加庫存，增加總成本
            $p.Quantity += $qty
            $p.TotalCost += $amount
        }
        elseif ($isSell) {
            # 賣出：減少庫存，計算損益
            if ($p.Quantity -eq 0) {
                Write-Warning "異常交易：嘗試賣出無庫存股票 $code ($qty)"
                continue
            }

            # 計算當下平均成本 (每股)
            $avgCost = $p.TotalCost / $p.Quantity
            
            # 銷售成本 (Cost of Goods Sold)
            $cogs = $avgCost * $qty
            
            # 計算已實現損益 = 淨交割金額 - 銷售成本
            $pnl = $amount - $cogs
            
            # 更新庫存狀態
            $p.Quantity -= $qty
            $p.TotalCost -= $cogs
            $p.RealizedPnL += $pnl

            # 處理浮點數誤差 (若庫存歸零，成本應歸零)
            if ($p.Quantity -le 0) {
                $p.Quantity = 0
                $p.TotalCost = 0
            }
        }
        
        # 更新平均成本顯示 (避免除以零)
        if ($p.Quantity -gt 0) {
            $p.AvgCost = $p.TotalCost / $p.Quantity
        }
        else {
            $p.AvgCost = 0
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
    
    # 僅篩選當年度的賣出，但需重跑所有歷史以計算正確成本
    $pnlRecords = [System.Collections.ArrayList]::new()
    
    # 臨時庫存狀態 (用於 Replay) - 改用 FIFO
    $portfolio = @{} 

    foreach ($t in $transactions) {
        $code = $t.'代號'
        $name = $t.'名稱'
        $type = $t.'類別'
        $qty = [int]$t.'股數'
        $amount = [double]$t.'總金額'
        $date = $t.'日期'
        
        if (-not $portfolio.ContainsKey($code)) {
            # 使用佇列（Queue）追蹤每批買入
            $portfolio[$code] = [PSCustomObject]@{
                Batches = [System.Collections.Generic.Queue[PSCustomObject]]::new()
                Name    = $name
            }
        }
        $p = $portfolio[$code]

        if ($type -eq "買進") {
            # 記錄這批買入
            $batch = [PSCustomObject]@{
                Quantity  = $qty
                TotalCost = $amount
            }
            $p.Batches.Enqueue($batch)
        }
        elseif ($type -eq "賣出") {
            if ($p.Batches.Count -eq 0) { continue }
            
            # FIFO: 從最早買入的批次開始賣出
            $remainingToSell = $qty
            $totalCogs = 0.0
            
            while ($remainingToSell -gt 0 -and $p.Batches.Count -gt 0) {
                $batch = $p.Batches.Peek()  # 查看最早的批次
                
                if ($batch.Quantity -le $remainingToSell) {
                    # 這批全部賣掉
                    $totalCogs += $batch.TotalCost
                    $remainingToSell -= $batch.Quantity
                    $p.Batches.Dequeue() | Out-Null  # 移除這批
                }
                else {
                    # 這批部分賣掉
                    $avgCost = $batch.TotalCost / $batch.Quantity
                    $partialCost = $avgCost * $remainingToSell
                    $totalCogs += $partialCost
                    
                    # 更新剩餘
                    $batch.Quantity -= $remainingToSell
                    $batch.TotalCost -= $partialCost
                    $remainingToSell = 0
                }
            }
            
            $cogs = $totalCogs
            $pnl = $amount - $cogs
            
            # 若此交易發生在目標年份，則記錄
            if ($TargetYear -eq "ALL" -or $date.StartsWith($TargetYear)) {
                
                $roi = 0
                if ($cogs -ne 0) { $roi = ($pnl / $cogs) * 100 }
                
                $record = [ordered]@{
                    "日期"    = [datetime]::Parse($date).ToString("yyyy/MM/dd")
                    "市場"    = "台股"
                    "股票代號"  = $code
                    "股票名稱"  = $p.Name
                    "賣出股數"  = $qty
                    "總成本"   = [math]::Round($cogs, 0)
                    "賣出價"   = [math]::Round($amount, 0)
                    "已實現損益" = [math]::Round($pnl, 0)
                    "報酬率%"  = "$([math]::Round($roi, 2))%"
                    "匯率"    = "1.0"
                }
                $pnlRecords.Add([PSCustomObject]$record) | Out-Null
            }
        }
    }
    
    return $pnlRecords
}
