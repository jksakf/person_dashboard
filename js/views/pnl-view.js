/**
 * 個人資產一體化工作台 - 已實現損益視圖模組 (PnLView: 已實現損益大表、盈虧圓餅圖切片、個股平倉排行)
 * 編碼：UTF-8 with BOM
 */

class PnLView {
    constructor(app) {
        this.app = app;
    }

    // ==========================================
    // View 5: 已實現損益全表渲染 (由交易紀錄 FIFO 計算，支援日期範圍篩選)
    // ==========================================
    getRealizedPnLList() {
        const { calculatedPnL } = this.engine.computeFifoHoldings(this.data.transactions || []);
        const manualList = (this.data.realizedPnL || []).filter(p => p.id !== 'manual_pnl_1');
        const manualCustom = manualList.filter(m => {
            const isCovered = calculatedPnL.some(c => 
                (c.transactionId && c.transactionId === m.transactionId) || 
                c.id === m.id ||
                (c.date === m.date && c.symbol === m.symbol && Math.abs((c.shares || 0) - (m.shares || 0)) < 0.001)
            );
            return !isCovered;
        });
        const all = [...calculatedPnL, ...manualCustom];
        all.sort((a, b) => (b.closeDate || b.date || '').localeCompare(a.closeDate || a.date || ''));
        return all;
    }

    setPnlDateRange(type) {
        this.pnlDateRangeType = type;
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const toIso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

        if (type === 'ALL') {
            this.pnlStartDate = '';
            this.pnlEndDate = '';
        } else if (type === 'YTD') {
            this.pnlStartDate = `${now.getFullYear()}-01-01`;
            this.pnlEndDate = toIso(now);
        } else if (type === '1Y') {
            const past = new Date(now);
            past.setFullYear(past.getFullYear() - 1);
            this.pnlStartDate = toIso(past);
            this.pnlEndDate = toIso(now);
        } else if (type === '3M') {
            const past = new Date(now);
            past.setMonth(past.getMonth() - 3);
            this.pnlStartDate = toIso(past);
            this.pnlEndDate = toIso(now);
        } else if (type === '1M') {
            this.pnlStartDate = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
            const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            this.pnlEndDate = toIso(lastDay);
        }

        const startInput = document.getElementById('pnlStartDate');
        const endInput = document.getElementById('pnlEndDate');
        if (startInput) startInput.value = this.pnlStartDate;
        if (endInput) endInput.value = this.pnlEndDate;

        this.updatePnlQuickButtons();
        this.renderPnLTable();
    }

    onPnlCustomDateChange() {
        const startInput = document.getElementById('pnlStartDate');
        const endInput = document.getElementById('pnlEndDate');
        this.pnlStartDate = startInput?.value || '';
        this.pnlEndDate = endInput?.value || '';
        this.pnlDateRangeType = (this.pnlStartDate || this.pnlEndDate) ? 'CUSTOM' : 'ALL';

        this.updatePnlQuickButtons();
        this.renderPnLTable();
    }

