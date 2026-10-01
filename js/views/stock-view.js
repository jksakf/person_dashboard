/**
 * 個人資產一體化工作台 - 股票庫存視圖模組 (StockView: 股票庫存大表、持股權重甜甜圈圖、多維度排序、即時現價更新)
 * 編碼：UTF-8 with BOM
 */

class StockView {
    constructor(app) {
        this.app = app;
    }

    // ==========================================
    // View 3: 股票庫存全表渲染 (獨立雙直欄設計)
    // ==========================================
    renderHoldingsTable() {
        const tbody = document.getElementById('holdingsTableBody');
        const summaryStats = document.getElementById('stockSummaryStats');
        if (!tbody) return;

        const { holdings, fifoQueues } = this.engine.computeFifoHoldings(this.data.transactions || [], this.data.latestPrices || {});

        // 依使用者所選欄位與方向排序 (預設市值降冪，支援未實現損益、投入總成本等由大到小排序)
        const sortKey = this.stockSortKey || 'marketValue';
        const sortOrder = this.stockSortOrder || 'desc';

        const sortedHoldings = [...holdings].sort((a, b) => {
            let valA = a[sortKey];
            let valB = b[sortKey];
            if (valA == null) valA = 0;
            if (valB == null) valB = 0;
            return sortOrder === 'desc' ? (valB - valA) : (valA - valB);
        });

        // 即時更新表頭排序指示箭頭
        const iconShares = document.getElementById('sortIconShares');
        const iconTotalCost = document.getElementById('sortIconTotalCost');
        const iconMarketValue = document.getElementById('sortIconMarketValue');
        const iconUnrealizedPnL = document.getElementById('sortIconUnrealizedPnL');
        const arrow = sortOrder === 'desc' ? '▼' : '▲';
        if (iconShares) iconShares.textContent = sortKey === 'shares' ? arrow : '';
        if (iconTotalCost) iconTotalCost.textContent = sortKey === 'totalCost' ? arrow : '';
        if (iconMarketValue) iconMarketValue.textContent = sortKey === 'marketValue' ? arrow : '';
        if (iconUnrealizedPnL) iconUnrealizedPnL.textContent = sortKey === 'unrealizedPnL' ? arrow : '';

        const totalMarketVal = sortedHoldings.reduce((sum, h) => sum + h.marketValue, 0);
        const totalCost = sortedHoldings.reduce((sum, h) => sum + h.totalCost, 0);
        const totalPnL = totalMarketVal - totalCost;
        const totalRate = totalCost > 0 ? ((totalPnL / totalCost) * 100).toFixed(2) : 0;
        const pnlSign = totalPnL >= 0 ? '+' : '';
        const pnlColor = totalPnL >= 0 ? 'var(--danger)' : 'var(--success)'; // 台灣紅賺綠賠

        // 更新頂部 3 大股票核心 KPI 看板
        const elStockMarketVal = document.getElementById('stockKpiMarketValue');
        const elStockTotalCost = document.getElementById('stockKpiTotalCost');
        const elStockUnrealizedPnL = document.getElementById('stockKpiUnrealizedPnL');
        const elStockUnrealizedRate = document.getElementById('stockKpiUnrealizedRate');

        if (elStockMarketVal) elStockMarketVal.textContent = `$${Math.round(totalMarketVal).toLocaleString()}`;
        if (elStockTotalCost) elStockTotalCost.textContent = `$${Math.round(totalCost).toLocaleString()}`;
        if (elStockUnrealizedPnL) {
            elStockUnrealizedPnL.textContent = `${pnlSign}$${Math.round(totalPnL).toLocaleString()}`;
            elStockUnrealizedPnL.style.color = pnlColor;
        }
        if (elStockUnrealizedRate) {
            elStockUnrealizedRate.textContent = `總報酬率 ${pnlSign}${totalRate}%`;
            elStockUnrealizedRate.style.color = pnlColor;
        }

        if (summaryStats) {
            summaryStats.textContent = `持倉 ${sortedHoldings.length} 檔 ｜ 總市值 $${Math.round(totalMarketVal).toLocaleString()} ｜ 未實現: ${pnlSign}$${Math.round(totalPnL).toLocaleString()} (${pnlSign}${totalRate}%)`;
        }

        // 渲染股票庫存頂部：持股權重佔比圖與核心標的排行
        this.renderStockWeightChart(sortedHoldings, totalMarketVal);

        if (sortedHoldings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">目前無任何股票持倉庫存</td></tr>`;
            return;
        }

        let html = '';
        sortedHoldings.forEach(h => {
            const isExpanded = this.expandedHoldings.has(h.symbol);
            const isProfit = h.unrealizedPnL >= 0;
            const profitSign = isProfit ? '+' : '';
            const profitColor = isProfit ? 'var(--danger)' : 'var(--success)';
            const lots = fifoQueues[h.symbol] || [];
            const displayPrice = (h.currentPrice || h.lastPrice || 0);

            html += `
            <tr class="wb-inventory-row ${isExpanded ? 'expanded' : ''}" onclick="app.toggleHoldingExpand('${h.symbol}')">
                <td>
                    <span class="wb-expand-icon">${isExpanded ? '▼' : '▶'}</span>
                    <strong class="mono" style="color:var(--primary); font-size:1rem;">${h.symbol}</strong>
                </td>
                <td><strong>${h.name}</strong></td>
                <td class="text-right mono" style="font-weight:700;">${h.shares.toLocaleString()} 股</td>
                <td class="text-right mono">$${h.avgCost.toLocaleString()}</td>
                <td class="text-right mono" style="font-weight:700; color:var(--primary);">$${displayPrice.toLocaleString()}</td>
                <td class="text-right mono" style="font-weight:700;">$${Math.round(h.totalCost).toLocaleString()}</td>
                <td class="text-right mono" style="font-weight:700;">$${Math.round(h.marketValue).toLocaleString()}</td>
                <td class="text-right mono" style="font-weight:700; color:${profitColor};">
                    ${profitSign}$${h.unrealizedPnL.toLocaleString()} (${profitSign}${h.unrealizedRate}%)
                </td>
                <td style="text-align:center;">
                    <button class="wb-btn sm" onclick="event.stopPropagation(); app.filterHistoryByStock('${h.symbol}')" title="查看此股票所有交易明細">
                        🔍 查交易
                    </button>
                </td>
            </tr>`;

            if (isExpanded) {
                html += `
                <tr class="wb-batch-subrow">
                    <td colspan="9">
                        <div class="wb-batch-subcontainer">
                            <div class="wb-batch-title">📦 FIFO 先進先出買進批次明細 (共 ${lots.length} 批)：</div>
                            <table class="wb-table" style="font-size:0.82rem; background:transparent;">
                                <thead>
                                    <tr style="border-bottom:1px solid var(--card-border);">
                                        <th>買入日期</th>
                                        <th class="text-right">剩餘股數</th>
                                        <th class="text-right">買入單價</th>
                                        <th class="text-right">分攤每股成本</th>
                                        <th class="text-right">批次剩餘成本</th>
                                        <th class="text-right">批次現值</th>
                                        <th class="text-right">未實現損益</th>
                                    </tr>
                                </thead>
                                <tbody>`;

                lots.forEach(lot => {
                    const lotCost = Math.round(lot.shares * lot.costPerShare);
                    const lotMarket = Math.round(lot.shares * (h.currentPrice || h.lastPrice || 0));
                    const lotPnL = lotMarket - lotCost;
                    const lotPnLSign = lotPnL >= 0 ? '+' : '';
                    const lotColor = lotPnL >= 0 ? 'var(--danger)' : 'var(--success)';

                    html += `
                    <tr>
                        <td class="mono">${lot.date || '-'}</td>
                        <td class="text-right mono" style="font-weight:600;">${lot.shares.toLocaleString()} 股</td>
                        <td class="text-right mono">$${lot.price.toLocaleString()}</td>
                        <td class="text-right mono">$${Math.round(lot.costPerShare).toLocaleString()}</td>
                        <td class="text-right mono">$${lotCost.toLocaleString()}</td>
                        <td class="text-right mono">$${lotMarket.toLocaleString()}</td>
                        <td class="text-right mono" style="font-weight:700; color:${lotColor};">
                            ${lotPnLSign}$${lotPnL.toLocaleString()}
                        </td>
                    </tr>`;
                });

                html += `
                                </tbody>
                            </table>
                        </div>
                    </td>
                </tr>`;
            }
        });

        tbody.innerHTML = html;
    }

