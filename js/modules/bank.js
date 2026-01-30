// Bank Assets Logic
App.Modules.Bank = {
    render: function (targetDate = null) {
        const data = App.Data.store.bankAssets;
        if (!data || data.length === 0) return;

        // 1. 找出所有日期並排序 (新 -> 舊)
        const uniqueDates = [...new Set(data.map(item => item['日期']))].sort().reverse();

        // 2. 更新下拉選單
        const selectEl = document.getElementById('bankDateSelect');
        // 如果選單選項跟日期數不合，重繪
        const currentOptions = selectEl.querySelectorAll('option:not([value=""])');
        if (currentOptions.length !== uniqueDates.length) {
            selectEl.innerHTML = ''; // 清空
            uniqueDates.forEach(date => {
                const option = document.createElement('option');
                option.value = date;
                option.textContent = date;
                selectEl.appendChild(option);
            });
            // 預設選取最新
            selectEl.value = uniqueDates[0];
        }

        // 3. 決定要顯示的日期
        const selectedDate = targetDate || selectEl.value || uniqueDates[0];
        if (selectEl.value !== selectedDate) selectEl.value = selectedDate;

        // 4. 過濾該日期的資料
        const currentData = data.filter(item => item['日期'] === selectedDate);
        if (currentData.length === 0) {
            alert('查無該日期的銀行資產資料');
            return;
        }

        // 5. 計算總資產 (Support both '台幣餘額' and '金額')
        const totalAssets = currentData.reduce((sum, item) => sum + App.Utils.parseMoney(item['台幣餘額'] || item['金額']), 0);

        // 6. 更新 UI
        App.Utils.animateMoney('totalBankAssets', totalAssets);
        document.getElementById('assetsDate').textContent = `資料日期: ${selectedDate}`;

        // Show Content, Hide Skeleton
        const card = document.querySelector('#bankAssetsCard');
        if (card) card.classList.remove('is-loading');

        // 7. 繪製圓餅圖 (依幣別或銀行/帳戶)
        this.renderPieChart(currentData, totalAssets);

        // 8. 繪製明細表格
        this.renderTable(currentData);
    },

    renderPieChart: function (currentData, totalAssets) {
        const currencyMap = {};
        currentData.forEach(item => {
            // Fallback to 'TWD' if currency is missing, or use Account Name if simple format
            let key = item['幣別'];
            if (!key) {
                key = item['帳戶名稱'] || item['銀行名稱'] || 'Unknown';
            }

            const amount = App.Utils.parseMoney(item['台幣餘額'] || item['金額']);
            if (!currencyMap[key]) currencyMap[key] = 0;
            currencyMap[key] += amount;
        });

        const labels = Object.keys(currencyMap);
        const values = Object.values(currencyMap);

        const ctx = document.getElementById('bankPieChart').getContext('2d');
        if (App.Charts['bankPie']) {
            App.Charts['bankPie'].destroy();
        }

        App.Charts['bankPie'] = new Chart(ctx, {
            type: 'pie',
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                        '#FF9F40', '#FF5733', '#33FF57', '#3357FF', '#F333FF',
                        '#8A2BE2', '#A52A2A', '#DEB887', '#5F9EA0', '#7FFF00',
                        '#D2691E', '#FF7F50', '#6495ED', '#DC143C', '#00FFFF'
                    ],
                    borderWidth: 1,
                    borderColor: '#1e293b'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            color: '#f1f5f9',
                            padding: 20,
                            font: { size: 14 }
                        }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) {
                                    label += ': ';
                                }
                                const value = context.raw;
                                const percentage = ((value / totalAssets) * 100).toFixed(1) + '%';
                                label += `$${value.toLocaleString()} (${percentage})`;
                                return label;
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        color: '#fff',
                        font: { weight: 'bold', size: 14 },
                        formatter: (value, ctx) => {
                            let sum = 0;
                            let dataArr = ctx.chart.data.datasets[0].data;
                            dataArr.map(data => { sum += data; });
                            let percentageVal = (value / sum);
                            if (percentageVal < 0.05) return null; // Hide if < 3%
                            return (percentageVal * 100).toFixed(1) + "%";
                        },
                        textAlign: 'center'
                    }
                }
            }
        });
    },

    renderTable: function (data) {
        const container = document.getElementById('bankTableContainer');
        let tableHTML = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                <thead style="background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: #38bdf8;">
                    <tr>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #334155;">帳戶名稱</th>
                        <th style="padding: 12px; text-align: left; border-bottom: 2px solid #334155;">類別/幣別</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #334155;">原幣金額</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #334155;">匯率</th>
                        <th style="padding: 12px; text-align: right; border-bottom: 2px solid #334155;">台幣金額</th>
                    </tr>
                </thead>
                <tbody>
        `;

        // Sort by TWD Amount Descending
        const sortedData = [...data].sort((a, b) => {
            const valA = App.Utils.parseMoney(a['台幣餘額'] || a['金額']);
            const valB = App.Utils.parseMoney(b['台幣餘額'] || b['金額']);
            return valB - valA;
        });

        sortedData.forEach(item => {
            const name = item['帳戶名稱'] || item['銀行名稱'] || '-';
            const type = item['帳戶類別'] || item['幣別'] || 'TWD'; // Fallback
            const originalAmount = item['原幣餘額'] ? App.Utils.parseMoney(item['原幣餘額']).toLocaleString() : '-';
            const rate = item['匯率'] || '-';
            const twdAmount = App.Utils.parseMoney(item['台幣餘額'] || item['金額']).toLocaleString();

            tableHTML += `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 12px;">${name}</td>
                    <td style="padding: 12px;"><span style="background:rgba(56, 189, 248, 0.2); color:#38bdf8; padding:2px 8px; border-radius:12px; font-size:0.8em;">${type}</span></td>
                    <td style="padding: 12px; text-align: right;">${originalAmount}</td>
                    <td style="padding: 12px; text-align: right;">${rate}</td>
                    <td style="padding: 12px; text-align: right; font-weight: bold; color: #f1f5f9;">$${twdAmount}</td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    },

    // 渲染資產趨勢圖 (Area Chart) + Sparkline Logic
    renderTrend: function () {
        const data = App.Data.store.bankAssets;
        if (!data || data.length === 0) return;

        // 1. 整理每日總資產
        const dailyTotals = {};
        data.forEach(item => {
            const date = item['日期']; // assume 'YYYY/MM/DD' or 'YYYY-MM-DD'
            const amount = App.Utils.parseMoney(item['台幣餘額'] || item['金額']);
            if (!dailyTotals[date]) dailyTotals[date] = 0;
            dailyTotals[date] += amount;
        });

        // Sort dates and Filter out 0 values
        const allDates = Object.keys(dailyTotals).sort();
        const sortedDates = allDates.filter(d => dailyTotals[d] > 0);
        const sortedAmounts = sortedDates.map(d => dailyTotals[d]);

        // Update Sparkline
        this.updateSparkline(dailyTotals, sortedDates[sortedDates.length - 1], sortedDates);

        const ctx = document.getElementById('assetTrendChart').getContext('2d');
        if (App.Charts['assetTrend']) {
            App.Charts['assetTrend'].destroy();
        }

        // Gradient
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.5)');
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

        App.Charts['assetTrend'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: sortedDates,
                datasets: [{
                    label: '總資產 (TWD)',
                    data: sortedAmounts,
                    borderColor: '#38bdf8',
                    backgroundColor: gradient,
                    borderWidth: 3,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#1e293b',
                    pointBorderColor: '#38bdf8',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                        backgroundColor: 'rgba(30, 41, 59, 0.9)',
                        titleColor: '#f1f5f9',
                        bodyColor: '#f1f5f9',
                        borderColor: 'rgba(255,255,255,0.1)',
                        borderWidth: 1,
                        callbacks: {
                            label: function (context) {
                                return `總資產: $${context.raw.toLocaleString()}`;
                            }
                        }
                    },
                    datalabels: {
                        display: true, // Show labels
                        align: 'top',
                        color: '#fff',
                        backgroundColor: 'rgba(30, 41, 59, 0.7)',
                        borderRadius: 4,
                        font: { weight: 'bold', size: 12 },
                        padding: 4,
                        formatter: function (value) {
                            return '$' + (value / 10000).toFixed(0) + '萬';
                        }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    y: {
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: {
                            color: '#94a3b8',
                            callback: function (value) {
                                return '$' + (value / 10000).toFixed(0) + '萬';
                            }
                        },
                        beginAtZero: false
                    }
                },
                interaction: {
                    intersect: false,
                    mode: 'index',
                },
            }
        });
    },

    updateSparkline: function (dailyTotals, lastDate, sortedDataDates) {
        const recentDates = [];
        const recentAmounts = [];
        let currentBalance = 0;

        const windowStartDate = new Date(lastDate);
        windowStartDate.setDate(windowStartDate.getDate() - 30);

        for (let i = 29; i >= 0; i--) {
            const d = new Date(lastDate);
            d.setDate(d.getDate() - i);

            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const dateStr = `${y}/${m}/${day}`;
            const dateStrDash = `${y}-${m}-${day}`;

            recentDates.push(dateStr);

            if (dailyTotals[dateStr] !== undefined) {
                currentBalance = dailyTotals[dateStr];
            } else if (dailyTotals[dateStrDash] !== undefined) {
                currentBalance = dailyTotals[dateStrDash];
            } else {
                if (currentBalance === 0 && recentAmounts.length === 0) {
                    const targetTime = d.getTime();
                    let bestMatch = null;
                    for (let k = sortedDataDates.length - 1; k >= 0; k--) {
                        const pDate = new Date(sortedDataDates[k].replace(/-/g, '/'));
                        if (pDate.getTime() <= targetTime) {
                            bestMatch = sortedDataDates[k];
                            break;
                        }
                    }
                    if (bestMatch) {
                        currentBalance = dailyTotals[bestMatch];
                    }
                }
            }
            recentAmounts.push(currentBalance);
        }

        const ctx = document.getElementById('totalAssetSparkline').getContext('2d');

        if (App.Charts['totalAssetSparkline']) {
            App.Charts['totalAssetSparkline'].destroy();
        }

        const gradient = ctx.createLinearGradient(0, 0, 0, 60);
        gradient.addColorStop(0, 'rgba(56, 189, 248, 0.5)');
        gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

        App.Charts['totalAssetSparkline'] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: recentDates,
                datasets: [{
                    data: recentAmounts,
                    borderColor: '#38bdf8',
                    borderWidth: 2,
                    backgroundColor: gradient,
                    fill: true,
                    pointRadius: 0,
                    pointHoverRadius: 4,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        intersect: false,
                        displayColors: false,
                        callbacks: {
                            title: () => '',
                            label: (ctx) => `$${ctx.raw.toLocaleString()}`
                        }
                    },
                    datalabels: { display: false }
                },
                scales: {
                    x: {
                        display: false
                    },
                    y: {
                        display: false,
                        min: Math.min(...recentAmounts) * 0.95
                    }
                },
                layout: { padding: 0 }
            }
        });
    }
};
