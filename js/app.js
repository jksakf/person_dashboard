// 全域變數
let appData = {
    bankAssets: [],
    stockHoldings: [],
    realizedPnL: [],
    transactions: []
};

let charts = {};
let currentStockChartType = 'pie'; // Default

// 0. 全域錯誤攔截 (Nuclear Option)
window.onerror = function (message, source, lineno, colno, error) {
    alert(`🚨 發生未預期的錯誤:\n\n訊息: ${message}\n行號: ${lineno}\n來源: ${source}\n\n請截圖此畫面回報。`);
    return false;
};

// 1. 檢查相依套件是否載入
window.onload = function () {
    let missing = [];
    if (typeof Papa === 'undefined') missing.push("PapaParse (讀取 CSV 用)");
    if (typeof Chart === 'undefined') missing.push("Chart.js (畫圖用)");

    if (missing.length > 0) {
        alert(`❌ 嚴重錯誤：缺少必要元件！\n\n${missing.join('\n')}\n\n可能是網路問題導致無法載入 CDN，請檢查網路連線或稍後再試。`);
    } else {
        console.log("✅ 所有元件載入成功");

        // Register DataLabels Plugin Globally
        if (typeof ChartDataLabels !== 'undefined') {
            Chart.register(ChartDataLabels);
            console.log("✅ ChartDataLabels plugin registered");
        } else {
            console.warn("⚠️ ChartDataLabels plugin not found");
        }

        initDragAndDrop(); // Initialize Drag & Drop
        loadDataFromStorage(); // Load saved data
    }
}

// Data Persistence Functions (LocalStorage)
const STORAGE_KEY = 'person_dashboard_data_v1';

function saveDataToStorage() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
        console.log('✅ Data saved to LocalStorage');
    } catch (e) {
        console.error('Failed to save data:', e);
    }
}

function loadDataFromStorage() {
    try {
        const json = localStorage.getItem(STORAGE_KEY);
        if (json) {
            const savedData = JSON.parse(json);

            // Merge or replace appData
            if (savedData.bankAssets) appData.bankAssets = savedData.bankAssets;
            if (savedData.stockHoldings) appData.stockHoldings = savedData.stockHoldings;
            if (savedData.realizedPnL) appData.realizedPnL = savedData.realizedPnL;
            if (savedData.transactions) appData.transactions = savedData.transactions;

            console.log('✅ Data loaded from LocalStorage', appData);

            // Trigger Renders
            if (appData.bankAssets.length > 0) {
                renderBankAssets();
                renderAssetTrend(); // Restore Asset Trend Chart
                document.getElementById('bankStatus').textContent = '✅ 已還原';
            }
            if (appData.stockHoldings.length > 0) {
                renderStockHoldings();
                document.getElementById('stockStatus').textContent = '✅ 已還原';
            }
            if (appData.realizedPnL.length > 0) {
                renderRealizedPnL();
                document.getElementById('pnlStatus').textContent = '✅ 已還原';
            }
            if (appData.transactions.length > 0) {
                renderTransactionHistory();
                document.getElementById('transStatus').textContent = '✅ 已還原';
            }
        }
    } catch (e) {
        console.error('Failed to load data:', e);
    }
}

function clearStorage() {
    localStorage.removeItem(STORAGE_KEY);
    console.log('🗑️ Storage cleared');
}

