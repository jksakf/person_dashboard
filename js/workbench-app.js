/**
 * 個人資產一體化工作台 - 主應用控制器 (WorkbenchApp v1.3.0)
 * 職責：5 大獨立全寬度視圖切換、Datalist 智慧連動、FIFO 金融計算、滑出抽屜與傳統儀表板同步
 * 編碼：UTF-8 with BOM
 */

class WorkbenchApp {
    constructor() {
        this.engine = new WorkbenchEngine();
        this.storage = (typeof window !== 'undefined' && window.appStorage) ? window.appStorage : new StorageService();
        this.data = {
            meta: {
                version: "1.3.0",
                lastUpdated: new Date().toISOString(),
                feeRates: { stockFeeRate: 0.001425, stockTaxRate: 0.003, minFee: 20 },
                stockDict: [],
                accountList: []
            },
            bankAssets: [],
            transactions: [],
            realizedPnL: [],
            latestPrices: {},
            monthlySnapshots: {}
        };

        this.currentView = 'overview'; // 'overview' | 'bank' | 'stock' | 'history' | 'pnl'
        this.historySearch = '';
        this.historyFilterAction = 'ALL';
        this.pnlSearch = '';
        this.selectedBankMonth = '';
        this.expandedHoldings = new Set();
        this.stockSortKey = 'marketValue'; // 'marketValue' | 'unrealizedPnL' | 'unrealizedRate' | 'shares'
        this.stockSortOrder = 'desc';      // 'desc' | 'asc'
        this.historySortKey = 'date';      // 'date' | 'amount'
        this.historySortOrder = 'desc';    // 'desc' | 'asc'
        this.pnlDateRangeType = 'ALL';     // 'ALL' | 'YTD' | '1Y' | '3M' | '1M' | 'CUSTOM'
        this.pnlStartDate = '';
        this.pnlEndDate = '';

        // 月度結算總表展開狀態
        this.isLedgerExpanded = false;
        this.trendTimeRange = 'ALL'; // '6M' | '1Y' | '3Y' | 'ALL'

        // 抽屜編輯狀態
        this.isDrawerOpen = false;
        this.editingType = null; // 'transaction' | 'bankAsset'
        this.editingItem = null;

        // 常用清單管理狀態
        this.isListModalOpen = false;
        this.currentDictTab = 'stock'; // 'stock' | 'account'
        this.stockDictFilter = '';
        this.accountDictFilter = '';

        this.saveTimeout = null;
        this.charts = {
            trend: null,
            doughnut: null,
            bar: null,
            stockWeight: null,
            realizedWeight: null
        };
    }

    async init() {
        this.initTheme();
        await this.loadData();
        this.initDatalists();
        this.bindEvents();
        this.switchView('overview');
        this.showToast('資產工作台 v1.3 就緒 (獨立全寬度視圖模式)', 'success');
    }

    initTheme() {
        const savedTheme = localStorage.getItem('wb_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', savedTheme);
        this.updateThemeButton(savedTheme);
    }

    toggleTheme() {
        const current = document.documentElement.getAttribute('data-theme') || 'dark';
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('wb_theme', next);
        this.updateThemeButton(next);
        if (this.currentView === 'overview') {
            this.renderCharts();
        } else if (this.currentView === 'stock') {
            this.renderHoldingsTable();
        } else if (this.currentView === 'pnl') {
            this.renderPnLTable();
        }
    }

    updateThemeButton(theme) {
        const btn = document.getElementById('themeToggleBtn');
        if (btn) {
            btn.innerHTML = theme === 'dark' ? '☀️ 淺色' : '🌙 深色';
        }
    }

    async loadData() {
        try {
            await this.storage.migrateFromLocalStorage('assets_data');
            const cached = await this.storage.get('assets_data');

            // 優先獲取伺服器端 assets_data.json 最新狀態 (加入防快取參數)
            let serverData = null;
            try {
                const res = await fetch('assets_data.json?_t=' + Date.now());
                if (res.ok) {
                    serverData = await res.json();
                }
            } catch (err) { }

            if (serverData) {
                if (cached && (cached.transactions || cached.bankAssets)) {
                    this.data = cached;
                    // 自動同步伺服器端已校準完成之最新 monthlySnapshots 快照
                    if (serverData.monthlySnapshots) {
                        this.data.monthlySnapshots = serverData.monthlySnapshots;
                    }
                    if (serverData.meta) {
                        this.data.meta = { ...(this.data.meta || {}), ...serverData.meta };
                    }
                    await this.saveData();
                } else {
                    this.data = serverData;
                    await this.saveData();
                }
            } else if (cached && (cached.transactions || cached.bankAssets)) {
                this.data = cached;
            }
        } catch (e) {
            console.warn('載入 assets_data 失敗，改用預設結構:', e);
        }

        this.data.latestPrices = this.data.latestPrices || {};
        this.data.monthlySnapshots = this.data.monthlySnapshots || {};

        // 清洗 meta.accountList 雜質防呆 (避免舊快取殘留 [object Object])
        if (this.data.meta && Array.isArray(this.data.meta.accountList)) {
            this.data.meta.accountList = this.data.meta.accountList
                .map(a => (typeof a === 'string' ? a : (a && (a.value || a.name || ''))))
                .filter(a => typeof a === 'string' && a.trim() && !a.includes('[object'))
                .map(a => a.trim());
            this.data.meta.accountList = Array.from(new Set(this.data.meta.accountList));
        }

        if (this.data.meta && this.data.meta.feeRates) {
            this.engine = new WorkbenchEngine(this.data.meta.feeRates);
        }

        // 自動讀取並同步 stock_list.txt 與 account_list.txt 的最新內容
        try {
            const stockRes = await fetch('stock_list.txt');
            if (stockRes.ok) {
                const text = await stockRes.text();
                const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
                this.data.meta.stockDict = this.data.meta.stockDict || [];
                lines.forEach(line => {
                    const parts = line.split(',').map(s => s.trim().replace(/^"|"$/g, ''));
                    if (parts.length >= 3) {
                        const [market, symbol, name] = parts;
                        const existing = this.data.meta.stockDict.find(s => s.symbol === symbol);
                        if (!existing) {
                            this.data.meta.stockDict.push({ market, symbol, name });
                        } else {
                            existing.name = name;
                            existing.market = market;
                        }
                    }
                });
            }
        } catch { }

        try {
            const accRes = await fetch('account_list.txt');
            if (accRes.ok) {
                const text = await accRes.text();
                const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).map(l => l.trim().replace(/^"|"$/g, '')).filter(Boolean);
                if (lines.length > 0) {
                    const set = new Set([...(this.data.meta.accountList || []), ...lines]);
                    this.data.meta.accountList = Array.from(set);
                }
            }
        } catch { }

        // 預設常用字典種子 (若未讀取到任何清單則預載，確保本地 file:/// 模式下拉清單正常運作)
        if (!this.data.meta.stockDict || this.data.meta.stockDict.length === 0) {
            this.data.meta.stockDict = [
                { market: 'ETF', symbol: '006208', name: '富邦台50' },
                { market: '台股', symbol: '3576', name: '聯合再生' },
                { market: '台股', symbol: '3211', name: '順達' },
                { market: '台股', symbol: '1503', name: '士電' },
                { market: 'ETF', symbol: '00919', name: '群益台灣精選高息' },
                { market: '台股', symbol: '1815', name: '富喬' },
                { market: '台股', symbol: '2344', name: '華邦電' },
                { market: '台股', symbol: '3260', name: '威剛' },
                { market: '台股', symbol: '3481', name: '群創' },
                { market: '台股', symbol: '2455', name: '全新' },
                { market: '台股', symbol: '2408', name: '南亞科' },
                { market: '台股', symbol: '2313', name: '華通' },
                { market: '台股', symbol: '6290', name: '良維' },
                { market: '台股', symbol: '1303', name: '南亞' },
                { market: '台股', symbol: '4906', name: '正文' },
                { market: '台股', symbol: '3450', name: '聯鈞' },
                { market: '台股', symbol: '6278', name: '台表科' },
                { market: '台股', symbol: '6451', name: '訊芯-KY' },
                { market: '台股', symbol: '4958', name: '臻鼎-KY' },
                { market: '台股', symbol: '3357', name: '臺慶科' },
                { market: '台股', symbol: '2327', name: '國巨' },
                { market: '台股', symbol: '4991', name: '環宇-KY' },
                { market: '台股', symbol: '2472', name: '立隆電' },
                { market: '台股', symbol: '2308', name: '台達電' },
                { market: '台股', symbol: '5314', name: '世紀' }
            ];
        }

