<#
.SYNOPSIS
    AssetManager.ps1 - 個人資產管理系統主程式
#>

Write-Host "正在初始化 Asset Manager..." -ForegroundColor Cyan

# 1. 初始化環境
$ErrorActionPreference = "Stop"
try {
    $Script:RootPath = Split-Path -Parent $MyInvocation.MyCommand.Definition
    Set-Location $Script:RootPath
}
catch {
    Write-Error "無法設定工作目錄: $_"
    exit 1
}

# 載入共用函數
$CommonPath = Join-Path $Script:RootPath "common.ps1"
if (-not (Test-Path $CommonPath)) {
    Write-Error "找不到 $CommonPath"
    exit 1
}
. $CommonPath

# 2. 載入設定 (config.json 仍保留用於 OutputDirectory 設定，但帳戶列表已改讀 txt)
Get-Config | Out-Null

# 3. 靜態載入 Script (使用 Dot-Sourcing 確保在同一個 Scope)
# -------------------------------------------------------------
Write-Log "正在載入腳本..." -Level Info
$modules = @("BankAsset.ps1", "StockHolding.ps1", "RealizedPnL.ps1", "Transaction.ps1", "CostCalculator.ps1", "DataMerger.ps1", "PriceFetcher.ps1")
foreach ($mod in $modules) {
    $fullPath = Join-Path $Script:RootPath "modules/$mod"
    Write-Host "Loading $mod ..." -NoNewline
    try {
        . $fullPath
        Write-Host " OK" -ForegroundColor Green
    }
    catch {
        Write-Host " FAILED" -ForegroundColor Red
        Write-Error "Error loading $mod : $_"
        exit 1
    }
}
# -------------------------------------------------------------


# 4. 主迴圈
while ($true) {
    # -------------------------------------------------------------
    # 靜態定義選單
    # -------------------------------------------------------------
    $menuOptions = [ordered]@{
        "1" = @{ Description = "銀行資產輸入"; Action = { Invoke-BankAssetFlow } }
        "2" = @{ Description = "股票庫存輸入"; Action = { Invoke-StockHoldingFlow } }
        "3" = @{ Description = "已實現損益輸入"; Action = { Invoke-RealizedPnLFlow } }
        "4" = @{ Description = "錄入交易明細 (New Transaction)"; Action = { Invoke-TransactionFlow } }
        "5" = @{ Description = "合併年度資料 (Merge CSV)"; Action = { Invoke-DataMergerFlow } }
    }
    
    Show-Menu -Title "個人資產資料管理系統 (PowerShell)" -Options $menuOptions

    $choice = Read-Host "👉 請選擇功能 [0-4]"
    
    if ($choice -eq '0') {
        Write-Host "`n👋 謝謝使用，再見！" -ForegroundColor Cyan
        break
    }
    
    if ($menuOptions.Contains($choice)) {
        $selected = $menuOptions[$choice]
        try {
            # 執行對應的 ScriptBlock
            & $selected.Action
        }
        catch {
            $err = $_
            # 使用 "$err" 強制轉字串，並檢查 Exception.Message
            if ("$err" -match "UserExit" -or $err.Exception.Message -match "UserExit") {
                Write-Host "`n⚠️  使用者取消操作" -ForegroundColor Yellow
            }
            else {
                Write-Error "執行功能失敗: $err"
                Read-Host "執行發生錯誤，按 Enter 鍵繼續..."
            }
        }
    }
    else {
        Write-Host "`n❌ 無效的選擇，請重試..." -ForegroundColor Red
        Start-Sleep -Seconds 1
    }
}