function clearAllData() {
    if (confirm('確定要清除所有資料嗎？這將會從畫面和儲存空間中移除所有資料。')) {
        appData = {
            bankAssets: [],
            stockHoldings: [],
            realizedPnL: [],
            transactions: []
        };
        // Reset charts
        Object.keys(charts).forEach(key => {
            if (charts[key]) {
                charts[key].destroy();
                delete charts[key];
            }
        });

        // Reset UI
        document.getElementById('totalBankAssets').textContent = '$0';
        document.getElementById('totalMarketValue').textContent = '$0';
        document.getElementById('totalUnrealizedPnL').textContent = '$0';
        document.getElementById('totalRealizedPnL').textContent = '$0';
        document.getElementById('bankTableContainer').innerHTML = '<div class="placeholder-text">請上傳銀行資產 CSV 檔案以檢視明細</div>';
        document.getElementById('stockTableContainer').innerHTML = '<div class="placeholder-text">請上傳股票庫存 CSV 檔案以檢視明細</div>';
        document.getElementById('pnlTableContainer').innerHTML = '<div class="placeholder-text">請上傳已實現損益 CSV 檔案以檢視明細</div>';
        document.getElementById('historyTableContainer').innerHTML = '<div class="placeholder-text">請上傳交易明細 CSV 檔案以檢視內容</div>';

        // Clear status labels
        document.getElementById('bankStatus').textContent = '';
        document.getElementById('stockStatus').textContent = '';
        document.getElementById('pnlStatus').textContent = '';
        document.getElementById('transStatus').textContent = '';

        // Clear Storage
        clearStorage();

        alert('所有資料已清除');
    }
}

// Animation Helper using CountUp.js
function animateMoney(elementId, amount, prefix = '$') {
    const options = {
        decimalPlaces: 0,
        duration: 2.0,
        prefix: prefix,
        separator: ',',
    };
    // Check if CountUp is loaded
    if (typeof CountUp === 'undefined') {
        // Fallback
        document.getElementById(elementId).textContent = prefix + amount.toLocaleString();
        return;
    }
    const anim = new CountUp(elementId, amount, options);
    if (!anim.error) {
        anim.start();
    } else {
        console.error(anim.error);
        document.getElementById(elementId).textContent = prefix + amount.toLocaleString();
    }
}

// Init Drag & Drop Listeners
function initDragAndDrop() {
    const dropZone = document.getElementById('dropZone');

    // Prevent default drag behaviors
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
        document.body.addEventListener(eventName, preventDefaults, false);
    });

    // Highlight drop zone when item is dragged over it
    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.addEventListener(eventName, highlight, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, unhighlight, false);
    });

    // Handle dropped files
    dropZone.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

function highlight(e) {
    document.getElementById('dropZone').classList.add('drag-over');
}

function unhighlight(e) {
    document.getElementById('dropZone').classList.remove('drag-over');
}

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;
    handleBatchFiles(files);
}

function handleBatchFiles(files) {
    const statusDiv = document.getElementById('batchUploadStatus');
    statusDiv.innerHTML = '正在處理檔案...';

    let processedCount = 0;
    Array.from(files).forEach(file => {
        const name = file.name.toLowerCase();
        let type = null;

        if (name.includes('bank_assets')) type = 'bankAssets';
        else if (name.includes('stock_holdings')) type = 'stockHoldings';
        else if (name.includes('realized_pnl')) type = 'realizedPnL';
        else if (name.includes('transactions')) type = 'transactions';

        if (type) {
            parseCSV(file, type, (results) => {
                processedCount++;
                if (processedCount === files.length) {
                    statusDiv.innerHTML = `✅ 已處理 ${files.length} 個檔案`;
                    setTimeout(() => statusDiv.innerHTML = '', 3000);
                }
            });
        } else {
            console.warn(`跳過未知檔案: ${file.name}`);
            processedCount++;
        }
    });
}

// 2. 檔案上傳處理邏輯
function handleFileUpload(event, type) {
    const file = event.target.files[0];
    if (!file) return;

    parseCSV(file, type);
}

