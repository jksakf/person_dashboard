/**
 * test_e2e_verification.js
 * 驗證 5 大全景獨立視圖、頂部導航、Datalist 下拉、FIFO 已實現損益與 UTF-8 BOM 編碼合規
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

console.log('--- 🔍 開始執行全功能端到端合規性與結構檢測 (v1.3.0) ---');

// 1. 檢驗 workbench.html 結構
const html = fs.readFileSync(path.join(__dirname, '../workbench.html'), 'utf8');
assert.ok(html.includes('id="mainNavTabs"'), 'workbench.html 必須具備 #mainNavTabs 頂部頁籤導航');
assert.ok(html.includes('id="view-overview"'), 'workbench.html 必須具備 #view-overview 總覽視圖');
assert.ok(html.includes('id="view-bank"'), 'workbench.html 必須具備 #view-bank 銀行資產獨立頁面');
assert.ok(html.includes('id="view-stock"'), 'workbench.html 必須具備 #view-stock 股票庫存獨立頁面');
assert.ok(html.includes('id="view-history"'), 'workbench.html 必須具備 #view-history 交易紀錄獨立頁面');
assert.ok(html.includes('id="view-pnl"'), 'workbench.html 必須具備 #view-pnl 已實現損益獨立頁面');
assert.ok(html.includes('id="stockCodeList"'), 'workbench.html 必須具備 #stockCodeList 股票下拉清單');
assert.ok(html.includes('id="bankAccountList"'), 'workbench.html 必須具備 #bankAccountList 銀行帳戶下拉清單');
assert.ok(html.includes('id="drawerPane"'), 'workbench.html 必須具備 #drawerPane 抽屜');
assert.ok(html.includes('id="drawerBackdrop"'), 'workbench.html 必須具備 #drawerBackdrop 遮罩');
assert.ok(html.includes('storage-service.js'), 'workbench.html 必須引入 storage-service.js');
console.log('✅ workbench.html 5 大獨立全寬度視圖與 Datalist 契約 100% 完整！');

// 2. 檢驗 css/workbench.css
const css = fs.readFileSync(path.join(__dirname, '../css/workbench.css'), 'utf8');
assert.ok(css.includes('.wb-nav-tabs'), 'css 必須定義 .wb-nav-tabs 頂部頁籤樣式');
assert.ok(css.includes('.wb-view'), 'css 必須定義 .wb-view 全景視圖樣式');
assert.ok(css.includes('.wb-view-container'), 'css 必須定義 .wb-view-container 視圖容器');
assert.ok(css.includes('.wb-drawer'), 'css 必須定義 .wb-drawer 抽屜樣式');
console.log('✅ css/workbench.css 頂部導航與獨立全景視圖樣式驗證通過！');

// 3. 檢驗資料庫 assets_data.json
const rawDb = fs.readFileSync(path.join(__dirname, '../assets_data.json'), 'utf8').replace(/^\uFEFF/, '');
const db = JSON.parse(rawDb);
assert.ok(db.bankAssets.length >= 130, '歷史銀行資產快照應收納 >= 130 筆');
assert.ok(db.transactions.length >= 100, '歷史股票交易紀錄應收納 >= 100 筆');
assert.ok(Array.isArray(db.meta.accountList), 'meta.accountList 必須為乾淨陣列');
console.log(`✅ assets_data.json 資料量與結構驗證通過 (總筆數: ${db.bankAssets.length + db.transactions.length} 筆)`);

// 4. 檢驗 WorkbenchEngine 聚合計算與 FIFO 已實現損益
const WorkbenchEngine = require('../js/core/workbench-engine.js');
const engine = new WorkbenchEngine(db.meta.feeRates);
const metrics = engine.computeAssetMetrics(db);
console.log(`  • 計算之最新淨值: $${Math.round(metrics.netWorth).toLocaleString()}`);
console.log(`  • 最新月份銀行存款: $${Math.round(metrics.bankTotalTwd).toLocaleString()}`);
console.log(`  • 股票持股市值: $${Math.round(metrics.stockMarketValue).toLocaleString()}`);
console.log(`  • 庫存持股檔數: ${metrics.holdings.length} 檔`);
console.log(`  • 歷史已實現總損益 (台幣): $${Math.round(metrics.totalRealizedPnL).toLocaleString()}`);
console.log(`  • 平倉沖銷總筆數: ${metrics.calculatedPnL.length} 筆`);

assert.ok(metrics.netWorth > 0, '淨值必須大於 0');
assert.ok(metrics.bankTotalTwd > 0, '銀行總額必須大於 0');
assert.ok(metrics.stockMarketValue > 0, '股票市值必須大於 0');
assert.strictEqual(metrics.calculatedPnL.length, 49, '從交易紀錄中應精準沖銷計算出 49 筆已實現平倉');
assert.strictEqual(Math.round(metrics.totalRealizedPnL), 42975, '歷史已實現總損益折合台幣應為 $42,975');
console.log('✅ 金融聚合引擎與 FIFO 已實現損益沖銷計算 100% 精準無誤！');

// 5. 檢驗月度趨勢數據
const monthlyBank = {};
db.bankAssets.forEach(b => {
    const m = (b.date || '').slice(0, 7);
    if (!m) return;
    const amt = parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0;
    monthlyBank[m] = (monthlyBank[m] || 0) + amt;
});
const sortedMonths = Object.keys(monthlyBank).sort();
console.log(`  • 歷史月度分佈區間: ${sortedMonths[0]} ~ ${sortedMonths[sortedMonths.length - 1]} (共 ${sortedMonths.length} 個月)`);
assert.strictEqual(sortedMonths.length, 17, '應收納 17 個月的歷史月度快照');
console.log('✅ 17 個月歷史成長曲線資料流完整！');

// 6. 檢驗 index.html 與資料對接
const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(indexHtml.includes('storage-service.js'), 'index.html 必須引入 storage-service.js');
console.log('✅ 傳統儀表板 (index.html) 連動依賴驗證通過！');

// 7. 驗證所有核心檔案 UTF-8 with BOM 編碼
const coreFiles = [
    'workbench.html',
    'index.html',
    'css/workbench.css',
    'js/workbench-app.js',
    'js/core/workbench-engine.js',
    'js/core/storage-service.js',
    'js/core/data.js',
    'assets_data.json',
    'design_spec.md'
];

coreFiles.forEach(f => {
    const p = path.join(__dirname, '..', f);
    const buf = fs.readFileSync(p);
    const hasBom = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF;
    assert.ok(hasBom, `${f} 必須帶有 UTF-8 BOM 標記`);
});
console.log('✅ 所有核心系統檔案 UTF-8 with BOM 規範驗證 100% 合規！');

console.log('\n🎉🎉 全系統合規性、5 大獨立視圖與 Datalist 契約檢測 100% 全部通過！');
