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

    # [Fix] 終極 CSV 讀取 (清洗標題 + 手動解析)
    $encodings = @("Default", "UTF8", "Unicode") 
    $targetData = $null

    foreach ($enc in $encodings) {
        try {
            # 1. 讀取所有內容 (為了後續 ConvertFrom-Csv)
            $lines = Get-Content -Path $csvPath -Encoding $enc -ErrorAction Stop
            if ($lines.Count -eq 0) { continue }
            
            # 2. 標題清洗 (修正：僅移除 BOM 與不可見字元，保留引號)
            # 0xFEFF = BOM, 0x200B = Zero Width Space
            $lines[0] = $lines[0].Trim([char]0xFEFF, [char]0x200B)
            
            # 使用 Regex 移除開頭非文字且非引號的字元 (保留 " )
            # 這樣可以處理 ï»¿"日期" -> "日期"
            $lines[0] = $lines[0] -replace "^[^a-zA-Z0-9\p{IsCJKUnifiedIdeographs}`"']+", ""
            
            # 標題清洗 2: 去除逗號前後的空白 (避免 "日期, 代號" 導致屬性名變成 " 代號")
            $lines[0] = $lines[0] -replace "\s*,\s*", ","

            $header = $lines[0]
            
            if ($header -match "日期" -or $header -match "Date" -or $header -match "代號") {
                
                # 3. 決定分隔符號
                $delimiter = ","
                if (($header -split "`t").Count -gt ($header -split ",").Count) {
                    $delimiter = "`t"
                }

                # 4. 嘗試轉換
                try {
                    $tempData = $lines | ConvertFrom-Csv -Delimiter $delimiter
                    
                    if ($tempData.Count -ge 0) {
                        # Debug: 顯示抓到的屬性
                        $props = if ($tempData.Count -gt 0) { $tempData[0].PSObject.Properties.Name } else { @() }
                        # 將屬性強制轉為陣列以避免純字串 `.Count` 或 `[0]` 行為差異
                        $propsArray = @($props)
                        
                        Write-Log "Debug 屬性列表 (第一次): $($propsArray -join ', ')" -Level Info

                        # [Fix] 針對 "單一欄位且包含逗號" 的情況 (代表整行被引號包住)
                        # 注意：若 Props 是單一字串 "A,B,C"，Count 為 1。
                        if ($propsArray.Count -eq 1 -and $propsArray[0] -match ",") {
                            Write-Log "偵測到標題被引號包夾，嘗試移除引號重讀..." -Level Warning
                            $lines[0] = $lines[0].Trim().Trim('"')
                            try {
                                $tempData = $lines | ConvertFrom-Csv -Delimiter $delimiter
                                $props = if ($tempData.Count -gt 0) { $tempData[0].PSObject.Properties.Name } else { @() }
                                $propsArray = @($props) #Update array
                                Write-Log "Debug 屬性列表 (重試後): $($propsArray -join ', ')" -Level Info
                            }
                            catch {}
                        }
                        
                        # 寬容檢查：只要包含關鍵字即可
                        if ($propsArray -match "日期" -or $propsArray -match "代號" -or $propsArray -match "Date") {
                            $targetData = $tempData
                            Write-Log "成功識別 CSV 格式 | 編碼: $enc | 分隔符號: $(if($delimiter -eq "`t"){"Tab"}else{"Comma"}) | 筆數: $($tempData.Count)" -Level Info
                            break
                        }
                    }
                }
                catch {
                    # Convert 失敗
                }
            }
        }
        catch {
            # 讀取失敗換下一個
        }
    }

    if ($targetData) {
        # [Fix] 日期格式正規化
        # CSV 日期可能是 2024/01/01，而 TargetDate 是 20260126
        # 需將 CSV 日期移除 / - 符號後再比較
        $data = $targetData | Where-Object { 
            $d = $_.'日期' -replace "[^0-9]", ""  # 移除非數字
            $checkDate = if ($d) { $d } else { "99999999" } # 若無日期則不過濾(或視為未來?)
            $checkDate -le $TargetDate 
        }
        Write-Log "資料篩選後筆數: $($data.Count) (TargetDate: $TargetDate)" -Level Info
    }
    else {
        Write-Warning "⚠️ 嚴重: 無法識別 CSV 編碼或標題 (已嘗試清洗標題)。將使用預設 Import-Csv 強制讀取。"
        $data = Import-Csv -Path $csvPath -Encoding Unicode | Where-Object { $_.'日期' -le $TargetDate }
    }
    
    # Sort by Date ASC (Important for FIFO/Avg Cost)
    $data = $data | Sort-Object '日期'
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
        $date = $t.'日期'
        
        # [Fix] 防止 CSV 有空行或代號為空導致 Crash
        if ([string]::IsNullOrWhiteSpace($code)) {
            # 如果整行都是空的 (Excel 常見問題)，靜默跳過
            if ([string]::IsNullOrWhiteSpace($name) -and [string]::IsNullOrWhiteSpace($date)) {
                continue
            }
            # 如果有資料但沒代號，才警告
            Write-Warning "忽略無效交易紀錄 (代號為空): 日期=$date, 名稱=$name"
            continue
        }
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

function Get-PnLReport {
    param (
        [string]$TargetYear = (Get-Date -Format "yyyy")
    )

    # 取得所有歷史直到年底
    $transactions = Get-TransactionData -TargetDate "${TargetYear}1231"
    
    # 僅篩選當年度的賣出，但需重跑所有歷史以計算正確成本
    $pnlRecords = [System.Collections.ArrayList]::new()
    
    # 臨時庫存狀態 (用於 Replay)
    $portfolio = @{} 

    foreach ($t in $transactions) {
        $code = $t.'代號'
        
        # [Fix] 防止 CSV 有空行或代號為空導致 Crash
        if ([string]::IsNullOrWhiteSpace($code)) {
            continue
        }

        $name = $t.'名稱'
        $type = $t.'類別'
        $qty = [int]$t.'股數'
        $amount = [double]$t.'總金額'
        $date = $t.'日期'
        
        if (-not $portfolio.ContainsKey($code)) {
            $portfolio[$code] = [PSCustomObject]@{
                Quantity  = 0
                TotalCost = 0.0
            }
        }
        $p = $portfolio[$code]

        if ($type -eq "買進") {
            $p.Quantity += $qty
            $p.TotalCost += $amount
        }
        elseif ($type -eq "賣出") {
            if ($p.Quantity -eq 0) { continue }

            # 計算當下平均成本
            $avgCost = $p.TotalCost / $p.Quantity
            $cogs = $avgCost * $qty
            $pnl = $amount - $cogs
            
            # 若此交易發生在目標年份，則記錄
            if ($date.StartsWith($TargetYear)) {
                $roi = 0
                if ($cogs -ne 0) { $roi = ($pnl / $cogs) * 100 }
                
                $record = [ordered]@{
                    "日期"    = [datetime]::ParseExact($date, "yyyyMMdd", $null).ToString("yyyy/MM/dd")
                    "市場"    = "台股" # 暫定，可從 mapping 找
                    "股票代號"  = $code
                    "股票名稱"  = $name
                    "賣出股數"  = $qty
                    "總成本"   = [math]::Round($cogs, 0)
                    "賣出價"   = [math]::Round($amount, 0) # 這是淨收入
                    "已實現損益" = [math]::Round($pnl, 0)
                    "報酬率%"  = "$([math]::Round($roi, 2))%"
                }
                $pnlRecords.Add([PSCustomObject]$record) | Out-Null
            }

            # 更新庫存
            $p.Quantity -= $qty
            $p.TotalCost -= $cogs
            
            if ($p.Quantity -le 0) {
                $p.Quantity = 0
                $p.TotalCost = 0
            }
        }
    }
    
    return $pnlRecords
}