function parseCSV(file, type, callback = null) {
    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        encoding: "UTF-8", // 強制 UTF-8
        complete: function (results) {
            console.log(`Loaded ${type}:`, results.data);

            if (validateData(type, results.data)) {
                appData[type] = results.data;
                updateStatus(type, `✅ 匯入成功 (${results.data.length}筆)`);

                // 根據類型觸發渲染
                if (type === 'bankAssets') {
                    renderBankAssets();
                    renderAssetTrend();
                }
                else if (type === 'stockHoldings') renderStockHoldings();
                else if (type === 'realizedPnL') renderRealizedPnL();
                else if (type === 'transactions') renderTransactionHistory();

                // Save to Storage after successful parse
                saveDataToStorage();
            } else {
                updateStatus(type, `❌ 格式錯誤`);
                alert(`檔案 ${file.name} 格式不符合預期，請檢查欄位。`);
            }

            if (callback) callback(results);
        },
        error: function (error) {
            console.error(error);
            alert("CSV 解析失敗: " + error.message);
        }
    });
}

// 3. 簡單驗證資料欄位
function validateData(type, data) {
    if (!data || data.length === 0) return false;
    const firstRow = data[0];

    // Helper to check if property exists (loose check)
    const has = (key) => key in firstRow;
    const hasOneOf = (keys) => keys.some(k => k in firstRow);

    // Bank Assets: 日期 AND (台幣餘額 OR 金額)
    if (type === 'bankAssets') return has('日期') && hasOneOf(['台幣餘額', '金額']);

    // Stock Holdings: 股票名稱 AND (市值 OR 市值(台幣))
    if (type === 'stockHoldings') return has('股票名稱') && hasOneOf(['市值', '市值(台幣)']);

    // Realized PnL: (已實現損益 OR 已實現損益(台幣))
    if (type === 'realizedPnL') return hasOneOf(['已實現損益', '已實現損益(台幣)']);

    // Transactions: 日期
    if (type === 'transactions') return has('日期');

    return true;
}

function updateStatus(type, msg) {
    let id = '';
    if (type === 'bankAssets') id = 'bankStatus';
    if (type === 'stockHoldings') id = 'stockStatus';
    if (type === 'realizedPnL') id = 'pnlStatus';
    if (type === 'transactions') id = 'transStatus';

    if (id) document.getElementById(id).textContent = msg;
}

// 4. 通用金額解析 (移除 $ , 等符號)
function parseMoney(value) {
    if (!value) return 0;
    // Remove '$', ',', and whitespace
    let clean = String(value).replace(/[$,\s]/g, '');
    let num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
}

// ==========================================
// 渲染邏輯
// ==========================================

function renderBankAssets(targetDate = null) {
    const data = appData.bankAssets;
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
    const totalAssets = currentData.reduce((sum, item) => sum + parseMoney(item['台幣餘額'] || item['金額']), 0);

    // 6. 更新 UI
    // document.getElementById('totalBankAssets').textContent = `$${totalAssets.toLocaleString()}`;
    animateMoney('totalBankAssets', totalAssets);
    document.getElementById('assetsDate').textContent = `資料日期: ${selectedDate}`;

    // Show Content, Hide Skeleton
    document.querySelector('#bankAssetsCard').classList.remove('is-loading');

    // 7. 繪製圓餅圖 (依幣別或銀行/帳戶)
    // 這裡依「幣別」統計，若無幣別則依「帳戶名稱」
    const currencyMap = {};
    currentData.forEach(item => {
        // Fallback to 'TWD' if currency is missing, or use Account Name if simple format
        let key = item['幣別'];
        if (!key) {
            // If simple format (just Account Name + Amount), group by Account Name helps, but usually Pie is for allocation
            // If no currency column, assume TWD or stick to Account Name?
            // Let's use Account Name if Currency is missing, to show distribution by Account
            key = item['帳戶名稱'] || item['銀行名稱'] || 'Unknown';
        }

        const amount = parseMoney(item['台幣餘額'] || item['金額']);
        if (!currencyMap[key]) currencyMap[key] = 0;
        currencyMap[key] += amount;
    });

    const labels = Object.keys(currencyMap);
    const values = Object.values(currencyMap);

    const ctx = document.getElementById('bankPieChart').getContext('2d');
    if (charts['bankPie']) {
        charts['bankPie'].destroy();
    }

    charts['bankPie'] = new Chart(ctx, {
        type: 'pie', // Changed to Pie for consistency
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
                borderColor: '#1e293b' // Dark border match bg
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
                        if (percentageVal < 0.03) return null; // Hide if < 3%
                        return (percentageVal * 100).toFixed(1) + "%";
                    },
                    textAlign: 'center'
                }
            }
        }
    });

    // 8. 繪製明細表格
    renderBankTable(currentData);
}

