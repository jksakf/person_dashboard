# Modules/CostCalculator.ps1

function Get-TransactionData {
    param (
        [string]$TargetDate = (Get-Date -Format "yyyyMMdd")
    )
    
    $config = $Script:Config
    $outputDir = if ($config.OutputDirectory) { $config.OutputDirectory } else { "output" }
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
        $name = $t.'名稱'
        $type = $t.'類別'   # 買進 / 賣出
        $qty = [int]$t.'股數'
        $amount = [double]$t.'總金額' # Buy: Cost (inc fee), Sell: Net Proceeds (dec fee/tax)
        
        if (-not $portfolio.ContainsKey($code)) {
            $portfolio[$code] = [PSCustomObject]@{
                Code        = $code
                Name        = $name
                Quantity    = 0
                TotalCost   = 0.0
                RealizedPnL = 0.0
                AvgCost     = 0.0
            }
        }

        $p = $portfolio[$code]

        if ($type -eq "買進") {
            # 買入：增加庫存，增加總成本
            $p.Quantity += $qty
            $p.TotalCost += $amount
        }
        elseif ($type -eq "賣出") {
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
