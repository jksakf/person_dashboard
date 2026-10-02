/**
 * 個人資產一體化工作台 - 天天記帳視圖模組 (DailyLedgerView: 收支月曆熱力圖、當日時間軸明細與雙軌銀行連動)
 * 編碼：UTF-8 with BOM
 */

class DailyLedgerView {
    constructor(app) {
        this.app = app;
        this.currentMonth = this.getCurrentMonthStr();
        this.selectedDate = this.getTodayDateStr();
        
        // 常用分類定義
        this.categories = {
            expense: ['🍜 飲食', '🚗 交通', '🛍️ 購物', '☕ 飲品點心', '🏠 居住水電', '🎬 休閒娛樂', '💊 醫療保健', '📚 學習教育', '📱 通信網路', '📦 其他支出'],
            income: ['💼 薪資', '🎁 年終獎金', '📈 投資收益', '🤝 兼職外快', '🧧 禮金紅包', '💵 其他收入'],
            transfer: ['🔄 帳戶互轉', '💳 繳信用卡費', '📉 證券交割存入', '💰 提領現金']
        };
    }

    get data() {
        if (this._data) return this._data;
        if (this.app && this.app.data) return this.app.data;
        if (typeof window !== 'undefined' && window.app && window.app.data) return window.app.data;
        return { dailyRecords: [], meta: {} };
    }
    set data(val) {
        this._data = val;
    }

