# common.ps1
# 繁體中文通用函數庫
# 包含：日誌記錄、設定讀取、輸入驗證、選單顯示

# 確保輸出編碼為 UTF-8 (避免中文亂碼)
$OutputEncoding = [System.Text.Encoding]::UTF8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# 全域變數保存設定
$Script:Config = $null

<#
.SYNOPSIS
    載入並驗證設定檔
#>
function Get-Config {
    param (
        [string]$Path = "config.json"
    )

    if (-not (Test-Path $Path)) {
        Write-Error "找不到設定檔: $Path"
        exit 1
    }

    try {
        $content = Get-Content -Path $Path -Raw -Encoding UTF8
        $Script:Config = $content | ConvertFrom-Json
        return $Script:Config
    }
    catch {
        Write-Error "無法解析設定檔 ($Path)。請檢查 JSON 格式是否正確 (例如缺少逗號或引號)。"
        Write-Error "詳細錯誤: $_"
        exit 1
    }
}

<#
.SYNOPSIS
    寫入日誌訊息
#>
function Write-Log {
    param (
        [Parameter(Mandatory = $true)]
        [string]$Message,

        [ValidateSet("Info", "Warning", "Error", "Debug")]
        [string]$Level = "Info"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $formattedMsg = "[$timestamp] [$Level] $Message"
    
    # 輸出到螢幕 (根據層級上色)
    switch ($Level) {
        "Error" { Write-Host $formattedMsg -ForegroundColor Red }
        "Warning" { Write-Host $formattedMsg -ForegroundColor Yellow }
        "Debug" { Write-Host $formattedMsg -ForegroundColor DarkGray }
        Default { Write-Host $formattedMsg -ForegroundColor White }
    }

    # 輸出到檔案 (若有設定)
    if ($Script:Config -and $Script:Config.Logging.LogFile) {
        $logPath = $Script:Config.Logging.LogFile
        try {
            $dir = Split-Path $logPath -Parent
            if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
            Add-Content -Path $logPath -Value $formattedMsg -Encoding UTF8 -ErrorAction Stop
        }
        catch {
            # 若檔案被鎖定，僅顯示在螢幕上，不應讓程式崩潰
            Write-Host " [System] Log Write Failed: $_" -ForegroundColor DarkGray
        }
    }
}

<#
.SYNOPSIS
    顯示主選單
#>
function Show-Menu {
    param (
        [string]$Title,
        [hashtable]$Options
    )

    Clear-Host
    Write-Host "==================================" -ForegroundColor Cyan
    Write-Host "💰 $Title" -ForegroundColor White
    Write-Host "==================================" -ForegroundColor Cyan

    $sortedKeys = $Options.Keys | Sort-Object
    foreach ($key in $sortedKeys) {
        Write-Host "$key. $($Options[$key].Description)"
    }
    
    Write-Host "0. 🚪 離開"
    Write-Host "==================================" -ForegroundColor Cyan
}

<#
.SYNOPSIS
    取得使用者輸入並清理
    支援 'q' 或 'exit' 來中斷
#>
function Get-CleanInput {
    param (
        [string]$Prompt,
        [bool]$Mandatory = $true,
        [string]$DefaultValue = ""
    )

    while ($true) {
        $displayPrompt = "👉 $Prompt"
        if ($DefaultValue) {
            $displayPrompt += " [預設: $DefaultValue]"
        }
        
        $inputVal = Read-Host "$displayPrompt"
        $inputVal = $inputVal.Trim()

        # 檢查離開指令
        if ($inputVal -in @("q", "exit")) {
            throw "UserExit"
        }

        # 使用預設值
        if (-not $inputVal -and $DefaultValue) {
            return $DefaultValue
        }

        # 強制輸入檢查
        if ($Mandatory -and -not $inputVal) {
            Write-Log "此欄位為必填，請重新輸入 (或輸入 'q' 離開)" -Level Warning
            continue
        }

        return $inputVal
    }
}

<#
.SYNOPSIS
    驗證並取得日期字串 (YYYYMMDD)
#>
function Get-ValidDate {
    param (
        [string]$DefaultDate = (Get-Date -Format "yyyyMMdd"),
        [string]$Prompt = "請輸入日期 (YYYYMMDD)"
    )

    while ($true) {
        try {
            $inputStr = Get-CleanInput -Prompt $Prompt -DefaultValue $DefaultDate
            
            # 長度與數字檢查
            if ($inputStr.Length -ne 8 -or $inputStr -notmatch "^\d{8}$") {
                throw "格式錯誤"
            }

            # 有效日期檢查
            [datetime]::ParseExact($inputStr, "yyyyMMdd", $null) | Out-Null
            return $inputStr
        }
        catch {
            if ($_.Exception.Message -eq "UserExit") { throw "UserExit" }
            Write-Log "❌ 日期不合法 (範例: 20260120)，請重新輸入" -Level Warning
        }
    }
}

<#
.SYNOPSIS
    將資料匯出為 CSV
#>
function Export-DataToCsv {
    param (
        [Parameter(Mandatory = $false)]
        [System.Collections.ArrayList]$Data,
        
        [Parameter(Mandatory = $true)]
        [string]$FileNamePrefix,

        [Parameter(Mandatory = $false)]
        [string]$OutputDirectory
    )

    if ($null -eq $Data -or $Data.Count -eq 0) {
        Write-Log "無資料需要匯出。" -Level Warning
        return
    }

    # 取得輸出路徑優先順序: 參數 > Config > 預設 "output"
    $targetDir = if ($OutputDirectory) { 
        $OutputDirectory 
    }
    elseif ($Script:Config.OutputDirectory) { 
        $Script:Config.OutputDirectory 
    }
    else { 
        "output" 
    }

    # 處理相對路徑轉絕對路徑 (若不是絕對路徑，則基於 RootPath)
    if (-not [System.IO.Path]::IsPathRooted($targetDir)) {
        if ($Script:RootPath) {
            $targetDir = Join-Path $Script:RootPath $targetDir
        }
        else {
            $targetDir = Resolve-Path $targetDir
        }
    }

    if (-not (Test-Path $targetDir)) { 
        New-Item -ItemType Directory -Path $targetDir -Force | Out-Null 
    }

    $dateStr = Get-Date -Format "yyyyMMdd"
    $fullPath = Join-Path $targetDir "${dateStr}_${FileNamePrefix}.csv"

    try {
        # 根據 PowerBI/Excel 相容性需求，使用 Unicode (UTF-16 LE)
        # 若需要 Excel 直接開啟不亂碼，UTF-16 LE 是 Windows 下最安全的選擇，或是 UTF-8 with BOM
        $Data | Export-Csv -Path $fullPath -NoTypeInformation -Encoding Unicode
        Write-Log "✅ 成功匯出 CSV: $fullPath (筆數: $($Data.Count))" -Level Info
    }
    catch {
        Write-Log "❌ 匯出失敗: $_" -Level Error
    }
}

<#
.SYNOPSIS
    計算字串視覺長度 (中文字算 2，英數算 1)
#>
function Get-VisualLength {
    param ([string]$Str)
    $len = 0
    foreach ($char in $Str.ToCharArray()) {
        if ([int]$char -gt 127) { $len += 2 } else { $len += 1 }
    }
    return $len
}

<#
.SYNOPSIS
    填充字串到指定視覺長度
#>
function Pad-VisualString {
    param (
        [string]$Str,
        [int]$Width
    )
    $currentLen = Get-VisualLength -Str $Str
    if ($currentLen -lt $Width) {
        return $Str + (" " * ($Width - $currentLen))
    }
    return $Str
}


<#
.SYNOPSIS
    讀取 stock_list.txt 並格式化
#>
function Load-StockList {
    $txtPath = Join-Path $Script:RootPath "stock_list.txt"
    $list = @()
    if (Test-Path $txtPath) {
        try {
            # 確保讀取也是 UTF-8
            $lines = Get-Content $txtPath -Encoding UTF8 | Where-Object { $_ -match "\S" }
            foreach ($line in $lines) {
                $parts = $line -split ","
                if ($parts.Count -ge 3) {
                    $type = $parts[0].Trim()
                    $code = $parts[1].Trim()
                    $name = $parts[2].Trim()

                    # --- 排版邏輯 ---
                    # 1. Type: 預設對齊至 4 視覺寬度 (台股=4, ETF=3需補1格)
                    $typeDisplay = Pad-VisualString -Str $type -Width 4
                    
                    # 2. Code: 預設對齊至 6 格
                    $codeDisplay = "{0,-6}" -f $code

                    # 3. 組合: [Type] Code Name
                    $display = "[{0}] {1} {2}" -f $typeDisplay, $codeDisplay, $name

                    $list += [PSCustomObject]@{
                        Type        = $type
                        Code        = $code
                        Name        = $name
                        DisplayText = $display
                    }
                }
            }
            Write-Log "已載入股票列表 ($($list.Count) 筆)" -Level Info
        }
        catch {
            Write-Log "讀取 stock_list.txt 失敗: $_" -Level Error
        }
    }
    return $list
}

<#
.SYNOPSIS
    新增股票到 stock_list.txt
#>
function Add-StockToList {
    param ($code, $name, $type)
    
    $txtPath = Join-Path $Script:RootPath "stock_list.txt"

    $ans = Get-CleanInput -Prompt "是否將 [$name ($code)] 加入常用清單? (y/N)" -DefaultValue "N" -Mandatory $false
    if ($ans -eq "y" -or $ans -eq "Y") {
        if (-not $type) {
            $type = Get-CleanInput -Prompt "請輸入類別 (例如 台股, ETF, 港股)" -DefaultValue "台股"
        }
        
        $newLine = "$type,$code,$name"
        try {
            $currentContent = @(Get-Content -Path $txtPath -Encoding UTF8)
            $currentContent += $newLine
            $currentContent | Set-Content -Path $txtPath -Encoding UTF8
            
            Write-Log "✅ 已更新 stock_list.txt" -Level Info
            return $true
        }
        catch {
            Write-Log "❌ 寫入失敗: $_" -Level Error
        }
    }
    return $false
}

<#
.SYNOPSIS
    顯示股票選單
#>
function Show-StockOptionList {
    param ($Stocks)
    
    if (-not $Stocks -or $Stocks.Count -eq 0) { return }

    Write-Host "📈 可用股票:" -ForegroundColor Cyan
    for ($i = 0; $i -lt $Stocks.Count; $i++) {
        # 序號補齊對齊 (例如 1. vs 10.) -> {0,2}
        Write-Host ("{0,2}. {1}" -f ($i + 1), $Stocks[$i].DisplayText)
    }
}

<#
.SYNOPSIS
    互動式選擇股票 (Common)
#>
function Select-Stock {
    param (
        $StockList
    )

    if (-not $StockList -or $StockList.Count -eq 0) {
        Write-Host "⚠️  股票清單為空，請手動輸入。" -ForegroundColor Yellow
        # Fallback to manual input
        $code = Get-CleanInput -Prompt "股票代號"
        $name = Get-CleanInput -Prompt "股票名稱"
        $type = Get-CleanInput -Prompt "類別" -DefaultValue "台股"
        
        # 詢問是否加入清單
        Add-StockToList -code $code -name $name -type $type | Out-Null
        
        return [PSCustomObject]@{ Code = $code; Name = $name; Type = $type }
    }

    Show-StockOptionList -Stocks $StockList
    
    $stockInput = Get-CleanInput -Prompt "請輸入編號(選單) 或 代號/名稱(搜尋)"
    
    $selected = $null

    # Case A: Input is Index Number
    if ($stockInput -match "^\d+$" -and [int]$stockInput -ge 1 -and [int]$stockInput -le $StockList.Count) {
        $selected = $StockList[[int]$stockInput - 1]
    }
    else {
        # Case B: Search Code or Name
        $found = $StockList | Where-Object { $_.Code -eq $stockInput -or $_.Name -like "*$stockInput*" }
        
        if ($found) {
            if ($found.Count -gt 1) {
                Write-Host "⚠️ 找到多筆符合，請更精確輸入或選擇編號。"
                # 這裡簡單處理：直接視為新輸入 (或者可以遞迴呼叫自己? 但怕無窮迴圈)
                # 為了使用者體驗，若找到多筆，可以用名稱完全匹配再試一次
                $exact = $found | Where-Object { $_.Name -eq $stockInput -or $_.Code -eq $stockInput }
                if ($exact -and $exact.Count -eq 1) {
                    $selected = $exact[0]
                }
            }
            else {
                $selected = $found[0]
            }
        }
    }

    if ($selected) {
        Write-Host "✅ 已選擇: $($selected.Name) ($($selected.Code))" -ForegroundColor Green
        return $selected
    }

    # Case C: Not found / New Stock
    Write-Host "⚠️  未在清單中找到 '$stockInput'" -ForegroundColor Yellow
    $ans = Get-CleanInput -Prompt "是否新增此股票? (y:新增, r:重試)" -DefaultValue "y"
    
    if ($ans -eq "r") {
        # Retry
        return Select-Stock -StockList $StockList
    }

    # Manual Input
    $code = $stockInput # Default to input if look like code, but user can change
    $name = Get-CleanInput -Prompt "請輸入股票名稱"
    $type = Get-CleanInput -Prompt "請輸入類別" -DefaultValue "台股"
    
    Add-StockToList -code $code -name $name -type $type | Out-Null
    
    return [PSCustomObject]@{ Code = $code; Name = $name; Type = $type }
}
