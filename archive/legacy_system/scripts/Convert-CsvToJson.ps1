<#
.SYNOPSIS
    個人資產管理系統 - 歷史 CSV 轉單一 JSON 資料庫工具
.DESCRIPTION
    本腳本負責將現有的 transactions.csv、最新 bank_assets.csv 與 stock_list.txt 
    自動聚合轉換為現代化一體工作台所需之 assets_data.json，並強制採用 UTF-8 with BOM 編碼儲存。
.NOTES
    建立日期: 2026-09-24
    編碼標準: UTF-8 with BOM
#>

[CmdletBinding()]
param(
    [string]$WorkspaceRoot = "c:\person\Me\Money\person_dashboard"
)

# 設定主控台輸出編碼為 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "     個人資產資料庫遷移工具 (CSV -> assets_data.json)      " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan

# 1. 讀取常用股票字典
$stockListPath = Join-Path $WorkspaceRoot "stock_list.txt"
$stockDict = @()
if (Test-Path $stockListPath) {
    $lines = Get-Content $stockListPath -Encoding UTF8
    foreach ($line in $lines) {
        $parts = $line.Split(',')
        if ($parts.Count -ge 3) {
            $stockDict += @{
                market = $parts[0].Trim()
                symbol = $parts[1].Trim()
                name   = $parts[2].Trim()
            }
        }
    }
    Write-Host "[成功] 載入常用股票字典: $($stockDict.Count) 檔" -ForegroundColor Green
}

# 2. 讀取常用帳戶清單
$accountListPath = Join-Path $WorkspaceRoot "account_list.txt"
$accountList = @()
if (Test-Path $accountListPath) {
    $accountList = Get-Content $accountListPath -Encoding UTF8 | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
    Write-Host "[成功] 載入常用帳戶清單: $($accountList.Count) 筆" -ForegroundColor Green
}

# 3. 讀取交易紀錄 CSV (transactions.csv)
$transPath = Join-Path $WorkspaceRoot "output\history_data\Transactions\transactions.csv"
$transactions = @()
if (Test-Path $transPath) {
    # 歷史檔案為 UTF-16 LE (Unicode)
    $csvData = Import-Csv -Path $transPath -Encoding Unicode
    $idx = 1
    foreach ($row in $csvData) {
        $dateStr = if ($row.'日期') { $row.'日期'.Trim() } else { "" }
        $action = if ($row.'類別' -eq '買進') { '買入' } else { $row.'類別' }
        $price = [double]($row.'價格' -replace '[^\d\.]', '')
        $shares = [int]($row.'股數' -replace '[^\d]', '')
        $fee = [double]($row.'手續費' -replace '[^\d\.]', '')
        $tax = [double]($row.'交易稅' -replace '[^\d\.]', '')
        $total = [double]($row.'總金額' -replace '[^\d\.]', '')
        $netTwd = if ($row.'交割金額(台幣)') { [double]($row.'交割金額(台幣)' -replace '[^\d\.]', '') } else { $total }

        $id = "tx_" + ($dateStr -replace '[\/\-]', '') + "_" + $idx.ToString("000")
        $transactions += @{
            id           = $id
            date         = $dateStr.Replace('-', '/')
            symbol       = if ($row.'代號') { $row.'代號'.Trim() } else { "" }
            name         = if ($row.'名稱') { $row.'名稱'.Trim() } else { "" }
            action       = $action
            currency     = if ($row.'幣別') { $row.'幣別'.Trim() } else { "TWD" }
            exchangeRate = if ($row.'匯率') { [double]($row.'匯率' -replace '[^\d\.]', '') } else { 1.0 }
            price        = $price
            shares       = $shares
            fee          = $fee
            tax          = $tax
            totalAmount  = $total
            netAmountTwd = $netTwd
            note         = if ($row.'備註') { $row.'備註'.Trim() } else { "" }
        }
        $idx++
    }
    Write-Host "[成功] 轉換交易紀錄: $($transactions.Count) 筆" -ForegroundColor Green
}

# 4. 讀取最新銀行資產 CSV
$bankDir = Join-Path $WorkspaceRoot "output\history_data\Bank_assets"
$bankAssets = @()
if (Test-Path $bankDir) {
    $latestBankCsv = Get-ChildItem -Path (Join-Path $bankDir "*.csv") | Sort-Object Name -Descending | Select-Object -First 1
    if ($latestBankCsv) {
        Write-Host "[讀取] 採用最新銀行資產快照: $($latestBankCsv.Name)" -ForegroundColor Yellow
        $csvBank = Import-Csv -Path $latestBankCsv.FullName -Encoding Unicode
        $bIdx = 1
        foreach ($bRow in $csvBank) {
            $amount = [double]($bRow.'金額' -replace '[^\d\.\-]', '')
            $bId = "bank_" + ($bRow.'日期' -replace '[\/\-]', '') + "_" + $bIdx.ToString("000")
            $bankAssets += @{
                id             = $bId
                date           = if ($bRow.'日期') { $bRow.'日期'.Trim().Replace('-', '/') } else { "" }
                bankName       = if ($bRow.'帳戶名稱') { $bRow.'帳戶名稱'.Trim() } else { "" }
                accountType    = "活存"
                currency       = "TWD"
                originalAmount = $amount
                exchangeRate   = 1.0
                twdAmount      = $amount
                note           = ""
            }
            $bIdx++
        }
        Write-Host "[成功] 轉換銀行資產: $($bankAssets.Count) 筆帳戶" -ForegroundColor Green
    }
}

# 5. 組裝完整 JSON 結構
$exportObj = @{
    meta         = @{
        version     = "1.0.0"
        lastUpdated = (Get-Date).ToString("yyyy/MM/dd HH:mm:ss")
        feeRates    = @{
            stockFeeRate = 0.001425
            stockTaxRate = 0.003
            minFee       = 20
        }
        stockDict   = $stockDict
        accountList = $accountList
    }
    bankAssets   = $bankAssets
    transactions = $transactions
    realizedPnL  = @()
}

$outputJsonPath = Join-Path $WorkspaceRoot "assets_data.json"
$jsonString = $exportObj | ConvertTo-Json -Depth 6

# 以 UTF-8 with BOM 寫入檔案
$utf8WithBom = New-Object System.Text.UTF8Encoding($true)
[System.IO.File]::WriteAllText($outputJsonPath, $jsonString, $utf8WithBom)

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host " 匯出完成！檔案已寫入: assets_data.json (UTF-8 with BOM) " -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Cyan