    getTodayDateStr() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        const d = String(now.getDate()).padStart(2, '0');
        return `${y}/${m}/${d}`;
    }

    getCurrentMonthStr() {
        const now = new Date();
        const y = now.getFullYear();
        const m = String(now.getMonth() + 1).padStart(2, '0');
        return `${y}-${m}`;
    }

    // ==========================================
    // 渲染天天記帳主畫面 (月曆 + 當日流水)
    // ==========================================
    renderDailyLedger() {
        if (!this.currentMonth) this.currentMonth = this.getCurrentMonthStr();
        if (!this.selectedDate) this.selectedDate = this.getTodayDateStr();
        const records = this.data.dailyRecords || [];
        const monthPrefix = this.currentMonth.replace('-', '/'); // '2026/10'

        // 1. 當月收支指標彙總計算
        let totalExpense = 0;
        let totalIncome = 0;
        let monthRecordCount = 0;

        records.forEach(r => {
            if ((r.date || '').startsWith(monthPrefix)) {
                monthRecordCount++;
                const amt = parseFloat(r.amount) || 0;
                if (r.type === 'expense') {
                    totalExpense += amt;
                } else if (r.type === 'income') {
                    totalIncome += amt;
                }
            }
        });

        const netSavings = totalIncome - totalExpense;
        const savingsRate = totalIncome > 0 ? ((netSavings / totalIncome) * 100).toFixed(1) : '0.0';

        // 2. 更新頂部月度戰報看板
        const titleEl = document.getElementById('calMonthTitle');
        if (titleEl) {
            const [y, m] = this.currentMonth.split('-');
            titleEl.textContent = `${y} 年 ${parseInt(m, 10)} 月`;
        }

        const expEl = document.getElementById('calTotalExpense');
        const incEl = document.getElementById('calTotalIncome');
        const savEl = document.getElementById('calNetSavings');
        const rateEl = document.getElementById('calSavingsRate');
        const countEl = document.getElementById('calRecordCount');

        if (expEl) expEl.textContent = `-$${Math.round(totalExpense).toLocaleString()}`;
        if (incEl) incEl.textContent = `+$${Math.round(totalIncome).toLocaleString()}`;
        if (savEl) {
            savEl.textContent = `${netSavings >= 0 ? '+' : '-'}$${Math.abs(Math.round(netSavings)).toLocaleString()}`;
            savEl.style.color = netSavings >= 0 ? 'var(--success)' : 'var(--danger)';
        }
        if (rateEl) rateEl.textContent = `${savingsRate}%`;
        if (countEl) countEl.textContent = `${monthRecordCount} 筆`;

        // 3. 渲染月曆網格
        this.renderCalendarGrid(records, monthPrefix);

        // 4. 渲染右側當日時間軸流水
        this.renderTimelineFeed(records);
    }

    // ==========================================
    // 渲染當月月曆網格 (含熱力圖邊線與金額)
    // ==========================================
    renderCalendarGrid(records, monthPrefix) {
        const gridEl = document.getElementById('calendarDaysGrid');
        if (!gridEl) return;

        const [yearStr, monthStr] = this.currentMonth.split('-');
        const year = parseInt(yearStr, 10);
        const month = parseInt(monthStr, 10); // 1-12

        // 本月第一天與最後一天
        const firstDayIndex = new Date(year, month - 1, 1).getDay(); // 0(日) - 6(六)
        const daysInMonth = new Date(year, month, 0).getDate();
        const daysInPrevMonth = new Date(year, month - 1, 0).getDate();

        // 整理當月各日期的支出、收入與轉帳
        const dailySummary = {};
        records.forEach(r => {
            if ((r.date || '').startsWith(monthPrefix)) {
                const d = r.date;
                if (!dailySummary[d]) {
                    dailySummary[d] = { expense: 0, income: 0, hasTransfer: false };
                }
                const amt = parseFloat(r.amount) || 0;
                if (r.type === 'expense') {
                    dailySummary[d].expense += amt;
                } else if (r.type === 'income') {
                    dailySummary[d].income += amt;
                } else if (r.type === 'transfer') {
                    dailySummary[d].hasTransfer = true;
                }
            }
        });

        const todayStr = new Date().toISOString().slice(0, 10).replace(/-/g, '/');
        let html = '';

        // 1. 上個月填充格子
        for (let i = firstDayIndex - 1; i >= 0; i--) {
            const prevDayNum = daysInPrevMonth - i;
            html += `
            <div class="wb-calendar-day other-month">
                <div class="wb-day-header">
                    <span class="wb-day-number">${prevDayNum}</span>
                </div>
            </div>`;
        }

        // 2. 本月各日期格子
        for (let day = 1; day <= daysInMonth; day++) {
            const dayFormatted = day < 10 ? `0${day}` : `${day}`;
            const fullDateStr = `${monthPrefix}/${dayFormatted}`;
            const summary = dailySummary[fullDateStr] || { expense: 0, income: 0, hasTransfer: false };
            const isSelected = this.selectedDate === fullDateStr;
            const isToday = todayStr === fullDateStr;

            const exp = summary.expense || 0;
            const inc = summary.income || 0;
            const net = inc - exp;
            const hasExp = exp > 0;
            const hasInc = inc > 0;

            // 計算熱力與狀態邊線
            let heatClass = '';
            if (net > 0) {
                heatClass = 'net-positive-ambient income-only';
            } else if (exp > 3000) {
                heatClass = 'heat-4';
            } else if (exp > 1500) {
                heatClass = 'heat-3';
            } else if (exp > 500) {
                heatClass = 'heat-2';
            } else if (exp > 0) {
                heatClass = 'heat-1';
            }

            // 例外導向警示微章 (Exception-based Alerts)
            let badgeHtml = '';
            if (inc >= 5000) {
                badgeHtml += `<span class="wb-day-badge-icon" title="大額進帳: +$${Math.round(inc).toLocaleString()}">💰</span>`;
            }
            if (exp > 3000) {
                badgeHtml += `<span class="wb-day-badge-icon" title="警戒超支: -$${Math.round(exp).toLocaleString()}">🔥</span>`;
            }

            // 組織當日金額與階層化標籤
            let amountHtml = '';
            let titleText = `${fullDateStr}`;

            if (hasInc && hasExp) {
                // 雙向收支：Hero 顯示淨額，下方以精緻髮絲字體並列收入與支出明細
                const netSign = net >= 0 ? '+' : '-';
                const netClass = net >= 0 ? 'net-positive' : 'net-negative';
                titleText += ` ｜ 收入: +$${Math.round(inc).toLocaleString()} ｜ 支出: -$${Math.round(exp).toLocaleString()} ｜ 淨收支: ${netSign}$${Math.round(Math.abs(net)).toLocaleString()}`;
                amountHtml = `
                <div class="wb-day-hero-net ${netClass}">
                    ${netSign}$${Math.round(Math.abs(net)).toLocaleString()}
                </div>
                <div class="wb-day-hairline-breakdown">
                    <span class="wb-hairline-inc">+${Math.round(inc).toLocaleString()}</span>
                    <span class="wb-hairline-sep">｜</span>
                    <span class="wb-hairline-exp">-${Math.round(exp).toLocaleString()}</span>
                </div>`;
            } else if (hasInc) {
                // 純收入
                titleText += ` ｜ 當日收入: +$${Math.round(inc).toLocaleString()}`;
                amountHtml = `
                <div class="wb-day-hero-net net-positive">
                    +$${Math.round(inc).toLocaleString()}
                </div>`;
            } else if (hasExp) {
                // 純支出
                titleText += ` ｜ 當日支出: -$${Math.round(exp).toLocaleString()}`;
                amountHtml = `
                <div class="wb-day-hero-net net-negative">
                    -$${Math.round(exp).toLocaleString()}
                </div>`;
            } else if (summary.hasTransfer) {
                titleText += ` ｜ 帳戶轉帳`;
                amountHtml = `<div class="wb-day-transfer-tag">🔄 轉帳</div>`;
            }

            html += `
            <div class="wb-calendar-day ${heatClass} ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}" 
                 onclick="app.selectLedgerDate('${fullDateStr}')"
                 title="${titleText}">
                <div class="wb-day-header">
                    <span class="wb-day-number">${day}</span>
                    <div class="wb-day-badges">
                        ${badgeHtml}
                    </div>
                </div>
                <div class="wb-day-body">
                    ${amountHtml}
                </div>
            </div>`;
        }

        // 3. 次月填充格子 (維持完整 35 或 42 格)
        const totalRendered = firstDayIndex + daysInMonth;
        const totalCells = totalRendered > 35 ? 42 : 35;
        const nextMonthPadding = totalCells - totalRendered;
        for (let j = 1; j <= nextMonthPadding; j++) {
            html += `
            <div class="wb-calendar-day other-month">
                <div class="wb-day-header">
                    <span class="wb-day-number">${j}</span>
                </div>
            </div>`;
        }

        gridEl.innerHTML = html;
    }

    // ==========================================
    // 渲染右側選中日期的時間軸流水明細
    // ==========================================
    renderTimelineFeed(records) {
        const feedEl = document.getElementById('timelineRecordFeed');
        const titleEl = document.getElementById('timelineSelectedDateTitle');
        const dayTotalEl = document.getElementById('timelineDayTotal');
        if (!feedEl) return;

        // 計算選中日期的星期幾
        const [y, m, d] = this.selectedDate.split('/').map(n => parseInt(n, 10));
        const dateObj = new Date(y, m - 1, d);
        const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
        const weekdayStr = weekdays[dateObj.getDay()] || '';

        if (titleEl) {
            titleEl.textContent = `📝 ${this.selectedDate} (${weekdayStr}) 記帳明細`;
        }

        // 篩選當日明細
        const dayRecords = records.filter(r => r.date === this.selectedDate);
        let dayExpense = 0;
        let dayIncome = 0;

        dayRecords.forEach(r => {
            const amt = parseFloat(r.amount) || 0;
            if (r.type === 'expense') dayExpense += amt;
            else if (r.type === 'income') dayIncome += amt;
        });

        if (dayTotalEl) {
            let parts = [];
            if (dayExpense > 0) parts.push(`支出: -$${Math.round(dayExpense).toLocaleString()}`);
            if (dayIncome > 0) parts.push(`收入: +$${Math.round(dayIncome).toLocaleString()}`);
            if (dayExpense > 0 && dayIncome > 0) {
                const net = dayIncome - dayExpense;
                parts.push(`淨現金流: ${net >= 0 ? '+' : '-'}$${Math.round(Math.abs(net)).toLocaleString()}`);
            } else if (dayExpense === 0 && dayIncome === 0) {
                parts.push(`無收支`);
            }
            dayTotalEl.innerHTML = parts.map(p => `<span>${p}</span>`).join(' <span style="opacity:0.4;">｜</span> ');
        }

        if (dayRecords.length === 0) {
            feedEl.innerHTML = `
            <div class="wb-empty-state">
                <div style="font-size:2rem; margin-bottom:0.5rem;">🎉</div>
                <div>本日尚無任何收支紀錄</div>
                <div style="font-size:0.75rem; margin-top:0.25rem;">享受無消費生活，或點擊下方按鈕開始記帳！</div>
            </div>`;
            return;
        }

        let html = '';
        dayRecords.forEach(r => {
            const amt = parseFloat(r.amount) || 0;
            let icon = '💵';
            let amtClass = 'expense';
            let amtPrefix = '-$';

            if (r.type === 'income') {
                amtClass = 'income';
                amtPrefix = '+$';
                icon = '💰';
            } else if (r.type === 'transfer') {
                amtClass = 'transfer';
                amtPrefix = '$';
                icon = '🔄';
            }

            // 提取分類圖示
            const catStr = r.category || '';
            const match = catStr.match(/^(\p{Emoji_Presentation}|\p{Extended_Pictographic})/u);
            if (match) {
                icon = match[0];
            }

            html += `
            <div class="wb-record-card">
                <div class="wb-record-left">
                    <div class="wb-record-cat-icon">${icon}</div>
                    <div class="wb-record-info">
                        <div class="wb-record-title">${r.category || '一般支出'} ${r.note ? `<span style="font-weight:normal; color:var(--text-muted); font-size:0.8rem;">· ${r.note}</span>` : ''}</div>
                        <div class="wb-record-meta">
                            <span>💳 ${r.account || '未指定帳戶'}</span>
                            ${r.toAccount ? `<span>➔ ${r.toAccount}</span>` : ''}
                        </div>
                    </div>
                </div>
                <div class="wb-record-right">
                    <div class="wb-record-amount ${amtClass}">${amtPrefix}${Math.round(amt).toLocaleString()}</div>
                    <div class="wb-record-actions">
                        <button type="button" class="wb-btn xs" onclick="app.openDailyDrawerForEdit('${r.id}')" title="編輯此筆記帳">✏️</button>
                        <button type="button" class="wb-btn xs danger" onclick="app.deleteDailyRecord('${r.id}')" title="刪除此筆記帳">🗑️</button>
                    </div>
                </div>
            </div>`;
        });

        feedEl.innerHTML = html;
    }

    // ==========================================
    // 月曆與日期切換互動
    // ==========================================
    selectLedgerDate(dateStr) {
        this.selectedDate = dateStr;
        this.renderDailyLedger();
    }

    prevLedgerMonth() {
        const [y, m] = this.currentMonth.split('-').map(n => parseInt(n, 10));
        let prevYear = y;
        let prevMonth = m - 1;
        if (prevMonth < 1) {
            prevMonth = 12;
            prevYear--;
        }
        this.currentMonth = `${prevYear}-${prevMonth < 10 ? '0' + prevMonth : prevMonth}`;
        this.selectedDate = `${this.currentMonth.replace('-', '/')}/01`;
        this.renderDailyLedger();
    }

    nextLedgerMonth() {
        const [y, m] = this.currentMonth.split('-').map(n => parseInt(n, 10));
        let nextYear = y;
        let nextMonth = m + 1;
        if (nextMonth > 12) {
            nextMonth = 1;
            nextYear++;
        }
        this.currentMonth = `${nextYear}-${nextMonth < 10 ? '0' + nextMonth : nextMonth}`;
        this.selectedDate = `${this.currentMonth.replace('-', '/')}/01`;
        this.renderDailyLedger();
    }

    jumpToToday() {
        this.currentMonth = this.getCurrentMonthStr();
        this.selectedDate = this.getTodayDateStr();
        this.renderDailyLedger();
    }

    // ==========================================
    // 記帳抽屜表單調度 (呼叫右側抽屜)
    // ==========================================
    openDailyDrawerForCreate(type = 'expense') {
        const randId = Math.floor(Math.random() * 900) + 100;
        const app = this.app || (typeof window !== 'undefined' ? window.app : this);
        app.editingType = 'dailyRecord';
        app.editingItem = {
            id: `rec_${Date.now()}_${randId}`,
            date: this.selectedDate || this.getTodayDateStr(),
            type: type,
            category: type === 'expense' ? '🍜 飲食' : (type === 'income' ? '💼 薪資' : '🔄 帳戶互轉'),
            amount: '',
            account: (this.data.meta && this.data.meta.accountList && this.data.meta.accountList[0]) || '台新Richart',
            toAccount: '',
            note: ''
        };
        if (typeof app.renderDrawerForm === 'function') app.renderDrawerForm();
        if (typeof app.openDrawer === 'function') app.openDrawer();
    }

    openDailyDrawerForEdit(id) {
        const app = this.app || (typeof window !== 'undefined' ? window.app : this);
        const found = (this.data.dailyRecords || []).find(r => r.id === id);
        if (!found) return;
        app.editingType = 'dailyRecord';
        app.editingItem = JSON.parse(JSON.stringify(found));
        if (typeof app.renderDrawerForm === 'function') app.renderDrawerForm();
        if (typeof app.openDrawer === 'function') app.openDrawer();
    }

    // ==========================================
    // 雙軌銀行帳戶即時連動核心邏輯 (Option 3)
    // ==========================================
    applyRecordToBank(record, isRevert = false) {
        if (!record || !record.account || !record.amount) return;
        const amt = parseFloat(record.amount) || 0;
        if (amt === 0) return;

        // 取得該筆記帳所屬月份 (例如 '2026/10')
        const recordMonth = (record.date || '').slice(0, 7).replace('-', '/') || this.getCurrentMonthStr().replace('-', '/');
        
        // 確保該月份已自動開帳 (保護歷史月份快照，不竄改前月)
        const app = this.app || (typeof window !== 'undefined' ? window.app : this);
        if (typeof app.ensureBankAssetsForMonth === 'function') {
            app.ensureBankAssetsForMonth(recordMonth);
        }

        // 取得該月份專屬之帳戶清單
        let targetMonthAssets = (this.data.bankAssets || []).filter(b => (b.date || '').startsWith(recordMonth));
        if (targetMonthAssets.length === 0) {
            const getLatest = typeof this.getLatestBankAssets === 'function'
                ? this.getLatestBankAssets.bind(this)
                : (this.app && typeof this.app.getLatestBankAssets === 'function' ? this.app.getLatestBankAssets.bind(this.app) : null);
            targetMonthAssets = getLatest ? getLatest() : [];
        }
        if (!targetMonthAssets || targetMonthAssets.length === 0) return;

        // 智慧帳戶尋找器：支援完全相等、忽略大小寫與包含字串（例如 Richart 自動匹配 台新Richart）
        const findAccount = (accName) => {
            if (!accName) return null;
            const clean = accName.trim().toLowerCase();
            return targetMonthAssets.find(b => (b.bankName || '').trim().toLowerCase() === clean)
                || targetMonthAssets.find(b => (b.bankName || '').toLowerCase().includes(clean))
                || targetMonthAssets.find(b => clean.includes((b.bankName || '').toLowerCase()));
        };

        const updateAccountBalance = (target, delta) => {
            if (target) {
                const currentTwd = parseFloat(target.twdAmount) || parseFloat(target.originalAmount) || 0;
                target.twdAmount = Math.round(currentTwd + delta);
                target.originalAmount = target.twdAmount;
            }
        };

        const factor = isRevert ? -1 : 1;

        if (record.type === 'expense') {
            // 支出：扣減帳戶 (若帳戶為信用卡負債，減去負值等於負債增加)
            const target = findAccount(record.account);
            if (target) {
                if (!isRevert) record.account = target.bankName; // 正規化帳戶名稱
                const isDebt = target.accountType === '負債' || (target.bankName || '').includes('信用卡') || (target.bankName || '').includes('負債');
                if (isDebt) {
                    // 刷信用卡：負債增加 (數字變得更負)
                    updateAccountBalance(target, -amt * factor);
                } else {
                    // 活存扣除
                    updateAccountBalance(target, -amt * factor);
                }
            }
        } else if (record.type === 'income') {
            // 收入：帳戶增加
            const target = findAccount(record.account);
            if (target) {
                if (!isRevert) record.account = target.bankName;
                updateAccountBalance(target, amt * factor);
            }
        } else if (record.type === 'transfer') {
            // 轉帳：來源扣除，目的增加
            const fromTarget = findAccount(record.account);
            const toTarget = findAccount(record.toAccount);
            if (fromTarget) {
                if (!isRevert) record.account = fromTarget.bankName;
                updateAccountBalance(fromTarget, -amt * factor);
            }
            if (toTarget) {
                if (!isRevert) record.toAccount = toTarget.bankName;
                updateAccountBalance(toTarget, amt * factor);
            }
        }
    }

    // 刪除記帳紀錄
    deleteDailyRecord(id) {
        if (!confirm('確定要刪除此筆記帳嗎？')) return;
        const idx = (this.data.dailyRecords || []).findIndex(r => r.id === id);
        if (idx === -1) return;

        const deleted = this.data.dailyRecords[idx];
        // 1. 自動反向還原銀行帳戶金額
        this.applyRecordToBank(deleted, true);

        // 2. 移除紀錄
        this.data.dailyRecords.splice(idx, 1);

        // 3. 儲存並刷新畫面
        const app = this.app || (typeof window !== 'undefined' ? window.app : this);
        if (typeof app.saveData === 'function') app.saveData();
        this.renderDailyLedger();
        if (typeof app.renderBankTable === 'function') app.renderBankTable();
        if (typeof app.renderTacticalCards === 'function') app.renderTacticalCards();
        if (typeof app.renderMetrics === 'function') app.renderMetrics();
        if (typeof app.showToast === 'function') app.showToast('🗑️ 記帳已刪除，帳戶餘額已自動還原！', 'info');
    }
}

if (typeof window !== "undefined") {
    window.DailyLedgerView = DailyLedgerView;
}
if (typeof module !== "undefined" && module.exports) {
    module.exports = DailyLedgerView;
}
