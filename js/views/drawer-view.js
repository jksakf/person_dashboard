/**
 * 個人資產一體化工作台 - 抽屜表單與字典管理模組 (DrawerView: 滑出抽屜表單、即時試算、常用清單管理與 Datalist)
 * 編碼：UTF-8 with BOM
 */

class DrawerView {
    constructor(app) {
        this.app = app;
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

    // ==========================================
    // 下拉選單資料池與動態互動輔助函式
    // ==========================================
    getAvailableAccounts() {
        const set = new Set();
        (this.data.meta?.accountList || []).forEach(acc => {
            const str = typeof acc === 'string' ? acc.trim() : (acc && (acc.value || acc.name || ''));
            if (str && typeof str === 'string' && !str.includes('[object')) set.add(str);
        });
        (this.data.bankAssets || []).forEach(b => {
            const str = typeof b.bankName === 'string' ? b.bankName.trim() : '';
            if (str && !str.includes('[object') && str !== '銀行帳戶') set.add(str);
        });
        if (set.size === 0) {
            ['富邦活存', '中信生活費', '台新Richart', '玉山證券交割', '國泰信用卡', '玉山信用卡'].forEach(a => set.add(a));
        }
        return Array.from(set);
    }

    getAvailableStocks() {
        const holdingMap = new Map();
        const watchlistMap = new Map();

        (this.data.transactions || []).forEach(t => {
            if (t.symbol) {
                holdingMap.set(t.symbol.trim(), t.name || t.symbol);
            }
        });

        (this.data.meta?.stockDict || []).forEach(s => {
            if (s.symbol) {
                watchlistMap.set(s.symbol.trim(), s.name || s.symbol);
            }
        });

        if (holdingMap.size === 0 && watchlistMap.size === 0) {
            watchlistMap.set('006208', '富邦台50');
            watchlistMap.set('2330', '台積電');
            watchlistMap.set('00878', '國泰永續高股息');
            watchlistMap.set('VOO', 'Vanguard S&P 500');
        }

        return { holdingMap, watchlistMap };
    }

    onStockSymbolSelectChange(symVal) {
        if (!this.editingItem || this.editingType !== 'transaction') return;
        if (symVal === '__CUSTOM_STOCK__') {
            const customCode = prompt('請輸入股票代號（例如：2330 或 QQQ）：');
            const selectEl = document.getElementById('drawer_tx_symbol');
            if (!customCode || !customCode.trim()) {
                if (selectEl) selectEl.value = this.editingItem.symbol || '';
                return;
            }
            const code = customCode.trim().toUpperCase();
            const customName = prompt(`請輸入股票名稱（例如：台積電）：`, code) || code;
            const name = customName.trim();

            if (selectEl) {
                const opt = document.createElement('option');
                opt.value = code;
                opt.textContent = `${code} - ${name}`;
                opt.selected = true;
                selectEl.insertBefore(opt, selectEl.lastElementChild);
            }

            if (!this.data.meta.stockDict) this.data.meta.stockDict = [];
            const exist = this.data.meta.stockDict.find(s => s.symbol.toUpperCase() === code);
            if (!exist) {
                this.data.meta.stockDict.push({ symbol: code, name: name });
            }

            this.editingItem.symbol = code;
            this.editingItem.name = name;
            const nameInput = document.getElementById('drawer_stock_name');
            if (nameInput) nameInput.value = name;
            this.onTradeEstimateChange();
        } else {
            this.onStockCodeInput(symVal);
        }
    }

    onBankNameSelectChange(val) {
        if (!this.editingItem || this.editingType !== 'bankAsset') return;
        if (val === '__NEW_BANK__') {
            const newBank = prompt('請輸入新的銀行或帳戶名稱（例如：國泰生活費）：');
            const selectEl = document.getElementById('drawer_bank_name');
            if (!newBank || !newBank.trim()) {
                if (selectEl) selectEl.value = this.editingItem.bankName || '';
                return;
            }
            const trimmed = newBank.trim();
            if (!this.data.meta.accountList) this.data.meta.accountList = [];
            if (!this.data.meta.accountList.includes(trimmed)) {
                this.data.meta.accountList.push(trimmed);
            }
            if (selectEl) {
                const opt = document.createElement('option');
                opt.value = trimmed;
                opt.textContent = trimmed;
                opt.selected = true;
                selectEl.insertBefore(opt, selectEl.lastElementChild);
            }
            this.onBankNameInput(trimmed);
        } else {
            this.onBankNameInput(val);
        }
    }

    onDailyCategorySelectChange(val) {
        if (!this.editingItem || this.editingType !== 'dailyRecord') return;
        const currentType = this.editingItem.type || 'expense';
        if (val === '__NEW_CAT__') {
            const newCat = prompt('請輸入自訂記帳類別名稱（例如：🐶 寵物支出）：');
            const selectEl = document.getElementById('drawer_daily_cat');
            if (!newCat || !newCat.trim()) {
                if (selectEl) selectEl.value = this.editingItem.category || '';
                return;
            }
            const trimmed = newCat.trim();
            if (this.dailyLedgerView && this.dailyLedgerView.categories[currentType]) {
                if (!this.dailyLedgerView.categories[currentType].includes(trimmed)) {
                    this.dailyLedgerView.categories[currentType].push(trimmed);
                }
            }
            if (selectEl) {
                const opt = document.createElement('option');
                opt.value = trimmed;
                opt.textContent = trimmed;
                opt.selected = true;
                selectEl.insertBefore(opt, selectEl.lastElementChild);
            }
            this.editingItem.category = trimmed;
        } else {
            this.editingItem.category = val;
        }
    }

    onDailyAccountSelectChange(val, elId) {
        if (!this.editingItem || this.editingType !== 'dailyRecord') return;
        if (val === '__NEW_ACC__') {
            const newAcc = prompt('請輸入銀行/帳戶名稱（例如：國泰生活費）：');
            const selectEl = document.getElementById(elId);
            if (!newAcc || !newAcc.trim()) {
                if (selectEl) selectEl.value = (elId === 'drawer_daily_account' ? this.editingItem.account : this.editingItem.toAccount) || '';
                return;
            }
            const trimmed = newAcc.trim();
            if (!this.data.meta.accountList) this.data.meta.accountList = [];
            if (!this.data.meta.accountList.includes(trimmed)) {
                this.data.meta.accountList.push(trimmed);
            }
            ['drawer_daily_account', 'drawer_daily_to_account'].forEach(id => {
                const s = document.getElementById(id);
                if (s) {
                    const opt = document.createElement('option');
                    opt.value = trimmed;
                    opt.textContent = trimmed;
                    s.insertBefore(opt, s.lastElementChild);
                }
            });
            if (selectEl) selectEl.value = trimmed;
            if (elId === 'drawer_daily_account') {
                this.editingItem.account = trimmed;
            } else {
                this.editingItem.toAccount = trimmed;
            }
        } else {
            if (elId === 'drawer_daily_account') {
                this.editingItem.account = val;
            } else {
                this.editingItem.toAccount = val;
            }
        }
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

            const { holdingMap, watchlistMap } = this.getAvailableStocks();
            let stockOptionsHtml = '<option value="">-- 請選擇股票標的 --</option>';

            if (item.symbol && !holdingMap.has(item.symbol) && !watchlistMap.has(item.symbol)) {
                stockOptionsHtml += `<option value="${item.symbol}" selected>${item.symbol} - ${item.name || item.symbol}</option>`;
            }

            if (holdingMap.size > 0) {
                stockOptionsHtml += '<optgroup label="📦 歷史與庫存持股">';
                holdingMap.forEach((name, sym) => {
                    stockOptionsHtml += `<option value="${sym}" ${item.symbol === sym ? 'selected' : ''}>${sym} - ${name}</option>`;
                });
                stockOptionsHtml += '</optgroup>';
            }

            if (watchlistMap.size > 0) {
                stockOptionsHtml += '<optgroup label="⭐ 常用觀察標的">';
                watchlistMap.forEach((name, sym) => {
                    if (!holdingMap.has(sym)) {
                        stockOptionsHtml += `<option value="${sym}" ${item.symbol === sym ? 'selected' : ''}>${sym} - ${name}</option>`;
                    }
                });
                stockOptionsHtml += '</optgroup>';
            }

            stockOptionsHtml += '<option value="__CUSTOM_STOCK__">➕ 自訂輸入其他標的...</option>';

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
                    <label class="wb-label">股票標的 (下拉全覽挑選)</label>
                    <select class="wb-select mono" id="drawer_tx_symbol" onchange="app.onStockSymbolSelectChange(this.value)">
                        ${stockOptionsHtml}
                    </select>
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
                const meta = this.getAccountTypeMeta(item.accountType, (item.twdAmount || item.originalAmount || 0) < 0);
                badge.textContent = `${meta.icon} ${meta.text}`;
                badge.className = 'wb-tag ' + meta.tagClass;
                badge.style = meta.style;
            }

            const accounts = this.getAvailableAccounts();
            let bankOptionsHtml = '<option value="">-- 請選擇銀行/帳戶 --</option>';
            if (item.bankName && !accounts.includes(item.bankName)) {
                bankOptionsHtml += `<option value="${item.bankName}" selected>${item.bankName}</option>`;
            }
            accounts.forEach(acc => {
                bankOptionsHtml += `<option value="${acc}" ${item.bankName === acc ? 'selected' : ''}>${acc}</option>`;
            });
            bankOptionsHtml += '<option value="__NEW_BANK__">➕ 自訂新銀行帳戶...</option>';

            body.innerHTML = `
            <div class="wb-form-grid">
                <div class="wb-form-group">
                    <label class="wb-label">對帳日期 (YYYY/MM/DD)</label>
                    <input type="text" class="wb-input mono" id="drawer_bank_date" value="${item.date || ''}">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">銀行/帳戶名稱 (下拉全覽挑選)</label>
                    <select class="wb-select" id="drawer_bank_name" onchange="app.onBankNameSelectChange(this.value)">
                        ${bankOptionsHtml}
                    </select>
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">帳戶類型</label>
                    <select class="wb-select" id="drawer_bank_type" onchange="app.onDrawerBankTypeChange(this.value)">
                        <option value="活存" ${item.accountType === '活存' ? 'selected' : ''}>💰 活期存款</option>
                        <option value="定存" ${item.accountType === '定存' ? 'selected' : ''}>🏦 定期存款</option>
                        <option value="證券交割" ${item.accountType === '證券交割' ? 'selected' : ''}>📈 證券交割戶</option>
                        <option value="外幣" ${item.accountType === '外幣' ? 'selected' : ''}>🌐 外幣帳戶</option>
                        <option value="負債" ${item.accountType === '負債' ? 'selected' : ''}>💳 信用卡/應繳負債</option>
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
                    <label class="wb-label" id="drawer_bank_orig_label">${item.accountType === '負債' ? '應繳負債金額 ($，系統自動負數統計)' : '原幣存款金額 ($)'}</label>
                    <input type="number" step="any" class="wb-input mono" id="drawer_bank_orig" value="${Math.abs(item.originalAmount || 0)}" placeholder="${item.accountType === '負債' ? '例如: 8136' : '0'}" oninput="app.onBankAmountChange()">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">匯率</label>
                    <input type="number" step="any" class="wb-input mono" id="drawer_bank_fx" value="${item.exchangeRate || 1.0}" oninput="app.onBankAmountChange()">
                </div>

                <div class="wb-form-group col-full">
                    <label class="wb-label">折合台幣 (TWD，可手動微調實際金額)</label>
                    <input type="number" class="wb-input mono" id="drawer_bank_twd" value="${item.accountType === '負債' ? -Math.abs(item.twdAmount || 0) : (item.twdAmount || 0)}" oninput="app.onManualBankTwdChange(this.value)" style="font-weight:700; color:${item.accountType === '負債' ? 'var(--danger)' : 'var(--primary)'};">
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
        } else if (this.editingType === 'dailyRecord') {
            const isNew = !this.data.dailyRecords || !this.data.dailyRecords.some(r => r.id === item.id);
            if (title) title.textContent = isNew ? '＋ 新增日常記帳' : '✏️ 編輯日常記帳';
            if (badge) {
                const typeTexts = { expense: '💸 生活支出', income: '💰 日常收入', transfer: '🔄 帳戶轉帳' };
                badge.textContent = typeTexts[item.type] || '日常記帳';
                badge.className = `wb-tag ${item.type === 'expense' ? 'danger' : (item.type === 'income' ? 'success' : 'primary')}`;
                badge.style = '';
            }

            const categories = (this.dailyLedgerView && this.dailyLedgerView.categories[item.type]) || ['🍜 飲食', '🚗 交通', '🛍️ 購物', '☕ 飲品點心', '🏠 居住水電', '🎬 休閒娛樂'];
            let catOptions = '<option value="">-- 請選擇收支類別 --</option>';
            if (item.category && !categories.includes(item.category)) {
                catOptions += `<option value="${item.category}" selected>${item.category}</option>`;
            }
            categories.forEach(c => {
                catOptions += `<option value="${c}" ${item.category === c ? 'selected' : ''}>${c}</option>`;
            });
            catOptions += '<option value="__NEW_CAT__">➕ 自訂新類別...</option>';

            const accounts = this.getAvailableAccounts();
            let dailyAccOptions = '<option value="">-- 請選擇帳戶 --</option>';
            if (item.account && !accounts.includes(item.account)) {
                dailyAccOptions += `<option value="${item.account}" selected>${item.account}</option>`;
            }
            accounts.forEach(acc => {
                dailyAccOptions += `<option value="${acc}" ${item.account === acc ? 'selected' : ''}>${acc}</option>`;
            });
            dailyAccOptions += '<option value="__NEW_ACC__">➕ 自訂新帳戶...</option>';

            let dailyToAccOptions = '<option value="">-- 請選擇轉入帳戶 --</option>';
            if (item.toAccount && !accounts.includes(item.toAccount)) {
                dailyToAccOptions += `<option value="${item.toAccount}" selected>${item.toAccount}</option>`;
            }
            accounts.forEach(acc => {
                dailyToAccOptions += `<option value="${acc}" ${item.toAccount === acc ? 'selected' : ''}>${acc}</option>`;
            });
            dailyToAccOptions += '<option value="__NEW_ACC__">➕ 自訂新帳戶...</option>';

            body.innerHTML = `
            <div class="wb-form-grid">
                <div class="wb-form-group">
                    <label class="wb-label">記帳類型</label>
                    <select class="wb-select" id="drawer_daily_type" onchange="app.onDailyTypeChange(this.value)">
                        <option value="expense" ${item.type === 'expense' ? 'selected' : ''}>💸 生活支出</option>
                        <option value="income" ${item.type === 'income' ? 'selected' : ''}>💰 日常收入</option>
                        <option value="transfer" ${item.type === 'transfer' ? 'selected' : ''}>🔄 帳戶轉帳</option>
                    </select>
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">記帳日期 (YYYY/MM/DD)</label>
                    <input type="text" class="wb-input mono" id="drawer_daily_date" value="${item.date || ''}">
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">收支類別 (下拉全覽挑選)</label>
                    <select class="wb-select" id="drawer_daily_cat" onchange="app.onDailyCategorySelectChange(this.value)">
                        ${catOptions}
                    </select>
                </div>

                <div class="wb-form-group">
                    <label class="wb-label">金額 ($) <span style="color:var(--danger)">*</span></label>
                    <input type="number" step="any" class="wb-input mono" id="drawer_daily_amount" value="${item.amount || ''}" placeholder="請輸入金額" style="font-size:1.15rem; font-weight:700;">
                </div>

                <div class="wb-form-group ${item.type === 'transfer' ? '' : 'col-full'}" id="group_daily_account">
                    <label class="wb-label">${item.type === 'income' ? '入帳銀行帳戶' : (item.type === 'transfer' ? '轉出銀行帳戶' : '扣款銀行帳戶')}</label>
                    <select class="wb-select" id="drawer_daily_account" onchange="app.onDailyAccountSelectChange(this.value, 'drawer_daily_account')">
                        ${dailyAccOptions}
                    </select>
                </div>

                <div class="wb-form-group" id="group_daily_to_account" style="${item.type === 'transfer' ? 'display:flex;' : 'display:none;'}">
                    <label class="wb-label">轉入銀行帳戶</label>
                    <select class="wb-select" id="drawer_daily_to_account" onchange="app.onDailyAccountSelectChange(this.value, 'drawer_daily_to_account')">
                        ${dailyToAccOptions}
                    </select>
                </div>

                <div class="wb-form-group col-full">
                    <label class="wb-label">消費備註 / 細項說明</label>
                    <input type="text" class="wb-input" id="drawer_daily_note" value="${item.note || ''}" placeholder="例如: 聚餐拉麵、加油">
                </div>
            </div>
            <div style="margin-top: 1.5rem; display: flex; gap: 0.5rem; justify-content: flex-end;">
                <button class="wb-btn sm danger" onclick="app.deleteCurrentEditing()">🗑️ 刪除紀錄</button>
                <button class="wb-btn sm primary" onclick="app.saveCurrentEditing()">💾 完成存檔</button>
            </div>`;
        }
    }

    onDailyTypeChange(type) {
        if (!this.editingItem || this.editingType !== 'dailyRecord') return;
        this.editingItem.type = type;
        const badge = document.getElementById('drawerBadge');
        if (badge) {
            const typeTexts = { expense: '💸 生活支出', income: '💰 日常收入', transfer: '🔄 帳戶轉帳' };
            badge.textContent = typeTexts[type] || '日常記帳';
            badge.className = `wb-tag ${type === 'expense' ? 'danger' : (type === 'income' ? 'success' : 'primary')}`;
        }
        const toAccGroup = document.getElementById('group_daily_to_account');
        if (toAccGroup) {
            toAccGroup.style.display = type === 'transfer' ? 'flex' : 'none';
        }
        const accGroup = document.getElementById('group_daily_account');
        if (accGroup) {
            if (type === 'transfer') {
                accGroup.classList.remove('col-full');
            } else {
                accGroup.classList.add('col-full');
            }
        }
        const accLabel = document.querySelector('#group_daily_account label');
        if (accLabel) {
            accLabel.textContent = type === 'income' ? '入帳銀行帳戶' : (type === 'transfer' ? '轉出銀行帳戶' : '扣款銀行帳戶');
        }
        const catSelect = document.getElementById('drawer_daily_cat');
        if (catSelect && this.dailyLedgerView) {
            const categories = this.dailyLedgerView.categories[type] || [];
            let catOptions = '<option value="">-- 請選擇收支類別 --</option>';
            categories.forEach(c => catOptions += `<option value="${c}">${c}</option>`);
            catOptions += '<option value="__NEW_CAT__">➕ 自訂新類別...</option>';
            catSelect.innerHTML = catOptions;
            if (categories.length > 0) {
                catSelect.value = categories[0];
                this.editingItem.category = categories[0];
            }
        }
    }

    onDrawerBankTypeChange(type) {
        if (this.editingItem) {
            this.editingItem.accountType = type;
        }
        const badge = document.getElementById('drawerBadge');
        if (badge) {
            const meta = this.getAccountTypeMeta(type);
            badge.textContent = `${meta.icon} ${meta.text}`;
            badge.className = 'wb-tag ' + meta.tagClass;
            badge.style = meta.style;
        }
        const origInput = document.getElementById('drawer_bank_orig');
        const twdInput = document.getElementById('drawer_bank_twd');
        const origLabel = document.getElementById('drawer_bank_orig_label');
        const isDebt = type === '負債';
        if (origLabel) {
            origLabel.textContent = isDebt ? '應繳負債金額 ($，系統自動負數統計)' : '原幣存款金額 ($)';
        }
        if (origInput) {
            origInput.placeholder = isDebt ? '例如: 8136' : '0';
        }
        if (twdInput) {
            twdInput.style.color = isDebt ? 'var(--danger)' : 'var(--primary)';
            const val = parseFloat(twdInput.value) || 0;
            if (isDebt && val > 0) {
                twdInput.value = -val;
            } else if (!isDebt && val < 0) {
                twdInput.value = Math.abs(val);
            }
        }
    }

    onBankNameInput(nameVal) {
        if (!this.editingItem || this.editingType !== 'bankAsset') return;
        const name = (nameVal || '').trim();
        this.editingItem.bankName = name;
        const typeSelect = document.getElementById('drawer_bank_type');
        if (!typeSelect) return;

        // 智慧型自動偵測帳戶類型
        if (name.includes('交割') || name.includes('證券')) {
            if (typeSelect.value !== '證券交割') {
                typeSelect.value = '證券交割';
                this.onDrawerBankTypeChange('證券交割');
            }
        } else if (name.includes('信用卡') || name.includes('負債')) {
            if (typeSelect.value !== '負債') {
                typeSelect.value = '負債';
                this.onDrawerBankTypeChange('負債');
            }
        } else if (name.includes('外幣') || name.includes('美元') || name.includes('外匯')) {
            if (typeSelect.value !== '外幣') {
                typeSelect.value = '外幣';
                this.onDrawerBankTypeChange('外幣');
            }
        } else if (name.includes('定存')) {
            if (typeSelect.value !== '定存') {
                typeSelect.value = '定存';
                this.onDrawerBankTypeChange('定存');
            }
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

            // 信用卡/負債自動防呆轉負數
            let finalOrig = orig;
            let finalTwd = twd;
            const isDebtType = accountType === '負債' || (bankName && (bankName.includes('信用卡') || bankName.includes('負債')));
            if (isDebtType) {
                finalOrig = -Math.abs(orig);
                finalTwd = -Math.abs(twd);
            } else {
                finalOrig = Math.abs(orig);
                finalTwd = Math.abs(twd);
            }

            this.editingItem.date = date;
            this.editingItem.bankName = bankName;
            this.editingItem.accountType = isDebtType ? '負債' : accountType;
            this.editingItem.currency = currency;
            this.editingItem.originalAmount = finalOrig;
            this.editingItem.exchangeRate = fx;
            this.editingItem.twdAmount = finalTwd;
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

            // 同步寫入後端 server assets_data.json
            try {
                const baseUrl = (window.location.protocol === 'http:' || window.location.protocol === 'https:') ? window.location.origin : 'http://127.0.0.1:8080';
                fetch(`${baseUrl}/api/save-bank-assets`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ bankAssets: this.data.bankAssets })
                }).catch(() => {});
            } catch {}

            this.showToast(`已儲存銀行帳戶: ${bankName}`, 'success');
        } else if (this.editingType === 'dailyRecord') {
            const date = document.getElementById('drawer_daily_date')?.value || this.editingItem.date;
            const type = document.getElementById('drawer_daily_type')?.value || this.editingItem.type || 'expense';
            const category = (document.getElementById('drawer_daily_cat')?.value || this.editingItem.category || '').trim();
            const amount = parseFloat(document.getElementById('drawer_daily_amount')?.value) || 0;
            const account = (document.getElementById('drawer_daily_account')?.value || this.editingItem.account || '').trim();
            const toAccount = (document.getElementById('drawer_daily_to_account')?.value || this.editingItem.toAccount || '').trim();
            const note = document.getElementById('drawer_daily_note')?.value || '';

            if (amount <= 0) {
                alert('請輸入大於 0 的金額');
                return;
            }
            if (!account) {
                alert('請選擇或輸入銀行帳戶');
                return;
            }

            if (!this.data.dailyRecords) this.data.dailyRecords = [];

            // 若為修改既有紀錄，先還原原本對銀行的影響
            const existingIdx = this.data.dailyRecords.findIndex(r => r.id === this.editingItem.id);
            if (existingIdx >= 0) {
                if (typeof this.applyRecordToBank === 'function') {
                    this.applyRecordToBank(this.data.dailyRecords[existingIdx], true);
                } else if (this.dailyLedgerView && typeof this.dailyLedgerView.applyRecordToBank === 'function') {
                    this.dailyLedgerView.applyRecordToBank(this.data.dailyRecords[existingIdx], true);
                }
            }

            this.editingItem.date = date;
            this.editingItem.type = type;
            this.editingItem.category = category || (type === 'expense' ? '其他支出' : '其他收入');
            this.editingItem.amount = amount;
            this.editingItem.account = account;
            this.editingItem.toAccount = toAccount;
            this.editingItem.note = note;

            // 套用新的銀行帳戶影響
            if (typeof this.applyRecordToBank === 'function') {
                this.applyRecordToBank(this.editingItem, false);
            } else if (this.dailyLedgerView && typeof this.dailyLedgerView.applyRecordToBank === 'function') {
                this.dailyLedgerView.applyRecordToBank(this.editingItem, false);
            }

            if (existingIdx >= 0) {
                this.data.dailyRecords[existingIdx] = this.editingItem;
            } else {
                this.data.dailyRecords.unshift(this.editingItem);
            }

            this.showToast(`🎉 已記錄: ${this.editingItem.category} $${Math.round(amount).toLocaleString()}，帳戶已即時連動！`, 'success');
        }

        this.initDatalists();
        this.scheduleAutoSave();
        this.closeDrawer();
        this.renderAll();
        if (typeof this.renderDailyLedger === 'function') {
            this.renderDailyLedger();
        } else if (this.dailyLedgerView && typeof this.dailyLedgerView.renderDailyLedger === 'function') {
            this.dailyLedgerView.renderDailyLedger();
        }
    }

    deleteCurrentEditing() {
        if (!this.editingItem) return;
        if (!confirm('確定要刪除此筆紀錄嗎？此動作將無法復原。')) return;

        if (this.editingType === 'transaction') {
            this.data.transactions = this.data.transactions.filter(t => t.id !== this.editingItem.id);
            this.showToast('已刪除交易紀錄', 'info');
        } else if (this.editingType === 'dailyRecord') {
            if (this.dailyLedgerView) {
                this.dailyLedgerView.deleteDailyRecord(this.editingItem.id);
            }
            this.closeDrawer();
            return;
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

}

if (typeof window !== "undefined") {
    window.DrawerView = DrawerView;
}
