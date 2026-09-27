// Realized PnL Logic
App.Modules.PnL = {
    render: function (filteredData = null) {
        const data = filteredData || App.Data.store.realizedPnL;
        if (!data || data.length === 0) {
            if (filteredData) {
                document.getElementById('totalRealizedPnL').textContent = '$0';
                document.getElementById('totalSalePrice').textContent = '$0';
                document.getElementById('totalCost').textContent = '$0';
                document.getElementById('pnlDate').textContent = `查無符合條件的資料`;
                if (App.Charts['pnlPie']) { App.Charts['pnlPie'].destroy(); delete App.Charts['pnlPie']; }
                document.getElementById('pnlTableContainer').innerHTML = '<div class="placeholder-text">查無符合條件的資料</div>';
            }
            return;
        }

        const sortedDataByDate = [...data].sort((a, b) => new Date(a['日期']) - new Date(b['日期']));
        const startDate = sortedDataByDate[0]['日期'];
        const endDate = sortedDataByDate[sortedDataByDate.length - 1]['日期'];
        const dateRange = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;

        const totalRealizedPnL = data.reduce((sum, item) => sum + App.Utils.parseMoney(item['已實現損益(台幣)'] || item['已實現損益']), 0);
        const totalSalePrice = data.reduce((sum, item) => sum + App.Utils.parseMoney(item['賣出價(台幣)'] || item['賣出價']), 0);
        const totalCost = data.reduce((sum, item) => sum + App.Utils.parseMoney(item['總成本(台幣)'] || item['總成本']), 0);

        const pnlEl = document.getElementById('totalRealizedPnL');
        App.Utils.animateMoney('totalRealizedPnL', Math.abs(totalRealizedPnL), totalRealizedPnL >= 0 ? '$' : '-$');
        pnlEl.style.color = totalRealizedPnL >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

        App.Utils.animateMoney('totalSalePrice', totalSalePrice);
        App.Utils.animateMoney('totalCost', totalCost);
        document.getElementById('pnlDate').textContent = `資料期間: ${dateRange} (共 ${data.length} 筆交易)`;

        // Pie Chart Params
        let profitAmount = 0;
        let lossAmount = 0;
        data.forEach(item => {
            const pnl = App.Utils.parseMoney(item['已實現損益(台幣)'] || item['已實現損益']);
            if (pnl > 0) profitAmount += pnl;
            else if (pnl < 0) lossAmount += Math.abs(pnl);
        });

        this.renderPieChart(profitAmount, lossAmount);

        // Sorting for Table
        const sortedData = data.sort((a, b) => {
            const dateA = String(a['日期'] || '');
            const dateB = String(b['日期'] || '');
            return dateB.localeCompare(dateA);
        });
        this.renderTable(sortedData);
    },

    renderPieChart: function (profitAmount, lossAmount) {
        const labels = ['盈利', '虧損'];
        const amounts = [profitAmount, lossAmount];

        const ctx = document.getElementById('pnlPieChart').getContext('2d');
        if (App.Charts['pnlPie']) {
            App.Charts['pnlPie'].destroy();
        }

        App.Charts['pnlPie'] = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: amounts,
                    backgroundColor: ['#33FF57', '#FF5733'],
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
                            color: '#fff',
                            font: { size: 16 },
                            padding: 20
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
                                const total = profitAmount + lossAmount;
                                const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                                label += `$${value.toLocaleString()} (${percentage})`;
                                return label;
                            }
                        }
                    },
                    datalabels: {
                        display: true,
                        color: '#fff',
                        font: { weight: 'bold', size: 16 },
                        formatter: function (value, context) {
                            const label = context.chart.data.labels[context.dataIndex];
                            const total = profitAmount + lossAmount;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) + '%' : '0%';
                            return label + '\n' + percentage;
                        },
                        textAlign: 'center'
                    }
                },
                animation: { duration: 2000, easing: 'easeOutQuart' }
            }
        });
    },

    renderTable: function (data) {
        const container = document.getElementById('pnlTableContainer');

        let tableHTML = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <tr>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">日期</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">市場</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">股票代號</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">股票名稱</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">賣出股數</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">總成本</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">賣出總價</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">已實現損益</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">報酬率%</th>
                    </tr>
                </thead>
                <tbody>
        `;

        data.forEach((item, index) => {
            const isForeign = item['幣別'] && item['幣別'] !== 'TWD';
            const qty = App.Utils.parseMoney(item['賣出股數']);
            const costTWD = App.Utils.parseMoney(item['總成本(台幣)'] || item['總成本']);
            const saleTWD = App.Utils.parseMoney(item['賣出價(台幣)'] || item['賣出價']);
            const pnlTWD = App.Utils.parseMoney(item['已實現損益(台幣)'] || item['已實現損益']);

            const costOrig = App.Utils.parseMoney(item['總成本(原幣)']);
            const saleOrig = App.Utils.parseMoney(item['賣出價(原幣)']);
            const pnlOrig = App.Utils.parseMoney(item['已實現損益(原幣)']);

            const pnlColor = pnlTWD >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
            const returnRate = App.Utils.parseMoney(item['報酬率%']);
            const returnColor = returnRate >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

            const showOrig = (val, symbol = '$') => isForeign ? `<div style="font-size:0.8em; opacity:0.7; margin-top:2px;">(${symbol}${val.toLocaleString()})</div>` : '';

            tableHTML += `
                <tr>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['日期'] || '-'}</td>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['市場'] || '-'}</td>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['股票代號'] || '-'}</td>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['股票名稱'] || '-'}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">${qty.toLocaleString()}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">
                        $${costTWD.toLocaleString()}
                        ${showOrig(costOrig)}
                    </td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">
                        $${saleTWD.toLocaleString()}
                        ${showOrig(saleOrig)}
                    </td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1); color: ${pnlColor}; font-weight: 600;">
                        ${pnlTWD >= 0 ? '+' : ''}$${pnlTWD.toLocaleString()}
                        ${isForeign ? `<div style="font-size:0.8em; opacity:0.7; margin-top:2px; color:${pnlOrig >= 0 ? 'var(--success-color)' : 'var(--danger-color)'}">(${pnlOrig >= 0 ? '+' : ''}${pnlOrig.toLocaleString()})</div>` : ''}
                    </td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1); color: ${returnColor}; font-weight: 600;">
                        ${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%
                    </td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    },

    applyFilter: function () {
        const startStr = document.getElementById('pnlStartDate').value;
        const endStr = document.getElementById('pnlEndDate').value;

        if (!App.Data.store.realizedPnL || App.Data.store.realizedPnL.length === 0) {
            alert("目前沒有資料可供篩選");
            return;
        }

        if (!startStr && !endStr) {
            this.render();
            return;
        }

        const startDate = startStr ? new Date(startStr.replace(/-/g, '/')) : null;
        const endDate = endStr ? new Date(endStr.replace(/-/g, '/')) : null;

        const filtered = App.Data.store.realizedPnL.filter(item => {
            const itemDate = new Date(item['日期']);
            if (startDate && itemDate < startDate) return false;
            if (endDate && itemDate > endDate) return false;
            return true;
        });

        this.render(filtered);
    },

    resetFilter: function () {
        document.getElementById('pnlStartDate').value = '';
        document.getElementById('pnlEndDate').value = '';
        this.render(null);
    }
};
