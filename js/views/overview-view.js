/**
 * 個人資產一體化工作台 - 總覽儀表板視圖模組 (OverviewView: 核心指標、趨勢折線圖、水庫防守模型、月度結算總表)
 * 編碼：UTF-8 with BOM
 */

class OverviewView {
    constructor(app) {
        this.app = app;
    }

    // ==========================================
    // 核心指標計算 (Metrics)
    // ==========================================
    renderMetrics() {
        // 核心指標取自最新結算基準日（避免盤中即時波動與月度結算割裂）
        const ledgerRes = this.engine.generateMonthlySettlementLedger(
            this.data.bankAssets || [],
            this.data.transactions || [],
            this.data.monthlySnapshots || {},
            this.data.latestPrices || {}
        );
        const latestItem = (ledgerRes.ledger && ledgerRes.ledger.length > 0)
            ? ledgerRes.ledger[ledgerRes.ledger.length - 1]
            : null;

        const latestBank = this.getLatestBankAssets();
        const fallbackBankTotal = latestBank
            .filter(b => !(b.bankName && (b.bankName.includes('股票') || b.bankName.includes('ETF'))))
            .reduce((sum, b) => sum + (parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0), 0);

        const { holdings } = this.engine.computeFifoHoldings(this.data.transactions || [], this.data.latestPrices || {});
        const realtimeStockMarketValue = holdings.reduce((sum, h) => sum + h.marketValue, 0);
        const realtimeStockTotalCost = holdings.reduce((sum, h) => sum + h.totalCost, 0);
        const stockUnrealizedPnL = realtimeStockMarketValue - realtimeStockTotalCost;

        // 核心指標：100% 對齊最新結算基準日數值
        const netWorth = latestItem ? latestItem.totalNetWorth : (fallbackBankTotal + realtimeStockMarketValue);
        const bankTotalTwd = latestItem ? latestItem.bankTotal : fallbackBankTotal;
        const stockMarketValue = latestItem ? latestItem.stockTotal : realtimeStockMarketValue;

        // 頂部導航膠囊
        const topNetWorth = document.getElementById('topNetWorth');
        if (topNetWorth) topNetWorth.textContent = `$${Math.round(netWorth).toLocaleString()}`;

        // 總覽頁 5 大 KPI 卡片
        const nwEl = document.getElementById('kpiNetWorth');
        const nwSub = document.getElementById('kpiNetWorthSub');
        const bankEl = document.getElementById('kpiBankTotal');
        const stockEl = document.getElementById('kpiStockTotal');
        const stockSub = document.getElementById('kpiStockSub');
        const pnlEl = document.getElementById('kpiUnrealizedPnL');
        const dateSub = document.getElementById('kpiBankDateSub');
        const realizedEl = document.getElementById('kpiRealizedPnL');
        const realizedSub = document.getElementById('kpiRealizedPnLSub');

        if (nwEl) nwEl.textContent = `$${Math.round(netWorth).toLocaleString()}`;
        if (nwSub) {
            nwSub.textContent = latestItem ? `最新期次: ${latestItem.month} 對帳結算` : '包含最新銀行存款與股票現值';
        }

        if (bankEl) bankEl.textContent = `$${Math.round(bankTotalTwd).toLocaleString()}`;
        if (dateSub) {
            dateSub.textContent = latestItem ? `最新期次: ${latestItem.month} 對帳快照` : '尚無對帳快照';
        }

        if (stockEl) stockEl.textContent = `$${Math.round(stockMarketValue).toLocaleString()}`;
        if (stockSub) {
            if (latestItem) {
                stockSub.textContent = `最新期次: ${latestItem.month} 結算 (盤中現價: $${Math.round(realtimeStockMarketValue).toLocaleString()})`;
            } else {
                stockSub.textContent = `盤中即時現價估算`;
            }
        }

        if (pnlEl) {
            const isProfit = stockUnrealizedPnL >= 0;
            const sign = isProfit ? '+' : '';
            pnlEl.style.color = isProfit ? 'var(--danger)' : 'var(--success)';
            pnlEl.textContent = `${sign}$${Math.round(stockUnrealizedPnL).toLocaleString()}`;
        }

        // 歷史已實現損益計算
        const realizedList = this.getRealizedPnLList();
        const totalRealizedPnL = realizedList.reduce((sum, p) => sum + p.netProfit, 0);
        if (realizedEl) {
            const isProfit = totalRealizedPnL >= 0;
            const sign = isProfit ? '+' : '';
            realizedEl.style.color = isProfit ? 'var(--danger)' : 'var(--success)';
            realizedEl.textContent = `${sign}$${Math.round(totalRealizedPnL).toLocaleString()}`;
        }
        if (realizedSub) {
            realizedSub.textContent = `共 ${realizedList.length} 筆平倉累計獲利`;
        }
    }

