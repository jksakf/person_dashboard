// Core Data Management
App.Data = {
    // App Data Store
    store: {
        bankAssets: [],
        stockHoldings: [],
        realizedPnL: [],
        transactions: []
    },

    // Save to LocalStorage
    save: function () {
        try {
            localStorage.setItem(App.Config.StorageKey, JSON.stringify(this.store));
            console.log('✅ Data saved to LocalStorage');
        } catch (e) {
            console.error('Failed to save data:', e);
        }
    },

    // Load from IndexedDB or LocalStorage
    load: async function () {
        try {
            let savedData = null;

            // 1. Try loading legacy_sync_data from IndexedDB
            if (window.appStorage) {
                try {
                    savedData = await window.appStorage.get('legacy_sync_data');
                    if (savedData) {
                        console.log('Sync from IndexedDB success');
                    }
                } catch (e) {
                    console.warn('Load IndexedDB legacy_sync_data failed:', e);
                }
            }

            // 2. Fallback to LocalStorage
            if (!savedData) {
                const json = localStorage.getItem(App.Config.StorageKey);
                if (json) {
                    savedData = JSON.parse(json);
                    console.log('Load from LocalStorage success');
                }
            }

            if (savedData) {
                if (savedData.bankAssets) this.store.bankAssets = savedData.bankAssets;
                if (savedData.stockHoldings) this.store.stockHoldings = savedData.stockHoldings;
                if (savedData.realizedPnL) this.store.realizedPnL = savedData.realizedPnL;
                if (savedData.transactions) this.store.transactions = savedData.transactions;

                console.log('Data loaded successfully', this.store);
                this.triggerGlobalRender();
            }
        } catch (e) {
            console.error('Failed to load data:', e);
        }
    },

    clear: function () {
        localStorage.removeItem(App.Config.StorageKey);
        console.log('🗑️ Storage cleared');
    },

    clearAll: function () {
        if (confirm('確定要清除所有資料嗎？這將會從畫面和儲存空間中移除所有資料。')) {
            this.store = {
                bankAssets: [],
                stockHoldings: [],
                realizedPnL: [],
                transactions: []
            };

            // Reset charts
            if (window.App && App.Charts) {
                Object.keys(App.Charts).forEach(key => {
                    if (App.Charts[key]) {
                        App.Charts[key].destroy();
                        delete App.Charts[key];
                    }
                });
            }

            // Reset UI
            if (document.getElementById('totalBankAssets')) document.getElementById('totalBankAssets').textContent = '$0';
            if (document.getElementById('totalMarketValue')) document.getElementById('totalMarketValue').textContent = '$0';
            if (document.getElementById('totalUnrealizedPnL')) document.getElementById('totalUnrealizedPnL').textContent = '$0';
            if (document.getElementById('totalRealizedPnL')) document.getElementById('totalRealizedPnL').textContent = '$0';

            const placeholders = {
                'bankTableContainer': '請上傳銀行資產 CSV 檔案以檢視明細',
                'stockTableContainer': '請上傳股票庫存 CSV 檔案以檢視明細',
                'pnlTableContainer': '請上傳已實現損益 CSV 檔案以檢視明細',
                'historyTableContainer': '請上傳交易明細 CSV 檔案以檢視內容'
            };

            for (const [id, msg] of Object.entries(placeholders)) {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<div class="placeholder-text">${msg}</div>`;
            }

            // Clear status labels
            ['bankStatus', 'stockStatus', 'pnlStatus', 'transStatus'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.textContent = '';
            });

            // Clear Date Selectors
            ['bankDateSelect', 'stockDateSelect'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = '<option value="">請選擇日期</option>';
            });

            // Clear Storage
            this.clear();

            alert('所有資料已清除');
        }
    },

    // CSV Parsing
    parseCSV: function (file, type, callback = null) {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            encoding: "UTF-8",
            complete: (results) => {
                console.log(`Loaded ${type}:`, results.data);

                if (this.validate(type, results.data)) {
                    this.store[type] = results.data;
                    App.Utils.updateStatus(type, `✅ 匯入成功 (${results.data.length}筆)`);

                    // Trigger Renders
                    this.triggerRenderByType(type);

                    // Save to Storage
                    this.save();
                } else {
                    App.Utils.updateStatus(type, `❌ 格式錯誤`);
                    alert(`檔案 ${file.name} 格式不符合預期，請檢查欄位。`);
                }

                if (callback) callback(results);
            },
            error: function (error) {
                console.error(error);
                alert("CSV 解析失敗: " + error.message);
            }
        });
    },

    // Validation
    validate: function (type, data) {
        if (!data || data.length === 0) return false;
        const firstRow = data[0];

        const has = (key) => key in firstRow;
        const hasOneOf = (keys) => keys.some(k => k in firstRow);

        if (type === 'bankAssets') return has('日期') && hasOneOf(['台幣餘額', '金額']);
        if (type === 'stockHoldings') return has('股票名稱') && hasOneOf(['市值', '市值(台幣)']);
        if (type === 'realizedPnL') return hasOneOf(['已實現損益', '已實現損益(台幣)']);
        if (type === 'transactions') return has('日期');

        return true;
    },

    // Render Triggers (To be linked to specific modules)
    triggerGlobalRender: function () {
        if (this.store.bankAssets.length > 0) {
            if (App.Modules.Bank) {
                App.Modules.Bank.render();
                App.Modules.Bank.renderTrend();
                App.Utils.updateStatus('bankAssets', '✅ 已還原');
            }
        }
        if (this.store.stockHoldings.length > 0) {
            if (App.Modules.Stock) {
                App.Modules.Stock.render();
                App.Utils.updateStatus('stockHoldings', '✅ 已還原');
            }
        }
        if (this.store.realizedPnL.length > 0) {
            if (App.Modules.PnL) {
                App.Modules.PnL.render();
                App.Utils.updateStatus('realizedPnL', '✅ 已還原');
            }
        }
        if (this.store.transactions.length > 0) {
            if (App.Modules.History) {
                App.Modules.History.render();
                App.Utils.updateStatus('transactions', '✅ 已還原');
            }
        }
    },

    triggerRenderByType: function (type) {
        if (type === 'bankAssets' && App.Modules.Bank) {
            App.Modules.Bank.render();
            App.Modules.Bank.renderTrend();
        }
        else if (type === 'stockHoldings' && App.Modules.Stock) App.Modules.Stock.render();
        else if (type === 'realizedPnL' && App.Modules.PnL) App.Modules.PnL.render();
        else if (type === 'transactions' && App.Modules.History) App.Modules.History.render();
    }
};
