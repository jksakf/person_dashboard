# Tests/VerifyPriceFetcher.ps1
$ErrorActionPreference = "Stop"

# Setup Path
$Script:RootPath = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Definition)
$ModulePath = Join-Path $Script:RootPath "modules/PriceFetcher.ps1"
$CommonPath = Join-Path $Script:RootPath "common.ps1"

Write-Host "Loading modules..."
. $CommonPath
. $ModulePath

function Test-Price($Code, $Market, $ExpectSuccess) {
    Write-Host "Testing $Market $Code ..." -NoNewline
    $price = Get-RealTimePrice -Code $Code -MarketType $Market
    
    if ($price) {
        if ($ExpectSuccess) {
            Write-Host " ✅ OK: $price" -ForegroundColor Green
        }
        else {
            Write-Host " ❌ Failed: Expected $null but got $price" -ForegroundColor Red
        }
    }
    else {
        if ($ExpectSuccess) {
            Write-Host " ❌ Failed: Got $null" -ForegroundColor Red
        }
        else {
            Write-Host " ✅ OK: Got $null (Expected)" -ForegroundColor Green
        }
    }
}

# 1. Test TWSE (TSMC)
Test-Price "2330" "TW" $true

# 2. Test HK (Tencent)
Test-Price "0700" "HK" $true

# 3. Test Invalid
Test-Price "0000" "TW" $false