    renderStockWeightChart(holdings, totalMarketVal) {
        const canvas = document.getElementById('stockWeightChart');
        const rankList = document.getElementById('stockRankList');
        const badgeTotal = document.getElementById('stockTotalMarketValBadge');
        const badgeCount = document.getElementById('stockHoldingsCountBadge');

        if (badgeTotal) {
            badgeTotal.textContent = `總市值: $${Math.round(totalMarketVal || 0).toLocaleString()}`;
        }
        if (badgeCount) {
            badgeCount.textContent = `共 ${holdings.length} 檔標的`;
        }

        if (!canvas || typeof Chart === 'undefined') return;

        if (this.charts.stockWeight) {
            this.charts.stockWeight.destroy();
            this.charts.stockWeight = null;
        }

        if (!holdings || holdings.length === 0) {
            if (rankList) {
                rankList.innerHTML = `<div style="text-align:center; padding:1.5rem; color:var(--text-muted);">目前無持股標的</div>`;
            }
            return;
        }

        // 圓餅圖固定依持股市值高低排序，呈現最清晰的權重分佈
        const sortedByMarket = [...holdings].sort((a, b) => b.marketValue - a.marketValue);

        // 高辨識度美觀金融調色盤
        const palette = [
            '#38bdf8', '#818cf8', '#34d399', '#fbbf24', '#f472b6',
            '#a78bfa', '#2dd4bf', '#fb923c', '#60a5fa', '#4ade80'
        ];

        // 建立各股票專屬調色盤對照，確保清單與圓餅圖色彩 100% 一致
        const colorMap = {};
        sortedByMarket.forEach((h, idx) => {
            colorMap[h.symbol] = palette[idx % palette.length];
        });

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#f8fafc' : '#0f172a';
        const doughnutPlugins = typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [];

        const labels = sortedByMarket.map(h => {
            const pct = totalMarketVal > 0 ? ((h.marketValue / totalMarketVal) * 100).toFixed(1) : '0.0';
            return `${h.symbol} ${h.name} (${pct}%)`;
        });

        const dataVals = sortedByMarket.map(h => h.marketValue);
        const bgColors = sortedByMarket.map(h => colorMap[h.symbol]);

        this.charts.stockWeight = new Chart(canvas, {
            type: 'doughnut',
            plugins: doughnutPlugins,
            data: {
                labels: labels,
                datasets: [{
                    data: dataVals,
                    backgroundColor: bgColors,
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
                                const pct = totalMarketVal > 0 ? ((val / totalMarketVal) * 100).toFixed(1) : '0.0';
                                const h = sortedByMarket[context.dataIndex];
                                return ` ${h.symbol} ${h.name}: $${Math.round(val).toLocaleString()} (${pct}%) ｜ ${h.shares.toLocaleString()} 股`;
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
                            if (!totalMarketVal || totalMarketVal === 0) return '';
                            const pct = ((value / totalMarketVal) * 100).toFixed(1);
                            if (parseFloat(pct) < 3) return ''; // 佔比小於 3% 不在切片繪製避免擠壓
                            return `${pct}%`;
                        },
                        textShadowBlur: 4,
                        textShadowColor: 'rgba(0,0,0,0.7)'
                    }
                }
            }
        });