        if (!this.data.meta.accountList || this.data.meta.accountList.length === 0) {
            this.data.meta.accountList = [
                '富邦', '元大CMA', '元大', '國泰證券交割戶', '將來', '台新Richart',
                'ipass', '國泰(青年子帳戶)', 'LINEPAY', '休閒金', '股票(國泰)',
                '股票(元大)', '富邦信用卡(負債)', '台新信用卡(負債)'
            ];
        }

        // 初始化最新銀行月份快照
        const months = this.getAvailableBankMonths();
        if (months.length > 0) {
            this.selectedBankMonth = months[0];
        }
    }

    initDatalists() {
        // 1. 建立股票候選池 (整合 meta.stockDict 與所有交易歷史)
        const stockMap = new Map();
        (this.data.meta.stockDict || []).forEach(s => {
            if (s.symbol) stockMap.set(s.symbol.trim(), s.name || '');
        });
        (this.data.transactions || []).forEach(t => {
            if (t.symbol && !stockMap.has(t.symbol.trim())) {
                stockMap.set(t.symbol.trim(), t.name || '');
            }
        });

        const stockDatalistEl = document.getElementById('stockCodeList');
        if (stockDatalistEl) {
            let optionsHtml = '';
            stockMap.forEach((name, symbol) => {
                optionsHtml += `<option value="${symbol}">${symbol} - ${name}</option>`;
            });
            stockDatalistEl.innerHTML = optionsHtml;
        }

        // 2. 建立銀行帳戶候選池 (嚴格防禦性過濾，杜絕 [object Object] 等快取雜質)
        const accountSet = new Set();
        (this.data.meta.accountList || []).forEach(acc => {
            const str = typeof acc === 'string' ? acc.trim() : (acc && (acc.value || acc.name || ''));
            if (str && typeof str === 'string' && !str.includes('[object')) {
                accountSet.add(str);
            }
        });
        (this.data.bankAssets || []).forEach(b => {
            const str = typeof b.bankName === 'string' ? b.bankName.trim() : '';
            if (str && !str.includes('[object') && str !== '銀行帳戶') {
                accountSet.add(str);
            }
        });

        const bankDatalistEl = document.getElementById('bankAccountList');
        if (bankDatalistEl) {
            let optionsHtml = '';
            accountSet.forEach(acc => {
                optionsHtml += `<option value="${acc}">${acc}</option>`;
            });
            bankDatalistEl.innerHTML = optionsHtml;
        }
    }

    bindEvents() {
        // Esc 鍵關閉彈窗或抽屜
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (this.isListModalOpen) {
                    this.closeListManagerModal();
                } else if (this.isDrawerOpen) {
                    this.closeDrawer();
                }
            }
        });
    }

    // ==========================================
    // 視圖切換 (View Switching)
    // ==========================================
    switchView(viewName) {
        this.currentView = viewName;

        // 更新頂部頁籤 Active 狀態
        document.querySelectorAll('.wb-nav-tab').forEach(tab => {
            tab.classList.toggle('active', tab.getAttribute('data-view') === viewName);
        });

        // 切換主畫面 5 大獨立區塊
        document.querySelectorAll('.wb-view').forEach(viewEl => {
            viewEl.classList.toggle('active', viewEl.id === `view-${viewName}`);
        });

        // 依據進入的視圖執行全景渲染
        this.renderMetrics();
        if (viewName === 'overview') {
            this.renderCharts();
            this.renderMonthlyLedger();
        } else if (viewName === 'bank') {
            this.renderBankTable();
        } else if (viewName === 'stock') {
            this.renderHoldingsTable();
        } else if (viewName === 'history') {
            this.renderHistoryTable();
        } else if (viewName === 'pnl') {
            this.renderPnLTable();
        }
    }

    renderAll() {
        this.renderMetrics();
        if (this.currentView === 'overview') {
            this.renderCharts();
            this.renderMonthlyLedger();
        }
        else if (this.currentView === 'bank') this.renderBankTable();
        else if (this.currentView === 'stock') this.renderHoldingsTable();
        else if (this.currentView === 'history') this.renderHistoryTable();
        else if (this.currentView === 'pnl') this.renderPnLTable();
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

            const doughnutPlugins = typeof ChartDataLabels !== 'undefined' ? [ChartDataLabels] : [];

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

        // 3. 近期交易成交量柱狀圖
        const barCtx = document.getElementById('tradeBarChart');
        if (barCtx) {
            if (this.charts.bar) this.charts.bar.destroy();

            const monthlyVol = {};
            (this.data.transactions || []).forEach(tx => {
                const m = (tx.date || '').slice(0, 7);
                if (!m) return;
                monthlyVol[m] = (monthlyVol[m] || 0) + (parseFloat(tx.netAmountTwd) || parseFloat(tx.totalAmount) || 0);
            });

            const months = Object.keys(monthlyVol).sort().slice(-8);
            const vols = months.map(m => Math.round(monthlyVol[m]));

            this.charts.bar = new Chart(barCtx, {
                type: 'bar',
                data: {
                    labels: months,
                    datasets: [{
                        label: '交易金額 (TWD)',
                        data: vols,
                        backgroundColor: 'rgba(56, 189, 248, 0.7)',
                        borderRadius: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { ticks: { color: textColor }, grid: { color: gridColor } },
                        y: { ticks: { color: textColor }, grid: { color: gridColor } }
                    },
                    plugins: { legend: { display: false } }
                }
            });
        }
    }

    // ==========================================
    // View 2: 銀行資產全表渲染
    // ==========================================
    getAvailableBankMonths() {
        const months = new Set();
        (this.data.bankAssets || []).forEach(b => {
            const m = (b.date || '').slice(0, 7);
            if (m) months.add(m);
        });
        return Array.from(months).sort((a, b) => b.localeCompare(a));
    }

    getLatestBankAssets() {
        const months = this.getAvailableBankMonths();
        if (months.length === 0) return this.data.bankAssets || [];
        const latestM = months[0];
        return (this.data.bankAssets || []).filter(b => (b.date || '').startsWith(latestM));
    }

    onBankMonthSelect(month) {
        this.selectedBankMonth = month;
        this.renderBankTable();
        this.renderMetrics();
    }

    createMonthlySnapshot() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
        const currentMonth = today.slice(0, 7);

        const latestItems = this.getLatestBankAssets();
        if (latestItems.length === 0) {
            this.showToast('尚無銀行紀錄可供複製', 'info');
            return;
        }

        let copied = 0;
        latestItems.forEach(item => {
            const newItem = JSON.parse(JSON.stringify(item));
            newItem.id = `bank_${Date.now()}_${Math.floor(Math.random() * 900) + 100}`;
            newItem.date = today;
            this.data.bankAssets.unshift(newItem);
            copied++;
        });

        this.selectedBankMonth = currentMonth;
        this.scheduleAutoSave();
        this.renderAll();
        this.showToast(`已複製最新餘額並建立 ${currentMonth} 新月度快照 (${copied} 筆)`, 'success');
    }

    renderBankTable() {
        const monthSelect = document.getElementById('bankMonthSelect');
        const tbody = document.getElementById('bankTableBody');
        const summaryStats = document.getElementById('bankSummaryStats');
        if (!tbody) return;

        const months = this.getAvailableBankMonths();
        if (monthSelect) {
            monthSelect.innerHTML = months.map(m => `<option value="${m}" ${m === this.selectedBankMonth ? 'selected' : ''}>${m} 對帳快照</option>`).join('');
        }

        const activeMonth = this.selectedBankMonth || (months.length > 0 ? months[0] : '');
        const items = (this.data.bankAssets || []).filter(b => (b.date || '').startsWith(activeMonth));
        const totalTwd = items.reduce((sum, b) => sum + (parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0), 0);

        // 依折合台幣金額由大到小降冪排序 (大額主力帳戶置頂)
        const sortedItems = [...items].sort((a, b) => {
            const amtA = parseFloat(a.twdAmount) || parseFloat(a.originalAmount) || 0;
            const amtB = parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0;
            return amtB - amtA;
        });

        if (summaryStats) {
            summaryStats.textContent = `當期總計 ${items.length} 帳戶 ｜ 折合台幣: $${Math.round(totalTwd).toLocaleString()}`;
        }

        if (sortedItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">本月快照尚無帳戶資料</td></tr>`;
            return;
        }

        let html = '';
        sortedItems.forEach(item => {
            const originalAmt = parseFloat(item.originalAmount) || 0;
            const twdAmt = parseFloat(item.twdAmount) || 0;
            html += `
            <tr class="wb-inventory-row" onclick="app.openBankDrawerForEdit('${item.id}')">
                <td class="mono">${item.date || ''}</td>
                <td><strong>${item.bankName || ''}</strong></td>
                <td><span class="wb-tag bank">${item.accountType || '活存'}</span></td>
                <td class="mono">${item.currency || 'TWD'}</td>
                <td class="text-right mono">${originalAmt.toLocaleString()}</td>
                <td class="text-right mono">${item.exchangeRate || 1.0}</td>
                <td class="text-right mono" style="font-weight:700; color:var(--primary);">$${Math.round(twdAmt).toLocaleString()}</td>
                <td style="color:var(--text-muted); font-size:0.82rem;">${item.note || ''}</td>
                <td style="text-align:center;">
                    <button class="wb-btn sm" onclick="event.stopPropagation(); app.openBankDrawerForEdit('${item.id}')">✏️ 編輯</button>
                    <button class="wb-btn sm danger" onclick="event.stopPropagation(); app.deleteBankAsset('${item.id}')">🗑️</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }

    // ==========================================
    // View 3: 股票庫存全表渲染
    // ==========================================
    renderHoldingsTable() {
        const tbody = document.getElementById('holdingsTableBody');
        const summaryStats = document.getElementById('stockSummaryStats');
        if (!tbody) return;

        const { holdings, fifoQueues } = this.engine.computeFifoHoldings(this.data.transactions || [], this.data.latestPrices || {});

        // 依使用者所選欄位與方向排序 (預設市值降冪，支援未實現損益等由大到小排序)
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
        const iconMarketValue = document.getElementById('sortIconMarketValue');
        const iconUnrealizedPnL = document.getElementById('sortIconUnrealizedPnL');
        const iconShares = document.getElementById('sortIconShares');
        const arrow = sortOrder === 'desc' ? '▼' : '▲';
        if (iconMarketValue) iconMarketValue.textContent = sortKey === 'marketValue' ? arrow : '';
        if (iconUnrealizedPnL) iconUnrealizedPnL.textContent = sortKey === 'unrealizedPnL' ? arrow : '';
        if (iconShares) iconShares.textContent = sortKey === 'shares' ? arrow : '';

        const totalMarketVal = sortedHoldings.reduce((sum, h) => sum + h.marketValue, 0);
        const totalCost = sortedHoldings.reduce((sum, h) => sum + h.totalCost, 0);
        const totalPnL = totalMarketVal - totalCost;
        const totalRate = totalCost > 0 ? ((totalPnL / totalCost) * 100).toFixed(2) : 0;
        const pnlSign = totalPnL >= 0 ? '+' : '';

        if (summaryStats) {
            summaryStats.textContent = `持倉 ${sortedHoldings.length} 檔 ｜ 總市值 $${Math.round(totalMarketVal).toLocaleString()} ｜ 未實現: ${pnlSign}$${Math.round(totalPnL).toLocaleString()} (${pnlSign}${totalRate}%)`;
        }

        // 渲染股票庫存頂部：持股權重佔比圖與核心標的排行
        this.renderStockWeightChart(sortedHoldings, totalMarketVal);

        if (sortedHoldings.length === 0) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">目前無任何股票持倉庫存</td></tr>`;
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
                <td class="text-right mono" style="font-weight:700;">$${h.marketValue.toLocaleString()}</td>
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
                    <td colspan="8">
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

    onHistoryFilterChange() {
        const select = document.getElementById('historyActionFilter');
        if (select) {
            this.historyFilterAction = select.value;
            this.renderHistoryTable();
        }
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

        // 類別過濾 (買入 / 賣出)
        if (this.historyFilterAction && this.historyFilterAction !== 'ALL') {
            txs = txs.filter(t => t.action === this.historyFilterAction);
        }

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

        let html = '';
        txs.forEach(t => {
            const isBuy = t.action === '買入';
            const actionTag = isBuy ? 'buy' : 'sell';
            const netTwd = parseFloat(t.netAmountTwd) || parseFloat(t.totalAmount) || 0;

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
                <td style="text-align:center;">
                    <button class="wb-btn sm" onclick="event.stopPropagation(); app.openTxDrawerForEdit('${t.id}')">✏️ 編輯</button>
                    <button class="wb-btn sm danger" onclick="event.stopPropagation(); app.deleteTransaction('${t.id}')">🗑️</button>
                </td>
            </tr>`;
        });

        tbody.innerHTML = html;
    }

    // ==========================================
    // View 5: 已實現損益全表渲染 (由交易紀錄 FIFO 計算，支援日期範圍篩選)
    // ==========================================
    getRealizedPnLList() {
        const { calculatedPnL } = this.engine.computeFifoHoldings(this.data.transactions || []);
        const manualList = this.data.realizedPnL || [];
        const manualCustom = manualList.filter(m => !calculatedPnL.some(c => (c.transactionId && c.transactionId === m.transactionId) || c.id === m.id));
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

    renderRealizedWeightChart(fullList = []) {
        const canvas = document.getElementById('realizedWeightChart');
        const rankList = document.getElementById('pnlRankList');
        const badgeTotal = document.getElementById('pnlTotalProfitBadge');
        const badgeCount = document.getElementById('pnlTradedCountBadge');

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
        const totalGrossProfit = gainers.reduce((sum, s) => sum + s.netProfit, 0);

        if (badgeTotal) {
            badgeTotal.textContent = `獲利總和: +$${Math.round(totalGrossProfit).toLocaleString()}`;
        }
        if (badgeCount) {
            badgeCount.textContent = `共 ${allStocks.length} 檔標的平倉`;
        }

        // 整理前 7 大獲利標的 + 其他
        let chartLabels = [];
        let chartData = [];
        const topCount = 7;

        if (gainers.length <= topCount + 1) {
            chartLabels = gainers.map(g => {
                const pct = totalGrossProfit > 0 ? ((g.netProfit / totalGrossProfit) * 100).toFixed(1) : '0.0';
                return `${g.symbol} ${g.name} (${pct}%)`;
            });
            chartData = gainers.map(g => g.netProfit);
        } else {
            const topGainers = gainers.slice(0, topCount);
            const otherGainers = gainers.slice(topCount);
            const otherProfit = otherGainers.reduce((sum, g) => sum + g.netProfit, 0);
            const otherPct = totalGrossProfit > 0 ? ((otherProfit / totalGrossProfit) * 100).toFixed(1) : '0.0';

            chartLabels = topGainers.map(g => {
                const pct = totalGrossProfit > 0 ? ((g.netProfit / totalGrossProfit) * 100).toFixed(1) : '0.0';
                return `${g.symbol} ${g.name} (${pct}%)`;
            });
            chartData = topGainers.map(g => g.netProfit);

            chartLabels.push(`其他 ${otherGainers.length} 檔 (${otherPct}%)`);
            chartData.push(otherProfit);
        }

        const palette = [
            '#34d399', '#38bdf8', '#818cf8', '#fbbf24', '#f472b6',
            '#a78bfa', '#2dd4bf', '#fb923c', '#4ade80', '#60a5fa'
        ];

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
                                const pct = totalGrossProfit > 0 ? ((val / totalGrossProfit) * 100).toFixed(1) : '0.0';
                                return ` ${context.label.split(' ')[0]}: +$${Math.round(val).toLocaleString()} (${pct}%)`;
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
                            if (!totalGrossProfit || totalGrossProfit === 0) return '';
                            const pct = ((value / totalGrossProfit) * 100).toFixed(1);
                            if (parseFloat(pct) < 4) return ''; // 佔比小於 4% 隱藏文字避免擁擠
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
            // 由累計獲利最高排到虧損最多
            const sortedAll = [...allStocks].sort((a, b) => b.netProfit - a.netProfit);
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

    // ==========================================
    // 滑出抽屜編輯器 (Slide-over Drawer with Datalists)
    // ==========================================
    openTxDrawerForCreate() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
        const randId = Math.floor(Math.random() * 900) + 100;
        this.editingType = 'transaction';
        this.editingItem = {
            id: `tx_${Date.now()}_${randId}`,
            date: today,
            symbol: '006208',
            name: '富邦台50',
            action: '買入',
            price: 110,
            shares: 100,
            fee: 20,
            tax: 0,
            totalAmount: 11020,
            currency: 'TWD',
            exchangeRate: 1.0,
            netAmountTwd: 11020,
            note: ''
        };
        this.renderDrawerForm();
        this.openDrawer();
    }

    openTxDrawerForEdit(id) {
        const found = (this.data.transactions || []).find(t => t.id === id);
        if (!found) return;
        this.editingType = 'transaction';
        this.editingItem = JSON.parse(JSON.stringify(found));
        this.renderDrawerForm();
        this.openDrawer();
    }

    openBankDrawerForCreate() {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
        const randId = Math.floor(Math.random() * 900) + 100;
        this.editingType = 'bankAsset';
        this.editingItem = {
            id: `bank_${Date.now()}_${randId}`,
            date: this.selectedBankMonth ? `${this.selectedBankMonth}/01` : today,
            bankName: '富邦',
            accountType: '活存',
            currency: 'TWD',
            originalAmount: 100000,
            exchangeRate: 1.0,
            twdAmount: 100000,
            note: ''
        };
        this.renderDrawerForm();
        this.openDrawer();
    }

    openBankDrawerForEdit(id) {
        const found = (this.data.bankAssets || []).find(b => b.id === id);
        if (!found) return;
        this.editingType = 'bankAsset';
        this.editingItem = JSON.parse(JSON.stringify(found));
        this.renderDrawerForm();
        this.openDrawer();
    }

    openDrawer() {
        this.isDrawerOpen = true;
        const drawer = document.getElementById('drawerPane');
        const backdrop = document.getElementById('drawerBackdrop');
        if (drawer) drawer.classList.add('open');
        if (backdrop) backdrop.classList.add('open');
    }

    closeDrawer() {
        this.isDrawerOpen = false;
        const drawer = document.getElementById('drawerPane');
        const backdrop = document.getElementById('drawerBackdrop');
        if (drawer) drawer.classList.remove('open');
        if (backdrop) backdrop.classList.remove('open');
    }

    // Datalist 自動帶出股票名稱
    onStockCodeInput(symbolVal) {
        if (!this.editingItem) return;
        const sym = (symbolVal || '').trim();
        this.editingItem.symbol = sym;

        // 搜尋候選名稱
        let foundName = '';
        (this.data.meta.stockDict || []).forEach(s => {
            if (s.symbol === sym) foundName = s.name;
        });
        if (!foundName) {
            (this.data.transactions || []).forEach(t => {
                if (t.symbol === sym && t.name) foundName = t.name;
            });
        }

        if (foundName) {
            this.editingItem.name = foundName;
            const nameInput = document.getElementById('drawer_stock_name');
            if (nameInput) nameInput.value = foundName;
        }
        this.onTradeEstimateChange();
    }

    onTradeEstimateChange() {
        if (!this.editingItem || this.editingType !== 'transaction') return;
        const price = parseFloat(document.getElementById('drawer_tx_price')?.value) || 0;
        const shares = parseInt(document.getElementById('drawer_tx_shares')?.value, 10) || 0;
        const action = document.getElementById('drawer_tx_action')?.value || '買入';
        const fx = parseFloat(document.getElementById('drawer_tx_fx')?.value) || 1.0;

        this.editingItem.price = price;
        this.editingItem.shares = shares;
        this.editingItem.action = action;
        this.editingItem.exchangeRate = fx;

        // 試算手續費與稅
        const estimate = this.engine.calculateTradeEstimate({ action, price, shares });
        const feeInput = document.getElementById('drawer_tx_fee');
        const taxInput = document.getElementById('drawer_tx_tax');
        const totalInput = document.getElementById('drawer_tx_total');
        const netTwdInput = document.getElementById('drawer_tx_net_twd');

        if (feeInput) feeInput.value = estimate.fee;
        if (taxInput) taxInput.value = estimate.tax;
        if (totalInput) totalInput.value = estimate.netAmountOriginal;

        const netTwd = Math.round(estimate.netAmountOriginal * fx);
        if (netTwdInput) netTwdInput.value = netTwd;

        this.editingItem.fee = estimate.fee;
        this.editingItem.tax = estimate.tax;
        this.editingItem.totalAmount = estimate.netAmountOriginal;
        this.editingItem.netAmountTwd = netTwd;
    }

    onFeeOrTaxChange() {
        if (!this.editingItem || this.editingType !== 'transaction') return;
        const price = parseFloat(document.getElementById('drawer_tx_price')?.value) || 0;
        const shares = parseInt(document.getElementById('drawer_tx_shares')?.value, 10) || 0;
        const action = document.getElementById('drawer_tx_action')?.value || '買入';
        const fx = parseFloat(document.getElementById('drawer_tx_fx')?.value) || 1.0;
        const fee = parseFloat(document.getElementById('drawer_tx_fee')?.value) || 0;
        const tax = parseFloat(document.getElementById('drawer_tx_tax')?.value) || 0;

        let total = 0;
        if (action === '買入') {
            total = Math.round((shares * price) + fee);
        } else {
            total = Math.round((shares * price) - fee - tax);
        }
        const netTwd = Math.round(total * fx);

        const totalInput = document.getElementById('drawer_tx_total');
        const netTwdInput = document.getElementById('drawer_tx_net_twd');
        if (totalInput) totalInput.value = total;
        if (netTwdInput) netTwdInput.value = netTwd;

        this.editingItem.fee = fee;
        this.editingItem.tax = tax;
        this.editingItem.totalAmount = total;
        this.editingItem.netAmountTwd = netTwd;
    }

    onManualTxTotalChange(val) {
        if (!this.editingItem || this.editingType !== 'transaction') return;
        const total = parseFloat(val) || 0;
        const curr = document.getElementById('drawer_tx_currency')?.value || 'TWD';
        const fx = curr === 'TWD' ? 1.0 : (parseFloat(document.getElementById('drawer_tx_fx')?.value) || 1.0);
        const netTwd = Math.round(total * fx);

        const netTwdInput = document.getElementById('drawer_tx_net_twd');
        if (netTwdInput) netTwdInput.value = netTwd;

        this.editingItem.totalAmount = total;
        this.editingItem.netAmountTwd = netTwd;
    }

    onManualTxNetTwdChange(val) {
        if (!this.editingItem || this.editingType !== 'transaction') return;
        const netTwd = parseFloat(val) || 0;
        const curr = document.getElementById('drawer_tx_currency')?.value || 'TWD';

        // 若為台幣交易，原幣交割金額同步保持一致
        if (curr === 'TWD') {
            const totalInput = document.getElementById('drawer_tx_total');
            if (totalInput) totalInput.value = netTwd;
            this.editingItem.totalAmount = netTwd;
        }

        this.editingItem.netAmountTwd = netTwd;
    }

    onManualBankTwdChange(val) {
        if (!this.editingItem || this.editingType !== 'bankAsset') return;
        const twd = parseFloat(val) || 0;
        this.editingItem.twdAmount = twd;
    }

    recalculateTradeEstimate() {
        this.onTradeEstimateChange();
        this.showToast('已依單價、股數與預設費率重新試算交割金額', 'info');
    }

    onBankAmountChange() {
        if (!this.editingItem || this.editingType !== 'bankAsset') return;
        const orig = parseFloat(document.getElementById('drawer_bank_orig')?.value) || 0;
        const fx = parseFloat(document.getElementById('drawer_bank_fx')?.value) || 1.0;
        const twd = Math.round(orig * fx);

        this.editingItem.originalAmount = orig;
        this.editingItem.exchangeRate = fx;
        this.editingItem.twdAmount = twd;

        const twdInput = document.getElementById('drawer_bank_twd');
        if (twdInput) twdInput.value = twd;
    }

    renderDrawerForm() {
        const title = document.getElementById('drawerTitle');
        const badge = document.getElementById('drawerBadge');
        const body = document.getElementById('drawerBody');
        if (!body) return;

        const item = this.editingItem;

        if (this.editingType === 'transaction') {
            if (title) title.textContent = item.id.includes('Date.now') ? '＋ 新增股票交易' : '✏️ 編輯股票交易';
            if (badge) {
                badge.textContent = item.action || '買入';
                badge.className = `wb-tag ${item.action === '買入' ? 'buy' : 'sell'}`;
            }

            body.innerHTML = `
            <div class="wb-form-grid">
                <div class="wb-form-group">
                    <label class="wb-label">交易類別</label>
                    <select class="wb-select" id="drawer_tx_action" onchange="app.onTradeEstimateChange()">
                        <option value="買入" ${item.action === '買入' ? 'selected' : ''}>買入</option>
                        <option value="賣出" ${item.action === '賣出' ? 'selected' : ''}>賣出</option>
                    </select>
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">交易日期 (YYYY/MM/DD)</label>
                    <input type="text" class="wb-input mono" id="drawer_tx_date" value="${item.date || ''}">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">股票代號 (支援下拉挑選或輸入)</label>
                    <input type="text" class="wb-input mono" id="drawer_tx_symbol" list="stockCodeList" value="${item.symbol || ''}" placeholder="例如: 006208" oninput="app.onStockCodeInput(this.value)">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">股票名稱 (自動帶出)</label>
                    <input type="text" class="wb-input" id="drawer_stock_name" value="${item.name || ''}" placeholder="例如: 富邦台50">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">成交單價 ($)</label>
                    <input type="number" step="any" class="wb-input mono" id="drawer_tx_price" value="${item.price || 0}" oninput="app.onTradeEstimateChange()">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">成交股數 (股)</label>
                    <input type="number" class="wb-input mono" id="drawer_tx_shares" value="${item.shares || 0}" oninput="app.onTradeEstimateChange()">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">手續費 ($，可手動微調)</label>
                    <input type="number" class="wb-input mono" id="drawer_tx_fee" value="${item.fee || 0}" oninput="app.onFeeOrTaxChange()">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">證交稅 ($，可手動微調)</label>
                    <input type="number" class="wb-input mono" id="drawer_tx_tax" value="${item.tax || 0}" oninput="app.onFeeOrTaxChange()">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">計價幣別</label>
                    <select class="wb-select" id="drawer_tx_currency" onchange="app.onTradeEstimateChange()">
                        <option value="TWD" ${(item.currency || 'TWD') === 'TWD' ? 'selected' : ''}>新台幣 (TWD)</option>
                        <option value="HKD" ${item.currency === 'HKD' ? 'selected' : ''}>港幣 (HKD)</option>
                        <option value="USD" ${item.currency === 'USD' ? 'selected' : ''}>美元 (USD)</option>
                    </select>
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">匯率 (折合台幣)</label>
                    <input type="number" step="any" class="wb-input mono" id="drawer_tx_fx" value="${item.exchangeRate || 1.0}" oninput="app.onTradeEstimateChange()">
                </div>

                <div class="wb-form-group">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <label class="wb-label" style="margin-bottom:0;">交割金額 (原幣，可手動輸入)</label>
                        <button type="button" class="wb-btn sm" onclick="app.recalculateTradeEstimate()" title="依單價、股數與預設費率重新試算" style="padding:0.1rem 0.45rem; font-size:0.72rem; line-height:1.2;">🔄 依公式重算</button>
                    </div>
                    <input type="number" step="any" class="wb-input mono" id="drawer_tx_total" value="${item.totalAmount || 0}" oninput="app.onManualTxTotalChange(this.value)" placeholder="輸入實際交割金額 (原幣)">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">折合台幣金額 (實際交割 TWD，可手動輸入)</label>
                    <input type="number" class="wb-input mono" id="drawer_tx_net_twd" value="${item.netAmountTwd || 0}" oninput="app.onManualTxNetTwdChange(this.value)" placeholder="輸入對帳單實際扣款台幣金額" style="font-weight:700; color:var(--primary);">
                </div>

                <div class="wb-form-group col-full">
                    <label class="wb-label">備註說明</label>
                    <input type="text" class="wb-input" id="drawer_tx_note" value="${item.note || ''}" placeholder="例如: 定期定額、除權息補貼...">
                </div>
            </div>

            <div class="wb-form-actions">
                <button class="wb-btn sm danger" onclick="app.deleteCurrentEditing()">🗑️ 刪除紀錄</button>
                <button class="wb-btn sm primary" onclick="app.saveCurrentEditing()">💾 完成存檔</button>
            </div>`;
        } else if (this.editingType === 'bankAsset') {
            if (title) title.textContent = item.id.includes('Date.now') ? '＋ 新增帳戶餘額' : '✏️ 編輯帳戶餘額';
            if (badge) {
                badge.textContent = item.accountType || '活存';
                badge.className = 'wb-tag bank';
            }

            body.innerHTML = `
            <div class="wb-form-grid">
                <div class="wb-form-group">
                    <label class="wb-label">對帳日期 (YYYY/MM/DD)</label>
                    <input type="text" class="wb-input mono" id="drawer_bank_date" value="${item.date || ''}">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">銀行/帳戶名稱 (支援下拉挑選或輸入)</label>
                    <input type="text" class="wb-input" id="drawer_bank_name" list="bankAccountList" value="${item.bankName || ''}" placeholder="例如: 富邦、元大CMA">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">帳戶類型</label>
                    <select class="wb-select" id="drawer_bank_type">
                        <option value="活存" ${item.accountType === '活存' ? 'selected' : ''}>活期存款</option>
                        <option value="定存" ${item.accountType === '定存' ? 'selected' : ''}>定期存款</option>
                        <option value="證券交割" ${item.accountType === '證券交割' ? 'selected' : ''}>證券交割戶</option>
                        <option value="外幣" ${item.accountType === '外幣' ? 'selected' : ''}>外幣帳戶</option>
                    </select>
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">幣別</label>
                    <select class="wb-select" id="drawer_bank_currency">
                        <option value="TWD" ${(item.currency || 'TWD') === 'TWD' ? 'selected' : ''}>新台幣 (TWD)</option>
                        <option value="USD" ${item.currency === 'USD' ? 'selected' : ''}>美元 (USD)</option>
                        <option value="JPY" ${item.currency === 'JPY' ? 'selected' : ''}>日圓 (JPY)</option>
                    </select>
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">原幣存款金額 ($)</label>
                    <input type="number" step="any" class="wb-input mono" id="drawer_bank_orig" value="${item.originalAmount || 0}" oninput="app.onBankAmountChange()">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">匯率</label>
                    <input type="number" step="any" class="wb-input mono" id="drawer_bank_fx" value="${item.exchangeRate || 1.0}" oninput="app.onBankAmountChange()">
                </div>

                <div class="wb-form-group col-full">
                    <label class="wb-label">折合台幣 (TWD，可手動微調實際金額)</label>
                    <input type="number" class="wb-input mono" id="drawer_bank_twd" value="${item.twdAmount || 0}" oninput="app.onManualBankTwdChange(this.value)" style="font-weight:700; color:var(--primary);">
                </div>

                <div class="wb-form-group col-full">
                    <label class="wb-label">備註說明</label>
                    <input type="text" class="wb-input" id="drawer_bank_note" value="${item.note || ''}" placeholder="例如: 薪轉戶、緊急預備金...">
                </div>
            </div>

            <div class="wb-form-actions">
                <button class="wb-btn sm danger" onclick="app.deleteCurrentEditing()">🗑️ 刪除紀錄</button>
                <button class="wb-btn sm primary" onclick="app.saveCurrentEditing()">💾 完成存檔</button>
            </div>`;
        }
    }

    saveCurrentEditing() {
        if (!this.editingItem) return;

        if (this.editingType === 'transaction') {
            const date = document.getElementById('drawer_tx_date')?.value || this.editingItem.date;
            const action = document.getElementById('drawer_tx_action')?.value || this.editingItem.action;
            const symbol = (document.getElementById('drawer_tx_symbol')?.value || this.editingItem.symbol || '').trim();
            const name = (document.getElementById('drawer_stock_name')?.value || this.editingItem.name || '').trim();
            const price = parseFloat(document.getElementById('drawer_tx_price')?.value) || 0;
            const shares = parseInt(document.getElementById('drawer_tx_shares')?.value, 10) || 0;
            const fee = parseFloat(document.getElementById('drawer_tx_fee')?.value) || 0;
            const tax = parseFloat(document.getElementById('drawer_tx_tax')?.value) || 0;
            const currency = document.getElementById('drawer_tx_currency')?.value || 'TWD';
            const fx = parseFloat(document.getElementById('drawer_tx_fx')?.value) || 1.0;
            const total = parseFloat(document.getElementById('drawer_tx_total')?.value) || ((shares * price) + fee);
            const netTwd = parseFloat(document.getElementById('drawer_tx_net_twd')?.value) || Math.round(total * fx);
            const note = document.getElementById('drawer_tx_note')?.value || '';

            if (!symbol) {
                alert('請輸入或選擇股票代號');
                return;
            }

            this.editingItem.date = date;
            this.editingItem.action = action;
            this.editingItem.symbol = symbol;
            this.editingItem.name = name;
            this.editingItem.price = price;
            this.editingItem.shares = shares;
            this.editingItem.fee = fee;
            this.editingItem.tax = tax;
            this.editingItem.currency = currency;
            this.editingItem.exchangeRate = fx;
            this.editingItem.totalAmount = total;
            this.editingItem.netAmountTwd = netTwd;
            this.editingItem.note = note;

            const idx = this.data.transactions.findIndex(t => t.id === this.editingItem.id);
            if (idx >= 0) {
                this.data.transactions[idx] = this.editingItem;
            } else {
                this.data.transactions.unshift(this.editingItem);
            }

            // 自動學習新股票標的收錄至常用字典
            if (symbol) {
                if (!this.data.meta.stockDict) this.data.meta.stockDict = [];
                const exist = this.data.meta.stockDict.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
                if (!exist) {
                    const mkt = currency === 'USD' ? '美股' : (currency === 'HKD' ? '港股' : (name.includes('高息') || name.includes('50') || symbol.startsWith('00') ? 'ETF' : '台股'));
                    this.data.meta.stockDict.push({ market: mkt, symbol, name: name || symbol });
                } else if (name && (!exist.name || exist.name === symbol)) {
                    exist.name = name;
                }
            }

            this.showToast(`已儲存交易紀錄: ${symbol} ${name}`, 'success');
        } else if (this.editingType === 'bankAsset') {
            const date = document.getElementById('drawer_bank_date')?.value || this.editingItem.date;
            const bankName = (document.getElementById('drawer_bank_name')?.value || this.editingItem.bankName || '').trim();
            const accountType = document.getElementById('drawer_bank_type')?.value || '活存';
            const currency = document.getElementById('drawer_bank_currency')?.value || 'TWD';
            const orig = parseFloat(document.getElementById('drawer_bank_orig')?.value) || 0;
            const fx = parseFloat(document.getElementById('drawer_bank_fx')?.value) || 1.0;
            const twd = parseFloat(document.getElementById('drawer_bank_twd')?.value) || Math.round(orig * fx);
            const note = document.getElementById('drawer_bank_note')?.value || '';

            if (!bankName) {
                alert('請輸入或選擇銀行帳戶名稱');
                return;
            }

            this.editingItem.date = date;
            this.editingItem.bankName = bankName;
            this.editingItem.accountType = accountType;
            this.editingItem.currency = currency;
            this.editingItem.originalAmount = orig;
            this.editingItem.exchangeRate = fx;
            this.editingItem.twdAmount = twd;
            this.editingItem.note = note;

            const idx = this.data.bankAssets.findIndex(b => b.id === this.editingItem.id);
            if (idx >= 0) {
                this.data.bankAssets[idx] = this.editingItem;
            } else {
                this.data.bankAssets.unshift(this.editingItem);
            }

            // 自動學習新銀行帳戶收錄至常用清單
            if (bankName) {
                if (!this.data.meta.accountList) this.data.meta.accountList = [];
                if (!this.data.meta.accountList.includes(bankName)) {
                    this.data.meta.accountList.push(bankName);
                }
            }

            this.showToast(`已儲存銀行帳戶: ${bankName}`, 'success');
        }

        this.initDatalists();
        this.scheduleAutoSave();
        this.closeDrawer();
        this.renderAll();
    }

    deleteCurrentEditing() {
        if (!this.editingItem) return;
        if (!confirm('確定要刪除此筆紀錄嗎？此動作將無法復原。')) return;

        if (this.editingType === 'transaction') {
            this.data.transactions = this.data.transactions.filter(t => t.id !== this.editingItem.id);
            this.showToast('已刪除交易紀錄', 'info');
        } else if (this.editingType === 'bankAsset') {
            this.data.bankAssets = this.data.bankAssets.filter(b => b.id !== this.editingItem.id);
            this.showToast('已刪除銀行資產', 'info');
        }

        this.scheduleAutoSave();
        this.closeDrawer();
        this.renderAll();
    }

    deleteTransaction(id) {
        if (!confirm('確定要刪除這筆交易紀錄嗎？')) return;
        this.data.transactions = this.data.transactions.filter(t => t.id !== id);
        this.scheduleAutoSave();
        this.renderAll();
        this.showToast('已刪除交易紀錄', 'info');
    }

    deleteBankAsset(id) {
        if (!confirm('確定要刪除這筆銀行帳戶資產嗎？')) return;
        this.data.bankAssets = this.data.bankAssets.filter(b => b.id !== id);
        this.scheduleAutoSave();
        this.renderAll();
        this.showToast('已刪除銀行資產', 'info');
    }

    // ==========================================
    // 儲存與同步機制 (IndexedDB & Legacy Sync)
    // ==========================================
    scheduleAutoSave() {
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(async () => {
            await this.saveData();
        }, 300);
    }

    async saveData() {
        try {
            this.data.meta.lastUpdated = new Date().toISOString();
            await this.storage.set('assets_data', this.data);

            try {
                const jsonStr = JSON.stringify(this.data);
                if (jsonStr.length < 4 * 1024 * 1024) {
                    localStorage.setItem('assets_data', jsonStr);
                }
            } catch { }
        } catch (e) {
            console.error('儲存失敗:', e);
            this.showToast('本地儲存失敗: ' + (e.message || e), 'danger');
        }
    }

    // ==========================================
    // 匯出 CSV 與 JSON 備份
    // ==========================================
    exportJson() {
        const jsonStr = JSON.stringify(this.data, null, 2);
        const blob = DataConverter.createUtf8BomBlob(jsonStr, 'application/json;charset=utf-8');
        const filename = `assets_data_backup_${new Date().toISOString().slice(0, 10)}.json`;
        DataConverter.downloadBlob(blob, filename);
        this.showToast('已匯出完整 JSON 備份', 'success');
    }

    exportCsv(type) {
        if (type === 'transactions') {
            const csv = DataConverter.generateTransactionsCsv(this.data.transactions);
            const blob = DataConverter.createUtf8BomBlob(csv);
            DataConverter.downloadBlob(blob, `transactions_${new Date().toISOString().slice(0, 10)}.csv`);
            this.showToast('已匯出交易紀錄 CSV', 'success');
        } else if (type === 'bankAssets') {
            const csv = DataConverter.generateBankAssetsCsv(this.data.bankAssets);
            const blob = DataConverter.createUtf8BomBlob(csv);
            DataConverter.downloadBlob(blob, `bank_assets_${new Date().toISOString().slice(0, 10)}.csv`);
            this.showToast('已匯出銀行資產 CSV', 'success');
        } else if (type === 'realizedPnL') {
            const list = this.getFilteredRealizedPnLList();
            const headers = ['日期', '市場', '股票代號', '股票名稱', '幣別', '賣出股數', '匯率', '總成本(原幣)', '賣出價(原幣)', '已實現損益(原幣)', '總成本(台幣)', '賣出價(台幣)', '已實現損益(台幣)', '報酬率%'];
            const rows = list.map(p => [
                `"${p.closeDate || p.date}"`,
                `"${p.market || '台股'}"`,
                `"${p.symbol}"`,
                `"${p.name || ''}"`,
                `"${p.currency || 'TWD'}"`,
                `"${p.shares}"`,
                `"${p.exchangeRate || 1.0}"`,
                `"${p.costBasisOriginal || p.costBasis}"`,
                `"${p.sellRevenueOriginal || p.sellRevenue}"`,
                `"${p.netProfitOriginal || p.netProfit}"`,
                `"${p.costBasis}"`,
                `"${p.sellRevenue}"`,
                `"${p.netProfit}"`,
                `"${p.profitRate || 0}%"`
            ].join(','));
            const csv = [headers.join(','), ...rows].join('\r\n');
            const blob = DataConverter.createUtf8BomBlob(csv);
            DataConverter.downloadBlob(blob, `realized_pnl_${new Date().toISOString().slice(0, 10)}.csv`);
            this.showToast('已匯出已實現損益 CSV', 'success');
        }
    }

    importJsonFile(event) {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const cleanText = (e.target.result || '').replace(/^\uFEFF/, '');
                const parsed = JSON.parse(cleanText);
                if (parsed.transactions && parsed.bankAssets) {
                    this.data = parsed;
                    await this.saveData();
                    this.initDatalists();
                    this.renderAll();
                    this.showToast('成功匯入並套用 JSON 備份', 'success');
                } else {
                    alert('匯入的 JSON 格式不符合資產資料庫結構');
                }
            } catch (err) {
                alert('JSON 解析失敗，請確認檔案格式是否正確');
            }
        };
        reader.readAsText(file);
    }

    showToast(message, type = 'info') {
        let container = document.getElementById('toastContainer');
        if (!container) {
            container = document.createElement('div');
            container.id = 'toastContainer';
            container.className = 'wb-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `wb-toast ${type}`;
        toast.innerHTML = message;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 200);
        }, 2500);
    }

    // ==========================================
    // 常用清單管理 (List Manager Modal)
    // ==========================================
    openListManagerModal() {
        this.isListModalOpen = true;
        const modal = document.getElementById('listManagerModal');
        const backdrop = document.getElementById('listManagerBackdrop');
        if (modal) modal.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
        this.switchListManagerTab(this.currentDictTab || 'stock');
    }

    closeListManagerModal() {
        this.isListModalOpen = false;
        const modal = document.getElementById('listManagerModal');
        const backdrop = document.getElementById('listManagerBackdrop');
        if (modal) modal.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
    }

    switchListManagerTab(tab) {
        this.currentDictTab = tab;
        const tabStock = document.getElementById('tabStockDict');
        const tabAccount = document.getElementById('tabAccountDict');
        const panelStock = document.getElementById('panelStockDict');
        const panelAccount = document.getElementById('panelAccountDict');
        const btnExport = document.getElementById('btnExportTxt');
        const btnImport = document.getElementById('btnImportTxt');

        if (tab === 'stock') {
            if (tabStock) tabStock.classList.add('active');
            if (tabAccount) tabAccount.classList.remove('active');
            if (panelStock) panelStock.style.display = 'block';
            if (panelAccount) panelAccount.style.display = 'none';
            if (btnExport) btnExport.textContent = '📤 匯出 stock_list.txt';
            if (btnImport) btnImport.textContent = '📥 匯入 stock_list.txt';
        } else {
            if (tabStock) tabStock.classList.remove('active');
            if (tabAccount) tabAccount.classList.add('active');
            if (panelStock) panelStock.style.display = 'none';
            if (panelAccount) panelAccount.style.display = 'block';
            if (btnExport) btnExport.textContent = '📤 匯出 account_list.txt';
            if (btnImport) btnImport.textContent = '📥 匯入 account_list.txt';
        }
        this.renderListManager();
    }

    renderListManager() {
        this.renderStockDictList();
        this.renderAccountDictList();
    }

    filterStockDictList(query) {
        this.stockDictFilter = (query || '').toLowerCase().trim();
        this.renderStockDictList();
    }

    filterAccountDictList(query) {
        this.accountDictFilter = (query || '').toLowerCase().trim();
        this.renderAccountDictList();
    }

    renderStockDictList() {
        const tbody = document.getElementById('stockDictTableBody');
        const countSpan = document.getElementById('stockDictCount');
        if (!this.data.meta.stockDict) this.data.meta.stockDict = [];

        if (countSpan) countSpan.textContent = this.data.meta.stockDict.length;
        if (!tbody) return;

        let filtered = this.data.meta.stockDict;
        if (this.stockDictFilter) {
            filtered = filtered.filter(s =>
                (s.symbol && s.symbol.toLowerCase().includes(this.stockDictFilter)) ||
                (s.name && s.name.toLowerCase().includes(this.stockDictFilter)) ||
                (s.market && s.market.toLowerCase().includes(this.stockDictFilter))
            );
        }

        if (filtered.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-muted);">無符合之股票標的</td></tr>`;
            return;
        }

        let html = '';
        filtered.forEach(s => {
            const mktTagClass = s.market === 'ETF' ? 'stock' : (s.market === '美股' || s.market === '港股' ? 'primary' : 'bank');
            html += `
            <tr>
                <td><span class="wb-tag ${mktTagClass}" style="font-size:0.75rem;">${s.market || '台股'}</span></td>
                <td><strong class="mono" style="color:var(--primary);">${s.symbol}</strong></td>
                <td><strong>${s.name || ''}</strong></td>
                <td style="text-align:center;">
                    <button class="wb-btn sm danger" style="padding:0.2rem 0.5rem;" onclick="app.deleteStockDictItem('${s.symbol}')" title="自字典中移除">
                        🗑️
                    </button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }

    addStockDictItem() {
        const marketEl = document.getElementById('newStockMarket');
        const codeEl = document.getElementById('newStockCode');
        const nameEl = document.getElementById('newStockName');

        const market = marketEl ? marketEl.value : '台股';
        const symbol = codeEl ? codeEl.value.trim() : '';
        const name = nameEl ? nameEl.value.trim() : '';

        if (!symbol) {
            alert('請輸入股票代號');
            return;
        }

        if (!this.data.meta.stockDict) this.data.meta.stockDict = [];
        const existing = this.data.meta.stockDict.find(s => s.symbol.toUpperCase() === symbol.toUpperCase());
        if (existing) {
            existing.market = market;
            if (name) existing.name = name;
            this.showToast(`已更新標的資訊: ${symbol} ${existing.name}`, 'info');
        } else {
            this.data.meta.stockDict.unshift({
                market,
                symbol,
                name: name || symbol
            });
            this.showToast(`已新增標的: ${symbol} ${name || symbol}`, 'success');
        }

        if (codeEl) codeEl.value = '';
        if (nameEl) nameEl.value = '';

        this.initDatalists();
        this.renderStockDictList();
        this.scheduleAutoSave();
    }

    deleteStockDictItem(symbol) {
        if (!confirm(`確定要從常用字典中移除股票「${symbol}」嗎？`)) return;
        this.data.meta.stockDict = (this.data.meta.stockDict || []).filter(s => s.symbol !== symbol);
        this.initDatalists();
        this.renderStockDictList();
        this.scheduleAutoSave();
        this.showToast(`已自字典移除標的: ${symbol}`, 'info');
    }

    renderAccountDictList() {
        const grid = document.getElementById('accountTagGrid');
        const countSpan = document.getElementById('accountDictCount');
        if (!this.data.meta.accountList) this.data.meta.accountList = [];

        if (countSpan) countSpan.textContent = this.data.meta.accountList.length;
        if (!grid) return;

        let filtered = this.data.meta.accountList;
        if (this.accountDictFilter) {
            filtered = filtered.filter(a => typeof a === 'string' && a.toLowerCase().includes(this.accountDictFilter));
        }

        if (filtered.length === 0) {
            grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:1.5rem; color:var(--text-muted);">無符合之銀行帳戶</div>`;
            return;
        }

        let html = '';
        filtered.forEach(acc => {
            html += `
            <div class="wb-account-tag-item">
                <span>🏦 ${acc}</span>
                <button class="del-btn" onclick="app.deleteAccountDictItem('${acc}')" title="刪除此帳戶">✕</button>
            </div>`;
        });
        grid.innerHTML = html;
    }

    addAccountDictItem() {
        const nameEl = document.getElementById('newAccountName');
        const name = nameEl ? nameEl.value.trim() : '';

        if (!name) {
            alert('請輸入銀行或帳戶名稱');
            return;
        }

        if (!this.data.meta.accountList) this.data.meta.accountList = [];
        if (this.data.meta.accountList.includes(name)) {
            alert(`帳戶「${name}」已在清單中`);
            return;
        }

        this.data.meta.accountList.unshift(name);
        if (nameEl) nameEl.value = '';

        this.initDatalists();
        this.renderAccountDictList();
        this.scheduleAutoSave();
        this.showToast(`已新增銀行帳戶: ${name}`, 'success');
    }

    deleteAccountDictItem(accountName) {
        if (!confirm(`確定要從常用字典中移除帳戶「${accountName}」嗎？`)) return;
        this.data.meta.accountList = (this.data.meta.accountList || []).filter(a => a !== accountName);
        this.initDatalists();
        this.renderAccountDictList();
        this.scheduleAutoSave();
        this.showToast(`已移除銀行帳戶: ${accountName}`, 'info');
    }

    exportCurrentDictTxt() {
        if (this.currentDictTab === 'stock') {
            const txt = DataConverter.generateStockListTxt(this.data.meta.stockDict || []);
            const blob = DataConverter.createUtf8BomBlob(txt, 'text/plain;charset=utf-8');
            DataConverter.downloadBlob(blob, 'stock_list.txt');
            this.showToast('已匯出 stock_list.txt (UTF-8 with BOM)', 'success');
        } else {
            const txt = DataConverter.generateAccountListTxt(this.data.meta.accountList || []);
            const blob = DataConverter.createUtf8BomBlob(txt, 'text/plain;charset=utf-8');
            DataConverter.downloadBlob(blob, 'account_list.txt');
            this.showToast('已匯出 account_list.txt (UTF-8 with BOM)', 'success');
        }
    }

    importCurrentDictTxt(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const text = e.target.result;
            if (this.currentDictTab === 'stock') {
                const parsed = DataConverter.parseStockListTxt(text);
                if (parsed.length === 0) {
                    alert('未解析到任何有效的股票清單資料，請確認檔案格式');
                    return;
                }
                const dictMap = new Map();
                (this.data.meta.stockDict || []).forEach(s => dictMap.set(s.symbol, s));
                parsed.forEach(s => dictMap.set(s.symbol, s));
                this.data.meta.stockDict = Array.from(dictMap.values());
                this.showToast(`成功匯入 ${parsed.length} 筆股票標的`, 'success');
            } else {
                const parsed = DataConverter.parseAccountListTxt(text);
                if (parsed.length === 0) {
                    alert('未解析到任何有效的銀行帳戶資料，請確認檔案格式');
                    return;
                }
                const set = new Set([...(this.data.meta.accountList || []), ...parsed]);
                this.data.meta.accountList = Array.from(set);
                this.showToast(`成功匯入 ${parsed.length} 個銀行帳戶`, 'success');
            }
            this.initDatalists();
            this.renderListManager();
            this.scheduleAutoSave();
            event.target.value = '';
        };
        reader.readAsText(file, 'utf-8');
    }

    // ==========================================
    // 股票即時行情與歷史快照功能
    // ==========================================
    getApiBaseUrl() {
        if (window.location.protocol.startsWith('http')) {
            return '';
        }
        // 當使用者直接以 file:/// 協定開啟時，指向本機背景服務
        return 'http://127.0.0.1:8080';
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

    async backfillHistoricalSnapshots() {
        const btn = document.getElementById('btnBackfillSnapshots');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '⏳ 歷史補齊中...';
        }

        const baseUrl = this.getApiBaseUrl();

        try {
            // 找出所有歷史月份 (排除當前最新月) 與各月份真實銀行對帳日、純存款與股票留存估值
            const monthlyBank = {};
            const monthlyStockLegacy = {};
            const monthlyReconDate = {};
            (this.data.bankAssets || []).forEach(b => {
                const m = (b.date || '').slice(0, 7);
                if (!m) return;
                // 記錄該月份在 bankAssets 中的真實對帳日期 (例如 2026/05/08)
                if (!monthlyReconDate[m] || b.date > monthlyReconDate[m]) {
                    monthlyReconDate[m] = b.date;
                }
                const amt = parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0;
                const isStockAcc = b.bankName && (b.bankName.includes('股票') || b.bankName.includes('ETF'));
                if (isStockAcc) {
                    monthlyStockLegacy[m] = (monthlyStockLegacy[m] || 0) + amt;
                } else {
                    monthlyBank[m] = (monthlyBank[m] || 0) + amt;
                }
            });

            const sortedMonths = Object.keys(monthlyBank).sort();
            if (sortedMonths.length <= 1) {
                this.showToast('目前歷史期次不足，無需補齊快照', 'info');
                return;
            }

            const pastMonths = sortedMonths.slice(0, sortedMonths.length - 1);
            this.data.monthlySnapshots = this.data.monthlySnapshots || {};
            const newSnapshots = {};
            let processedMonths = 0;

            for (const m of pastMonths) {
                // 取得該月具體銀行對帳日 (消除時間差盲區)
                const reconDate = monthlyReconDate[m] || (m + '-31');
                const bankTotal = monthlyBank[m] || 0;

                // 若舊系統留存有記錄股票估值，優先 100% 採用舊留存值，徹底杜絕落差
                let stockTotal = 0;
                if (monthlyStockLegacy[m] != null && monthlyStockLegacy[m] > 0) {
                    stockTotal = monthlyStockLegacy[m];
                } else {
                    // 若無留存紀錄，則以對帳日持股與收盤價回溯推算
                    const hist = this.engine.computeHoldingsAtDate(this.data.transactions || [], reconDate);
                    const priceMap = {};
                    for (const h of hist.holdings) {
                        try {
                            const res = await fetch(`${baseUrl}/api/stock-price/historical?symbol=${encodeURIComponent(h.symbol)}&month=${encodeURIComponent(m)}`);
                            if (res.ok) {
                                const j = await res.json();
                                if (j.success && j.data && j.data.closePrice) {
                                    priceMap[h.symbol] = j.data.closePrice;
                                }
                            }
                        } catch (e) { }
                    }
                    const reval = this.engine.computeHoldingsAtDate(this.data.transactions || [], reconDate, priceMap);
                    stockTotal = reval.totalMarketValue;
                }

                const netWorth = bankTotal + stockTotal;
                const histDetails = this.engine.computeHoldingsAtDate(this.data.transactions || [], reconDate);

                newSnapshots[m] = {
                    month: m,
                    date: reconDate,
                    bankTotal: bankTotal,
                    stockTotal: stockTotal,
                    totalNetWorth: netWorth,
                    holdings: histDetails.holdings.map(h => ({
                        symbol: h.symbol,
                        name: h.name,
                        currency: h.currency || 'TWD',
                        exchangeRate: h.exchangeRate || 1.0,
                        shares: h.shares,
                        closePrice: h.evalPrice || h.currentPrice,
                        marketValue: h.marketValue,
                        marketValueOriginal: h.marketValueOriginal || h.marketValue
                    })),
                    updatedAt: new Date().toISOString()
                };
                processedMonths++;
            }

            // 本地合併快照
            Object.assign(this.data.monthlySnapshots, newSnapshots);
            await this.saveData();

            // 同步寫入後端 server assets_data.json
            try {
                await fetch(`${baseUrl}/api/save-snapshots`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ snapshots: newSnapshots })
                });
            } catch (postErr) {
                console.warn('同步後端 save-snapshots 失敗 (已在本地 IndexedDB 保存):', postErr);
            }

            this.renderCharts();
            this.renderMetrics();
            this.showToast(`🎉 成功完成 ${processedMonths} 個歷史月份持股市值快照補齊！`, 'success');
        } catch (err) {
            console.error('補齊歷史快照失敗:', err);
            const isFile = window.location.protocol === 'file:';
            if (isFile) {
                this.showToast('⚠️ 目前為直接開啟檔案模式 (file:///)，請執行 Start-Workbench.bat 啟動服務，或直接前往 http://127.0.0.1:8080/workbench.html', 'warning', 7000);
            } else {
                this.showToast(`補齊歷史快照失敗: ${err.message}`, 'error');
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '🔄 補齊歷史月份市值';
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
            if (!this.isLedgerExpanded && items.length > 6) {
                items = items.slice(0, 6);
            }
            if (expandBtn) {
                expandBtn.textContent = this.isLedgerExpanded ? '收合顯示 (最近 6 個月) ▲' : `展開全部月份 (${filteredData.ledger.length} 期) ▼`;
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

// 實例化全域 App
const app = new WorkbenchApp();
if (typeof window !== 'undefined') {
    window.app = app;
    window.addEventListener('DOMContentLoaded', () => app.init());
}
