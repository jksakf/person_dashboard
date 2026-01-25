# Modules/StockHolding.ps1

function Invoke-StockHoldingFlow {
    Write-Log ">>> 正在啟動 [股票庫存] 模組..." -Level Info
    
    $data = [System.Collections.ArrayList]::new()
    $defaultDate = Get-Date -Format "yyyyMMdd"
    
    # 初始載入
    $stocks = Load-StockList

    try {
        while ($true) {
            Write-Host "`n--- 新增一筆股票庫存 (預設日期: $defaultDate) ---" -ForegroundColor Green
            
            # 1. 輸入日期
            $inputDate = Get-ValidDate -DefaultDate $defaultDate
            $defaultDate = $inputDate
            $date = [datetime]::ParseExact($inputDate, "yyyyMMdd", $null).ToString("yyyy/MM/dd")

            # 2. 選擇股票
            $selectedStock = $null
            $isNewStock = $false
            $inputCode = ""
            $inputName = ""
            $inputType = "" 
            
            if ($stocks.Count -gt 0) {
                # 使用 common.ps1 的顯示函數
                Show-StockOptionList -Stocks $stocks
                
                $stockInput = Get-CleanInput -Prompt "請輸入編號(選單) 或 代號/名稱(搜尋)"
                
                if ($stockInput -match "^\d+$" -and [int]$stockInput -ge 1 -and [int]$stockInput -le $stocks.Count) {
                    $selectedStock = $stocks[[int]$stockInput - 1]
                    $inputCode = $selectedStock.Code
                    $inputName = $selectedStock.Name
                    $inputType = $selectedStock.Type
                }
                else {
                    $found = $stocks | Where-Object { $_.Code -eq $stockInput -or $_.Name -like "*$stockInput*" }
                    if ($found) {
                        if ($found.Count -gt 1) {
                            Write-Host "⚠️ 找到多筆符合，將視為新輸入..."
                            $inputCode = $stockInput
                            $inputName = Get-CleanInput -Prompt "請手動輸入名稱"
                            $inputType = Get-CleanInput -Prompt "請輸入市場/類別" -DefaultValue "台股"
                            $isNewStock = $true
                        }
                        else {
                            $selectedStock = $found[0]
                            $inputCode = $selectedStock.Code
                            $inputName = $selectedStock.Name
                            $inputType = $selectedStock.Type
                            Write-Host "✅ 已選擇: $($inputName) ($($inputCode)) - $inputType"
                        }
                    }
                    else {
                        $inputCode = $stockInput
                        $inputName = Get-CleanInput -Prompt "請手動輸入名稱"
                        $inputType = Get-CleanInput -Prompt "請輸入市場/類別" -DefaultValue "台股"
                        $isNewStock = $true
                    }
                }
            }
            else {
                $inputCode = Get-CleanInput -Prompt "股票代號"
                $inputName = Get-CleanInput -Prompt "股票名稱"
                $inputType = Get-CleanInput -Prompt "請輸入市場" -DefaultValue "台股"
                $isNewStock = $true
            }

            if ($isNewStock) {
                $exists = $stocks | Where-Object { $_.Code -eq $inputCode }
                if (-not $exists) {
                    $updated = Add-StockToList -code $inputCode -name $inputName -type $inputType
                    if ($updated) { $stocks = Load-StockList }
                }
            }

            # 3. 股數
            $sharesStr = Get-CleanInput -Prompt "持有股數"
            if ($sharesStr -notmatch "^\d+$") { Write-Log "❌ 股數必須為正整數" -Level Warning; continue }
            $shares = [int]$sharesStr

            # 4. 總成本
            $totalCostStr = Get-CleanInput -Prompt "總成本 (Total Cost)"
            try { $totalCost = [decimal]$totalCostStr } catch { Write-Log "❌ 金額格式錯誤" -Level Warning; continue }

            # 5. 市值
            $marketValueStr = Get-CleanInput -Prompt "當前市值 (Market Value)"
            try { $marketValue = [decimal]$marketValueStr } catch { Write-Log "❌ 金額格式錯誤" -Level Warning; continue }

            # 計算損益
            $pnl = $marketValue - $totalCost
            
            # 報酬率 %
            if ($totalCost -ne 0) {
                $roi = ($pnl / $totalCost) * 100
                $roiStr = "$([math]::Round($roi, 2))%"
            }
            else {
                $roiStr = "0%"
            }

            # 輸出
            $record = [ordered]@{
                "日期"    = $date
                "市場"    = $inputType
                "股票代號"  = $inputCode
                "股票名稱"  = $inputName
                "持有股數"  = $shares
                "總成本"   = $totalCost
                "市值"    = $marketValue
                "未實現損益" = $pnl
                "報酬率%"  = $roiStr
            }
            $data.Add([PSCustomObject]$record) | Out-Null
            Write-Log "✅ 已暫存: $inputName | 市值: $([int]$marketValue) | 損益: $([int]$pnl) ($roiStr)" -Level Info
        }
    }
    catch {
        if ($_.Exception.Message -eq "UserExit") {
            Write-Host "`n結束輸入。"
        }
        else {
            Write-Error $_
        }
    }

    Export-DataToCsv -Data $data -FileNamePrefix "stock_holdings" -OutputDirectory "output/history_data/Stock_holdings"
    Read-Host "`n按 Enter 鍵繼續..."
}
