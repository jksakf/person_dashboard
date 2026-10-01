/**
 * 個人資產一體化工作台 - 銀行資產視圖模組 (BankView: 銀行帳戶大表、存款機構分佈圖、月份快照切換)
 * 編碼：UTF-8 with BOM
 */

class BankView {
    constructor(app) {
        this.app = app;
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

    getAccountTypeMeta(accountType, isNegative = false) {
        if (isNegative || accountType === '負債') {
            return {
                icon: '💳',
                text: '信用卡/負債',
                tagClass: 'danger',
                style: 'background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid rgba(239,68,68,0.3);'
            };
        }
        switch (accountType) {
            case '定存':
                return {
                    icon: '🏦',
                    text: '定期存款',
                    tagClass: 'warning',
                    style: 'background:rgba(245,158,11,0.15); color:#f59e0b; border:1px solid rgba(245,158,11,0.3);'
                };
            case '證券交割':
                return {
                    icon: '📈',
                    text: '證券交割',
                    tagClass: 'primary',
                    style: 'background:rgba(56,189,248,0.15); color:#38bdf8; border:1px solid rgba(56,189,248,0.3);'
                };
            case '外幣':
                return {
                    icon: '🌐',
                    text: '外幣帳戶',
                    tagClass: 'info',
                    style: 'background:rgba(168,85,247,0.15); color:#c084fc; border:1px solid rgba(168,85,247,0.3);'
                };
            case '活存':
            default:
                return {
                    icon: '💰',
                    text: '活存',
                    tagClass: 'bank',
                    style: 'background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3);'
                };
        }
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
        // 排除舊系統中的股票/ETF 虛擬帳戶，避免與股票現值重複統計
        const items = (this.data.bankAssets || [])
            .filter(b => (b.date || '').startsWith(activeMonth))
            .filter(b => {
                const name = b.bankName || '';
                return !(name.includes('股票') || name.includes('ETF'));
            });

        // 分類統計：存款 (正數) 與 負債/信用卡 (負數)
        let depositTotal = 0, depositCount = 0;
        let liabilityTotal = 0, liabilityCount = 0;

        items.forEach(b => {
            const twdAmt = parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0;
            if (twdAmt >= 0) {
                depositTotal += twdAmt;
                depositCount++;
            } else {
                liabilityTotal += twdAmt;
                liabilityCount++;
            }
        });

        const netLiquidCash = depositTotal + liabilityTotal;

        // 更新頂部 3 大流動性 KPI 看板
        const elDepTotal = document.getElementById('bankKpiDepositTotal');
        const elDepCount = document.getElementById('bankKpiDepositCount');
        const elLiabTotal = document.getElementById('bankKpiLiabilityTotal');
        const elLiabCount = document.getElementById('bankKpiLiabilityCount');
        const elNetCash = document.getElementById('bankKpiNetLiquidCash');

        if (elDepTotal) elDepTotal.textContent = `$${Math.round(depositTotal).toLocaleString()}`;
        if (elDepCount) elDepCount.textContent = `${depositCount} 個存款帳戶`;
        if (elLiabTotal) elLiabTotal.textContent = liabilityTotal === 0 ? '$0' : `-$${Math.round(Math.abs(liabilityTotal)).toLocaleString()}`;
        if (elLiabCount) elLiabCount.textContent = `${liabilityCount} 個負債/應繳帳戶`;
        if (elNetCash) elNetCash.textContent = `$${Math.round(netLiquidCash).toLocaleString()}`;

        // 依折合台幣金額由大到小降冪排序 (大額主力帳戶置頂)
        const sortedItems = [...items].sort((a, b) => {
            const amtA = parseFloat(a.twdAmount) || parseFloat(a.originalAmount) || 0;
            const amtB = parseFloat(b.twdAmount) || parseFloat(b.originalAmount) || 0;
            return amtB - amtA;
        });

        if (summaryStats) {
            summaryStats.textContent = `當期總計 ${items.length} 帳戶 ｜ 純存款: $${Math.round(depositTotal).toLocaleString()} ｜ 負債: $${Math.round(liabilityTotal).toLocaleString()} ｜ 淨流動資金: $${Math.round(netLiquidCash).toLocaleString()}`;
        }

        // 渲染各大銀行存款佔比甜甜圈圖與排行清單
        this.renderBankShareChart(sortedItems, depositTotal, liabilityTotal);

        if (sortedItems.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding:2rem; color:var(--text-muted);">本月快照尚無帳戶資料</td></tr>`;
            return;
        }

        let html = '';
        sortedItems.forEach(item => {
            const originalAmt = parseFloat(item.originalAmount) || 0;
            const twdAmt = parseFloat(item.twdAmount) || 0;
            const isNegative = twdAmt < 0;
            const amtColor = isNegative ? 'var(--danger)' : '#38bdf8';
            const meta = this.getAccountTypeMeta(item.accountType, isNegative);
            const tagHtml = `<span class="wb-tag" style="${meta.style}">${meta.icon} ${meta.text}</span>`;

            html += `
            <tr class="wb-inventory-row" onclick="app.openBankDrawerForEdit('${item.id}')">
                <td class="mono">${item.date || ''}</td>
                <td><strong>${item.bankName || ''}</strong></td>
                <td>${tagHtml}</td>
                <td class="mono">${item.currency || 'TWD'}</td>
                <td class="text-right mono">${isNegative ? '-' : ''}${Math.abs(originalAmt).toLocaleString()}</td>
                <td class="text-right mono">${item.exchangeRate || 1.0}</td>
                <td class="text-right mono" style="font-weight:700; color:${amtColor};">${isNegative ? '-' : ''}$${Math.round(Math.abs(twdAmt)).toLocaleString()}</td>
                <td style="color:var(--text-muted); font-size:0.82rem;">${item.note || ''}</td>
                <td style="text-align:center;">
                    <button class="wb-btn sm" onclick="event.stopPropagation(); app.openBankDrawerForEdit('${item.id}')">✏️ 編輯</button>
                    <button class="wb-btn sm danger" onclick="event.stopPropagation(); app.deleteBankAsset('${item.id}')">🗑️</button>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
    }

    renderBankShareChart(sortedItems = [], totalDeposit = 0, totalLiability = 0) {
        const canvas = document.getElementById('bankShareChart');
        const rankList = document.getElementById('bankRankList');
        const badgeDeposit = document.getElementById('bankTotalDepositBadge');
        const badgeCount = document.getElementById('bankAccountCountBadge');
        if (!canvas) return;

        if (badgeDeposit) {
            badgeDeposit.textContent = `純存款: $${Math.round(totalDeposit).toLocaleString()}`;
        }
        if (badgeCount) {
            badgeCount.textContent = `共 ${sortedItems.length} 個帳戶`;
        }

        // 正數純存款 (用於圓餅圖切片分析與主力排行)
        const positiveItems = sortedItems.filter(item => (parseFloat(item.twdAmount) || 0) > 0);
        // 負債帳戶 (信用卡)
        const debtItems = sortedItems.filter(item => (parseFloat(item.twdAmount) || 0) < 0);
        // 備用無餘額帳戶 ($0)
        const zeroItems = sortedItems.filter(item => (parseFloat(item.twdAmount) || 0) === 0);

        if (this.charts.bankShare) {
            this.charts.bankShare.destroy();
            this.charts.bankShare = null;
        }

        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDark ? '#94a3b8' : '#64748b';

        const palette = [
            '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
            '#d946ef', '#ec4899', '#f43f5e', '#10b981', '#14b8a6',
            '#06b6d4', '#f59e0b', '#84cc16'
        ];

        const labels = positiveItems.map(item => {
            const val = parseFloat(item.twdAmount) || 0;
            const pct = totalDeposit > 0 ? ((val / totalDeposit) * 100).toFixed(1) : '0.0';
            return `${item.bankName} (${pct}%)`;
        });
        const dataValues = positiveItems.map(item => Math.round(parseFloat(item.twdAmount) || 0));
        const colors = positiveItems.map((_, i) => palette[i % palette.length]);

        // 圓心自訂插件：在甜甜圈圖中心繪製純存款總計
        const bankCenterPlugin = {
            id: 'bankCenterText',
            beforeDraw: (chart) => {
                const { width, height, ctx } = chart;
                ctx.save();
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                const centerX = width / 2;
                const chartArea = chart.chartArea;
                const centerY = chartArea ? (chartArea.top + chartArea.bottom) / 2 : height / 2;

                ctx.font = '500 11px "Noto Sans TC", sans-serif';
                ctx.fillStyle = textColor;
                ctx.fillText('純存款總額', centerX, centerY - 11);

                ctx.font = '700 16px "Roboto Mono", monospace';
                ctx.fillStyle = '#38bdf8';
                ctx.fillText(`$${Math.round(totalDeposit).toLocaleString()}`, centerX, centerY + 12);
                ctx.restore();
            }
        };

        const bankChartPlugins = [bankCenterPlugin];
        if (typeof ChartDataLabels !== 'undefined') {
            bankChartPlugins.push(ChartDataLabels);
        }

        const ctx = canvas.getContext('2d');
        if (positiveItems.length > 0) {
            this.charts.bankShare = new Chart(ctx, {
                type: 'doughnut',
                plugins: bankChartPlugins,
                data: {
                    labels: labels,
                    datasets: [{
                        data: dataValues,
                        backgroundColor: colors,
                        borderWidth: 2,
                        borderColor: isDark ? '#1e293b' : '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '62%',
                    plugins: {
                        legend: {
                            display: true,
                            position: 'bottom',
                            labels: {
                                color: textColor,
                                font: { family: "'Noto Sans TC', sans-serif", size: 11 },
                                boxWidth: 10,
                                padding: 8
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: (context) => {
                                    const val = context.raw || 0;
                                    const pct = totalDeposit > 0 ? ((val / totalDeposit) * 100).toFixed(1) : 0;
                                    const labelName = context.label ? context.label.split(' (')[0] : '';
                                    return ` ${labelName}: $${val.toLocaleString()} (${pct}%)`;
                                }
                            }
                        },
                        datalabels: {
                            display: (context) => {
                                const val = context.dataset.data[context.dataIndex] || 0;
                                const pct = totalDeposit > 0 ? (val / totalDeposit) * 100 : 0;
                                return pct >= 6; // 大於等於 6% 才在切片上繪製標籤，避免重疊
                            },
                            color: '#ffffff',
                            font: {
                                weight: 'bold',
                                size: 11,
                                family: "'Roboto Mono', 'Noto Sans TC', sans-serif"
                            },
                            formatter: (val) => {
                                const pct = totalDeposit > 0 ? ((val / totalDeposit) * 100).toFixed(1) : 0;
                                return `${pct}%`;
                            },
                            textShadowBlur: 3,
                            textShadowColor: 'rgba(0,0,0,0.7)'
                        }
                    }
                }
            });
        }

        // 渲染右側資金分佈排行清單 (主力存款、負債警戒、備用帳戶清晰分組)
        if (rankList) {
            if (sortedItems.length === 0) {
                rankList.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text-muted);">無帳戶資料</div>`;
                return;
            }

            let rankHtml = '';

            // 1. 主力正數存款排行 (依金額降冪置頂)
            positiveItems.forEach((item, idx) => {
                const amt = parseFloat(item.twdAmount) || 0;
                const pct = totalDeposit > 0 ? ((amt / totalDeposit) * 100).toFixed(1) : '0.0';
                const dotColor = palette[idx % palette.length];

                rankHtml += `
                <div style="background:rgba(255,255,255,0.02); padding:0.45rem 0.65rem; border-radius:6px; border:1px solid rgba(255,255,255,0.05);">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.25rem;">
                        <div style="display:flex; align-items:center; gap:0.4rem;">
                            <span class="mono" style="font-size:0.75rem; font-weight:700; color:var(--text-muted); width:16px;">#${idx + 1}</span>
                            <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:${dotColor};"></span>
                            <span style="font-weight:600; font-size:0.85rem;">${item.bankName}</span>
                            <span class="wb-tag" style="${this.getAccountTypeMeta(item.accountType, false).style}; font-size:0.68rem; padding:0.1rem 0.35rem;">${this.getAccountTypeMeta(item.accountType, false).icon} ${this.getAccountTypeMeta(item.accountType, false).text}</span>
                        </div>
                        <div style="text-align:right;">
                            <span class="mono" style="font-weight:700; font-size:0.88rem; color:#38bdf8;">$${Math.round(amt).toLocaleString()}</span>
                            <span style="font-size:0.75rem; color:var(--text-muted); margin-left:0.3rem;">(${pct}%)</span>
                        </div>
                    </div>
                    <div style="height:4px; background:rgba(255,255,255,0.08); border-radius:2px; overflow:hidden;">
                        <div style="width:${pct}%; height:100%; background:${dotColor}; border-radius:2px;"></div>
                    </div>
                </div>`;
            });

            // 2. 信用卡應繳負債專屬警戒區 (若有負債帳戶)
            if (debtItems.length > 0) {
                const absTotalLiab = Math.abs(totalLiability) || 1;
                rankHtml += `
                <div style="margin-top:0.35rem; padding-top:0.4rem; border-top:1px dashed rgba(239,68,68,0.3);">
                    <div style="font-size:0.75rem; font-weight:700; color:var(--danger); margin-bottom:0.3rem; display:flex; justify-content:space-between;">
                        <span>💳 信用卡應繳與即期負債</span>
                        <span class="mono">小計 -$${Math.round(absTotalLiab).toLocaleString()}</span>
                    </div>`;

                debtItems.forEach(item => {
                    const amt = parseFloat(item.twdAmount) || 0;
                    const absAmt = Math.abs(amt);
                    const debtPct = ((absAmt / absTotalLiab) * 100).toFixed(1);

                    rankHtml += `
                    <div style="background:rgba(239,68,68,0.04); padding:0.4rem 0.65rem; border-radius:6px; border:1px solid rgba(239,68,68,0.15); margin-bottom:0.35rem;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.2rem;">
                            <div style="display:flex; align-items:center; gap:0.4rem;">
                                <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:var(--danger);"></span>
                                <span style="font-weight:600; font-size:0.83rem;">${item.bankName}</span>
                                <span class="wb-tag danger" style="font-size:0.65rem; padding:0.08rem 0.3rem;">負債</span>
                            </div>
                            <div style="text-align:right;">
                                <span class="mono" style="font-weight:700; font-size:0.85rem; color:var(--danger);">-$${Math.round(absAmt).toLocaleString()}</span>
                                <span style="font-size:0.73rem; color:var(--text-muted); margin-left:0.3rem;">(${debtPct}%)</span>
                            </div>
                        </div>
                        <div style="height:3px; background:rgba(239,68,68,0.15); border-radius:2px; overflow:hidden;">
                            <div style="width:${debtPct}%; height:100%; background:var(--danger); border-radius:2px;"></div>
                        </div>
                    </div>`;
                });

                rankHtml += `</div>`;
            }

            // 3. 備用零餘額帳戶 ($0)
            if (zeroItems.length > 0) {
                const zeroNames = zeroItems.map(z => z.bankName).join('、');
                rankHtml += `
                <div style="font-size:0.73rem; color:var(--text-muted); padding:0.25rem 0.4rem; background:rgba(255,255,255,0.01); border-radius:4px; border:1px solid rgba(255,255,255,0.03); margin-top:0.3rem;">
                    ⚪ 備用無餘額帳戶 (${zeroItems.length} 個): ${zeroNames} ($0)
                </div>`;
            }

            rankList.innerHTML = rankHtml;
            rankList.scrollTop = 0; // 確保滾動條預設置頂，優先看到排名第 1 的主力存款！
        }
    }

}

if (typeof window !== "undefined") {
    window.BankView = BankView;
}
