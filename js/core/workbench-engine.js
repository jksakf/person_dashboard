/**
 * 個人資產一體化工作台 - 金融運算核心引擎 (WorkbenchEngine)
 * 職責：FIFO 先進先出持倉成本演算、手續費/證交稅試算、超賣檢核、跨幣別匯率折算
 * 編碼：UTF-8 with BOM
 */

class WorkbenchEngine {
    constructor(config = {}) {
        this.stockFeeRate = config.stockFeeRate !== undefined ? config.stockFeeRate : 0.001425;
        this.stockTaxRate = config.stockTaxRate !== undefined ? config.stockTaxRate : 0.003;
        this.minFee = config.minFee !== undefined ? config.minFee : 20; // 手續費低消 20 元
    }

    /**
     * 試算股票交易手續費與交割稅費
     * @param {Object} params
     * @returns {Object} 試算結果
     */
    calculateTradeEstimate(params = {}) {
        const action = params.action;
        const price = params.price;
        const shares = params.shares;
        const currency = params.currency || 'TWD';
        const exchangeRate = params.exchangeRate || 1.0;
        const customFee = params.customFee !== undefined ? params.customFee : null;
        const customTax = params.customTax !== undefined ? params.customTax : null;

        const p = parseFloat(price) || 0;
        const s = parseInt(shares, 10) || 0;
        const rate = parseFloat(exchangeRate) || 1.0;
        const grossAmount = Math.round(p * s);

        // 手續費計算：若有手動自訂手續費則優先使用
        let fee = 0;
        if (customFee !== null && customFee !== undefined && customFee !== '') {
            fee = parseFloat(customFee) || 0;
        } else if (grossAmount > 0) {
            fee = Math.max(this.minFee, Math.floor(grossAmount * this.stockFeeRate));
        }

        // 證交稅計算：僅賣出時課徵
        let tax = 0;
        if (action === '賣出') {
            if (customTax !== null && customTax !== undefined && customTax !== '') {
                tax = parseFloat(customTax) || 0;
            } else if (grossAmount > 0) {
                tax = Math.floor(grossAmount * this.stockTaxRate);
            }
        }

        // 原幣交割總額
        let netAmountOriginal = 0;
        if (action === '買入') {
            netAmountOriginal = grossAmount + fee;
        } else if (action === '賣出') {
            netAmountOriginal = grossAmount - fee - tax;
        }

        // 折合台幣交割額
        const netAmountTwd = Math.round(netAmountOriginal * rate);

        return {
            grossAmount,
            fee,
            tax,
            netAmountOriginal,
            netAmountTwd
        };
    }

