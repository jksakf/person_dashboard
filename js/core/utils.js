// Core Utilities
App.Utils = {
    // 通用金額解析 (移除 $ , 等符號)
    parseMoney: function (value) {
        if (!value) return 0;
        // Remove '$', ',', and whitespace
        let clean = String(value).replace(/[$,\s]/g, '');
        let num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    },

    // Animation Helper using CountUp.js
    animateMoney: function (elementId, amount, prefix = '$') {
        const options = {
            decimalPlaces: 0,
            duration: 2.0,
            prefix: prefix,
            separator: ',',
        };
        // Check if CountUp is loaded
        if (typeof CountUp === 'undefined') {
            // Fallback
            const el = document.getElementById(elementId);
            if (el) el.textContent = prefix + amount.toLocaleString();
            return;
        }
        const anim = new CountUp(elementId, amount, options);
        if (!anim.error) {
            anim.start();
        } else {
            console.error(anim.error);
            const el = document.getElementById(elementId);
            if (el) el.textContent = prefix + amount.toLocaleString();
        }
    },

    // Drag & Drop Helpers
    initDragAndDrop: function () {
        const dropZone = document.getElementById('dropZone');
        if (!dropZone) return;

        // Prevent default drag behaviors
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.preventDefaults, false);
            document.body.addEventListener(eventName, this.preventDefaults, false);
        });

        // Highlight drop zone
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.highlight, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, this.unhighlight, false);
        });

        // Handle dropped files
        dropZone.addEventListener('drop', this.handleDrop.bind(this), false);
    },

    preventDefaults: function (e) {
        e.preventDefault();
        e.stopPropagation();
    },

    highlight: function (e) {
        document.getElementById('dropZone').classList.add('drag-over');
    },

    unhighlight: function (e) {
        document.getElementById('dropZone').classList.remove('drag-over');
    },

    handleDrop: function (e) {
        const dt = e.dataTransfer;
        const files = dt.files;
        this.handleBatchFiles(files);
    },

    handleBatchFiles: function (files) {
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
                App.Data.parseCSV(file, type, (results) => {
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
    },

    // Status Updater
    updateStatus: function (type, msg) {
        let id = '';
        if (type === 'bankAssets') id = 'bankStatus';
        if (type === 'stockHoldings') id = 'stockStatus';
        if (type === 'realizedPnL') id = 'pnlStatus';
        if (type === 'transactions') id = 'transStatus';

        if (id) {
            const el = document.getElementById(id);
            if (el) el.textContent = msg;
        }
    }
};
