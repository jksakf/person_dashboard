/**
 * 個人資產一體化工作台 - 交易紀錄視圖模組 (HistoryView: 交易歷史流水、金流摩擦成本看板、穿透跳轉)
 * 編碼：UTF-8 with BOM
 */

class HistoryView {
    constructor(app) {
        this.app = app;
    }

    // ==========================================
    // View 4: 交易紀錄全表渲染
    // ==========================================
    onHistorySearch(query) {
        this.historySearch = query;
        this.renderHistoryTable();
    }

    changeHistorySort(val) {
        if (!val) return;
        const lastUnderscore = val.lastIndexOf('_');
        if (lastUnderscore === -1) return;
        const key = val.substring(0, lastUnderscore);
        const order = val.substring(lastUnderscore + 1);
        this.setHistorySort(key, order);
    }

    setHistorySort(key, order = null) {
        if (order) {
            this.historySortKey = key;
            this.historySortOrder = order;
        } else {
            if (this.historySortKey === key) {
                this.historySortOrder = this.historySortOrder === 'desc' ? 'asc' : 'desc';
            } else {
                this.historySortKey = key;
                this.historySortOrder = 'desc';
            }
        }

        const select = document.getElementById('historySortSelect');
        if (select) {
            select.value = `${this.historySortKey}_${this.historySortOrder}`;
        }
        this.renderHistoryTable();
    }