function renderBankTable(data) {
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
        const valA = parseMoney(a['台幣餘額'] || a['金額']);
        const valB = parseMoney(b['台幣餘額'] || b['金額']);
        return valB - valA;
    });

    sortedData.forEach(item => {
        const name = item['帳戶名稱'] || item['銀行名稱'] || '-';
        const type = item['帳戶類別'] || item['幣別'] || 'TWD'; // Fallback
        const originalAmount = item['原幣餘額'] ? parseMoney(item['原幣餘額']).toLocaleString() : '-';
        const rate = item['匯率'] || '-';
        const twdAmount = parseMoney(item['台幣餘額'] || item['金額']).toLocaleString();

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
}

function switchStockChart(type) {
    currentStockChartType = type;

    // Update Buttons
    const btnPie = document.getElementById('btn-chart-pie');
    const btnBar = document.getElementById('btn-chart-bar');
    const btnBubble = document.getElementById('btn-chart-bubble');

    // Reset all styles
    [btnPie, btnBar, btnBubble].forEach(btn => {
        btn.classList.remove('primary');
        btn.style.background = 'rgba(255,255,255,0.1)';
        btn.style.color = 'var(--text-main)'; // Fix text color when unselected
    });

    if (type === 'pie') {
        btnPie.classList.add('primary');
        btnPie.style.background = 'var(--accent-color)';
        btnPie.style.color = '#1e293b'; // Dark text on accent
    } else if (type === 'bar') {
        btnBar.classList.add('primary');
        btnBar.style.background = 'var(--accent-color)';
        btnBar.style.color = '#1e293b';
    } else if (type === 'bubble') {
        btnBubble.classList.add('primary');
        btnBubble.style.background = 'var(--accent-color)';
        btnBubble.style.color = '#1e293b';
    }

    // Re-render
    renderStockHoldings();
}

// 渲染資產趨勢圖 (Area Chart) + Sparkline Logic
function renderAssetTrend() {
    const data = appData.bankAssets;
    if (!data || data.length === 0) return;

    // 1. 整理每日總資產
    const dailyTotals = {};
    data.forEach(item => {
        const date = item['日期']; // assume 'YYYY/MM/DD' or 'YYYY-MM-DD'
        const amount = parseMoney(item['台幣餘額'] || item['金額']);
        if (!dailyTotals[date]) dailyTotals[date] = 0;
        dailyTotals[date] += amount;
    });

    // Sort dates and Filter out 0 values
    const allDates = Object.keys(dailyTotals).sort();
    const sortedDates = allDates.filter(d => dailyTotals[d] > 0);
    const sortedAmounts = sortedDates.map(d => dailyTotals[d]);

    // Update Sparkline (Last 30 Days Logic)
    updateSparkline(dailyTotals, sortedDates[sortedDates.length - 1], sortedDates);

    const ctx = document.getElementById('assetTrendChart').getContext('2d');
    if (charts['assetTrend']) {
        charts['assetTrend'].destroy();
    }

    // Gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.5)');
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    charts['assetTrend'] = new Chart(ctx, {
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
                        // Show in Wan (萬) for compactness
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
}

function updateSparkline(dailyTotals, lastDate, sortedDataDates) {
    const recentDates = [];
    const recentAmounts = [];
    let currentBalance = 0;

    // Determine initial balance for the start of the 30-day window
    // Look for the latest available data point ON or BEFORE (lastDate - 30 days)
    const windowStartDate = new Date(lastDate);
    windowStartDate.setDate(windowStartDate.getDate() - 30);

    // Find "last known value" before window start
    // Simple search: iterate backwards from sortedDataDates
    // Or simplified: Just let the loop handle it by finding the closest previous date

    for (let i = 29; i >= 0; i--) {
        const d = new Date(lastDate);
        d.setDate(d.getDate() - i);

        // Format YYYY/MM/DD strict match
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        const dateStr = `${y}/${m}/${day}`;
        // Also try - separator just in case
        const dateStrDash = `${y}-${m}-${day}`;

        recentDates.push(dateStr);

        // Check if exact match exists
        if (dailyTotals[dateStr] !== undefined) {
            currentBalance = dailyTotals[dateStr];
        } else if (dailyTotals[dateStrDash] !== undefined) {
            currentBalance = dailyTotals[dateStrDash];
        } else {
            // If no data for this day, we must find the LAST KNOWN balance
            // Only need to search if we haven't set currentBalance yet (start of window)
            if (currentBalance === 0 && recentAmounts.length === 0) {
                // Attempt to find latest data BEFORE this date
                // This ensures the chart doesn't start at 0 if the user has older data
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
            // Use carried forward balance
        }
        recentAmounts.push(currentBalance);
    }

    // 2. 獲取 Canvas Context
    const ctx = document.getElementById('totalAssetSparkline').getContext('2d');

    // 銷毀舊圖表
    if (charts['totalAssetSparkline']) {
        charts['totalAssetSparkline'].destroy();
    }

    // 3. 建立漸層
    const gradient = ctx.createLinearGradient(0, 0, 0, 60);
    gradient.addColorStop(0, 'rgba(56, 189, 248, 0.5)'); // accent-color with opacity
    gradient.addColorStop(1, 'rgba(56, 189, 248, 0.0)');

    // 4. 繪製圖表
    charts['totalAssetSparkline'] = new Chart(ctx, {
        type: 'line',
        data: {
            labels: recentDates,
            datasets: [{
                data: recentAmounts,
                borderColor: '#38bdf8', // var(--accent-color)
                borderWidth: 2,
                backgroundColor: gradient,
                fill: true,
                pointRadius: 0, // 隱藏點
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
                        title: () => '', // 隱藏標題
                        label: (ctx) => `$${ctx.raw.toLocaleString()}`
                    }
                },
                datalabels: { display: false }
            },
            scales: {
                x: {
                    display: false // 隱藏 X 軸
                },
                y: {
                    display: false, // 隱藏 Y 軸
                    min: Math.min(...recentAmounts) * 0.95 // 讓波動看起來明顯一點
                }
            },
            layout: { padding: 0 }
        }
    });
}

function renderStockHoldings(targetDate = null) {
    const data = appData.stockHoldings;
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
    const totalMarketValue = currentData.reduce((sum, item) => sum + parseMoney(item['市值(台幣)'] || item['市值']), 0);
    const totalUnrealizedPnL = currentData.reduce((sum, item) => sum + parseMoney(item['未實現損益']), 0);

    // 6. 更新 DOM
    animateMoney('totalMarketValue', totalMarketValue);

    const pnlEl = document.getElementById('totalUnrealizedPnL');
    animateMoney('totalUnrealizedPnL', totalUnrealizedPnL, totalUnrealizedPnL >= 0 ? '$' : '-$');
    pnlEl.style.color = totalUnrealizedPnL >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    document.getElementById('stockDate').textContent = `資料日期: ${selectedDate}`;

    // 7. 準備圖表資料
    const stockLabels = currentData.map(item => item['股票名稱'] || item['股票代號']);
    const stockValues = currentData.map(item => parseMoney(item['市值(台幣)'] || item['市值']));

    // 8. 渲染圖表 (Pie, Bar, or Bubble)
    if (currentStockChartType === 'pie') {
        renderStockPieChart(stockLabels, stockValues, totalMarketValue);
    } else if (currentStockChartType === 'bar') {
        renderStockBarChart(currentData);
    } else if (currentStockChartType === 'bubble') {
        renderStockBubbleChart(currentData);
    } else {
        // Default to Pie
    }

    // 9. 繪製明細表格
    renderStockTable(currentData);
}

// 渲染持股圓餅圖
function renderStockPieChart(labels, marketValues, totalMarketValue) {
    const ctx = document.getElementById('stockPieChart').getContext('2d');

    if (charts['stockPie']) {
        charts['stockPie'].destroy();
    }

    charts['stockPie'] = new Chart(ctx, {
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
                        font: {
                            size: 14
                        },
                        padding: 15,
                        color: '#fff' // Fixed: Bright text for dark mode
                    }
                },
                tooltip: {
                    titleFont: {
                        size: 18
                    },
                    bodyFont: {
                        size: 18
                    },
                    callbacks: {
                        label: function (context) {
                            let label = context.label || '';
                            if (label) {
                                label += ': ';
                            }
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
                    font: {
                        weight: 'bold',
                        size: 14
                    },
                    formatter: (value, ctx) => {
                        let sum = 0;
                        let dataArr = ctx.chart.data.datasets[0].data;
                        dataArr.map(data => {
                            sum += data;
                        });
                        let percentageVal = (value / sum);
                        if (percentageVal < 0.03) return null; // Hide if < 3%
                        return (percentageVal * 100).toFixed(1) + "%";
                    },
                    textAlign: 'center'
                }
            },
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });
}

// 渲染持股橫向排長條圖 (Horizontal Bar)
function renderStockBarChart(data) {
    const ctx = document.getElementById('stockPieChart').getContext('2d');
    if (charts['stockPie']) charts['stockPie'].destroy();

    // Sort by Market Value Desc
    const sortedData = [...data].sort((a, b) => {
        const valA = parseMoney(a['市值(台幣)'] || a['市值']);
        const valB = parseMoney(b['市值(台幣)'] || b['市值']);
        return valB - valA;
    });

    const labels = sortedData.map(item => item['股票名稱'] || item['股票代號']);
    const values = sortedData.map(item => parseMoney(item['市值(台幣)'] || item['市值']));
    const colors = sortedData.map(item => {
        const pnl = parseMoney(item['未實現損益']);
        return pnl >= 0 ? 'rgba(72, 187, 120, 0.8)' : 'rgba(245, 101, 101, 0.8)'; // Green/Red
    });

    charts['stockPie'] = new Chart(ctx, {
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
}

// 渲染持股績效氣泡圖 (Performance Bubble)
function renderStockBubbleChart(data) {
    const ctx = document.getElementById('stockPieChart').getContext('2d');
    if (charts['stockPie']) charts['stockPie'].destroy();

    const bubbleData = data.map(item => {
        const mktVal = parseMoney(item['市值(台幣)'] || item['市值']);
        const cost = parseMoney(item['總成本']);
        const pnl = parseMoney(item['未實現損益']);
        const roi = parseMoney(item['報酬率%']);

        // Simple scaling: sqrt(cost) to avoid huge bubbles, then factor down
        const r = Math.sqrt(cost) / 15;

        return {
            x: roi,
            y: mktVal,
            r: Math.max(r, 5), // Min size 5
            name: item['股票名稱'] || item['股票代號'],
            rawCost: cost,
            rawPnl: pnl
        };
    });

    charts['stockPie'] = new Chart(ctx, {
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
                        dataArr.map(data => { sum += data; });
                        let percentageVal = (value / sum);
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
}

// 渲染持股明細表格
function renderStockTable(data) {
    const container = document.getElementById('stockTableContainer');

    let tableHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.95rem;">
            <thead style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white;">
                <tr>
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">市場</th>
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">股票代號</th>
                    <th style="padding: 12px; text-align: left; border: 1px solid #ddd;">股票名稱</th>
                    <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">持有股數</th>
                    <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">平均成本</th>
                    <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">總成本</th>
                    <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">幣別</th>
                    <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">總市值(台幣)</th>
                    <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">未實現損益</th>
                    <th style="padding: 12px; text-align: right; border: 1px solid #ddd;">報酬率%</th>
                </tr>
            </thead>
            <tbody>
    `;

    data.forEach((item, index) => {
        const qty = parseMoney(item['持有股數']);
        const cost = parseMoney(item['總成本']);

        const avgCost = qty > 0 ? (cost / qty) : 0;

        const pnl = parseMoney(item['未實現損益']);
        const pnlColor = pnl >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        const returnRate = parseMoney(item['報酬率%']);
        const returnColor = returnRate >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

        tableHTML += `
            <tr>
                <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['市場'] || '-'}</td>
                <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['股票代號'] || '-'}</td>
                <td style="padding: 10px; border: 1px solid rgba(255,255,255,0.1);">${item['股票名稱'] || '-'}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">${qty.toLocaleString()}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">$${avgCost.toFixed(1)}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">$${cost.toLocaleString()}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">${item['幣別'] || 'TWD'}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1);">$${parseMoney(item['市值(台幣)'] || item['市值']).toLocaleString()}</td>
                <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1); color: ${pnlColor}; font-weight: 600;">
                    ${pnl >= 0 ? '+' : ''}$${pnl.toLocaleString()}
                </td>
                <td style="padding: 10px; text-align: right; border: 1px solid rgba(255,255,255,0.1); color: ${returnColor}; font-weight: 600;">
                    ${returnRate >= 0 ? '+' : ''}${returnRate.toFixed(2)}%
                </td>
            </tr>
        `;
    });

    tableHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}

// 渲染交易歷史流水帳
function renderTransactionHistory() {
    const data = appData.transactions || [];
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

        const price = parseMoney(item['價格']);
        const qty = parseMoney(item['股數']);
        const total = parseMoney(item['總金額']);

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

    tableHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}

// 渲染已實現損益 (圓餅圖 + 明細表)
function renderRealizedPnL(filteredData = null) {
    const data = filteredData || appData.realizedPnL;
    if (!data || data.length === 0) {
        if (filteredData) {
            document.getElementById('totalRealizedPnL').textContent = '$0';
            document.getElementById('totalSalePrice').textContent = '$0';
            document.getElementById('totalCost').textContent = '$0';
            document.getElementById('pnlDate').textContent = `查無符合條件的資料`;
            if (charts['pnlPie']) { charts['pnlPie'].destroy(); charts['pnlPie'] = null; }
            document.getElementById('pnlTableContainer').innerHTML = '<div class="placeholder-text">查無符合條件的資料</div>';
        }
        return;
    }

    const sortedDataByDate = [...data].sort((a, b) => new Date(a['日期']) - new Date(b['日期']));
    const startDate = sortedDataByDate[0]['日期'];
    const endDate = sortedDataByDate[sortedDataByDate.length - 1]['日期'];
    const dateRange = startDate === endDate ? startDate : `${startDate} ~ ${endDate}`;

    const totalRealizedPnL = data.reduce((sum, item) => sum + parseMoney(item['已實現損益(台幣)'] || item['已實現損益']), 0);
    const totalSalePrice = data.reduce((sum, item) => sum + parseMoney(item['賣出價(台幣)'] || item['賣出價']), 0);
    const totalCost = data.reduce((sum, item) => sum + parseMoney(item['總成本(台幣)'] || item['總成本']), 0);

    const pnlEl = document.getElementById('totalRealizedPnL');
    animateMoney('totalRealizedPnL', Math.abs(totalRealizedPnL), totalRealizedPnL >= 0 ? '$' : '-$');
    pnlEl.style.color = totalRealizedPnL >= 0 ? 'var(--success-color)' : 'var(--danger-color)';

    animateMoney('totalSalePrice', totalSalePrice);
    animateMoney('totalCost', totalCost);
    document.getElementById('pnlDate').textContent = `資料期間: ${dateRange} (共 ${data.length} 筆交易)`;

    let profitAmount = 0;
    let lossAmount = 0;

    data.forEach(item => {
        const pnl = parseMoney(item['已實現損益(台幣)'] || item['已實現損益']);
        if (pnl > 0) {
            profitAmount += pnl;
        } else if (pnl < 0) {
            lossAmount += Math.abs(pnl);
        }
    });

    const labels = ['盈利', '虧損'];
    const amounts = [profitAmount, lossAmount];

    const ctx = document.getElementById('pnlPieChart').getContext('2d');
    if (charts['pnlPie']) {
        charts['pnlPie'].destroy();
    }

    charts['pnlPie'] = new Chart(ctx, {
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
            animation: {
                duration: 2000,
                easing: 'easeOutQuart'
            }
        }
    });

    const sortedData = data.sort((a, b) => {
        const dateA = String(a['日期'] || '');
        const dateB = String(b['日期'] || '');
        return dateB.localeCompare(dateA);
    });
    renderPnLTable(sortedData);
}

// 應用損益篩選
function applyPnLFilter() {
    const startStr = document.getElementById('pnlStartDate').value;
    const endStr = document.getElementById('pnlEndDate').value;

    if (!appData.realizedPnL || appData.realizedPnL.length === 0) {
        alert("目前沒有資料可供篩選");
        return;
    }

    if (!startStr && !endStr) {
        renderRealizedPnL();
        return;
    }

    const startDate = startStr ? new Date(startStr.replace(/-/g, '/')) : null;
    const endDate = endStr ? new Date(endStr.replace(/-/g, '/')) : null;

    const filtered = appData.realizedPnL.filter(item => {
        const itemDate = new Date(item['日期']);
        if (startDate && itemDate < startDate) return false;
        if (endDate && itemDate > endDate) return false;
        return true;
    });

    renderRealizedPnL(filtered);
}

function resetPnLFilter() {
    document.getElementById('pnlStartDate').value = '';
    document.getElementById('pnlEndDate').value = '';
    renderRealizedPnL(null);
}

function renderPnLTable(data) {
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
        const qty = parseMoney(item['賣出股數']);
        const costTWD = parseMoney(item['總成本(台幣)'] || item['總成本']);
        const saleTWD = parseMoney(item['賣出價(台幣)'] || item['賣出價']);
        const pnlTWD = parseMoney(item['已實現損益(台幣)'] || item['已實現損益']);

        const costOrig = parseMoney(item['總成本(原幣)']);
        const saleOrig = parseMoney(item['賣出價(原幣)']);
        const pnlOrig = parseMoney(item['已實現損益(原幣)']);

        const pnlColor = pnlTWD >= 0 ? 'var(--success-color)' : 'var(--danger-color)';
        const returnRate = parseMoney(item['報酬率%']);
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

    tableHTML += `
            </tbody>
        </table>
    `;

    container.innerHTML = tableHTML;
}

function openTab(tabName) {
    const contents = document.getElementsByClassName("tab-content");
    for (let i = 0; i < contents.length; i++) {
        contents[i].classList.remove("active");
    }

    const buttons = document.getElementsByClassName("tab-btn");
    for (let i = 0; i < buttons.length; i++) {
        buttons[i].classList.remove("active");
    }

    document.getElementById(tabName).classList.add("active");

    const buttonsArray = Array.from(buttons);
    const clickedBtn = buttonsArray.find(btn => btn.getAttribute('onclick').includes(tabName));
    if (clickedBtn) clickedBtn.classList.add("active");
}
