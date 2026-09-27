/**
 * test_storage_and_sync.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const WorkbenchEngine = require('../js/core/workbench-engine.js');
const { StorageService } = require('../js/core/storage-service.js');

console.log('--- 🧪 開始執行 StorageService 與股票庫存同步單元測試 ---');

// 1. 驗證 StorageService 類別定義
assert.ok(StorageService, 'StorageService 應該成功導出');
const dummyStorage = new StorageService('TestDB', 'test_store');
assert.strictEqual(dummyStorage.dbName, 'TestDB');
assert.strictEqual(dummyStorage.storeName, 'test_store');
console.log('✅ StorageService 實例化檢驗通過');

// 2. 驗證 FIFO 庫存計算與批次隊列 (fifoQueues)
const engine = new WorkbenchEngine();
const mockTransactions = [
    {
        id: 'tx_01',
        date: '2026/01/10',
        symbol: '2330',
        name: 'TSMC',
        action: '買入',
        price: 900,
        shares: 1000,
        fee: 1282,
        tax: 0,
        totalAmount: 901282
    },
    {
        id: 'tx_02',
        date: '2026/02/15',
        symbol: '2330',
        name: 'TSMC',
        action: '買入',
        price: 1000,
        shares: 500,
        fee: 712,
        tax: 0,
        totalAmount: 500712
    },
    {
        id: 'tx_03',
        date: '2026/03/01',
        symbol: '2330',
        name: 'TSMC',
        action: '賣出',
        price: 1100,
        shares: 600,
        fee: 940,
        tax: 1980,
        totalAmount: 657080
    }
];

const { holdings, fifoQueues } = engine.computeFifoHoldings(mockTransactions);
assert.strictEqual(holdings.length, 1, '應有 1 筆持倉股票');
const tsmc = holdings[0];
assert.strictEqual(tsmc.symbol, '2330');
assert.strictEqual(tsmc.shares, 900, '台積電剩餘持股應為 1000 + 500 - 600 = 900 股');

// 驗證 fifoQueues 批次拆解
const queue = fifoQueues['2330'];
assert.ok(queue, '應具備 2330 之 FIFO 批次隊列');
assert.strictEqual(queue.length, 2, '應有 2 個剩餘批次');
assert.strictEqual(queue[0].shares, 400, '第 1 批剩餘 400 股');
assert.strictEqual(queue[1].shares, 500, '第 2 批剩餘 500 股');
console.log('✅ FIFO 批次隊列計算檢驗通過 (分批餘額精確)');

// 3. 驗證舊版同步格式產出欄位完整性
const legacyHoldings = holdings.map(h => ({
    Date: '2026/09/24',
    Account: '證券戶',
    StockCode: h.symbol,
    StockName: h.name,
    Shares: h.shares,
    CurrentPrice: h.lastPrice,
    AvgCost: h.avgCost,
    Cost: Math.round(h.shares * h.avgCost),
    MarketValue: h.marketValue,
    UnrealizedProfit: h.unrealizedPnL,
    ProfitRate: h.unrealizedRate
}));

assert.strictEqual(legacyHoldings[0].StockCode, '2330');
assert.strictEqual(legacyHoldings[0].Shares, 900);
assert.ok(legacyHoldings[0].MarketValue > 0);
console.log('✅ 舊版相容持倉欄位對齊檢驗通過');

// 4. 檢查 HTML 檔案中引用 script 是否齊全
const wbHtml = fs.readFileSync(path.join(__dirname, '../workbench.html'), 'utf8');
assert.ok(wbHtml.includes('storage-service.js'), 'workbench.html 必須載入 storage-service.js');
assert.ok(wbHtml.includes('data-module="stockHoldings"'), 'workbench.html 必須包含股票庫存頁籤');

const indexHtml = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
assert.ok(indexHtml.includes('storage-service.js'), 'index.html 必須載入 storage-service.js');
assert.ok(indexHtml.includes('workbench.html'), 'index.html 必須包含前往 PRO 一體化工作台之連結');

console.log('✅ 頁面檔案依賴與頁籤宣告檢驗通過');
console.log('🎉 所有單元與相容性測試全部通過！');
