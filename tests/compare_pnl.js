const fs = require('fs');
const path = require('path');
const WorkbenchEngine = require('../js/core/workbench-engine.js');

// 1. 舊系統 49 筆
const pnlPath = 'archive/legacy_system/output/history_data/Realized_pnl/20260927_ALL1231_realized_pnl.csv';
const buf = fs.readFileSync(pnlPath);
const txt = (buf[0] === 0xFF && buf[1] === 0xFE) ? buf.toString('utf16le') : buf.toString('utf8');
const lines = txt.replace(/^\uFEFF/, '').trim().split(/\r?\n/).filter(Boolean);
const legacyRows = lines.slice(1).map(l => {
    const parts = l.split(',').map(s => s.replace(/^"|"$/g, '').trim());
    return {
        date: parts[0],
        market: parts[1],
        symbol: parts[2],
        name: parts[3],
        currency: parts[4],
        shares: parseFloat(parts[5]),
        costBasisTwd: parseFloat(parts[10]),
        sellRevenueTwd: parseFloat(parts[11]),
        pnlTwd: parseFloat(parts[12])
    };
});

// 2. 新系統
const rawJson = fs.readFileSync('assets_data.json', 'utf8').replace(/^\uFEFF/, '');
const assetsData = JSON.parse(rawJson);
const engine = new WorkbenchEngine(assetsData.meta && assetsData.meta.feeRates);
const { calculatedPnL } = engine.computeFifoHoldings(assetsData.transactions || [], assetsData.latestPrices || {});

console.log('Legacy count:', legacyRows.length, 'Total PnL TWD:', legacyRows.reduce((s, r) => s + r.pnlTwd, 0));
console.log('New engine count:', calculatedPnL.length, 'Total PnL TWD:', calculatedPnL.reduce((s, r) => s + r.netProfit, 0));

console.log('\n--- 尋找多出的平倉或未匹配平倉 ---');
const matchedLegacy = new Set();
calculatedPnL.forEach((np, nIdx) => {
    let matchIdx = -1;
    for (let i = 0; i < legacyRows.length; i++) {
        if (!matchedLegacy.has(i)) {
            const lr = legacyRows[i];
            if (lr.date === np.date && lr.symbol === np.symbol && Math.abs(lr.shares - np.shares) < 0.001) {
                matchIdx = i;
                break;
            }
        }
    }
    if (matchIdx !== -1) {
        matchedLegacy.add(matchIdx);
        const lr = legacyRows[matchIdx];
        const diff = np.netProfit - lr.pnlTwd;
        if (Math.abs(diff) > 0.01) {
            console.log(`[金額微差] ${np.date} ${np.symbol} ${np.name} (${np.shares}股): 舊=${lr.pnlTwd}, 新=${np.netProfit}, 差額=${diff} (舊成本=${lr.costBasisTwd}, 新成本=${np.costBasis}, 舊收入=${lr.sellRevenueTwd}, 新收入=${np.sellRevenue})`);
        }
    } else {
        console.log(`[新系統獨有平倉] ${np.date} ${np.symbol} ${np.name} (${np.shares}股): 損益=${np.netProfit}, 賣出收入=${np.sellRevenue}, 成本=${np.costBasis}`);
    }
});

for (let i = 0; i < legacyRows.length; i++) {
    if (!matchedLegacy.has(i)) {
        const lr = legacyRows[i];
        console.log(`[舊系統獨有平倉] ${lr.date} ${lr.symbol} ${lr.name} (${lr.shares}股): 損益=${lr.pnlTwd}`);
    }
}
