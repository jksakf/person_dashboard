# 測試美股 Stooq API

# 載入模組
. .\modules\PriceFetcher.ps1
. .\common.ps1

Write-Host ""
Write-Host "=== 測試美股 API（Stooq）===" -ForegroundColor Cyan
Write-Host "使用 Stooq API 抓取美股股價"
Write-Host ""

# 測試股票清單
$testStocks = @(
    [PSCustomObject]@{Code = "AAPL"; Name = "蘋果" }
    [PSCustomObject]@{Code = "NVDA"; Name = "NVIDIA" }
    [PSCustomObject]@{Code = "TSLA"; Name = "特斯拉" }
    [PSCustomObject]@{Code = "MSFT"; Name = "微軟" }
)

foreach ($stock in $testStocks) {
    Write-Host "測試: $($stock.Code) ($($stock.Name))... " -NoNewline
    
    try {
        $price = Get-RealTimePrice -Code $stock.Code -MarketType "US"
        
        if ($price) {
            Write-Host ("✅ `${0:F2} USD" -f $price) -ForegroundColor Green
        }
        else {
            Write-Host "❌ 失敗" -ForegroundColor Red
        }
    }
    catch {
        Write-Host "❌ 錯誤: $_" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host ""
Write-Host "測試完成！" -ForegroundColor Cyan