    /**
     * 核心 FIFO 先進先出持倉與損益結算
     * @param {Array} transactions 歷史交易流水帳陣列
     * @returns {Object} { holdings, fifoQueues, oversoldErrors, calculatedPnL }
     */
    computeFifoHoldings(transactions = [], priceMap = {}) {
        // 依日期與流水排序 (舊 -> 新)
        const sortedTx = [...transactions].sort((a, b) => {
            const dateA = (a.date || '').replace(/[\/\-]/g, '');
            const dateB = (b.date || '').replace(/[\/\-]/g, '');
            if (dateA !== dateB) return dateA.localeCompare(dateB);
            return (a.id || '').localeCompare(b.id || '');
        });

        // 依股票代號分組維護隊列
        const symbolGroups = {};
        const oversoldErrors = [];
        const calculatedPnL = [];

        for (const tx of sortedTx) {
            const symbol = (tx.symbol || '').trim();
            if (!symbol) continue;

            if (!symbolGroups[symbol]) {
                symbolGroups[symbol] = {
                    symbol: symbol,
                    name: tx.name || '',
                    lots: [], // 隊列：{ date, shares, price, costPerShare, originalShares, fee }
                    lastPrice: tx.price || 0
                };
            }

            const group = symbolGroups[symbol];
            group.lastPrice = tx.price || group.lastPrice;
            if (tx.name && !group.name) group.name = tx.name;

            const shares = parseInt(tx.shares, 10) || 0;
            const price = parseFloat(tx.price) || 0;
            const fee = parseFloat(tx.fee) || 0;
            const fxRate = parseFloat(tx.exchangeRate) || 1.0;
            const currency = tx.currency || 'TWD';

            if (tx.action === '買入') {
                if (shares <= 0) continue;
                // 買進計入成本 (優先採用使用者手動自訂之實際交割金額，若無則依單價*股數+手續費試算)
                const totalCostOriginal = parseFloat(tx.totalAmount) || ((shares * price) + fee);
                const costPerShareOriginal = totalCostOriginal / shares;
                const totalCostTwd = parseFloat(tx.netAmountTwd) || Math.round(totalCostOriginal * fxRate);
                const costPerShareTwd = totalCostTwd / shares;

                group.lots.push({
                    date: tx.date || '',
                    shares: shares,
                    price: price,
                    currency: currency,
                    exchangeRate: fxRate,
                    costPerShare: costPerShareOriginal,
                    costPerShareTwd: costPerShareTwd,
                    originalShares: shares,
                    fee: fee,
                    totalCostOriginal: totalCostOriginal,
                    remainingCostOriginal: totalCostOriginal,
                    totalCostTwd: totalCostTwd,
                    remainingCostTwd: totalCostTwd
                });
            } else if (tx.action === '賣出') {
                if (shares <= 0) continue;
                let remainingToSell = shares;
                let costOfSoldSharesOriginal = 0;
                let costOfSoldSharesTwd = 0;
                const sellTax = parseFloat(tx.tax) || 0;
                const sellFee = parseFloat(tx.fee) || 0;
                // 賣出收入 (優先採用使用者手動自訂之實際交割金額，若無則依單價*股數-手續費-證交稅試算)
                const sellRevenueOriginal = parseFloat(tx.totalAmount) || ((shares * price) - sellFee - sellTax);
                const sellRevenueTwd = parseFloat(tx.netAmountTwd) || Math.round(sellRevenueOriginal * fxRate);

                while (remainingToSell > 0 && group.lots.length > 0) {
                    const currentLot = group.lots[0];
                    const sharesFromThisLot = Math.min(currentLot.shares, remainingToSell);

                    let lotCostOriginal = 0;
                    let lotCostTwd = 0;

                    if (sharesFromThisLot >= currentLot.shares) {
                        // 1. 全數清空此 lot：完全繼承剩餘全部成本，徹底杜絕浮點數除法殘留誤差
                        lotCostOriginal = currentLot.remainingCostOriginal != null ? currentLot.remainingCostOriginal : (sharesFromThisLot * currentLot.costPerShare);
                        lotCostTwd = currentLot.remainingCostTwd != null ? currentLot.remainingCostTwd : Math.round(sharesFromThisLot * currentLot.costPerShareTwd);

                        currentLot.shares = 0;
                        currentLot.remainingCostOriginal = 0;
                        currentLot.remainingCostTwd = 0;
                        group.lots.shift(); // 移出隊列
                    } else {
                        // 2. 部分賣出此 lot：依券商對帳單標準分攤 (未滿 1 元手續費無條件捨去，由後續末筆繼承)
                        const partialRawOriginal = Math.round(sharesFromThisLot * currentLot.price * 100) / 100;
                        const partialFeeOriginal = currentLot.originalShares > 0
                            ? Math.floor((currentLot.fee || 0) * (sharesFromThisLot / currentLot.originalShares) * 100) / 100
                            : 0;
                        lotCostOriginal = Math.round((partialRawOriginal + partialFeeOriginal) * 100) / 100;

                        const partialRawTwd = sharesFromThisLot * currentLot.price * (currentLot.exchangeRate || 1.0);
                        const partialFeeTwd = currentLot.originalShares > 0
                            ? Math.floor((currentLot.fee || 0) * (sharesFromThisLot / currentLot.originalShares) * (currentLot.exchangeRate || 1.0))
                            : 0;
                        lotCostTwd = Math.round(partialRawTwd + partialFeeTwd);

                        currentLot.shares -= sharesFromThisLot;
                        if (currentLot.remainingCostOriginal != null) currentLot.remainingCostOriginal -= lotCostOriginal;
                        if (currentLot.remainingCostTwd != null) currentLot.remainingCostTwd -= lotCostTwd;
                    }

                    costOfSoldSharesOriginal += lotCostOriginal;
                    costOfSoldSharesTwd += lotCostTwd;
                    remainingToSell -= sharesFromThisLot;
                }

                // 檢查是否超賣
                if (remainingToSell > 0) {
                    oversoldErrors.push({
                        date: tx.date,
                        symbol: symbol,
                        name: group.name,
                        attemptedShares: shares,
                        oversoldAmount: remainingToSell
                    });
                }

                // 計算該筆賣出的已實現淨損益 (原幣與台幣)
                const netProfitOriginal = Math.round((sellRevenueOriginal - costOfSoldSharesOriginal) * 100) / 100;
                const netProfitTwd = Math.round(sellRevenueTwd - costOfSoldSharesTwd);
                const profitRate = costOfSoldSharesOriginal > 0 ? ((netProfitOriginal / costOfSoldSharesOriginal) * 100).toFixed(2) : '0.00';
                const market = currency === 'HKD' ? '港股' : (currency === 'USD' ? '美股' : '台股');

                calculatedPnL.push({
                    id: 'pnl_' + (tx.id || (tx.date || '').replace(/[\/\-]/g, '')),
                    transactionId: tx.id,
                    date: tx.date,
                    closeDate: tx.date,
                    symbol: symbol,
                    name: group.name,
                    market: market,
                    shares: shares - remainingToSell,
                    currency: currency,
                    exchangeRate: fxRate,
                    costBasisOriginal: Math.round(costOfSoldSharesOriginal * 100) / 100,
                    sellRevenueOriginal: Math.round(sellRevenueOriginal * 100) / 100,
                    netProfitOriginal: netProfitOriginal,
                    costBasis: Math.round(costOfSoldSharesTwd),
                    sellRevenue: Math.round(sellRevenueTwd),
                    netProfit: netProfitTwd,
                    profitRate: parseFloat(profitRate),
                    fee: sellFee,
                    tax: sellTax,
                    note: tx.note || ''
                });
            }
        }

        // 彙整最終持倉清單
        const holdings = [];
        const fifoQueues = {};

        for (const sym in symbolGroups) {
            const grp = symbolGroups[sym];
            const remainingShares = grp.lots.reduce((acc, lot) => acc + lot.shares, 0);

            if (remainingShares > 0) {
                // 判斷幣別與適用匯率
                const lastLot = grp.lots[grp.lots.length - 1] || {};
                const currency = lastLot.currency || 'TWD';
                const exchangeRate = parseFloat(lastLot.exchangeRate) || 1.0;

                // 原幣成本與折合台幣成本
                const totalCostOriginal = grp.lots.reduce((acc, lot) => acc + (lot.remainingCostOriginal != null ? lot.remainingCostOriginal : (lot.shares * lot.costPerShare)), 0);
                const totalCostTwd = grp.lots.reduce((acc, lot) => acc + (lot.remainingCostTwd != null ? lot.remainingCostTwd : (lot.shares * (lot.costPerShareTwd || (lot.costPerShare * (lot.exchangeRate || 1.0))))), 0);
                const avgCostOriginal = remainingShares > 0 ? (totalCostOriginal / remainingShares) : 0;
                const avgCostTwd = remainingShares > 0 ? (totalCostTwd / remainingShares) : 0;

                let currentPrice = grp.lastPrice;
                if (priceMap && priceMap[grp.symbol] != null && !isNaN(priceMap[grp.symbol])) {
                    currentPrice = parseFloat(priceMap[grp.symbol]);
                }

                // 市值計算：原幣與折合台幣 (TWD)
                const marketValOriginal = Math.round(remainingShares * currentPrice * 100) / 100;
                const marketValTwd = currency === 'TWD' ? Math.round(remainingShares * currentPrice) : Math.round(marketValOriginal * exchangeRate);

                // 未實現損益一律以折合台幣（TWD）衡量，維持全資產組合指標一致
                const unrealizedPnL = marketValTwd - Math.round(totalCostTwd);
                const unrealizedRate = totalCostTwd > 0 ? ((unrealizedPnL / totalCostTwd) * 100).toFixed(2) : '0.00';

                const h = {
                    symbol: grp.symbol,
                    name: grp.name,
                    currency: currency,
                    exchangeRate: exchangeRate,
                    shares: remainingShares,
                    avgCost: Math.round(avgCostTwd),
                    avgCostOriginal: Math.round(avgCostOriginal * 100) / 100,
                    totalCost: Math.round(totalCostTwd),
                    totalCostOriginal: Math.round(totalCostOriginal * 100) / 100,
                    lastPrice: grp.lastPrice,
                    currentPrice: currentPrice,
                    marketValue: marketValTwd,
                    marketValueOriginal: marketValOriginal,
                    unrealizedPnL: unrealizedPnL,
                    unrealizedRate: parseFloat(unrealizedRate),
                    lots: grp.lots
                };

                holdings.push(h);
                fifoQueues[grp.symbol] = grp.lots;
            }
        }

        const stockTotalMarketValue = holdings.reduce((sum, h) => sum + (parseFloat(h.marketValue) || 0), 0);
        const stockTotalCost = holdings.reduce((sum, h) => sum + (parseFloat(h.totalCost) || 0), 0);

        return {
            holdings,
            totalMarketValue: stockTotalMarketValue,
            totalCost: stockTotalCost,
            fifoQueues,
            oversoldErrors,
            calculatedPnL
        };
    }

