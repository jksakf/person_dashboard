
# CompareHKAPIs.ps1
# Test multiple HK Stock API sources

$targets = @(
    @{ Code = "01810"; Name = "Xiaomi"; Expected = 34.70 },
    @{ Code = "09660"; Name = "Horizon"; Expected = 7.98 }
)

function Test-EastMoney {
    param($Code)
    $url = "https://push2.eastmoney.com/api/qt/stock/get?secid=116.$Code&fields=f43,f170"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-RestMethod -Uri $url -Headers @{ "User-Agent" = "Mozilla/5.0" }
        $sw.Stop()
        if ($r.data) {
            $raw = $r.data.f43 
            return @{
                Source        = "EastMoney (116)"
                Raw           = $raw
                Price_Div10   = $raw / 10
                Price_Div100  = $raw / 100
                Price_Div1000 = $raw / 1000
                TimeMs        = $sw.ElapsedMilliseconds
                Status        = "OK"
            }
        }
        return @{ Source = "EastMoney"; Status = "NoData" }
    }
    catch {
        return @{ Source = "EastMoney"; Status = "Error: $_" }
    }
}

function Test-Sina {
    param($Code)
    $url = "http://hq.sinajs.cn/list=hk$Code"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-WebRequest -Uri $url -Headers @{ "Referer" = "https://finance.sina.com.cn/"; "User-Agent" = "Mozilla/5.0" } -UseBasicParsing
        $sw.Stop()
        $content = $r.Content
        if ($content -match '"([^"]+)"') {
            $data = $matches[1] -split ','
            if ($data.Count -gt 6) {
                return @{
                    Source = "Sina"
                    Raw    = $data[6]
                    Price  = [double]$data[6]
                    TimeMs = $sw.ElapsedMilliseconds
                    Status = "OK"
                }
            }
        }
        return @{ Source = "Sina"; Status = "FormatError: $content" }
    }
    catch {
        return @{ Source = "Sina"; Status = "Error: $_" }
    }
}

function Test-Tencent {
    param($Code)
    $url = "http://qt.gtimg.cn/q=hk$Code"
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing
        $sw.Stop()
        $content = $r.Content
        if ($content -match '="([^"]+)"') {
            $data = $matches[1] -split '~'
            if ($data.Count -gt 30) {
                return @{
                    Source = "Tencent"
                    Raw    = $data[3]
                    Price  = [double]$data[3]
                    TimeMs = $sw.ElapsedMilliseconds
                    Status = "OK"
                }
            }
        }
        return @{ Source = "Tencent"; Status = "FormatError: $content" }
    }
    catch {
        return @{ Source = "Tencent"; Status = "Error: $_" }
    }
}

Write-Host "=== HK Stock API Benchmark (Ref: 01810~34.70, 09660~7.98) ===" -ForegroundColor Cyan
foreach ($t in $targets) {
    Write-Host "`nTest ${t.Code} ${t.Name} (Exp: ${t.Expected})" -ForegroundColor Yellow
    
    # 1. EastMoney
    $res = Test-EastMoney -Code $t.Code
    if ($res.Status -eq "OK") {
        Write-Host "  [EastMoney] Time: $($res.TimeMs)ms | Raw: $($res.Raw)" -NoNewline
        $p = $res.Price_Div1000
        if ($res.Raw -gt 10000) { $p = $res.Price_Div1000; $div = "1000" } 
        elseif ($res.Raw -gt 1000) { $p = $res.Price_Div100; $div = "100" }
        else { $p = $res.Price_Div10; $div = "10" }
        
        Write-Host " | Assumed Price: $p (Div$div)" -ForegroundColor Green
    }
    else {
        Write-Host "  [EastMoney] Failed: $($res.Status)" -ForegroundColor Red
    }

    # 2. Sina
    $res = Test-Sina -Code $t.Code
    if ($res.Status -eq "OK") {
        Write-Host "  [Sina     ] Time: $($res.TimeMs)ms | Price: $($res.Price)" -ForegroundColor Green
    }
    else {
        Write-Host "  [Sina     ] Failed: $($res.Status)" -ForegroundColor Red
    }

    # 3. Tencent
    $res = Test-Tencent -Code $t.Code
    if ($res.Status -eq "OK") {
        Write-Host "  [Tencent  ] Time: $($res.TimeMs)ms | Price: $($res.Price)" -ForegroundColor Green
    }
    else {
        Write-Host "  [Tencent  ] Failed: $($res.Status)" -ForegroundColor Red
    }
}
