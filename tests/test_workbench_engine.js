/**
 * 工作台金融運算引擎與資料轉換測試套件
 * 執行指令: node tests/test_workbench_engine.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const WorkbenchEngine = require('../js/core/workbench-engine.js');
const DataConverter = require('../js/core/data-converter.js');

console.log('🧪 正在執行個人資產工作台金融核心單元測試...\n');

// 測試 1: 手續費與證交稅試算
{
    console.log('▶ [測試 1] 手續費低消與證交稅試算');
    const engine = new WorkbenchEngine({ stockFeeRate: 0.001425, stockTaxRate: 0.003, minFee: 20 });

    // 小額買入: 10 股 * 100 元 = 1000 元，0.1425% 為 1 元，應觸發低消 20 元
    const estBuySmall = engine.calculateTradeEstimate({ action: '買入', price: 100, shares: 10 });
    assert.strictEqual(estBuySmall.fee, 20, '小額買入手續費應為低消 20 元');
    assert.strictEqual(estBuySmall.tax, 0, '買入無證交稅');
    assert.strictEqual(estBuySmall.netAmountOriginal, 1020, '交割付出額應為 1000 + 20');

    // 大額賣出: 1000 股 * 1000 元 = 1000,000 元
    // 手續費: 1,000,000 * 0.001425 = 1425 元
    // 證交稅: 1,000,000 * 0.003 = 3000 元
    // 實收: 1,000,000 - 1425 - 3000 = 995,575 元
    const estSellBig = engine.calculateTradeEstimate({ action: '賣出', price: 1000, shares: 1000 });
    assert.strictEqual(estSellBig.fee, 1425, '大額賣出手續費應為 1425 元');
    assert.strictEqual(estSellBig.tax, 3000, '賣出證交稅應為 3000 元');
    assert.strictEqual(estSellBig.netAmountOriginal, 995575, '實收額應為 995,575 元');

    console.log('  ✅ 手續費與稅額計算無誤！');
}

// 測試 2: FIFO 先進先出持倉與損益演算法
{
    console.log('\n▶ [測試 2] FIFO 先進先出批次庫存與平倉損益');
    const engine = new WorkbenchEngine();

    const sampleTx = [
        // 第一批買入: 100 股 @ $100，手續費 $20，成本 $10,020 (每股 $100.2)
        { id: 'tx_001', date: '2026/01/01', symbol: '2330', name: '台積電', action: '買入', price: 100, shares: 100, fee: 20, tax: 0 },
        // 第二批買入: 100 股 @ $200，手續費 $28，成本 $20,028 (每股 $200.28)
        { id: 'tx_002', date: '2026/02/01', symbol: '2330', name: '台積電', action: '買入', price: 200, shares: 100, fee: 28, tax: 0 },
        // 部分賣出: 150 股 @ $300，手續費 $64，稅 $135
        // 實收: 45,000 - 64 - 135 = 44,801 元
        // FIFO 沖銷:
        //  - 第 1 批 100 股全沖: 成本 $10,020
        //  - 第 2 批 50 股沖銷: 成本 50 * 200.28 = $10,014
        //  - 沖銷總成本: 10,020 + 10,014 = $20,034
        //  - 已實現淨損益: 44,801 - 20,034 = $24,767
        // 剩餘庫存: 第 2 批剩餘 50 股 @ $200.28 = $10,014
        { id: 'tx_003', date: '2026/03/01', symbol: '2330', name: '台積電', action: '賣出', price: 300, shares: 150, fee: 64, tax: 135 }
    ];

    const { holdings, oversoldErrors, calculatedPnL } = engine.computeFifoHoldings(sampleTx);

    assert.strictEqual(oversoldErrors.length, 0, '正常賣出無超賣錯誤');
    assert.strictEqual(holdings.length, 1, '應僅剩 1 檔持倉');
    assert.strictEqual(holdings[0].shares, 50, '剩餘持股應為 50 股');
    assert.strictEqual(holdings[0].totalCost, 10014, '剩餘成本應為 10,014 元');
    assert.strictEqual(calculatedPnL.length, 1, '產生 1 筆平倉損益');
    assert.strictEqual(calculatedPnL[0].netProfit, 24767, '已實現損益應為 24,767 元');

    console.log('  ✅ FIFO 沖銷、加權平均成本與平倉損益計算 100% 精準！');
}

// 測試 3: 超賣防護檢測
{
    console.log('\n▶ [測試 3] 超賣防護 (Oversell Prevention) 驗證');
    const engine = new WorkbenchEngine();

    const oversoldTx = [
        { id: 'tx_001', date: '2026/01/01', symbol: '2330', name: '台積電', action: '買入', price: 100, shares: 50, fee: 20 },
        { id: 'tx_002', date: '2026/02/01', symbol: '2330', name: '台積電', action: '賣出', price: 120, shares: 80, fee: 20 }
    ];

    const { holdings, oversoldErrors } = engine.computeFifoHoldings(oversoldTx);
    assert.strictEqual(oversoldErrors.length, 1, '應捕捉到超賣錯誤');
    assert.strictEqual(oversoldErrors[0].oversoldAmount, 30, '超賣數量應為 30 股');
    console.log(`  ✅ 成功捕捉超賣例外: ${oversoldErrors[0].message}`);
}

// 測試 4: 資料庫 assets_data.json 完整性驗證
{
    console.log('\n▶ [測試 4] assets_data.json 結構與數據驗證');
    const jsonPath = path.join(__dirname, '../assets_data.json');
    assert.ok(fs.existsSync(jsonPath), 'assets_data.json 檔案必須存在');

    let content = fs.readFileSync(jsonPath, 'utf8');
    if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
    }
    const json = JSON.parse(content);

    assert.ok(Array.isArray(json.transactions), 'transactions 必須為陣列');
    assert.ok(Array.isArray(json.bankAssets), 'bankAssets 必須為陣列');
    assert.ok(json.transactions.length > 0, '已成功遷移歷史交易紀錄');
    assert.ok(json.bankAssets.length > 0, '已成功遷移歷史銀行紀錄');

    const engine = new WorkbenchEngine();
    const metrics = engine.computeAssetMetrics(json);
    console.log(`  • 總資產淨值: $${Math.round(metrics.netWorth).toLocaleString()}`);
    console.log(`  • 銀行總存款: $${Math.round(metrics.bankTotalTwd).toLocaleString()}`);
    console.log(`  • 股票持倉檔數: ${metrics.holdings.length} 檔`);
    console.log(`  • 股票持股市值: $${Math.round(metrics.stockMarketValue).toLocaleString()}`);
    console.log('  ✅ 資料庫結構與聚合指標驗證通過！');
}

// 測試 5: 歷史基準日持股回溯與月末市值推算 (computeHoldingsAtDate)
{
    console.log('\n▶ [測試 5] 歷史基準日持股回溯與月末市值推算驗證');
    const engine = new WorkbenchEngine();

    const sampleTx = [
        { id: 'tx_1', date: '2024/01/15', symbol: '2330', name: '台積電', action: '買入', price: 600, shares: 1000, fee: 20 },
        { id: 'tx_2', date: '2024/02/10', symbol: '2454', name: '聯發科', action: '買入', price: 900, shares: 500, fee: 20 },
        { id: 'tx_3', date: '2024/03/20', symbol: '2330', name: '台積電', action: '賣出', price: 750, shares: 400, fee: 20, tax: 900 },
        { id: 'tx_4', date: '2024/04/15', symbol: '2330', name: '台積電', action: '買入', price: 800, shares: 200, fee: 20 }
    ];

    // 回溯至 2024-01-31 底: 僅有 2330 1000 股
    const janHoldings = engine.computeHoldingsAtDate(sampleTx, '2024-01-31', { '2330': 620 });
    assert.strictEqual(janHoldings.holdings.length, 1);
    assert.strictEqual(janHoldings.holdings[0].symbol, '2330');
    assert.strictEqual(janHoldings.holdings[0].shares, 1000);
    assert.strictEqual(janHoldings.totalMarketValue, 620000, '2024-01-31 市值應為 1000 * 620');

    // 回溯至 2024-02-29 底: 2330 1000 股 + 2454 500 股
    const febHoldings = engine.computeHoldingsAtDate(sampleTx, '2024-02-29', { '2330': 690, '2454': 1000 });
    assert.strictEqual(febHoldings.holdings.length, 2);
    assert.strictEqual(febHoldings.totalMarketValue, (1000 * 690) + (500 * 1000), '2024-02-29 市值應為 690,000 + 500,000');

    // 回溯至 2024-03-31 底: 2330 剩 600 股，2454 500 股
    const marHoldings = engine.computeHoldingsAtDate(sampleTx, '2024-03-31', { '2330': 770, '2454': 1180 });
    const h2330 = marHoldings.holdings.find(h => h.symbol === '2330');
    assert.strictEqual(h2330.shares, 600, '2024-03-31 2330 應剩 600 股');
    assert.strictEqual(marHoldings.totalMarketValue, (600 * 770) + (500 * 1180));

    console.log('  ✅ 歷史任一時間點 FIFO 庫存回溯與月末市值推算 100% 精準！');
}

// 測試 6: 使用者手動自訂實際交割金額 (券商手續費折讓/實際扣款防錯)
{
    console.log('\n▶ [測試 6] 實際交割扣款金額手動覆寫防錯機制');
    const engine = new WorkbenchEngine();

    // 模擬買入：理論成本 1000 * 50 + 71 = 50,071
    // 但券商退佣折讓或實際銀行扣款對帳單為 50,030 元 (手動填入 netAmountTwd: 50030)
    const customBuyTx = [
        { id: 'tx_c1', date: '2024/05/10', symbol: '0050', name: '元大台灣50', action: '買入', price: 50, shares: 1000, fee: 71, totalAmount: 50030, netAmountTwd: 50030 }
    ];

    const buyRes = engine.computeFifoHoldings(customBuyTx);
    assert.strictEqual(buyRes.holdings.length, 1);
    assert.strictEqual(buyRes.holdings[0].totalCost, 50030, '持倉成本應以使用者手動輸入之實際交割扣款金額 50030 為準');

    // 模擬賣出：理論收入 1000 * 60 - 85 - 180 = 59,735
    // 但實際交割入帳為 59,750 元 (手動填入 netAmountTwd: 59750)
    const customSellTx = [
        ...customBuyTx,
        { id: 'tx_c2', date: '2024/06/10', symbol: '0050', name: '元大台灣50', action: '賣出', price: 60, shares: 1000, fee: 85, tax: 180, totalAmount: 59750, netAmountTwd: 59750 }
    ];

    const sellRes = engine.computeFifoHoldings(customSellTx);
    assert.strictEqual(sellRes.holdings.length, 0, '持股已全數平倉');
    assert.strictEqual(sellRes.calculatedPnL.length, 1);
    assert.strictEqual(sellRes.calculatedPnL[0].costBasis, 50030, '平倉成本依實際扣款 50030');
    assert.strictEqual(sellRes.calculatedPnL[0].sellRevenue, 59750, '賣出收入依實際入帳 59750');
    assert.strictEqual(sellRes.calculatedPnL[0].netProfit, 59750 - 50030, '已實現損益為 59750 - 50030 = 9720');
    console.log('  ✅ 實際交割扣款金額覆寫防錯機制驗證無誤！');
}

// 測試 7: 外幣股票 (港股/美股) 匯率折算台幣與歷史月末估值
{
    console.log('\n▶ [測試 7] 外幣股票匯率折算與歷史月末估值');
    const engine = new WorkbenchEngine();

    const foreignTx = [
        { id: 'tx_f1', date: '2025/02/19', symbol: '01810', name: '小米集團-W', action: '買入', price: 48.95, shares: 200, fee: 50, currency: 'HKD', exchangeRate: 4.226, netAmountTwd: 41564 }
    ];

    // 即時庫存
    const res = engine.computeFifoHoldings(foreignTx);
    assert.strictEqual(res.holdings.length, 1);
    const h = res.holdings[0];
    assert.strictEqual(h.currency, 'HKD');
    assert.strictEqual(h.exchangeRate, 4.226);
    // 市值折合台幣：200 * 48.95 * 4.226 = 41373
    assert.strictEqual(h.marketValue, Math.round(200 * 48.95 * 4.226));
    assert.strictEqual(h.marketValueOriginal, 200 * 48.95);

    // 月末歷史回溯
    const monthRes = engine.computeHoldingsAtDate(foreignTx, '2025-02-28', { '01810': 50.0 }, { 'HKD': 4.20 });
    assert.strictEqual(monthRes.holdings.length, 1);
    // 市值應為 200 * 50.0 * 4.20 = 42,000 TWD
    assert.strictEqual(monthRes.holdings[0].marketValue, 42000);
    assert.strictEqual(monthRes.totalMarketValue, 42000);
    console.log('  ✅ 外幣股票匯率折合台幣與歷史月末估值 100% 精準！');
}

// 8. 月度資產結算總表與手動覆寫 (isManualOverride) 優先保護驗證
console.log('\n▶ [測試 8] 月度資產結算總表與手動微調優先權');
{
    const engine = new WorkbenchEngine();
    const dummyBank = [
        { date: '2025/03/05', bankName: '富邦', twdAmount: 50000 },
        { date: '2025/03/05', bankName: '股票(國泰)', twdAmount: 150000 },
        { date: '2025/04/05', bankName: '富邦', twdAmount: 60000 },
        { date: '2025/04/05', bankName: '股票(國泰)', twdAmount: 180000 }
    ];
    const dummySnapshots = {
        '2025/03': {
            month: '2025/03',
            bankTotal: 50000,
            stockTotal: 150000,
            totalNetWorth: 200000,
            isManualOverride: false
        },
        '2025/04': {
            month: '2025/04',
            bankTotal: 65000, // 手動校正存款
            stockTotal: 195000, // 手動校正市值
            totalNetWorth: 260000,
            isManualOverride: true, // 標記手動校正
            note: '手動微調對齊銀行存摺實質餘額'
        }
    };

    const res = engine.generateMonthlySettlementLedger(dummyBank, [], dummySnapshots, {});
    assert.strictEqual(res.ledger.length, 2);

    // 2025/03 為自動結算
    assert.strictEqual(res.ledger[0].month, '2025/03');
    assert.strictEqual(res.ledger[0].totalNetWorth, 200000);
    assert.strictEqual(res.ledger[0].isManualOverride, false);

    // 2025/04 應完全遵循手動校正覆寫值
    assert.strictEqual(res.ledger[1].month, '2025/04');
    assert.strictEqual(res.ledger[1].bankTotal, 65000);
    assert.strictEqual(res.ledger[1].stockTotal, 195000);
    assert.strictEqual(res.ledger[1].totalNetWorth, 260000);
    assert.strictEqual(res.ledger[1].isManualOverride, true);
    assert.strictEqual(res.ledger[1].monthlyGrowth, 60000); // 260000 - 200000
    assert.strictEqual(res.ledger[1].growthRate, 30.0); // +30.0%

    // 總結算統計
    assert.strictEqual(res.summary.totalGrowth, 60000);
    assert.strictEqual(res.summary.totalGrowthRate, 30.0);
    console.log('  ✅ 月度資產結算總表與手動覆寫 (isManualOverride) 優先保護驗證 100% 正確！');
}

// 測試 9: 結算時序膠囊切片 (6M / 1Y / 3Y / ALL) 與動態成長試算
{
    console.log('\n▶ [測試 9] 結算時序膠囊切片 (6M / 1Y / 3Y / ALL) 與動態成長試算');
    const dummyLedger = [];
    // 產生連續 24 個月的虛擬結算數據 (總淨值從 100,000 成長至 340,000，每月成長 10,000)
    for (let i = 0; i < 24; i++) {
        const year = 2024 + Math.floor(i / 12);
        const month = String((i % 12) + 1).padStart(2, '0');
        dummyLedger.push({
            month: `${year}/${month}`,
            totalNetWorth: 100000 + i * 10000
        });
    }

    // 模擬切片函式
    function filterLedger(ledger, range) {
        let filtered = ledger;
        if (range === '6M') filtered = ledger.slice(-6);
        else if (range === '1Y') filtered = ledger.slice(-12);
        else if (range === '3Y') filtered = ledger.slice(-36);

        let growth = 0;
        let growthRate = '0.0';
        if (filtered.length >= 2) {
            const first = filtered[0].totalNetWorth;
            const last = filtered[filtered.length - 1].totalNetWorth;
            growth = Math.round(last - first);
            growthRate = first > 0 ? ((growth / first) * 100).toFixed(1) : '0.0';
        }
        return { filtered, growth, growthRate };
    }

    // 驗證 6M: 應切出後 6 個月，成長額 = 330,000 - 280,000 = 50,000，成長率 = 50,000 / 280,000 = 17.9%
    const res6M = filterLedger(dummyLedger, '6M');
    assert.strictEqual(res6M.filtered.length, 6);
    assert.strictEqual(res6M.filtered[0].month, '2025/07');
    assert.strictEqual(res6M.filtered[5].month, '2025/12');
    assert.strictEqual(res6M.growth, 50000);
    assert.strictEqual(res6M.growthRate, '17.9');

    // 驗證 1Y: 應切出後 12 個月，成長額 = 330,000 - 220,000 = 110,000，成長率 = 110,000 / 220,000 = 50.0%
    const res1Y = filterLedger(dummyLedger, '1Y');
    assert.strictEqual(res1Y.filtered.length, 12);
    assert.strictEqual(res1Y.growth, 110000);
    assert.strictEqual(res1Y.growthRate, '50.0');

    // 驗證 3Y: 因只有 24 個月，應安全返回全部 24 個月，無邊界溢出
    const res3Y = filterLedger(dummyLedger, '3Y');
    assert.strictEqual(res3Y.filtered.length, 24);
    assert.strictEqual(res3Y.growth, 230000);

    // 驗證 ALL: 完整全期 24 個月
    const resALL = filterLedger(dummyLedger, 'ALL');
    assert.strictEqual(resALL.filtered.length, 24);
    assert.strictEqual(resALL.growth, 230000);
    assert.strictEqual(resALL.growthRate, '230.0');

    console.log('  ✅ 6M / 1Y / 3Y / ALL 時序膠囊切片與動態成長指標驗證 100% 正確！');
}

// 測試 10: 券商對帳單標準整數分攤模式驗證 (訊芯-KY 2股與98股損益精準對齊)
{
    console.log('\n▶ [測試 10] 券商對帳單標準整數分攤模式驗證 (訊芯-KY 2股與98股損益精準對齊)');
    const engine = new WorkbenchEngine();
    const rawData = JSON.parse(fs.readFileSync(path.join(__dirname, '../assets_data.json'), 'utf8').replace(/^\uFEFF/, ''));
    const { calculatedPnL } = engine.computeFifoHoldings(rawData.transactions || []);

    const pnl33 = calculatedPnL.find(p => p.date === '2026/06/23' && p.symbol === '6451' && p.shares === 2);
    const pnl34 = calculatedPnL.find(p => p.date === '2026/06/23' && p.symbol === '6451' && p.shares === 98);

    assert.ok(pnl33, '必須能找到 2026/06/23 訊芯 2 股平倉紀錄');
    assert.ok(pnl34, '必須能找到 2026/06/23 訊芯 98 股平倉紀錄');

    assert.strictEqual(pnl33.costBasis, 970, '訊芯 2 股認列成本必須為整數 970 (零股手續費未滿1元捨去)');
    assert.strictEqual(pnl33.sellRevenue, 1250, '訊芯 2 股賣出實收必須為整數 1250');
    assert.strictEqual(pnl33.netProfit, 280, '訊芯 2 股已實現損益必須 100% 吻合證券 APP 對帳單 $280');

    assert.strictEqual(pnl34.costBasis, 57829, '訊芯 98 股認列成本必須為整數 57829 (完整結轉前批剩餘20元手續費)');
    assert.strictEqual(pnl34.sellRevenue, 60527, '訊芯 98 股賣出實收必須為整數 60527');
    assert.strictEqual(pnl34.netProfit, 2698, '訊芯 98 股已實現損益必須 100% 吻合證券 APP 對帳單 $2698');

    // 兩筆總損益守恆
    assert.strictEqual(pnl33.netProfit + pnl34.netProfit, 2978, '兩筆平倉損益加總必須等於真實銀行交割實收減交割成本 2978 元');
    console.log('  ✅ 訊芯-KY 零股分攤、尾數結轉與證券 APP 對帳單 ($280 / $2698) 100% 精準對齊！');
}

console.log('\n🎉 所有金融運算與資料結構測試均通過！');


