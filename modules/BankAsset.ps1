# Modules/BankAsset.ps1

function Invoke-BankAssetFlow {
    Write-Log ">>> 正在啟動 [銀行資產] 模組..." -Level Info
    
    $data = [System.Collections.ArrayList]::new()
    $defaultDate = Get-Date -Format "yyyyMMdd"
    
    # -----------------------------------------------------------
    # 修改：改讀取 account_list.txt
    # -----------------------------------------------------------
    $txtPath = Join-Path $Script:RootPath "account_list.txt"
    $accounts = @()

    if (Test-Path $txtPath) {
        try {
            # 嘗試讀取，過濾空白行
            $accounts = Get-Content $txtPath -Encoding UTF8 | Where-Object { $_ -match "\S" }
            Write-Log "已載入帳戶列表 ($($accounts.Count) 筆)" -Level Info
        }
        catch {
            Write-Log "讀取 account_list.txt 失敗，使用預設值" -Level Warning
            $accounts = @("富邦", "將來", "國泰")
        }
    }
    else {
        # 檔案不存在，建立預設
        Write-Log "找不到 account_list.txt，建立預設檔案..." -Level Warning
        $accounts = @("富邦", "將來", "國泰證券交割戶", "國泰(青年子帳戶)", "LINEPAY", "股票/ETF(國泰)", "保單金")
        $accounts | Set-Content $txtPath -Encoding UTF8
    }
    # -----------------------------------------------------------

    try {
        while ($true) {
            Write-Host "`n--- 新增一筆資料 (預設日期: $defaultDate) ---" -ForegroundColor Green
            
            # 1. 輸入日期
            $inputDate = Get-ValidDate -DefaultDate $defaultDate
            $defaultDate = $inputDate
            $date = [datetime]::ParseExact($inputDate, "yyyyMMdd", $null).ToString("yyyy/MM/dd")

            # 2. 選擇帳戶
            Write-Host "💳 可用帳戶:"
            for ($i = 0; $i -lt $accounts.Count; $i++) {
                Write-Host "   $($i+1). $($accounts[$i])"
            }
            
            $accInput = Get-CleanInput -Prompt "請輸入帳戶名稱 或 選單編號"
            $accountName = ""
            
            if ($accInput -match "^\d+$") {
                $idx = [int]$accInput
                if ($idx -ge 1 -and $idx -le $accounts.Count) {
                    $accountName = $accounts[$idx - 1]
                }
                else {
                    Write-Log "❌ 無效的編號" -Level Warning
                    continue
                }
            }
            elseif ($accInput -in $accounts) {
                $accountName = $accInput
            }
            else {
                Write-Log "❌ 輸入錯誤，必須是清單中的名稱或編號" -Level Warning
                continue
            }

            # 3. 輸入金額
            $amtInput = Get-CleanInput -Prompt "請輸入金額 (整數)" 
            if ($amtInput -notmatch "^-?\d+$") {
                Write-Log "❌ 金額必須為數字" -Level Warning
                continue
            }
            $amount = [int]$amtInput

            # 4. 加入清單
            $record = [PSCustomObject]@{
                "日期"   = $date
                "帳戶名稱" = $accountName
                "金額"   = $amount
            }
            $data.Add($record) | Out-Null
            Write-Log "✅ 已暫存: $date | $accountName | $amount" -Level Info
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

    # 匯出資料
    Export-DataToCsv -Data $data -FileNamePrefix "bank_assets"
    Read-Host "`n按 Enter 鍵繼續..."
}
