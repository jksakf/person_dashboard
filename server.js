/*
 * 個人資產一體化工作台 - 本地原生微服務 (server.js)
 * 職責：
 *   1. 本地靜態檔案服務 (workbench.html, index.html 等)
 *   2. 台灣證交所 (TWSE) 即時行情 API 轉發 (/api/stock-price/realtime)
 *   3. 台灣證券交易所/Yahoo 歷史月末收盤價查詢 (/api/stock-price/historical)
 *   4. 月度資產快照持久化儲存 (/api/save-snapshots)
 * 編碼標準: UTF-8 with BOM
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 8080;
const ROOT_DIR = __dirname;
const ASSETS_DATA_FILE = path.join(ROOT_DIR, 'assets_data.json');

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8'
};

// 輔助函式：發送 HTTPS GET 請求
function httpsGet(reqUrl, headers = {}) {
    return new Promise((resolve, reject) => {
        const u = new URL(reqUrl);
        const options = {
            hostname: u.hostname,
            path: u.pathname + u.search,
            method: 'GET',
            headers: Object.assign({
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }, headers),
            timeout: 9000
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ statusCode: res.statusCode, body: data }));
        });

        req.on('timeout', () => { req.destroy(); reject(new Error('HTTPS request timeout')); });
        req.on('error', reject);
        req.end();
    });
}

// 1. 抓取即時行情 (TWSE MIS API，同時涵蓋上市 tse 與上櫃 otc)
async function fetchRealtimePrices(symbols) {
    if (!symbols || symbols.length === 0) return {};

    // 組裝 channel list: tse_2330.tw|otc_2330.tw|...
    const channels = symbols.map(s => `tse_${s}.tw|otc_${s}.tw`).join('|');
    const ts = Date.now();
    const apiUrl = `https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${encodeURIComponent(channels)}&json=1&delay=0&_=${ts}`;

    const res = await httpsGet(apiUrl);
    const json = JSON.parse(res.body);
    const result = {};

    if (json && Array.isArray(json.msgArray)) {
        json.msgArray.forEach(item => {
            const sym = item.c;
            if (!sym) return;

            let price = null;
            if (item.z && item.z !== '-' && item.z !== '') {
                price = parseFloat(item.z);
            } else if (item.y && item.y !== '-' && item.y !== '') {
                price = parseFloat(item.y);
            }

            const prevClose = (item.y && item.y !== '-') ? parseFloat(item.y) : null;
            const open = (item.o && item.o !== '-') ? parseFloat(item.o) : null;
            const high = (item.h && item.h !== '-') ? parseFloat(item.h) : null;
            const low = (item.l && item.l !== '-') ? parseFloat(item.l) : null;

            result[sym] = {
                symbol: sym,
                name: item.n || '',
                price: price,
                previousClose: prevClose,
                open: open,
                high: high,
                low: low,
                time: item.t || '',
                date: item.d || '',
                rawStatus: item.z !== '-' ? 'trading' : 'closed'
            };
        });
    }

    return result;
}

// 2. 抓取歷史月份最後交易日收盤價 (優先 TWSE STOCK_DAY，備援 Yahoo Finance)
async function fetchHistoricalMonthClose(symbol, yearMonth) {
    const ym = yearMonth.replace(/[^0-9]/g, ''); // e.g. 202403
    if (ym.length !== 6) return null;
    const targetYm = `${ym.slice(0, 4)}-${ym.slice(4, 6)}`;

    // 嘗試 1: TWSE 官方月成交日報表 (上市)
    try {
        const twseUrl = `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${ym}01&stockNo=${symbol}&response=json`;
        const res = await httpsGet(twseUrl);
        const json = JSON.parse(res.body);
        if (json.stat === 'OK' && Array.isArray(json.data) && json.data.length > 0) {
            const lastRow = json.data[json.data.length - 1];
            const closeStr = (lastRow[6] || '').replace(/,/g, '').trim();
            const close = parseFloat(closeStr);
            if (!isNaN(close) && close > 0) {
                return {
                    symbol: symbol,
                    month: yearMonth,
                    closePrice: close,
                    tradeDate: lastRow[0],
                    source: 'TWSE'
                };
            }
        }
    } catch (e) {
        // 進入備援
    }

    // 嘗試 2: Yahoo Finance (支援台股 .TWO, .TW 與港股 .HK)
    const isHk = (symbol.length === 5 && symbol.startsWith('0')) || symbol.endsWith('.HK');
    let candidateSymbols = [];
    if (isHk) {
        const cleanSym = symbol.replace(/\.HK$/i, '');
        candidateSymbols = [cleanSym.replace(/^0+/, '') + '.HK', cleanSym + '.HK'];
    } else {
        candidateSymbols = [symbol + '.TWO', symbol + '.TW'];
    }

    for (const ySymbol of candidateSymbols) {
        try {
            const yUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ySymbol)}?interval=1d&range=5y`;
            const yRes = await httpsGet(yUrl);
            const yJson = JSON.parse(yRes.body);
            if (yJson && yJson.chart && Array.isArray(yJson.chart.result) && yJson.chart.result.length > 0) {
                const r = yJson.chart.result[0];
                const timestamps = r.timestamp || [];
                const quoteObj = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
                const closes = quoteObj.close || [];

                let lastClose = null;
                let lastDate = null;
                for (let i = timestamps.length - 1; i >= 0; i--) {
                    const d = new Date(timestamps[i] * 1000);
                    const isoMonth = d.toISOString().slice(0, 7);
                    if (isoMonth === targetYm && closes[i] !== null && !isNaN(closes[i])) {
                        lastClose = closes[i];
                        lastDate = d.toISOString().slice(0, 10);
                        break;
                    }
                }

                if (lastClose !== null) {
                    return {
                        symbol: symbol,
                        month: yearMonth,
                        closePrice: Math.round(lastClose * 100) / 100,
                        tradeDate: lastDate,
                        source: 'Yahoo:' + ySymbol
                    };
                }
            }
        } catch (err) { }
    }

    return null;
}

// 3. 儲存月資產快照至 assets_data.json
function saveMonthlySnapshots(snapshots) {
    if (!fs.existsSync(ASSETS_DATA_FILE)) {
        throw new Error('assets_data.json 不存在');
    }

    let fileContent = fs.readFileSync(ASSETS_DATA_FILE);
    if (fileContent[0] === 0xEF && fileContent[1] === 0xBB && fileContent[2] === 0xBF) {
        fileContent = fileContent.slice(3);
    }

    const data = JSON.parse(fileContent.toString('utf8'));
    if (!data.monthlySnapshots) {
        data.monthlySnapshots = {};
    }

    Object.assign(data.monthlySnapshots, snapshots);
    data.meta = data.meta || {};
    data.meta.lastSnapshotUpdate = new Date().toISOString();

    const jsonStr = JSON.stringify(data, null, 2);
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const finalBuffer = Buffer.concat([bom, Buffer.from(jsonStr, 'utf8')]);

    fs.writeFileSync(ASSETS_DATA_FILE, finalBuffer);
    return Object.keys(snapshots).length;
}

// 4. 儲存銀行帳戶清單至 assets_data.json
function saveBankAssets(bankAssets) {
    if (!fs.existsSync(ASSETS_DATA_FILE)) {
        throw new Error('assets_data.json 不存在');
    }

    let fileContent = fs.readFileSync(ASSETS_DATA_FILE);
    if (fileContent[0] === 0xEF && fileContent[1] === 0xBB && fileContent[2] === 0xBF) {
        fileContent = fileContent.slice(3);
    }

    const data = JSON.parse(fileContent.toString('utf8'));
    data.bankAssets = bankAssets;
    data.meta = data.meta || {};
    data.meta.lastUpdated = new Date().toISOString();

    const jsonStr = JSON.stringify(data, null, 2);
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    const finalBuffer = Buffer.concat([bom, Buffer.from(jsonStr, 'utf8')]);

    fs.writeFileSync(ASSETS_DATA_FILE, finalBuffer);
    return bankAssets.length;
}

// 建立 HTTP 伺服器
const server = http.createServer(async (req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    // 處理 API 端點
    if (pathname.startsWith('/api/')) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        try {
            // API 1: GET /api/stock-price/realtime?symbols=2330,2454
            if (pathname === '/api/stock-price/realtime' && req.method === 'GET') {
                const syms = (parsedUrl.query.symbols || '').split(',').map(s => s.trim()).filter(Boolean);
                const prices = await fetchRealtimePrices(syms);
                res.writeHead(200);
                res.end(JSON.stringify({ success: true, data: prices, count: Object.keys(prices).length, timestamp: new Date().toISOString() }));
                return;
            }

            // API 2: GET /api/stock-price/historical?symbol=2330&month=2024-03
            if (pathname === '/api/stock-price/historical' && req.method === 'GET') {
                const sym = (parsedUrl.query.symbol || '').trim();
                const m = (parsedUrl.query.month || '').trim();
                if (!sym || !m) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ success: false, error: '缺少 symbol 或 month 參數' }));
                    return;
                }

                const result = await fetchHistoricalMonthClose(sym, m);
                if (result) {
                    res.writeHead(200);
                    res.end(JSON.stringify({ success: true, data: result }));
                } else {
                    res.writeHead(404);
                    res.end(JSON.stringify({ success: false, error: `無法取得 ${sym} 於 ${m} 之歷史收盤價` }));
                }
                return;
            }

            // API 3: POST /api/save-snapshots
            if (pathname === '/api/save-snapshots' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        const snapshots = parsed.snapshots || parsed;
                        const savedCount = saveMonthlySnapshots(snapshots);
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, savedCount: savedCount, message: `成功儲存 ${savedCount} 個月份資產快照` }));
                    } catch (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ success: false, error: err.message }));
                    }
                });
                return;
            }

            // API 4: POST /api/save-bank-assets
            if (pathname === '/api/save-bank-assets' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk);
                req.on('end', () => {
                    try {
                        const parsed = JSON.parse(body);
                        const bankAssets = parsed.bankAssets || parsed;
                        const savedCount = saveBankAssets(bankAssets);
                        res.writeHead(200);
                        res.end(JSON.stringify({ success: true, count: savedCount, message: `成功同步 ${savedCount} 筆銀行帳戶至 assets_data.json` }));
                    } catch (err) {
                        res.writeHead(500);
                        res.end(JSON.stringify({ success: false, error: err.message }));
                    }
                });
                return;
            }

            res.writeHead(404);
            res.end(JSON.stringify({ success: false, error: 'API 端點不存在' }));
            return;
        } catch (err) {
            res.writeHead(500);
            res.end(JSON.stringify({ success: false, error: err.message }));
            return;
        }
    }

    // 處理靜態檔案服務
    let filePath = path.join(ROOT_DIR, pathname === '/' ? 'workbench.html' : pathname);

    if (!filePath.startsWith(ROOT_DIR)) {
        res.writeHead(403);
        res.end('403 Forbidden');
        return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'workbench.html');
    }

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('404 Not Found: ' + pathname);
            return;
        }

        const ext = path.extname(filePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache'
        });
        res.end(data);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Personal Asset Workbench] 服務已在 http://127.0.0.1:${PORT} 啟動`);
    console.log(`[Personal Asset Workbench] 靜態根目錄: ${ROOT_DIR}`);
    console.log(`[Personal Asset Workbench] 即時報價端點: http://127.0.0.1:${PORT}/api/stock-price/realtime`);
});