    /**
     * 檢核某標的在指定交易發生前，最大可賣出庫存股數
     * @param {Array} transactions 既有交易陣列
     * @param {string} symbol 標的代號
     * @param {string} currentTxId 正在編輯的交易 ID (若是修改則排除本身)
     * @returns {number} 目前可用庫存股數
     */
    getAvailableShares(transactions, symbol, currentTxId = null) {
        if (!symbol) return 0;
        const filteredTx = (transactions || []).filter(t => t.id !== currentTxId);
        const { holdings } = this.computeFifoHoldings(filteredTx);
        const found = holdings.find(h => h.symbol.trim() === symbol.trim());
        return found ? found.shares : 0;
    }

    /**
     * 彙總全資產現況 (淨值、銀行資產、股票持倉、總損益)
     * @param {Object} data 包括 bankAssets, transactions, realizedPnL
     * @returns {Object} 全域指標統計
     */
    computeAssetMetrics(data = {}, priceMap = {}) {
        const bankAssets = data.bankAssets || [];
        const transactions = data.transactions || [];
        const manualPnL = data.realizedPnL || [];
        const effectivePriceMap = priceMap || data.latestPrices || {};

        // 1. 銀行總資產折合台幣 (若存在多個歷史月份快照，以最新月份快照計入當前淨值)
        let activeBankAssets = bankAssets;
        if (bankAssets.length > 0) {
            const sortedDates = Array.from(new Set(bankAssets.map(b => b.date).filter(Boolean))).sort().reverse();
            if (sortedDates.length > 0) {
                const latestDatePrefix = sortedDates[0].slice(0, 7);
                const distinctMonths = new Set(sortedDates.map(d => (d || '').slice(0, 7)));
                if (distinctMonths.size > 1) {
                    activeBankAssets = bankAssets.filter(b => (b.date || '').startsWith(latestDatePrefix));
                }
            }
        }

        // 排除舊系統中的股票/ETF 虛擬帳戶，避免與股票市值重複計算
        const bankTotalTwd = activeBankAssets.filter(item => {
            const name = item.bankName || '';
            return !(name.includes('股票') || name.includes('ETF'));
        }).reduce((sum, item) => {
            const amount = parseFloat(item.twdAmount) || parseFloat(item.originalAmount) || 0;
            return sum + amount;
        }, 0);

        // 2. 股票持倉 FIFO 計算
        const { holdings, fifoQueues, oversoldErrors, calculatedPnL } = this.computeFifoHoldings(transactions, effectivePriceMap);

        const stockTotalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);
        const stockMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
        const stockUnrealizedPnL = stockMarketValue - stockTotalCost;

