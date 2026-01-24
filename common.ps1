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
        $Script:Config = Get-Content -Path $Path -Raw -Encoding UTF8 | ConvertFrom-Json
        return $Script:Config
    }
    catch {
        Write-Error "無法解析設定檔: $_"
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
        $dir = Split-Path $logPath -Parent
        if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
        Add-Content -Path $logPath -Value $formattedMsg -Encoding UTF8
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
        [string]$DefaultDate = (Get-Date -Format "yyyyMMdd")
    )

    while ($true) {
        try {
            $inputStr = Get-CleanInput -Prompt "請輸入日期 (YYYYMMDD)" -DefaultValue $DefaultDate
            
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
        [string]$FileNamePrefix
    )

    if ($null -eq $Data -or $Data.Count -eq 0) {
        Write-Log "無資料需要匯出。" -Level Warning
        return
    }

    # 取得輸出路徑
    $outputDir = if ($Script:Config.OutputDirectory) { $Script:Config.OutputDirectory } else { "output" }
    if (-not (Test-Path $outputDir)) { New-Item -ItemType Directory -Path $outputDir -Force | Out-Null }

    $dateStr = Get-Date -Format "yyyyMMdd"
    $fullPath = Join-Path $outputDir "${dateStr}_${FileNamePrefix}.csv"

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