        // 動態更新右側排行標題
        const rankTitle = document.getElementById('stockRankTitle');
        if (rankTitle) {
            if (this.stockSortKey === 'unrealizedPnL') {
                rankTitle.textContent = `🏆 各標的未實現損益排行 (${this.stockSortOrder === 'desc' ? '獲利高→低' : '虧損高→低'})`;
            } else if (this.stockSortKey === 'unrealizedRate') {
                rankTitle.textContent = `🏆 各標的報酬率排行 (${this.stockSortOrder === 'desc' ? '高→低' : '低→高'})`;
            } else if (this.stockSortKey === 'shares') {
                rankTitle.textContent = `🏆 各標的持有股數排行 (${this.stockSortOrder === 'desc' ? '多→少' : '少→多'})`;
            } else {
                rankTitle.textContent = `🏆 各標的市值佔比與排行 (${this.stockSortOrder === 'desc' ? '高→低' : '低→高'})`;
            }
        }

        // 渲染右側排行榜清單 (順序與傳入之 sortedHoldings 100% 同步)
        if (rankList) {
            let rankHtml = '';
            holdings.forEach(h => {
                const pct = totalMarketVal > 0 ? ((h.marketValue / totalMarketVal) * 100).toFixed(1) : '0.0';
                const color = colorMap[h.symbol] || '#38bdf8';
                const isProfit = h.unrealizedPnL >= 0;
                const profitSign = isProfit ? '+' : '';
                const profitColor = isProfit ? 'var(--danger)' : 'var(--success)';

                rankHtml += `
                <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:6px; padding:0.5rem 0.75rem; cursor:pointer;" onclick="app.toggleHoldingExpand('${h.symbol}')" title="點擊展開/收合此股票明細">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <div style="display:flex; align-items:center; gap:0.4rem;">
                            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${color};"></span>
                            <strong class="mono" style="color:var(--primary); font-size:0.9rem;">${h.symbol}</strong>
                            <span style="font-weight:600; font-size:0.85rem;">${h.name}</span>
                        </div>
                        <div style="text-align:right;">
                            <span class="mono" style="font-weight:700; font-size:0.9rem;">$${Math.round(h.marketValue).toLocaleString()}</span>
                            <span class="mono" style="font-weight:700; color:${color}; font-size:0.85rem; margin-left:0.3rem;">(${pct}%)</span>
                        </div>
                    </div>
                    <div style="height:5px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden; margin-bottom:0.3rem;">
                        <div style="width:${pct}%; height:100%; background:${color}; border-radius:3px;"></div>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size:0.75rem; color:var(--text-muted);">
                        <span>${h.shares.toLocaleString()} 股 ｜ 均價 $${h.avgCost.toLocaleString()}</span>
                        <span style="color:${profitColor}; font-weight:600;">未實現: ${profitSign}$${h.unrealizedPnL.toLocaleString()} (${profitSign}${h.unrealizedRate}%)</span>
                    </div>
                </div>`;
            });
            rankList.innerHTML = rankHtml;
        }
    }

    toggleHoldingExpand(symbol) {
        if (this.expandedHoldings.has(symbol)) {
            this.expandedHoldings.delete(symbol);
        } else {
            this.expandedHoldings.add(symbol);
        }
        this.renderHoldingsTable();
    }

    toggleAllHoldingsExpand(expandAll) {
        const { holdings } = this.engine.computeFifoHoldings(this.data.transactions || []);
        if (expandAll) {
            holdings.forEach(h => this.expandedHoldings.add(h.symbol));
        } else {
            this.expandedHoldings.clear();
        }
        this.renderHoldingsTable();
    }

    changeStockSort(val) {
        if (!val) return;
        const lastUnderscore = val.lastIndexOf('_');
        if (lastUnderscore === -1) return;
        const key = val.substring(0, lastUnderscore);
        const order = val.substring(lastUnderscore + 1);
        this.setStockSort(key, order);
    }

    setStockSort(key, order = null) {
        if (order) {
            this.stockSortKey = key;
            this.stockSortOrder = order;
        } else {
            if (this.stockSortKey === key) {
                this.stockSortOrder = this.stockSortOrder === 'desc' ? 'asc' : 'desc';
            } else {
                this.stockSortKey = key;
                this.stockSortOrder = 'desc';
            }
        }

        const select = document.getElementById('stockSortSelect');
        if (select) {
            select.value = `${this.stockSortKey}_${this.stockSortOrder}`;
        }
        this.renderHoldingsTable();
    }

    async refreshLiveStockPrices() {
        const btn = document.getElementById('btnRefreshLivePrices');
        const badge = document.getElementById('livePriceUpdateBadge');

        const { holdings } = this.engine.computeFifoHoldings(this.data.transactions || []);
        if (!holdings || holdings.length === 0) {
            this.showToast('目前庫存無任何持股標的', 'warning');
            return;
        }

        const symbols = Array.from(new Set(holdings.map(h => h.symbol.trim()))).filter(Boolean);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ 抓取中...';
        }
        if (badge) {
            badge.textContent = '連線證交所中...';
            badge.style.color = 'var(--text-muted)';
        }

        const baseUrl = this.getApiBaseUrl();

        try {
            const res = await fetch(`${baseUrl}/api/stock-price/realtime?symbols=${encodeURIComponent(symbols.join(','))}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            if (json.success && json.data) {
                this.data.latestPrices = this.data.latestPrices || {};
                let updatedCount = 0;

                symbols.forEach(sym => {
                    const quote = json.data[sym];
                    if (quote && quote.price != null && !isNaN(quote.price)) {
                        this.data.latestPrices[sym] = quote.price;
                        updatedCount++;
                    }
                });

                const nowStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
                if (badge) {
                    badge.textContent = `已更新現價 (${nowStr})`;
                    badge.style.color = 'var(--primary)';
                }

                await this.saveData();
                this.renderMetrics();
                this.renderHoldingsTable();
                this.renderCharts();

                this.showToast(`⚡ 成功更新 ${updatedCount} 檔股票最新現價！`, 'success');
            } else {
                throw new Error(json.error || '未取得行情資料');
            }
        } catch (err) {
            console.error('抓取即時股價失敗:', err);
            const isFile = window.location.protocol === 'file:';
            if (badge) {
                badge.textContent = isFile ? '請啟動 Start-Workbench.bat' : 'API 連線異常 (使用既有價格)';
                badge.style.color = isFile ? 'var(--danger)' : 'var(--text-muted)';
            }
            if (isFile) {
                this.showToast('⚠️ 目前為直接開啟檔案模式 (file:///)，請執行 Start-Workbench.bat 啟動服務，或直接前往 http://127.0.0.1:8080/workbench.html', 'warning', 7000);
            } else {
                this.showToast(`行情 API 抓取失敗: ${err.message}`, 'error');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '⚡ 更新現價';
            }
        }
    }

}

if (typeof window !== "undefined") {
    window.StockView = StockView;
}
