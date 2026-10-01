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
            monthlySnapshots: {},
            dailyRecords: []
        };

        this.currentView = 'overview'; // 'overview' | 'bank' | 'stock' | 'history' | 'pnl' | 'daily'
        this.historySearch = '';
        this.historyFilterAction = 'ALL';
        this.historyMarketFilter = 'ALL';
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
        this.pnlPieType = 'profit';  // 'profit' | 'loss' | 'comparison'

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
            bankShare: null,
            stockWeight: null,
            realizedWeight: null
        };
        // ==========================================
        // 實例化獨立視圖模組 (View Modules)
        // ==========================================
        this.overviewView = typeof OverviewView !== 'undefined' ? new OverviewView(this) : null;
        this.bankView = typeof BankView !== 'undefined' ? new BankView(this) : null;
        this.stockView = typeof StockView !== 'undefined' ? new StockView(this) : null;
        this.historyView = typeof HistoryView !== 'undefined' ? new HistoryView(this) : null;
        this.pnlView = typeof PnLView !== 'undefined' ? new PnLView(this) : null;
        this.drawerView = typeof DrawerView !== 'undefined' ? new DrawerView(this) : null;
        this.dailyLedgerView = typeof DailyLedgerView !== 'undefined' ? new DailyLedgerView(this) : null;

        // 自動將視圖方法綁定至 app 實例，100% 保持 HTML onclick 與既有調用簽名相容
        [this.overviewView, this.bankView, this.stockView, this.historyView, this.pnlView, this.drawerView, this.dailyLedgerView].forEach(v => this._registerView(v));
    }

    _registerView(viewInstance) {
        if (!viewInstance) return;
        const proto = Object.getPrototypeOf(viewInstance);
        Object.getOwnPropertyNames(proto).forEach(name => {
            if (name !== 'constructor' && typeof viewInstance[name] === 'function') {
                this[name] = viewInstance[name].bind(this);
            }
        });
    }

    async init() {
        this.initTheme();
        await this.loadData();
        this.initDatalists();
        this.bindEvents();
        this.updateInitialSyncStatus();
        this.startHeartbeat();
        this.switchView('overview');
        this.showToast('資產工作台 v1.3 就緒 (獨立全寬度視圖模式)', 'success');
    }

    // ==========================================
    // 網頁活躍心跳續約 (與本地 Node 服務保持連線)
    // ==========================================
    startHeartbeat() {
        const baseUrl = this.getApiBaseUrl();
        const sendBeat = () => {
            try {
                fetch(`${baseUrl}/api/heartbeat`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true
                }).catch(() => {});
            } catch (e) {}
        };

        // 立即發送第一次心跳
        sendBeat();

        // 每 5 秒定期心跳續約 (伺服器無心跳 30 秒自動退出)
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = setInterval(sendBeat, 5000);
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

            // 優先獲取伺服器端 assets_data.json 最新狀態 (加入防快取參數與 UTF-8 BOM 防呆過濾)
            let serverData = null;
            try {
                const res = await fetch('assets_data.json?_t=' + Date.now());
                if (res.ok) {
                    const text = await res.text();
                    serverData = JSON.parse(text.replace(/^\uFEFF/, ''));
                }
            } catch (err) {
                console.warn('載入 assets_data.json 失敗:', err);
            }

            if (serverData && ((serverData.transactions && serverData.transactions.length > 0) || (serverData.bankAssets && serverData.bankAssets.length > 0))) {
                if (cached && ((cached.transactions && cached.transactions.length > 0) || (cached.bankAssets && cached.bankAssets.length > 0))) {
                    this.data = cached;
                    // 自動同步伺服器端已校準完成之最新 monthlySnapshots 快照
                    if (serverData.monthlySnapshots) {
                        this.data.monthlySnapshots = serverData.monthlySnapshots;
                    }
                    if (serverData.meta) {
                        this.data.meta = { ...(this.data.meta || {}), ...serverData.meta };
                    }
                } else {
                    // 若本地快取無資料或為空陣列，則以伺服器端完整資料為主
                    this.data = serverData;
                    await this.saveData();
                }
            } else if (cached && ((cached.transactions && cached.transactions.length > 0) || (cached.bankAssets && cached.bankAssets.length > 0))) {
                this.data = cached;
            }
        } catch (e) {
            console.warn('載入 assets_data 失敗，改用預設結構:', e);
        }

        this.data.latestPrices = this.data.latestPrices || {};
        this.data.monthlySnapshots = this.data.monthlySnapshots || {};

        // 清洗 meta.accountList 雜質防呆 (避免舊快取殘留 [object Object])
        if (Array.isArray(this.data.realizedPnL)) {
            this.data.realizedPnL = this.data.realizedPnL.filter(p => p.id !== 'manual_pnl_1');
        }
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
        } else if (viewName === 'daily') {
            if (this.dailyLedgerView) this.dailyLedgerView.renderDailyLedger();
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
        else if (this.currentView === 'daily') {
            if (this.dailyLedgerView) this.dailyLedgerView.renderDailyLedger();
        }
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

            // 自動雙向同步至後端實體磁碟 (assets_data.json)
            await this.syncToDisk();
        } catch (e) {
            console.error('儲存失敗:', e);
            this.showToast('本地儲存失敗: ' + (e.message || e), 'danger');
        }
    }

    updateInitialSyncStatus() {
        const isFile = window.location.protocol === 'file:';
        if (isFile) {
            this.setSyncBadge('offline', '⚠️ 本地快取模式', '目前以 file:/// 開啟，資料僅存於瀏覽器快取；請使用 Start-Workbench.bat 啟用磁碟同步');
        } else {
            const timeStr = this.data?.meta?.lastUpdated ? new Date(this.data.meta.lastUpdated).toLocaleTimeString('zh-TW', { hour12: false }) : '';
            this.setSyncBadge('online', `🟢 已同步磁碟${timeStr ? ` (${timeStr})` : ''}`, '本機微服務已連線，所有異動均即時安全寫入 assets_data.json');
        }
    }

    setSyncBadge(status, text, title) {
        const badge = document.getElementById('syncStatusBadge');
        if (!badge) return;
        badge.className = `wb-sync-badge-pill ${status}`;
        const textEl = badge.querySelector('.sync-text');
        if (textEl) textEl.textContent = text;
        if (title) badge.title = title;
    }

    async syncToDisk() {
        const baseUrl = this.getApiBaseUrl();
        this.setSyncBadge('syncing', '⏳ 同步寫入中...', '正在將異動資料原子化寫入磁碟 assets_data.json');

        try {
            const res = await fetch(`${baseUrl}/api/save-all-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json; charset=utf-8' },
                body: JSON.stringify(this.data)
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (json.success) {
                const nowStr = new Date().toLocaleTimeString('zh-TW', { hour12: false });
                this.setSyncBadge('online', `🟢 已同步磁碟 (${nowStr})`, '已成功寫入 assets_data.json，並自動備份至 assets_data.backup.json');
            } else {
                throw new Error(json.error || '磁碟寫入異常');
            }
        } catch (err) {
            const isFile = window.location.protocol === 'file:';
            if (isFile) {
                this.setSyncBadge('offline', '⚠️ 本地快取模式', '目前以 file:/// 瀏覽，僅儲存於瀏覽器 IndexedDB，請執行 Start-Workbench.bat 啟動磁碟自動同步');
            } else {
                this.setSyncBadge('error', '⚠️ 磁碟同步失敗', `寫入實體磁碟失敗: ${err.message} (已保存在本地 IndexedDB)`);
            }
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
    // 股票即時行情與歷史快照功能
    // ==========================================
    getApiBaseUrl() {
        if (window.location.protocol.startsWith('http')) {
            return '';
        }
        // 當使用者直接以 file:/// 協定開啟時，指向本機背景服務
        return 'http://127.0.0.1:8080';
    }

}


// 實例化全域 App
const app = new WorkbenchApp();
if (typeof window !== 'undefined') {
    window.app = app;
    window.addEventListener('DOMContentLoaded', () => app.init());
}
