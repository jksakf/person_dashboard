const fs = require('fs');
const path = require('path');
const WorkbenchEngine = require('../js/core/workbench-engine.js');
const engine = new WorkbenchEngine();

const dataFile = path.resolve(__dirname, '../assets_data.json');
const raw = fs.readFileSync(dataFile, 'utf8').replace(/^\uFEFF/, '');
const data = JSON.parse(raw);

// 1. 計算純銀行存款 (按月份，排除股票科目) 與各月份真實銀行對帳日
const monthlyBank = {};
const monthlyReconDate = {};
(data.bankAssets || []).forEach(b => {
    const m = (b.date || '').slice(0, 7);
    if (!m) return;
    if (!monthlyReconDate[m] || b.date > monthlyReconDate[m]) {
        monthlyReconDate[m] = b.date;
    }
    const isStockAcc = b.bankName && (b.bankName.includes('股票') || b.bankName.includes('ETF'));
    if (isStockAcc) return;
    const amt = parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0;
    monthlyBank[m] = (monthlyBank[m] || 0) + amt;
});

const sortedMonths = Object.keys(monthlyBank).sort();
const pastMonths = sortedMonths.slice(0, sortedMonths.length - 1);
console.log('待補齊歷史月份 (以各月真實對帳日回溯):', pastMonths);

(async () => {
    const newSnapshots = {};
    for (const m of pastMonths) {
        const reconDate = monthlyReconDate[m] || (m + '-31');
        const hist = engine.computeHoldingsAtDate(data.transactions || [], reconDate);
        const priceMap = {};
        for (const h of hist.holdings) {
            try {
                const res = await fetch('http://127.0.0.1:8080/api/stock-price/historical?symbol=' + encodeURIComponent(h.symbol) + '&month=' + encodeURIComponent(m));
                if (res.ok) {
                    const j = await res.json();
                    if (j.success && j.data && j.data.closePrice) {
                        priceMap[h.symbol] = j.data.closePrice;
                    }
                }
            } catch (e) {}
        }

        const reval = engine.computeHoldingsAtDate(data.transactions || [], reconDate, priceMap);
        const bankTotal = monthlyBank[m] || 0;
        const stockTotal = reval.totalMarketValue;
        const netWorth = bankTotal + stockTotal;

        const bAssets = data.bankAssets.filter(b => b.date && b.date.startsWith(m));
        const legacySum = bAssets.reduce((s, b) => s + (b.twdAmount || 0), 0);
        const diff = netWorth - legacySum;
        const sign = diff >= 0 ? '+' : '';

        console.log(`[${m}] 對帳日: ${reconDate} | 純銀: $${bankTotal.toLocaleString()} + 股: $${stockTotal.toLocaleString()} = 新淨值: $${netWorth.toLocaleString()} | 舊留存: $${legacySum.toLocaleString()} (${sign}$${diff.toLocaleString()})`);

        newSnapshots[m] = {
            month: m,
            date: reconDate,
            bankTotal: bankTotal,
            stockTotal: stockTotal,
            totalNetWorth: netWorth,
            holdings: reval.holdings.map(h => ({
                symbol: h.symbol,
                name: h.name,
                currency: h.currency || 'TWD',
                exchangeRate: h.exchangeRate || 1.0,
                shares: h.shares,
                closePrice: h.evalPrice,
                marketValue: h.marketValue,
                marketValueOriginal: h.marketValueOriginal || h.marketValue
            })),
            updatedAt: new Date().toISOString()
        };
    }

    data.monthlySnapshots = data.monthlySnapshots || {};
    Object.assign(data.monthlySnapshots, newSnapshots);
    data.meta = data.meta || {};
    data.meta.lastSnapshotUpdate = new Date().toISOString();

    const jsonStr = JSON.stringify(data, null, 2);
    const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
    fs.writeFileSync(dataFile, Buffer.concat([bom, Buffer.from(jsonStr, 'utf8')]));
    console.log('\n🎉 assets_data.json monthlySnapshots 依真實對帳日重新補齊完成！');
})();
