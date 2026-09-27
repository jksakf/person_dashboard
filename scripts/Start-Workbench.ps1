<#
.SYNOPSIS
    個人資產一體化工作台 - 控制台啟動主程序
.DESCRIPTION
    負責檢測本地環境、啟動輕量地端服務、自動開啟瀏覽器工作台，並提供彩色管理選單。
.NOTES
    編碼標準: UTF-8 with BOM
#>

[CmdletBinding()]
param()

# 設定主控台輸出編碼為 UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

$root = Split-Path -Parent $PSScriptRoot
$workbenchHtml = Join-Path $root "workbench.html"
$archiveDir = Join-Path $root "archive\legacy_system"
$indexHtml = Join-Path $archiveDir "index.html"
$outputDir = Join-Path $archiveDir "output\history_data"
$assetManagerPs1 = Join-Path $archiveDir "AssetManager.ps1"
$convertCsvPs1 = Join-Path $archiveDir "scripts\Convert-CsvToJson.ps1"

function Show-Header {
    Clear-Host
    Write-Host "============================================================" -ForegroundColor Cyan
    Write-Host "         個人資產一體化工作台 (Personal Asset Workbench)    " -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Cyan
}

function Open-Workbench {
    Write-Host "`n>>> 正在啟動工作台..." -ForegroundColor Yellow
    
    # 檢查 Port 8080 是否已有服務
    $portActive = $false
    try {
        $tcp = New-Object System.Net.Sockets.TcpClient
        $tcp.Connect("127.0.0.1", 8080)
        $tcp.Close()
        $portActive = $true
    } catch {
        $portActive = $false
    }

    if (-not $portActive) {
        # 優先使用 Node.js 啟動原生微服務 (支援 TWSE 即時與歷史報價 API)
        $node = Get-Command node -ErrorAction SilentlyContinue
        if ($node) {
            Write-Host "    [服務] 啟動原生 Node.js 微服務 (Port 8080，支援股票行情 API)..." -ForegroundColor Cyan
            $serverScript = Join-Path $root "server.js"
            Start-Process -FilePath "node" -ArgumentList "`"$serverScript`"" -WorkingDirectory $root -WindowStyle Hidden
            Start-Sleep -Seconds 1
        }
        else {
            # 備援：檢查 Python
            $python = Get-Command python -ErrorAction SilentlyContinue
            if ($python) {
                Write-Host "    [服務] 啟動背景 Python 伺服器 (Port 8080)..." -ForegroundColor Cyan
                Start-Process -FilePath "python" -ArgumentList "-m http.server 8080" -WorkingDirectory $root -WindowStyle Hidden
                Start-Sleep -Seconds 1
            }
        }
    }

    $url = "http://localhost:8080/workbench.html"
    Write-Host "    [瀏覽器] 開啟 $url" -ForegroundColor Green
    Start-Process $url
}

# 首次執行自動啟動工作台
Open-Workbench

while ($true) {
    Show-Header
    Write-Host "  [W] 再次開啟工作台 (workbench.html)" -ForegroundColor White
    Write-Host "  [A] 開啟舊系統封存資料夾 (archive\legacy_system)" -ForegroundColor White
    Write-Host "  [T] 執行舊版終端管理器 (AssetManager.ps1)" -ForegroundColor Gray
    Write-Host "  [I] 開啟舊版傳統儀表板 (index.html)" -ForegroundColor Gray
    Write-Host "  [C] 執行歷史 CSV 重新遷移 (Convert-CsvToJson.ps1)" -ForegroundColor Gray
    Write-Host "  ----------------------------------------------------------" -ForegroundColor DarkGray
    Write-Host "  [Q] 離開" -ForegroundColor Gray
    Write-Host "============================================================" -ForegroundColor Cyan

    $choice = (Read-Host "請輸入選項 [預設 W]").Trim().ToUpper()
    if ([string]::IsNullOrEmpty($choice)) { $choice = "W" }

    switch ($choice) {
        "W" {
            Open-Workbench
            Start-Sleep -Seconds 1
        }
        "A" {
            Write-Host "`n>>> 正在開啟舊系統封存資料夾..." -ForegroundColor Cyan
            Invoke-Item $archiveDir
            Start-Sleep -Seconds 1
        }
        "T" {
            Write-Host "`n>>> 正在啟動舊版傳統終端管理器..." -ForegroundColor Yellow
            if (Test-Path $assetManagerPs1) {
                & $assetManagerPs1
            } else {
                Write-Host "找不到檔案: $assetManagerPs1" -ForegroundColor Red
            }
            Read-Host "按 Enter 鍵返回選單..."
        }
        "I" {
            Write-Host "`n>>> 正在開啟舊版傳統儀表板..." -ForegroundColor Green
            if (Test-Path $indexHtml) {
                Start-Process $indexHtml
            } else {
                Write-Host "找不到檔案: $indexHtml" -ForegroundColor Red
            }
            Start-Sleep -Seconds 1
        }
        "C" {
            Write-Host "`n>>> 正在執行 CSV 轉 JSON 重新遷移..." -ForegroundColor Yellow
            if (Test-Path $convertCsvPs1) {
                & $convertCsvPs1
                Write-Host "`n同步完成！" -ForegroundColor Green
            } else {
                Write-Host "找不到檔案: $convertCsvPs1" -ForegroundColor Red
            }
            Read-Host "按 Enter 鍵返回選單..."
        }
        "Q" {
            Write-Host "`n感謝使用，再見！" -ForegroundColor Green
            exit 0
        }
        default {
            Write-Host "無效選項，請重新輸入..." -ForegroundColor Red
            Start-Sleep -Milliseconds 800
        }
    }
}
