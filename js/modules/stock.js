// Stock Holdings Logic
App.Modules.Stock = {
    currentChartType: 'pie',

    render: function (targetDate = null) {
        const data = App.Data.store.stockHoldings;
        if (!data || data.length === 0) return;

        // 1. 找出所有日期並排序 (新 -> 舊)
        const uniqueDates = [...new Set(data.map(item => item['日期']))].sort().reverse();

        // 2. 更新下拉選單
        const selectEl = document.getElementById('stockDateSelect');
        if (targetDate === null || selectEl.options.length <= 1) {
            selectEl.innerHTML = '';
            uniqueDates.forEach(date => {
                const option = document.createElement('option');
                option.value = date;
                option.textContent = date;
                selectEl.appendChild(option);
            });
            selectEl.value = uniqueDates[0];
        }

        // 3. 決定要顯示的日期
        const selectedDate = targetDate || selectEl.value || uniqueDates[0];
        if (selectEl.value !== selectedDate) selectEl.value = selectedDate;

        // 4. 過濾該日期的資料
        const currentData = data.filter(item => item['日期'] === selectedDate);
        if (currentData.length === 0) {
            alert('查無該日期的庫存資料');
            return;
        }

        // 5. 計算總市值與總未實現損益
        const totalMarketValue = currentData.reduce((sum, item) => sum + App.Utils.parseMoney(item['市值(台幣)'] || item['市值']), 0);
        const totalUnrealizedPnL = currentData.reduce((sum, item) => sum + App.Utils.parseMoney(item['未實現損益']), 0);

        // 6. 更新 DOM
        App.Utils.animateMoney('totalMarketValue', totalMarketValue);

        const pnlEl = document.getElementById('totalUnrealizedPnL');
        App.Utils.animateMoney('totalUnrealizedPnL', totalUnrealizedPnL, totalUnrealizedPnL >= 0 ? '$' : '-$');
        pnlEl.style.color = totalUnrealizedPnL >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

        const dateEl = document.getElementById('stockDate');
        if (dateEl) dateEl.textContent = `資料日期: ${selectedDate}`;

        // 7. 準備圖表資料
        const stockLabels = currentData.map(item => item['股票名稱'] || item['股票代號']);
        const stockValues = currentData.map(item => App.Utils.parseMoney(item['市值(台幣)'] || item['市值']));

        // 8. 渲染圖表
        if (this.currentChartType === 'pie') {
            this.renderPieChart(stockLabels, stockValues, totalMarketValue);
        } else if (this.currentChartType === 'bar') {
            this.renderBarChart(currentData);
        } else if (this.currentChartType === 'bubble') {
            this.renderBubbleChart(currentData);
        }

        // 9. 繪製明細表格
        this.renderTable(currentData);
    },

    switchChart: function (type) {
        this.currentChartType = type;

        // Update Buttons
        const buttons = {
            'pie': document.getElementById('btn-chart-pie'),
            'bar': document.getElementById('btn-chart-bar'),
            'bubble': document.getElementById('btn-chart-bubble')
        };

        // Reset
        Object.values(buttons).forEach(btn => {
            if (!btn) return;
            btn.classList.remove('primary');
            btn.style.background = 'rgba(255,255,255,0.1)';
            btn.style.color = 'var(--text-main)';
        });

        // Activate
        const targetBtn = buttons[type];
        if (targetBtn) {
            targetBtn.classList.add('primary');
            targetBtn.style.background = 'var(--accent-color)';
            targetBtn.style.color = '#1e293b';
        }

        this.render();
    },

    renderPieChart: function (labels, marketValues, totalMarketValue) {
        const ctx = document.getElementById('stockPieChart').getContext('2d');
        if (App.Charts['stockPie']) {
            App.Charts['stockPie'].destroy();
        }

        App.Charts['stockPie'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: marketValues,
                    backgroundColor: [
                        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
                        '#FF9F40', '#FF5733', '#33FF57', '#3357FF', '#F333FF',
                        '#8A2BE2', '#A52A2A', '#DEB887', '#5F9EA0', '#7FFF00',
                        '#D2691E', '#FF7F50', '#6495ED', '#DC143C', '#00FFFF'
                    ],
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'right',
                        labels: {
                            font: { size: 14 },
                            padding: 15,
                            color: '#fff'
                        }
                    },
                    tooltip: {
                        titleFont: { size: 18 },
                        bodyFont: { size: 18 },
                        callbacks: {
                            label: function (context) {
                                let label = context.label || '';
                                if (label) { label += ': '; }
                                const value = context.raw;
                                const percentage = ((value / totalMarketValue) * 100).toFixed(1) + '%';
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
                            if (percentageVal < 0.03) return null; // Hide if < 3%
                            return (percentageVal * 100).toFixed(1) + "%";
                        },
                        textAlign: 'center'
                    }
                },
                animation: { duration: 2000, easing: 'easeOutQuart' }
            }
        });
    },

    renderBarChart: function (data) {
        const ctx = document.getElementById('stockPieChart').getContext('2d');
        if (App.Charts['stockPie']) App.Charts['stockPie'].destroy();

        // Sort by Market Value Desc
        const sortedData = [...data].sort((a, b) => {
            const valA = App.Utils.parseMoney(a['市值(台幣)'] || a['市值']);
            const valB = App.Utils.parseMoney(b['市值(台幣)'] || b['市值']);
            return valB - valA;
        });

        const labels = sortedData.map(item => item['股票名稱'] || item['股票代號']);
        const values = sortedData.map(item => App.Utils.parseMoney(item['市值(台幣)'] || item['市值']));
        const colors = sortedData.map(item => {
            const pnl = App.Utils.parseMoney(item['未實現損益']);
            return pnl >= 0 ? 'rgba(72, 187, 120, 0.8)' : 'rgba(245, 101, 101, 0.8)';
        });

        App.Charts['stockPie'] = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '市值',
                    data: values,
                    backgroundColor: colors,
                    borderRadius: 6,
                    borderWidth: 0
                }]
            },
            options: {
                indexAxis: 'y', // Horizontal
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const val = context.raw;
                                return `市值: $${val.toLocaleString()}`;
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        color: 'white',
                        anchor: 'end',
                        align: 'end',
                        formatter: (val) => `$${(val / 10000).toFixed(1)}萬`,
                        font: { weight: 'bold' }
                    }
                },
                scales: {
                    x: {
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: 'var(--text-secondary)' }
                    },
                    y: {
                        grid: { display: false },
                        ticks: {
                            color: 'white',
                            font: { size: 14, weight: 'bold', family: "'Noto Sans TC'" }
                        }
                    }
                },
                animation: { duration: 1500, easing: 'easeOutQuart' }
            }
        });
    },

    renderBubbleChart: function (data) {
        const ctx = document.getElementById('stockPieChart').getContext('2d');
        if (App.Charts['stockPie']) App.Charts['stockPie'].destroy();

        const bubbleData = data.map(item => {
            const mktVal = App.Utils.parseMoney(item['市值(台幣)'] || item['市值']);
            const cost = App.Utils.parseMoney(item['總成本']);
            const pnl = App.Utils.parseMoney(item['未實現損益']);
            const roi = App.Utils.parseMoney(item['報酬率%']);

            const r = Math.sqrt(cost) / 15;

            return {
                x: roi,
                y: mktVal,
                r: Math.max(r, 5),
                name: item['股票名稱'] || item['股票代號'],
                rawCost: cost,
                rawPnl: pnl
            };
        });

        App.Charts['stockPie'] = new Chart(ctx, {
            type: 'bubble',
            data: {
                datasets: [{
                    label: '持股',
                    data: bubbleData,
                    backgroundColor: (ctx) => {
                        const val = ctx.raw?.x;
                        return val >= 0 ? 'rgba(72, 187, 120, 0.7)' : 'rgba(245, 101, 101, 0.7)';
                    },
                    borderColor: (ctx) => {
                        const val = ctx.raw?.x;
                        return val >= 0 ? '#48bb78' : '#f56565';
                    },
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                const d = context.raw;
                                return [
                                    d.name,
                                    `報酬率: ${d.x.toFixed(2)}%`,
                                    `市值: $${d.y.toLocaleString()}`,
                                    `成本: $${d.rawCost.toLocaleString()}`,
                                    `損益: $${d.rawPnl.toLocaleString()}`
                                ];
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
                            dataArr.forEach(data => { sum += data.y; });
                            let percentageVal = (value.y / sum);
                            if (percentageVal < 0.03) return null; // Hide if < 3%
                            return (percentageVal * 100).toFixed(1) + "%";
                        },
                        textAlign: 'center'
                    }
                },
                scales: {
                    x: {
                        title: { display: true, text: '報酬率 (%)', color: '#cbd5e1' },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: 'white' }
                    },
                    y: {
                        title: { display: true, text: '市值 ($)', color: '#cbd5e1' },
                        grid: { color: 'rgba(255,255,255,0.1)' },
                        ticks: { color: 'white' },
                        beginAtZero: true
                    }
                },
                animation: { duration: 1500, easing: 'easeOutQuart' }
            }
        });
    },

    renderTable: function (data) {
        const container = document.getElementById('stockTableContainer');

        let tableHTML = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <tr>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">市場</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">股票代號</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">股票名稱</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">持有股數</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">幣別</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">平均成本</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">總成本</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">總市值(台幣)</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">未實現損益</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">報酬率%</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach((item, index) => {
            const qty = App.Utils.parseMoney(item['持有股數']);
            const currency = item['幣別'] || 'TWD';

            // 優先使用原幣成本，若無則使用總成本欄位
            let totalCost = 0;
            if (item['總成本(原幣)']) {
                totalCost = App.Utils.parseMoney(item['總成本(原幣)']);
            } else if (item['總成本']) {
                totalCost = App.Utils.parseMoney(item['總成本']);
            }

            const avgCost = qty > 0 ? (totalCost / qty) : 0;
            const pnl = App.Utils.parseMoney(item['未實現損益']);
            const pnlColor = pnl >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
            const returnRate = App.Utils.parseMoney(item['報酬率%']);
            const returnColor = returnRate >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

            const marketValueTWD = App.Utils.parseMoney(item['市值(台幣)'] || item['市值']);

            // 計算原幣市值 (如果有的話)
            let marketValueDisplay = `$${marketValueTWD.toLocaleString()}`;
            if (currency !== 'TWD' && item['市值(原幣)']) {
                const marketValueOrig = App.Utils.parseMoney(item['市值(原幣)']);
                marketValueDisplay = `
                    <div>$${marketValueTWD.toLocaleString()}</div>
                    <div style="font-size: 0.75em; color: #94a3b8; margin-top: 2px;">${currency} $${marketValueOrig.toLocaleString()}</div>
                `;
            }

            tableHTML += `
                <tr>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['市場'] || '-'}</td>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['股票代號'] || '-'}</td>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['股票名稱'] || '-'}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">${qty.toLocaleString()}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">${currency}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">$${avgCost.toFixed(1)}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">$${totalCost.toLocaleString()}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">${marketValueDisplay}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1); color: ${pnlColor}; font-weight: 600;">
                        ${pnl >= 0 ? '+' : ''}$${pnl.toLocaleString()}
                    </td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1); color: ${returnColor}; font-weight: 600;">
                        ${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%
                    </td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }
};