    // ==========================================
    // 時序膠囊切換與過濾 (Time Range Filtering)
    // ==========================================
    setTrendTimeRange(range) {
        this.trendTimeRange = range;
        document.querySelectorAll('#trendTimeRangeGroup .wb-pill-btn').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-range') === range);
        });
        this.renderCharts();
        this.renderMonthlyLedger();
    }

    getFilteredLedgerData() {
        const fullRes = this.engine.generateMonthlySettlementLedger(
            this.data.bankAssets || [],
            this.data.transactions || [],
            this.data.monthlySnapshots || {},
            this.data.latestPrices || {}
        );
        const fullLedger = fullRes.ledger || [];
        let filtered = fullLedger;
        if (this.trendTimeRange === '6M') {
            filtered = fullLedger.slice(-6);
        } else if (this.trendTimeRange === '1Y') {
            filtered = fullLedger.slice(-12);
        } else if (this.trendTimeRange === '3Y') {
            filtered = fullLedger.slice(-36);
        }

        let growth = 0;
        let growthRate = '0.0';
        if (filtered.length >= 2) {
            const first = filtered[0].totalNetWorth;
            const last = filtered[filtered.length - 1].totalNetWorth;
            growth = Math.round(last - first);
            growthRate = first > 0 ? ((growth / first) * 100).toFixed(1) : '0.0';
        } else if (filtered.length === 1) {
            growth = 0;
            growthRate = '0.0';
        }

        const rangeLabelMap = {
            '6M': '近 6 個月',
            '1Y': '近 1 年',
            '3Y': '近 3 年',
            'ALL': '歷史全期'
        };

        return {
            fullLedger,
            ledger: filtered,
            summary: {
                totalGrowth: growth,
                totalGrowthRate: growthRate,
                rangeLabel: rangeLabelMap[this.trendTimeRange] || '區間'
            }
        };
    }

    // ==========================================
    // View 1: 總覽圖表渲染
    // ==========================================
    renderCharts() {
        if (typeof Chart === 'undefined') return;

        // 若載入了 ChartDataLabels，先向 Chart.js 註冊並預設關閉全域顯示 (避免折線圖與柱狀圖雜亂)
        if (typeof ChartDataLabels !== 'undefined') {
            try {
                Chart.register(ChartDataLabels);
            } catch (e) {
                // 已註冊過則忽略
            }
            if (Chart.defaults && Chart.defaults.plugins) {
                if (!Chart.defaults.plugins.datalabels) Chart.defaults.plugins.datalabels = {};
                Chart.defaults.plugins.datalabels.display = false;
            }
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';

        // 1. 總資產歷史成長趨勢折線圖 (支援月度資產快照與時序膠囊切換)
        const trendCtx = document.getElementById('netWorthTrendChart');
        if (trendCtx) {
            if (this.charts.trend) this.charts.trend.destroy();

            const filteredData = this.getFilteredLedgerData();
            const trendLabels = filteredData.ledger.map(item => item.month);
            const trendValues = filteredData.ledger.map(item => item.totalNetWorth);

            const badge = document.getElementById('trendSummaryBadge');
            if (badge) {
                if (trendValues.length >= 2) {
                    const growth = filteredData.summary.totalGrowth;
                    const rate = filteredData.summary.totalGrowthRate;
                    const sign = growth >= 0 ? '+' : '';
                    badge.textContent = `${filteredData.summary.rangeLabel} ${sign}$${growth.toLocaleString()} (${sign}${rate}%)`;
                } else if (trendValues.length === 1) {
                    badge.textContent = `${filteredData.summary.rangeLabel} 單期 $${trendValues[0].toLocaleString()}`;
                } else {
                    badge.textContent = '尚無紀錄';
                }
            }

            this.charts.trend = new Chart(trendCtx, {
                type: 'line',
                data: {
                    labels: trendLabels,
                    datasets: [{
                        label: '總淨值 (TWD)',
                        data: trendValues,
                        borderColor: '#38bdf8',
                        backgroundColor: 'rgba(56, 189, 248, 0.12)',
                        borderWidth: 2.5,
                        fill: true,
                        tension: 0.35,
                        pointBackgroundColor: '#38bdf8',
                        pointRadius: 3.5,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: textColor }, grid: { color: gridColor } },
                        y: { ticks: { color: textColor }, grid: { color: gridColor } }
                    },
                    plugins: {
                        legend: { display: false },
                        datalabels: { display: false }
                    }
                }
            });
        }

        // 2. 資產配置比重圓餅圖 (含切片與圖例百分比標註)
        const pieCtx = document.getElementById('assetDoughnutChart');
        if (pieCtx) {
            if (this.charts.doughnut) this.charts.doughnut.destroy();

            const latestBank = this.getLatestBankAssets();
            const bankTotal = latestBank
                .filter(b => !(b.bankName && (b.bankName.includes('股票') || b.bankName.includes('ETF'))))
                .reduce((sum, b) => sum + (parseFloat(b.twdAmount) || 0), 0);
            const { holdings } = this.engine.computeFifoHoldings(this.data.transactions || []);
            const stockTotal = holdings.reduce((sum, h) => sum + h.marketValue, 0);
            const totalAsset = bankTotal + stockTotal;

            const bankPct = totalAsset > 0 ? ((bankTotal / totalAsset) * 100).toFixed(1) : '0.0';
            const stockPct = totalAsset > 0 ? ((stockTotal / totalAsset) * 100).toFixed(1) : '0.0';

            // 圓心自訂插件：在甜甜圈圖中心繪製總資產淨值，消除視覺中空感
            const assetCenterPlugin = {
                id: 'assetCenterText',
                beforeDraw: (chart) => {
                    const { width, height, ctx } = chart;
                    ctx.save();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const centerX = width / 2;
                    const chartArea = chart.chartArea;
                    const centerY = chartArea ? (chartArea.top + chartArea.bottom) / 2 : height / 2;

                    ctx.font = '500 11px "Noto Sans TC", sans-serif';
                    ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
                    ctx.fillText('總資產淨值', centerX, centerY - 12);

                    ctx.font = '700 17px "Roboto Mono", monospace';
                    ctx.fillStyle = isDark ? '#f8fafc' : '#0f172a';
                    ctx.fillText(`$${Math.round(totalAsset).toLocaleString()}`, centerX, centerY + 11);
                    ctx.restore();
                }
            };

            const doughnutPlugins = [assetCenterPlugin];
            if (typeof ChartDataLabels !== 'undefined') {
                doughnutPlugins.push(ChartDataLabels);
            }

            this.charts.doughnut = new Chart(pieCtx, {
                type: 'doughnut',
                plugins: doughnutPlugins,
                data: {
                    labels: [`銀行存款 (${bankPct}%)`, `股票持股 (${stockPct}%)`],
                    datasets: [{
                        data: [bankTotal, stockTotal],
                        backgroundColor: ['#0284c7', '#38bdf8'],
                        borderColor: isDark ? '#1e293b' : '#ffffff',
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '65%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: textColor,
                                font: { family: "'Noto Sans TC', sans-serif", size: 12 },
                                padding: 14
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const val = context.raw || 0;
                                    const pct = totalAsset > 0 ? ((val / totalAsset) * 100).toFixed(1) : '0.0';
                                    return ` ${context.label.split(' ')[0]}: $${Math.round(val).toLocaleString()} (${pct}%)`;
                                }
                            }
                        },
                        datalabels: {
                            display: true,
                            color: '#ffffff',
                            font: {
                                weight: 'bold',
                                size: 14,
                                family: "'Roboto Mono', 'Noto Sans TC', sans-serif"
                            },
                            formatter: (value) => {
                                if (!totalAsset || totalAsset === 0) return '';
                                const pct = ((value / totalAsset) * 100).toFixed(1);
                                if (parseFloat(pct) < 1) return '';
                                return `${pct}%`;
                            },
                            textShadowBlur: 4,
                            textShadowColor: 'rgba(0,0,0,0.6)'
                        }
                    }
                }
            });
        }

        // 3. 渲染右側雙層戰情卡 (方案 1 財務防守線 + 方案 3 今年度 YTD 戰果)
        this.renderTacticalCards();
    }

    getAvailableOverviewYears(ledger = []) {
        const years = new Set();
        (ledger || []).forEach(l => {
            const y = (l.month || '').slice(0, 4);
            if (y) years.add(y);
        });
        const pnlList = this.getRealizedPnLList();
        pnlList.forEach(p => {
            const y = (p.closeDate || p.date || '').slice(0, 4);
            if (y) years.add(y);
        });
        if (years.size === 0) {
            years.add(new Date().getFullYear().toString());
        }
        return Array.from(years).sort((a, b) => b.localeCompare(a));
    }

    changeOverviewYear(year) {
        this.selectedOverviewYear = year;
        this.renderTacticalCards();
    }

    renderTacticalCards() {
        const safetyBadge = document.getElementById('overviewSafetyBadge');
        const grossCashVal = document.getElementById('overviewGrossCashVal');
        const creditDebtVal = document.getElementById('overviewCreditDebtVal');
        const netCashVal = document.getElementById('overviewNetCashVal');

        const ytdGrowthBadge = document.getElementById('overviewYtdGrowthBadge');
        const ytdNetGrowth = document.getElementById('overviewYtdNetGrowth');
        const ytdRealizedPnL = document.getElementById('overviewYtdRealizedPnL');
        const ytdWinRate = document.getElementById('overviewYtdWinRate');
        const ytdNetGrowthLabel = document.getElementById('overviewYtdNetGrowthLabel');
        const ytdRealizedLabel = document.getElementById('overviewYtdRealizedLabel');
        const ytdWinRateLabel = document.getElementById('overviewYtdWinRateLabel');

        if (!netCashVal) return;

        // 1. 財務安全防守線計算 (Waterfall 扣抵模型：總流動現金 － 即期信用卡 ＝ 實質淨水位)
        const latestItems = this.getLatestBankAssets().filter(b => {
            const name = b.bankName || '';
            return !(name.includes('股票') || name.includes('ETF'));
        });
        let depositTotal = 0;
        let debtTotal = 0;

        latestItems.forEach(b => {
            const amt = parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0;
            if (amt >= 0) {
                depositTotal += amt;
            } else {
                debtTotal += amt;
            }
        });

        const netCash = depositTotal + debtTotal;
        const absDebt = Math.abs(debtTotal);
        const debtRatio = depositTotal > 0 ? ((absDebt / depositTotal) * 100).toFixed(1) : '0.0';

        if (grossCashVal) grossCashVal.textContent = `$${Math.round(depositTotal).toLocaleString()}`;
        if (creditDebtVal) creditDebtVal.textContent = absDebt > 0 ? `-$${Math.round(absDebt).toLocaleString()}` : '$0';
        if (netCashVal) netCashVal.textContent = `$${Math.round(netCash).toLocaleString()}`;

        if (safetyBadge) {
            const ratioNum = parseFloat(debtRatio);
            if (ratioNum < 15) {
                safetyBadge.className = 'wb-tag success';
                safetyBadge.textContent = '🟢 體質優良';
            } else if (ratioNum < 30) {
                safetyBadge.className = 'wb-tag warning';
                safetyBadge.textContent = '🟡 正常安全';
            } else {
                safetyBadge.className = 'wb-tag danger';
                safetyBadge.textContent = '🔴 負債偏高';
            }
        }

        // 財務安全防守線視覺進度條與提示 (Waterfall 總現金池拆解)
        const cashRatioLabel = document.getElementById('overviewCashRatioLabel');
        const debtRatioLabel = document.getElementById('overviewDebtRatioLabel');
        const cashBar = document.getElementById('overviewCashBar');
        const debtBar = document.getElementById('overviewDebtBar');
        const safetyTip = document.getElementById('overviewSafetyTip');

        let cashShare = 0;
        let debtShare = 0;

        if (absDebt === 0) {
            cashShare = 100;
            debtShare = 0;
            if (cashRatioLabel) cashRatioLabel.innerHTML = `💧 實質淨防守水位 <strong id="overviewCashRatioText">100.0% ($${Math.round(netCash).toLocaleString()})</strong>`;
            if (debtRatioLabel) debtRatioLabel.innerHTML = `💳 負債侵蝕率 <strong id="overviewDebtRatioText">0.0% ($0)</strong>`;
        } else if (netCash > 0 && depositTotal > 0) {
            // 正常流動性充足：以總流動現金為 100% 母體
            debtShare = Math.min(100, (absDebt / depositTotal) * 100);
            cashShare = Math.max(0, 100 - debtShare);
            if (cashRatioLabel) cashRatioLabel.innerHTML = `💧 實質淨防守水位 <strong id="overviewCashRatioText">${cashShare.toFixed(1)}% ($${Math.round(netCash).toLocaleString()})</strong>`;
            if (debtRatioLabel) debtRatioLabel.innerHTML = `💳 負債侵蝕率 <strong id="overviewDebtRatioText">${debtShare.toFixed(1)}% ($${Math.round(absDebt).toLocaleString()})</strong>`;
        } else {
            // 負債超越現金儲備 (赤字)：防守線遭擊穿，水位歸零！
            cashShare = 0;
            debtShare = 100;
            if (cashRatioLabel) cashRatioLabel.innerHTML = `💧 實質淨防守水位 <strong id="overviewCashRatioText">0.0% (防線遭擊穿)</strong>`;
            if (debtRatioLabel) debtRatioLabel.innerHTML = `🚨 負債全面覆蓋 <strong id="overviewDebtRatioText">100.0% (超額負債 -$${Math.abs(Math.round(netCash)).toLocaleString()})</strong>`;
        }

        if (cashBar) cashBar.style.width = `${cashShare.toFixed(1)}%`;
        if (debtBar) debtBar.style.width = `${debtShare.toFixed(1)}%`;

        if (safetyTip) {
            const netCashNum = Math.round(netCash);
            const depositNum = Math.round(depositTotal);
            if (absDebt === 0) {
                safetyTip.textContent = `💡 當前無即期信用卡負債，總流動儲備 $${depositNum.toLocaleString()} 極為充沛無虞。`;
            } else {
                const coverMultiple = (depositTotal / absDebt).toFixed(1);
                const ratioNum = parseFloat(debtRatio);
                if (ratioNum < 15) {
                    safetyTip.textContent = `💡 總現金儲備足以全額清償卡費 ${coverMultiple} 次；全額清償後，仍保有 $${netCashNum.toLocaleString()} 自由防守資金，防守縱深極佳。`;
                } else if (ratioNum < 30) {
                    safetyTip.textContent = `💡 總現金儲備足以全額清償卡費 ${coverMultiple} 次；全額清償後，仍保有 $${netCashNum.toLocaleString()} 自由防守資金，防守體質正常。`;
                } else if (ratioNum < 50) {
                    safetyTip.textContent = `💡 即期負債比率偏高 (${debtRatio}%)，總現金足以清償 ${coverMultiple} 次；繳清後自由資金剩餘 $${netCashNum.toLocaleString()}，建議適度撙節。`;
                } else if (netCashNum >= 0) {
                    safetyTip.textContent = `⚠️ 警戒：即期負債已達 ${debtRatio}%（可清償 ${coverMultiple} 次），繳清後僅存 $${netCashNum.toLocaleString()}，建議優先清理信用卡款。`;
                } else {
                    safetyTip.textContent = `🚨 警戒：即期負債已超出流動儲備（實質赤字 -$${Math.abs(netCashNum).toLocaleString()}，負債比 ${debtRatio}%），防守線遭擊穿，請優先籌措資金償還！`;
                }
            }
        }

        // 2. 今年度 YTD 戰果計算 (智慧動態錨定 ＋ 支援跨年份切換)
        const { ledger } = this.engine.generateMonthlySettlementLedger(
            this.data.bankAssets || [],
            this.data.transactions || [],
            this.data.monthlySnapshots || {},
            this.data.latestPrices || {}
        );

        const availableYears = this.getAvailableOverviewYears(ledger);
        if (!this.selectedOverviewYear || !availableYears.includes(this.selectedOverviewYear)) {
            this.selectedOverviewYear = availableYears[0];
        }
        const activeYear = this.selectedOverviewYear;

        const yearSelect = document.getElementById('overviewYearSelect');
        if (yearSelect) {
            yearSelect.innerHTML = availableYears.map(y => `<option value="${y}" ${y === activeYear ? 'selected' : ''}>${y} 年度</option>`).join('');
        }

        if (ytdNetGrowthLabel) ytdNetGrowthLabel.textContent = `${activeYear} 淨資產增長`;
        if (ytdRealizedLabel) ytdRealizedLabel.textContent = `${activeYear} 已實現獲利`;
        if (ytdWinRateLabel) ytdWinRateLabel.textContent = `${activeYear} 平倉戰績`;

        // 找出該年度的所有結算紀錄
        const yearRecords = ledger.filter(l => (l.month || '').startsWith(activeYear));
        let ytdGrowthAmt = 0;
        let ytdGrowthRate = '0.0';

        if (yearRecords.length > 0) {
            const startRecord = yearRecords[0];
            const latestRecord = yearRecords[yearRecords.length - 1];
            if (yearRecords.length === 1) {
                const prevRecords = ledger.filter(l => l.month < activeYear);
                const prevRecord = prevRecords.length > 0 ? prevRecords[prevRecords.length - 1] : null;
                const baseNetWorth = prevRecord ? prevRecord.totalNetWorth : startRecord.totalNetWorth;
                ytdGrowthAmt = latestRecord.totalNetWorth - baseNetWorth;
                ytdGrowthRate = baseNetWorth > 0 ? ((ytdGrowthAmt / baseNetWorth) * 100).toFixed(1) : '0.0';
            } else {
                const baseNetWorth = startRecord.totalNetWorth;
                ytdGrowthAmt = latestRecord.totalNetWorth - baseNetWorth;
                ytdGrowthRate = baseNetWorth > 0 ? ((ytdGrowthAmt / baseNetWorth) * 100).toFixed(1) : '0.0';
            }
        }

        const isYtdNetProfit = ytdGrowthAmt >= 0;
        const ytdNetColor = isYtdNetProfit ? 'var(--danger)' : 'var(--success)';
        const ytdSign = isYtdNetProfit ? '+' : '';

        if (ytdNetGrowth) {
            ytdNetGrowth.textContent = `${ytdSign}$${Math.round(ytdGrowthAmt).toLocaleString()}`;
            ytdNetGrowth.style.color = ytdNetColor;
        }
        if (ytdGrowthBadge) {
            ytdGrowthBadge.textContent = `${activeYear} ${ytdSign}${ytdGrowthRate}%`;
            ytdGrowthBadge.style.color = ytdNetColor;
        }

        // 該年度已實現平倉獲利與勝率 (嚴格讀取 netProfit 金融指標)
        const pnlList = this.getRealizedPnLList();
        const yearPnLs = pnlList.filter(p => (p.closeDate || p.date || '').startsWith(activeYear));

        let ytdRealizedSum = 0;
        let wins = 0;
        let losses = 0;

        yearPnLs.forEach(p => {
            const amt = parseFloat(p.netProfit) || 0;
            ytdRealizedSum += amt;
            if (amt > 0) wins++;
            else if (amt < 0) losses++;
        });

        const totalTrades = wins + losses;
        const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';

        const isRealizedProfit = ytdRealizedSum >= 0;
        const realizedColor = isRealizedProfit ? 'var(--danger)' : 'var(--success)';
        const realizedSign = isRealizedProfit ? '+' : '';

        if (ytdRealizedPnL) {
            ytdRealizedPnL.textContent = `${realizedSign}$${Math.round(ytdRealizedSum).toLocaleString()}`;
            ytdRealizedPnL.style.color = realizedColor;
        }

        if (ytdWinRate) {
            ytdWinRate.textContent = `${wins}勝 ${losses}負 (${winRate}%)`;
        }

        // 年度平倉戰果視覺進度條與提示
        const winRatioText = document.getElementById('overviewWinRatioText');
        const lossRatioText = document.getElementById('overviewLossRatioText');
        const winBar = document.getElementById('overviewWinBar');
        const lossBar = document.getElementById('overviewLossBar');
        const ytdTip = document.getElementById('overviewYtdTip');

        if (totalTrades > 0) {
            const winPct = ((wins / totalTrades) * 100).toFixed(1);
            const lossPct = ((losses / totalTrades) * 100).toFixed(1);
            if (winRatioText) winRatioText.textContent = `${winPct}% (${wins}筆)`;
            if (lossRatioText) lossRatioText.textContent = `${lossPct}% (${losses}筆)`;
            if (winBar) winBar.style.width = `${winPct}%`;
            if (lossBar) lossBar.style.width = `${lossPct}%`;
        } else {
            if (winRatioText) winRatioText.textContent = '0.0% (0筆)';
            if (lossRatioText) lossRatioText.textContent = '0.0% (0筆)';
            if (winBar) winBar.style.width = '0%';
            if (lossBar) lossBar.style.width = '0%';
        }

        if (ytdTip) {
            if (totalTrades === 0) {
                ytdTip.textContent = `💡 ${activeYear} 年度尚未有平倉出場紀錄，持股目前維持長線現值滾動。`;
            } else {
                ytdTip.textContent = `💡 ${activeYear} 年度已結清 ${totalTrades} 筆交易，累積已實現平倉損益 ${realizedSign}$${Math.round(ytdRealizedSum).toLocaleString()}。`;
            }
        }
    }

    // ==========================================
    // 📑 月度資產結算總表 (Monthly Net Worth Ledger)
    // ==========================================
    renderMonthlyLedger() {
        const tbody = document.getElementById('settlementLedgerBody');
        if (!tbody) return;

        const filteredData = this.getFilteredLedgerData();
        let items = filteredData.ledger.slice();
        // 倒序排列：最新月份置頂，便於日常檢視與微調
        items.reverse();

        const expandBtn = document.getElementById('btnToggleLedgerExpand');
        if (this.trendTimeRange !== 'ALL') {
            if (expandBtn) expandBtn.textContent = `顯示中：${filteredData.summary.rangeLabel} (共 ${items.length} 期)`;
        } else {
            if (!this.isLedgerExpanded && items.length > 3) {
                items = items.slice(0, 3);
            }
            if (expandBtn) {
                expandBtn.textContent = this.isLedgerExpanded ? '收合顯示 (最近 3 個月) ▲' : `展開全部月份 (共 ${filteredData.ledger.length} 期) ▼`;
            }
        }

        if (items.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" style="text-align:center; color:var(--text-muted); padding:2rem;">目前尚無月度資產紀錄</td></tr>';
            return;
        }

        tbody.innerHTML = items.map(item => {
            const isProfit = item.monthlyGrowth > 0;
            const isLoss = item.monthlyGrowth < 0;
            const growthClass = isProfit ? 'color:var(--danger);' : (isLoss ? 'color:var(--success);' : 'color:var(--text-muted);');
            const sign = isProfit ? '+' : '';
            const growthText = (!isNaN(item.monthlyGrowth) && item.monthlyGrowth !== 0)
                ? `${sign}$${Math.round(item.monthlyGrowth).toLocaleString()} (${sign}${item.growthRate}%)`
                : '-';

            let statusBadge = '<span class="wb-tag success">自動結算</span>';
            if (item.isManualOverride) {
                statusBadge = '<span class="wb-tag warning" title="已由使用者手動校準並永久鎖定">🏷️ 手動校正</span>';
            } else if (item.status === 'current') {
                statusBadge = '<span class="wb-tag primary" title="當前最新月份即時動態淨值">⚡ 即時動態</span>';
            }

            const bankDisplay = !isNaN(item.bankTotal) ? Math.round(item.bankTotal).toLocaleString() : '0';
            const stockDisplay = !isNaN(item.stockTotal) ? Math.round(item.stockTotal).toLocaleString() : '0';
            const netWorthDisplay = !isNaN(item.totalNetWorth) ? Math.round(item.totalNetWorth).toLocaleString() : '0';

            return `
                <tr>
                    <td style="font-weight:600;">${item.month}</td>
                    <td style="color:var(--text-muted); font-size:0.85rem;">${item.date}</td>
                    <td class="text-right">$${bankDisplay}</td>
                    <td class="text-right">$${stockDisplay}</td>
                    <td class="text-right" style="font-weight:700; color:var(--primary);">$${netWorthDisplay}</td>
                    <td class="text-right" style="${growthClass}; font-weight:600;">${growthText}</td>
                    <td style="text-align:center;">${statusBadge}</td>
                    <td style="max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-muted); font-size:0.8rem;" title="${item.note || ''}">${item.note || '-'}</td>
                    <td style="text-align:center;">
                        <button class="wb-btn sm" onclick="app.openSettlementEditModal('${item.month}')" style="font-size:0.75rem; padding:0.2rem 0.5rem;">✏️ 編輯</button>
                    </td>
                </tr>
            `;
        }).join('');
    }

    toggleLedgerExpand() {
        this.isLedgerExpanded = !this.isLedgerExpanded;
        this.renderMonthlyLedger();
    }

    openSettlementEditModal(month) {
        const res = this.engine.generateMonthlySettlementLedger(
            this.data.bankAssets || [],
            this.data.transactions || [],
            this.data.monthlySnapshots || {},
            this.data.latestPrices || {}
        );
        const item = res.ledger.find(l => l.month === month);
        if (!item) return;

        document.getElementById('editSettlementMonth').value = item.month;
        document.getElementById('editSettlementDateDisplay').value = `${item.month} (基準日: ${item.date})`;
        document.getElementById('editSettlementBank').value = item.bankTotal;
        document.getElementById('editSettlementStock').value = item.stockTotal;
        document.getElementById('editSettlementNote').value = item.note || '';
        this.updateSettlementTotalPreview();

        const resetBtn = document.getElementById('btnResetSettlement');
        if (resetBtn) {
            resetBtn.style.display = item.isManualOverride ? 'inline-block' : 'none';
        }

        const modal = document.getElementById('modalSettlementEdit');
        if (modal) modal.classList.add('active');
    }

    closeSettlementEditModal() {
        const modal = document.getElementById('modalSettlementEdit');
        if (modal) modal.classList.remove('active');
    }

    updateSettlementTotalPreview() {
        const bank = parseFloat(document.getElementById('editSettlementBank').value) || 0;
        const stock = parseFloat(document.getElementById('editSettlementStock').value) || 0;
        const total = Math.round(bank + stock);
        const display = document.getElementById('editSettlementTotalDisplay');
        if (display) {
            display.textContent = `$${total.toLocaleString()}`;
        }
    }

    async saveSettlementEdit() {
        const month = document.getElementById('editSettlementMonth').value;
        const bank = parseFloat(document.getElementById('editSettlementBank').value);
        const stock = parseFloat(document.getElementById('editSettlementStock').value);
        const note = (document.getElementById('editSettlementNote').value || '').trim();

        if (isNaN(bank) || isNaN(stock)) {
            this.showToast('請輸入有效的存款與股票金額', 'error');
            return;
        }

        this.data.monthlySnapshots = this.data.monthlySnapshots || {};
        const total = Math.round(bank + stock);
        this.data.monthlySnapshots[month] = {
            ...(this.data.monthlySnapshots[month] || {}),
            month: month,
            bankTotal: Math.round(bank),
            stockTotal: Math.round(stock),
            totalNetWorth: total,
            isManualOverride: true,
            note: note,
            updatedAt: new Date().toISOString()
        };

        await this.saveData();

        // 同步寫入後端 server assets_data.json
        try {
            const baseUrl = this.getApiBaseUrl();
            await fetch(`${baseUrl}/api/save-snapshots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshots: { [month]: this.data.monthlySnapshots[month] } })
            });
        } catch (e) {
            console.warn('同步後端 save-snapshots 失敗 (已在本地保存):', e);
        }

        this.closeSettlementEditModal();
        this.renderMonthlyLedger();
        this.renderCharts();
        this.renderMetrics();
        this.showToast(`🎉 成功儲存 ${month} 月度資產手動校正數據！`, 'success');
    }

    async resetSettlementEdit() {
        const month = document.getElementById('editSettlementMonth').value;
        if (!month) return;

        if (this.data.monthlySnapshots && this.data.monthlySnapshots[month]) {
            delete this.data.monthlySnapshots[month].isManualOverride;
            delete this.data.monthlySnapshots[month].note;
        }

        await this.saveData();

        try {
            const baseUrl = this.getApiBaseUrl();
            await fetch(`${baseUrl}/api/save-snapshots`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ snapshots: this.data.monthlySnapshots })
            });
        } catch (e) {}

        this.closeSettlementEditModal();
        this.renderMonthlyLedger();
        this.renderCharts();
        this.renderMetrics();
        this.showToast(`↩️ 已還原 ${month} 為系統自動計算！`, 'info');
    }
}

if (typeof window !== "undefined") {
    window.OverviewView = OverviewView;
}