        // 3. 已實現損益加總 (以交易紀錄自動 FIFO 沖銷為主，避免與手動快取重複計算)
        const fifoTotalPnL = calculatedPnL.reduce((sum, p) => sum + p.netProfit, 0);
        const manualUnlinked = manualPnL.filter(m => !calculatedPnL.some(c => (c.transactionId && c.transactionId === m.transactionId) || c.id === m.id));
        const manualTotalPnL = manualUnlinked.reduce((sum, p) => sum + (parseFloat(p.netProfit) || 0), 0);

        // 總資產淨值 = 銀行總資產 + 股票現值
        const netWorth = bankTotalTwd + stockMarketValue;

        const totalRealizedPnL = fifoTotalPnL + manualTotalPnL;

        return {
            netWorth,
            bankTotalTwd,
            stockTotalCost,
            stockMarketValue,
            stockUnrealizedPnL,
            manualTotalPnL,
            fifoTotalPnL,
            totalRealizedPnL,
            holdings,
            fifoQueues,
            oversoldErrors,
            calculatedPnL
        };
    }

    /**
     * 回溯計算指定歷史基準日（如月底 YYYY-MM-DD 或 YYYY/MM/DD）在庫持股與估值
     * @param {Array} transactions 歷史完整交易明細
     * @param {string} targetDate 基準日期 (例如 '2024-03-31' 或 '2024/03/31')
     * @param {Object} priceMap 可選：當日/當月各標的收盤價映射 { [symbol]: price }
     * @param {Object} fxRateMap 可選：各幣別折合台幣匯率映射 { 'HKD': 4.1, 'USD': 32.0 }
     * @returns {Object} { holdings, totalCost, totalMarketValue, totalUnrealizedPnL }
     */
    computeHoldingsAtDate(transactions = [], targetDate = '', priceMap = {}, fxRateMap = {}) {
        if (!targetDate) return this.computeFifoHoldings(transactions);

        // 正規化 targetDate 為 YYYYMMDD
        const normTarget = targetDate.replace(/[\/\-]/g, '').slice(0, 8);

        // 僅篩選日期 <= targetDate 的交易
        const filteredTx = (transactions || []).filter(tx => {
            const txDate = (tx.date || '').replace(/[\/\-]/g, '').slice(0, 8);
            if (!txDate) return false;
            return txDate <= normTarget;
        });

        const { holdings, fifoQueues } = this.computeFifoHoldings(filteredTx);

        // 若有傳入 priceMap，以此計算月末市值；若無則以該持股 lastPrice，若仍無則以平均成本保底
        let totalCost = 0;
        let totalMarketValue = 0;

        const evaluatedHoldings = holdings.map(h => {
            const costTwd = h.totalCost; // 已經是折合台幣
            totalCost += costTwd;

            let evalPrice = null;
            if (priceMap && priceMap[h.symbol] != null && !isNaN(priceMap[h.symbol])) {
                evalPrice = parseFloat(priceMap[h.symbol]);
            } else if (h.currentPrice && !isNaN(h.currentPrice)) {
                evalPrice = parseFloat(h.currentPrice);
            } else {
                evalPrice = h.avgCostOriginal || h.avgCost; // 保底回退為買入成本
            }

            // 取得適用匯率 (若外部傳入 fxRateMap 優先，否則取持股批次匯率，再保底)
            let fxRate = 1.0;
            if (h.currency && h.currency !== 'TWD') {
                if (fxRateMap && fxRateMap[h.currency] != null && !isNaN(fxRateMap[h.currency])) {
                    fxRate = parseFloat(fxRateMap[h.currency]);
                } else if (h.exchangeRate && !isNaN(h.exchangeRate)) {
                    fxRate = parseFloat(h.exchangeRate);
                } else if (h.currency === 'HKD') {
                    fxRate = 4.05;
                } else if (h.currency === 'USD') {
                    fxRate = 32.0;
                }
            }

            const mValOriginal = Math.round(h.shares * evalPrice * 100) / 100;
            const mValTwd = h.currency === 'TWD' ? Math.round(h.shares * evalPrice) : Math.round(mValOriginal * fxRate);
            totalMarketValue += mValTwd;

            const pnl = mValTwd - costTwd;
            const pnlRate = costTwd > 0 ? ((pnl / costTwd) * 100).toFixed(2) : 0;

            return {
                ...h,
                evalPrice: evalPrice,
                marketValue: mValTwd,
                marketValueOriginal: mValOriginal,
                exchangeRate: fxRate,
                unrealizedPnL: pnl,
                profitRate: parseFloat(pnlRate)
            };
        });

        const totalUnrealizedPnL = totalMarketValue - totalCost;

        return {
            date: targetDate,
            holdings: evaluatedHoldings,
            fifoQueues: fifoQueues,
            totalCost: totalCost,
            totalMarketValue: totalMarketValue,
            totalUnrealizedPnL: totalUnrealizedPnL
        };
    }

    /**
     * 生成月度資產結算總表 (Monthly Net Worth Ledger)
     * 支援月末自動結算、手動校正覆寫保護 (isManualOverride) 與月成長率試算
     * @param {Array} bankAssets 銀行資產清單
     * @param {Array} transactions 交易紀錄清單
     * @param {Object} snapshots 現有月度快照映射 (month -> snapshot)
     * @param {Object} latestPrices 當前最新股票現價映射
     * @returns {Object} { ledger: Array, summary: Object }
     */
    generateMonthlySettlementLedger(bankAssets = [], transactions = [], snapshots = {}, latestPrices = {}) {
        // 1. 整理銀行資產各月份純存款與舊留存股票
        const monthlyBankPure = {};
        const monthlyStockLegacy = {};
        const monthlyReconDate = {};

        (bankAssets || []).forEach(b => {
            const m = (b.date || '').slice(0, 7);
            if (!m) return;
            if (!monthlyReconDate[m] || b.date > monthlyReconDate[m]) {
                monthlyReconDate[m] = b.date;
            }
            const amt = parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0;
            const isStockAcc = b.bankName && (b.bankName.includes('股票') || b.bankName.includes('ETF'));
            if (isStockAcc) {
                monthlyStockLegacy[m] = (monthlyStockLegacy[m] || 0) + amt;
            } else {
                monthlyBankPure[m] = (monthlyBankPure[m] || 0) + amt;
            }
        });

        // 2. 彙整所有出現的月份
        const allMonthsSet = new Set(Object.keys(monthlyBankPure));
        if (snapshots) {
            Object.keys(snapshots).forEach(m => allMonthsSet.add(m));
        }
        const sortedMonths = Array.from(allMonthsSet).sort();
        if (sortedMonths.length === 0) {
            return { ledger: [], summary: { totalGrowth: 0, totalGrowthRate: 0, currentNetWorth: 0 } };
        }

        // 3. 當前即時股票總市值 (防禦性計算，確保為精確數值)
        const currentHoldingsRes = this.computeFifoHoldings(transactions || [], latestPrices || {});
        const currentStockValue = currentHoldingsRes.totalMarketValue != null && !isNaN(currentHoldingsRes.totalMarketValue)
            ? currentHoldingsRes.totalMarketValue
            : (currentHoldingsRes.holdings || []).reduce((sum, h) => sum + (parseFloat(h.marketValue) || 0), 0);

        const ledger = [];
        let prevNetWorth = null;

        sortedMonths.forEach((m, idx) => {
            const isLatest = idx === sortedMonths.length - 1;
            const reconDate = monthlyReconDate[m] || (m + '-31');
            const pureBank = Math.round(monthlyBankPure[m] || 0);
            const snap = snapshots ? snapshots[m] : null;

            let bankTotal = pureBank;
            let stockTotal = 0;
            let totalNetWorth = 0;
            let isManual = false;
            let status = 'auto';
            let note = snap ? (snap.note || '') : '';

            // A. 最高優先權：手動校正標記 (isManualOverride)
            if (snap && snap.isManualOverride === true) {
                isManual = true;
                status = 'manual';
                bankTotal = snap.bankTotal != null ? Math.round(snap.bankTotal) : pureBank;
                stockTotal = snap.stockTotal != null ? Math.round(snap.stockTotal) : 0;
                totalNetWorth = snap.totalNetWorth != null ? Math.round(snap.totalNetWorth) : (bankTotal + stockTotal);
            }
            // B. 次高優先權：已有月度結算快照（依使用者需求：以結算基準日數值為主，優先於盤中即時估算）
            else if (snap && snap.totalNetWorth != null && !isNaN(snap.totalNetWorth)) {
                status = 'auto';
                totalNetWorth = Math.round(snap.totalNetWorth);
                bankTotal = snap.bankTotal != null ? Math.round(snap.bankTotal) : pureBank;
                stockTotal = snap.stockTotal != null ? Math.round(snap.stockTotal) : Math.max(0, totalNetWorth - bankTotal);
            }
            // C. 最新月份且無結算快照：純存款 + 當前即時持股市值 (即時動態)
            else if (isLatest) {
                status = 'current';
                bankTotal = pureBank;
                stockTotal = Math.round(currentStockValue);
                totalNetWorth = bankTotal + stockTotal;
            }
            // D. 歷史月份無快照：若舊留存有股票則採用舊留存，否則以對帳日回溯
            else {
                status = 'auto';
                if (monthlyStockLegacy[m] != null && monthlyStockLegacy[m] > 0) {
                    stockTotal = Math.round(monthlyStockLegacy[m]);
                } else {
                    const hist = this.computeHoldingsAtDate(transactions || [], reconDate);
                    stockTotal = Math.round(hist.totalMarketValue || 0);
                }
                bankTotal = pureBank;
                totalNetWorth = bankTotal + stockTotal;
            }

            // 月成長金額與成長率計算
            let monthlyGrowth = 0;
            let growthRate = 0;
            if (prevNetWorth !== null && !isNaN(prevNetWorth) && !isNaN(totalNetWorth)) {
                monthlyGrowth = totalNetWorth - prevNetWorth;
                growthRate = prevNetWorth > 0 ? parseFloat(((monthlyGrowth / prevNetWorth) * 100).toFixed(1)) : 0;
            }
            prevNetWorth = !isNaN(totalNetWorth) ? totalNetWorth : prevNetWorth;

            ledger.push({
                month: m,
                date: reconDate,
                bankTotal: bankTotal,
                stockTotal: stockTotal,
                totalNetWorth: totalNetWorth,
                monthlyGrowth: monthlyGrowth,
                growthRate: growthRate,
                isManualOverride: isManual,
                status: status,
                note: note,
                updatedAt: snap ? snap.updatedAt : null
            });
        });

        const firstNetWorth = ledger.length > 0 ? ledger[0].totalNetWorth : 0;
        const lastNetWorth = ledger.length > 0 ? ledger[ledger.length - 1].totalNetWorth : 0;
        const totalGrowth = lastNetWorth - firstNetWorth;
        const totalGrowthRate = firstNetWorth > 0 ? parseFloat(((totalGrowth / firstNetWorth) * 100).toFixed(1)) : 0;

        return {
            ledger: ledger,
            summary: {
                totalGrowth: totalGrowth,
                totalGrowthRate: totalGrowthRate,
                currentNetWorth: lastNetWorth,
                firstNetWorth: firstNetWorth
            }
        };
    }
}

// 支援 Node.js CommonJS 環境與瀏覽器全域
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WorkbenchEngine;
}
if (typeof window !== 'undefined') {
    window.WorkbenchEngine = WorkbenchEngine;
}