    updatePnlQuickButtons() {
        const container = document.getElementById('pnlDateQuickGroup');
        if (!container) return;
        const buttons = container.querySelectorAll('button[data-pnl-range]');
        buttons.forEach(btn => {
            if (btn.getAttribute('data-pnl-range') === this.pnlDateRangeType) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    getFilteredRealizedPnLList() {
        let list = this.getRealizedPnLList();

        // 1. 日期區間過濾 (依金融會計標準，以平倉賣出日期為準)
        if (this.pnlStartDate || this.pnlEndDate) {
            const normStart = this.pnlStartDate ? this.pnlStartDate.replace(/[\/\-]/g, '') : '00000000';
            const normEnd = this.pnlEndDate ? this.pnlEndDate.replace(/[\/\-]/g, '') : '99999999';

            list = list.filter(p => {
                const rawDate = p.closeDate || p.date || '';
                const normDate = rawDate.replace(/[\/\-]/g, '').slice(0, 8);
                if (!normDate) return false;
                return normDate >= normStart && normDate <= normEnd;
            });
        }

        // 2. 關鍵字搜尋過濾
        if (this.pnlSearch) {
            const q = this.pnlSearch.toLowerCase();
            list = list.filter(p => `${p.symbol || ''} ${p.name || ''} ${p.closeDate || p.date || ''} ${p.market || ''}`.toLowerCase().includes(q));
        }

        return list;
    }

    onPnLSearch(query) {
        this.pnlSearch = query;
        this.renderPnLTable();
    }

    renderPnLTable() {
        const tbody = document.getElementById('realizedTableBody');
        const badge = document.getElementById('realizedStatsBadge');
        if (!tbody) return;

        const list = this.getFilteredRealizedPnLList();

        const totalProfit = list.reduce((sum, p) => sum + p.netProfit, 0);
        const winCount = list.filter(p => p.netProfit > 0).length;
        const lossCount = list.filter(p => p.netProfit < 0).length;
        const winRate = list.length > 0 ? ((winCount / list.length) * 100).toFixed(1) : 0;
        const sign = totalProfit >= 0 ? '+' : '';

        if (badge) {
            badge.textContent = `共 ${list.length} 筆平倉 | 累計獲利 ${sign}$${totalProfit.toLocaleString()} | ${winCount} 勝 ${lossCount} 負 (勝率 ${winRate}%)`;
        }

        // 渲染已實現損益頂部：獲利標的貢獻佔比圓餅圖與個股累計損益排行榜 (完全連動當前篩選期間)
        this.renderRealizedWeightChart(list);

        if (list.length === 0) {
            tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; padding:2rem; color:var(--text-muted);">查無符合條件的已實現損益紀錄</td></tr>`;
            return;
        }

        let html = '';
        list.forEach(p => {
            const isProfit = p.netProfit >= 0;
            const profitSign = isProfit ? '+' : '';
            const profitColor = isProfit ? 'var(--danger)' : 'var(--success)';
            const marketTag = p.market === '港股' ? 'bank' : (p.market === '美股' ? 'warning' : 'primary');

            html += `
            <tr class="wb-inventory-row" onclick="app.filterHistoryByStock('${p.symbol}')">
                <td class="mono">${p.closeDate || p.date}</td>
                <td><span class="wb-tag ${marketTag}">${p.market || '台股'}</span></td>
                <td><strong class="mono" style="color:var(--primary);">${p.symbol}</strong></td>
                <td>${p.name || ''}</td>
                <td class="text-right mono">${(p.shares || 0).toLocaleString()} 股</td>
                <td class="text-right mono">$${(p.costBasis || 0).toLocaleString()}</td>
                <td class="text-right mono">$${(p.sellRevenue || 0).toLocaleString()}</td>
                <td class="text-right mono" style="font-weight:700; color:${profitColor};">
                    ${profitSign}$${(p.netProfit || 0).toLocaleString()}
                </td>
                <td class="text-right mono" style="font-weight:700; color:${profitColor};">
                    ${profitSign}${p.profitRate || 0}%
                </td>
                <td style="text-align:center;">
                    <button class="wb-btn sm" onclick="event.stopPropagation(); app.filterHistoryByStock('${p.symbol}')" title="查看此標的所有交易">
                        🔍 查明細
                    </button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }

    setPnlPieType(type) {
        this.pnlPieType = type;
        document.querySelectorAll('#pnlPieTypeGroup .wb-pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-pie-type') === type);
        });
        const list = this.getFilteredRealizedPnLList();
        this.renderRealizedWeightChart(list);
    }

    renderRealizedWeightChart(fullList = []) {
        const canvas = document.getElementById('realizedWeightChart');
        const rankList = document.getElementById('pnlRankList');
        const badgeTotal = document.getElementById('pnlTotalProfitBadge');
        const badgeCount = document.getElementById('pnlTradedCountBadge');
        const titleEl = document.getElementById('pnlPieCardTitle');

        if (!canvas || typeof Chart === 'undefined') return;

        if (this.charts.realizedWeight) {
            this.charts.realizedWeight.destroy();
            this.charts.realizedWeight = null;
        }

        if (!fullList || fullList.length === 0) {
            if (badgeTotal) badgeTotal.textContent = '獲利總和: +$0';
            if (badgeCount) badgeCount.textContent = '共 0 檔平倉';
            if (rankList) {
                rankList.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">尚無已平倉損益紀錄</div>`;
            }
            return;
        }

        // 依股票代號聚合已實現損益
        const stockMap = new Map();
        fullList.forEach(p => {
            const symbol = p.symbol || '未知';
            if (!stockMap.has(symbol)) {
                stockMap.set(symbol, {
                    symbol,
                    name: p.name || symbol,
                    market: p.market || '台股',
                    netProfit: 0,
                    tradeCount: 0,
                    totalRevenue: 0,
                    totalCost: 0
                });
            }
            const item = stockMap.get(symbol);
            item.netProfit += (p.netProfit || 0);
            item.tradeCount += 1;
            item.totalRevenue += (p.sellRevenue || 0);
            item.totalCost += (p.costBasis || 0);
        });

        const allStocks = Array.from(stockMap.values());
        const gainers = allStocks.filter(s => s.netProfit > 0).sort((a, b) => b.netProfit - a.netProfit);
        const losers = allStocks.filter(s => s.netProfit < 0).sort((a, b) => a.netProfit - b.netProfit);
        const totalGrossProfit = gainers.reduce((sum, s) => sum + s.netProfit, 0);
        const totalGrossLoss = Math.abs(losers.reduce((sum, s) => sum + s.netProfit, 0));
        const netPnL = totalGrossProfit - totalGrossLoss;

        if (badgeCount) {
            badgeCount.textContent = `共 ${allStocks.length} 檔標的平倉 (${gainers.length} 賺 ${losers.length} 賠)`;
        }

        let chartLabels = [];
        let chartData = [];
        let palette = [];
        let denominator = 1;
        const topCount = 6;

        if (this.pnlPieType === 'loss') {
            if (titleEl) titleEl.textContent = '⚠️ 已實現虧損標的分佈';
            if (badgeTotal) badgeTotal.textContent = `虧損總和: -$${Math.round(totalGrossLoss).toLocaleString()}`;
            denominator = totalGrossLoss;

            if (losers.length === 0) {
                chartLabels = ['無任何虧損標的 🎉'];
                chartData = [1];
                palette = ['#10b981'];
            } else if (losers.length <= topCount + 1) {
                chartLabels = losers.map(l => {
                    const lossAbs = Math.abs(l.netProfit);
                    const pct = denominator > 0 ? ((lossAbs / denominator) * 100).toFixed(1) : '0.0';
                    return `${l.symbol} ${l.name} (${pct}%)`;
                });
                chartData = losers.map(l => Math.abs(l.netProfit));
                // 台灣習慣：虧損為綠/青/冷色調
                palette = ['#10b981', '#059669', '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#64748b'];
            } else {
                const topLosers = losers.slice(0, topCount);
                const otherLosers = losers.slice(topCount);
                const otherLoss = Math.abs(otherLosers.reduce((sum, l) => sum + l.netProfit, 0));
                const otherPct = denominator > 0 ? ((otherLoss / denominator) * 100).toFixed(1) : '0.0';

                chartLabels = topLosers.map(l => {
                    const lossAbs = Math.abs(l.netProfit);
                    const pct = denominator > 0 ? ((lossAbs / denominator) * 100).toFixed(1) : '0.0';
                    return `${l.symbol} ${l.name} (${pct}%)`;
                });
                chartData = topLosers.map(l => Math.abs(l.netProfit));

                chartLabels.push(`其他 ${otherLosers.length} 檔 (${otherPct}%)`);
                chartData.push(otherLoss);
                palette = ['#10b981', '#059669', '#14b8a6', '#06b6d4', '#0ea5e9', '#6366f1', '#64748b', '#94a3b8'];
            }
        } else if (this.pnlPieType === 'comparison') {
            if (titleEl) titleEl.textContent = '⚖️ 歷史累計盈虧總額對比';
            const sign = netPnL >= 0 ? '+' : '';
            const pFactor = totalGrossLoss > 0 ? (totalGrossProfit / totalGrossLoss).toFixed(2) : '∞';
            if (badgeTotal) badgeTotal.textContent = `淨損益: ${sign}$${Math.round(netPnL).toLocaleString()} (盈虧比: ${pFactor})`;

            denominator = totalGrossProfit + totalGrossLoss;
            const profitPct = denominator > 0 ? ((totalGrossProfit / denominator) * 100).toFixed(1) : '0.0';
            const lossPct = denominator > 0 ? ((totalGrossLoss / denominator) * 100).toFixed(1) : '0.0';

            chartLabels = [
                `獲利總和 (+${profitPct}%)`,
                `虧損總和 (-${lossPct}%)`
            ];
            chartData = [totalGrossProfit, totalGrossLoss];
            // 台灣習慣：獲利紅、虧損綠
            palette = ['#ef4444', '#10b981'];
        } else {
            // 預設: profit
            if (titleEl) titleEl.textContent = '🏆 已實現獲利標的分佈';
            if (badgeTotal) badgeTotal.textContent = `獲利總和: +$${Math.round(totalGrossProfit).toLocaleString()}`;
            denominator = totalGrossProfit;

            if (gainers.length === 0) {
                chartLabels = ['尚無獲利標的'];
                chartData = [1];
                palette = ['#94a3b8'];
            } else if (gainers.length <= topCount + 1) {
                chartLabels = gainers.map(g => {
                    const pct = denominator > 0 ? ((g.netProfit / denominator) * 100).toFixed(1) : '0.0';
                    return `${g.symbol} ${g.name} (${pct}%)`;
                });
                chartData = gainers.map(g => g.netProfit);
                // 台灣習慣：獲利紅/暖色系列
                palette = ['#ef4444', '#f87171', '#fb923c', '#f59e0b', '#eab308', '#f43f5e', '#fb7185'];
            } else {
                const topGainers = gainers.slice(0, topCount);
                const otherGainers = gainers.slice(topCount);
                const otherProfit = otherGainers.reduce((sum, g) => sum + g.netProfit, 0);
                const otherPct = denominator > 0 ? ((otherProfit / denominator) * 100).toFixed(1) : '0.0';

                chartLabels = topGainers.map(g => {
                    const pct = denominator > 0 ? ((g.netProfit / denominator) * 100).toFixed(1) : '0.0';
                    return `${g.symbol} ${g.name} (${pct}%)`;
                });
                chartData = topGainers.map(g => g.netProfit);

                chartLabels.push(`其他 ${otherGainers.length} 檔 (${otherPct}%)`);
                chartData.push(otherProfit);
                palette = ['#ef4444', '#f87171', '#fb923c', '#f59e0b', '#eab308', '#f43f5e', '#fb7185', '#94a3b8'];
            }
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const doughnutPlugins = typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [];

        this.charts.realizedWeight = new Chart(canvas, {
            type: 'doughnut',
            plugins: doughnutPlugins,
            data: {
                labels: chartLabels,
                datasets: [{
                    data: chartData,
                    backgroundColor: chartLabels.map((_, i) => palette[i % palette.length]),
                    borderColor: isDark ? '#1e293b' : '#ffffff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: textColor,
                            font: { family: "'Noto Sans TC', sans-serif", size: 11 },
                            boxWidth: 12,
                            padding: 10
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const val = context.raw || 0;
                                const pct = denominator > 0 ? ((val / denominator) * 100).toFixed(1) : '0.0';
                                const sign = this.pnlPieType === 'loss' ? '-$' : (this.pnlPieType === 'comparison' && context.dataIndex === 1 ? '-$' : '+$');
                                return ` ${context.label.split(' ')[0]}: ${sign}${Math.round(val).toLocaleString()} (${pct}%)`;
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        color: '#ffffff',
                        font: {
                            weight: 'bold',
                            size: 13,
                            family: "'Roboto Mono', 'Noto Sans TC', sans-serif"
                        },
                        formatter: (value) => {
                            if (!denominator || denominator === 0) return '';
                            const pct = ((value / denominator) * 100).toFixed(1);
                            if (parseFloat(pct) < 4) return '';
                            return `${pct}%`;
                        },
                        textShadowBlur: 4,
                        textShadowColor: 'rgba(0,0,0,0.7)'
                    }
                }
            }
        });

        // 渲染右側歷史平倉個股損益排行清單
        if (rankList) {
            let sortedAll = [];
            if (this.pnlPieType === 'loss') {
                // 若選虧損，由虧損最多排到獲利最多
                sortedAll = [...allStocks].sort((a, b) => a.netProfit - b.netProfit);
            } else {
                sortedAll = [...allStocks].sort((a, b) => b.netProfit - a.netProfit);
            }
            const maxAbs = Math.max(...sortedAll.map(s => Math.abs(s.netProfit)), 1);

            let rankHtml = '';
            sortedAll.forEach((s) => {
                const isProfit = s.netProfit >= 0;
                const sign = isProfit ? '+' : '';
                const profitColor = isProfit ? 'var(--danger)' : 'var(--success)';
                const barColor = isProfit ? '#ef4444' : '#22c55e';
                const widthPct = Math.min(100, Math.max(6, (Math.abs(s.netProfit) / maxAbs) * 100)).toFixed(1);

                rankHtml += `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:0.5rem 0.75rem; cursor:pointer;" onclick="app.filterPnLByStock('${s.symbol}')" title="點擊過濾查看「${s.symbol}」所有平倉紀錄">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <div style="display:flex; align-items:center; gap:0.4rem;">
                            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${barColor};"></span>
                            <strong class="mono" style="color:var(--primary); font-size:0.9rem;">${s.symbol}</strong>
                            <span style="font-weight:600; font-size:0.85rem;">${s.name}</span>
                        </div>
                        <div style="text-align:right;">
                            <span class="mono" style="font-weight:700; font-size:0.92rem; color:${profitColor};">${sign}$${Math.round(s.netProfit).toLocaleString()}</span>
                        </div>
                    </div>
                    <div style="height:5px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin-bottom:0.3rem;">
                        <div style="width:${widthPct}%; height:100%; background:${barColor}; border-radius:3px;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                        <span>共 ${s.tradeCount} 筆平倉 ｜ 賣出總額 $${Math.round(s.totalRevenue).toLocaleString()}</span>
                        <span style="color:var(--primary);">🔍 點擊過濾</span>
                    </div>
                </div>`;
            });
            rankList.innerHTML = rankHtml;
        }
    }

    filterPnLByStock(symbol) {
        const input = document.getElementById('pnlSearchInput');
        if (input) input.value = symbol;
        this.pnlSearch = symbol;
        this.renderPnLTable();
        this.showToast(`已過濾平倉標的: ${symbol}`, 'info');
    }

}

if (typeof window !== "undefined") {
    window.PnLView = PnLView;
}
