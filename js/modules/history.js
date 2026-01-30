// Transaction History Logic
App.Modules.History = {
    render: function () {
        const data = App.Data.store.transactions || [];
        const container = document.getElementById('historyTableContainer');

        if (data.length === 0) {
            container.innerHTML = '<div class="placeholder-text">尚無交易資料</div>';
            return;
        }

        // 按日期降序排序
        const sortedData = [...data].sort((a, b) => {
            const dateA = String(a['日期'] || '');
            const dateB = String(b['日期'] || '');
            return dateB.localeCompare(dateA);
        });

        let tableHTML = `
            <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
                <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                    <tr>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">日期</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">代號</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">名稱</th>
                        <th style="padding: 12px; text-align: center; border: 1px solid #ddd;">類別</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">成交價</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">股數</th>
                        <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">總金額 (含稅費)</th>
                        <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">備註</th>
                    </tr>
                </thead>
                <tbody>
        `;

        sortedData.forEach((item, index) => {
            const type = item['類別'];
            const typeColor = type === '買進' ? '#d32f2f' : (type === '賣出' ? '#388e3c' : '#aaa');
            const typeLabel = `<span style="color: ${typeColor}; font-weight: bold;">${type}</span>`;

            const price = App.Utils.parseMoney(item['價格']);
            const qty = App.Utils.parseMoney(item['股數']);
            const total = App.Utils.parseMoney(item['總金額']);

            tableHTML += `
                <tr>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['日期'] || '-'}</td>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['代號'] || '-'}</td>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['名稱'] || '-'}</td>
                    <td style="padding: 10px; text-align: center; border: 1px solid rgba(255,255,255,0.1);">${typeLabel}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">$${price.toLocaleString()}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">${qty.toLocaleString()}</td>
                    <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1); font-weight:bold;">$${total.toLocaleString()}</td>
                    <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1); color: var(--text-secondary);">${item['備註'] || ''}</td>
                </tr>
            `;
        });

        tableHTML += `</tbody></table>`;
        container.innerHTML = tableHTML;
    }
};