    setHistoryActionFilter(action) {
        this.historyFilterAction = action;
        const group = document.getElementById('historyActionPillGroup');
        if (group) {
            group.querySelectorAll('.wb-pill-btn').forEach(btn => {
                if (btn.getAttribute('data-action') === action) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }
        this.renderHistoryTable();
    }

    onHistoryMarketFilterChange(val) {
        this.historyMarketFilter = val || 'ALL';
        this.renderHistoryTable();
    }

    isMarketMatch(t, market) {
        if (!market || market === 'ALL') return true;
        const sym = String(t.symbol || '').trim();
        const cur = String(t.currency || 'TWD').toUpperCase();
        const name = String(t.name || '');
        const isEtf = sym.startsWith('00') || name.toUpperCase().includes('ETF') || name.includes('高息') || name.includes('50') || name.includes('正2');

        if (market === 'ETF') {
            return isEtf;
        }
        if (market === 'HK') {
            return cur === 'HKD' || sym.length === 5;
        }
        if (market === 'US') {
            return cur === 'USD';
        }
        if (market === 'TW') {
            return cur === 'TWD' && !isEtf;
        }
        return true;
    }

    jumpToPnL(symbol) {
        this.switchView('pnl');
        this.pnlSearch = symbol;
        const pnlInput = document.getElementById('pnlSearchInput');
        if (pnlInput) pnlInput.value = symbol;
        this.renderPnLTable();
        this.showToast(`已定位 ${symbol} 平倉損益紀錄`, 'info');
    }

    jumpToHoldings(symbol) {
        this.switchView('stock');
        this.showToast(`已切換至股票庫存總表`, 'info');
    }

    filterHistoryByStock(symbol) {
        this.historySearch = symbol;
        const searchInput = document.getElementById('historySearchInput');
        if (searchInput) searchInput.value = symbol;
        this.switchView('history');
        this.showToast(`已篩選標的交易紀錄: ${symbol}`, 'info');
    }

    renderHistoryTable() {
        const tbody = document.getElementById('historyTableBody');
        const countBadge = document.getElementById('historyCountBadge');
        if (!tbody) return;

        let txs = [...(this.data.transactions || [])];

        // 搜尋過濾
        if (this.historySearch) {
            const q = this.historySearch.toLowerCase();
            txs = txs.filter(t => `${t.symbol || ''} ${t.name || ''} ${t.note || ''} ${t.date || ''}`.toLowerCase().includes(q));
        }

        // 買賣類別過濾 (買入 / 賣出)
        if (this.historyFilterAction && this.historyFilterAction !== 'ALL') {
            txs = txs.filter(t => t.action === this.historyFilterAction);
        }

        // 市場過濾 (TW / HK / US / ETF)
        if (this.historyMarketFilter && this.historyMarketFilter !== 'ALL') {
            txs = txs.filter(t => this.isMarketMatch(t, this.historyMarketFilter));
        }

        // 計算當前篩選集合的摩擦成本與統計指標
        let buyTotal = 0, buyCount = 0;
        let sellTotal = 0, sellCount = 0;
        let totalFee = 0, totalTax = 0;

        txs.forEach(t => {
            const rate = parseFloat(t.exchangeRate) || 1;
            const feeTwd = Math.round((parseFloat(t.fee) || 0) * rate);
            const taxTwd = Math.round((parseFloat(t.tax) || 0) * rate);
            totalFee += feeTwd;
            totalTax += taxTwd;
            const netTwd = Math.round(parseFloat(t.netAmountTwd) || parseFloat(t.totalAmount) || 0);

            if (t.action === '買入') {
                buyTotal += netTwd;
                buyCount++;
            } else if (t.action === '賣出') {
                sellTotal += netTwd;
                sellCount++;
            }
        });

        const totalFriction = totalFee + totalTax;
        const tradeVolume = buyTotal + sellTotal;
        const frictionRate = tradeVolume > 0 ? ((totalFriction / tradeVolume) * 100).toFixed(2) : '0.00';

        // 更新頂部摩擦成本看板
        const elBuyTotal = document.getElementById('histKpiBuyTotal');
        const elBuyCount = document.getElementById('histKpiBuyCount');
        const elSellTotal = document.getElementById('histKpiSellTotal');
        const elSellCount = document.getElementById('histKpiSellCount');
        const elFeeTotal = document.getElementById('histKpiFeeTotal');
        const elTaxTotal = document.getElementById('histKpiTaxTotal');
        const elFrictionTotal = document.getElementById('histKpiFrictionTotal');
        const elFrictionRate = document.getElementById('histKpiFrictionRate');

        if (elBuyTotal) elBuyTotal.textContent = `$${buyTotal.toLocaleString()}`;
        if (elBuyCount) elBuyCount.textContent = `${buyCount} 筆買入交易`;
        if (elSellTotal) elSellTotal.textContent = `$${sellTotal.toLocaleString()}`;
        if (elSellCount) elSellCount.textContent = `${sellCount} 筆賣出交易`;
        if (elFeeTotal) elFeeTotal.textContent = `$${totalFee.toLocaleString()}`;
        if (elTaxTotal) elTaxTotal.textContent = `$${totalTax.toLocaleString()}`;
        if (elFrictionTotal) elFrictionTotal.textContent = `$${totalFriction.toLocaleString()}`;
        if (elFrictionRate) elFrictionRate.textContent = `手續費+證交稅 佔交易額 ${frictionRate}%`;

        // 依日期或金額進行排序 (預設由新到舊降冪 ▼，同日依建立時間倒序)
        const sortKey = this.historySortKey || 'date';
        const sortOrder = this.historySortOrder || 'desc';

        txs.sort((a, b) => {
            if (sortKey === 'date') {
                const dateA = (a.date || '').replace(/[\/\-]/g, '');
                const dateB = (b.date || '').replace(/[\/\-]/g, '');
                if (dateA !== dateB) {
                    return sortOrder === 'desc' ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
                }
                // 同日 Tie-breaker: 依 id 倒序排列
                const idA = String(a.id || '');
                const idB = String(b.id || '');
                return sortOrder === 'desc' ? idB.localeCompare(idA) : idA.localeCompare(idB);
            } else if (sortKey === 'amount') {
                const amtA = parseFloat(a.netAmountTwd) || parseFloat(a.totalAmount) || 0;
                const amtB = parseFloat(b.netAmountTwd) || parseFloat(b.totalAmount) || 0;
                return sortOrder === 'desc' ? (amtB - amtA) : (amtA - amtB);
            }
            return 0;
        });

        // 即時更新表頭排序指示箭頭
        const iconHistDate = document.getElementById('sortIconHistDate');
        const iconHistAmount = document.getElementById('sortIconHistAmount');
        const arrow = sortOrder === 'desc' ? '▼' : '▲';
        if (iconHistDate) iconHistDate.textContent = sortKey === 'date' ? arrow : '';
        if (iconHistAmount) iconHistAmount.textContent = sortKey === 'amount' ? arrow : '';

        if (countBadge) {
            countBadge.textContent = `顯示 ${txs.length} / 共 ${this.data.transactions.length} 筆`;
        }

        if (txs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="12" style="text-align:center; padding:2rem; color:var(--text-muted);">查無符合條件的交易紀錄</td></tr>`;
            return;
        }

        // 獲取目前有效庫存標的列表 (供買入時判斷是否顯示「庫存」按鈕)
        const { holdings } = this.engine.computeFifoHoldings(this.data.transactions || []);
        const activeHoldingSymbols = new Set(holdings.map(h => h.symbol));

        let html = '';
        txs.forEach(t => {
            const isBuy = t.action === '買入';
            const actionTag = isBuy ? 'buy' : 'sell';
            const netTwd = parseFloat(t.netAmountTwd) || parseFloat(t.totalAmount) || 0;

            let extraBtn = '';
            if (!isBuy) {
                extraBtn = `<button class="wb-btn sm" onclick="event.stopPropagation(); app.jumpToPnL('${t.symbol}')" title="跳轉查看 ${t.symbol} 已實現平倉損益">🔍 查平倉</button>`;
            } else if (activeHoldingSymbols.has(t.symbol)) {
                extraBtn = `<button class="wb-btn sm" onclick="event.stopPropagation(); app.jumpToHoldings('${t.symbol}')" title="跳轉查看 ${t.symbol} 持倉狀態">📦 庫存</button>`;
            }

            html += `
            <tr class="wb-inventory-row" onclick="app.openTxDrawerForEdit('${t.id}')">
                <td class="mono">${t.date || ''}</td>
                <td><span class="wb-tag ${actionTag}">${t.action}</span></td>
                <td><strong class="mono" style="color:var(--primary);">${t.symbol}</strong></td>
                <td>${t.name || ''}</td>
                <td class="text-right mono">$${parseFloat(t.price || 0).toLocaleString()}</td>
                <td class="text-right mono">${parseInt(t.shares || 0).toLocaleString()} 股</td>
                <td class="text-right mono">$${parseFloat(t.fee || 0).toLocaleString()}</td>
                <td class="text-right mono">$${parseFloat(t.tax || 0).toLocaleString()}</td>
                <td class="text-right mono">${parseFloat(t.totalAmount || 0).toLocaleString()} ${t.currency || 'TWD'}</td>
                <td class="text-right mono" style="font-weight:700;">$${Math.round(netTwd).toLocaleString()}</td>
                <td style="color:var(--text-muted); font-size:0.82rem;">${t.note || ''}</td>
                <td style="text-align:center; white-space:nowrap;">
                    <div style="display:inline-flex; align-items:center; justify-content:flex-end; gap:0.35rem; width:180px;">
                        ${extraBtn}
                        <button class="wb-btn sm" onclick="event.stopPropagation(); app.openTxDrawerForEdit('${t.id}')">✏️ 編輯</button>
                        <button class="wb-btn sm danger" onclick="event.stopPropagation(); app.deleteTransaction('${t.id}')">🗑️</button>
                    </div>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }

}

if (typeof window !== "undefined") {
    window.HistoryView = HistoryView;
}
