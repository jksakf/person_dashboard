// Main Entry Point
(function () {
    // 1. Initialize
    window.onload = function () {
        // Build Dependency Check
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

            // Init Utils
            App.Utils.initDragAndDrop();

            // Load Data
            App.Data.load();
        }
    };

    // 2. Global Event Listeners (Expose to window for HTML onclick compatibility)
    // Note: In a pure module system we'd use addEventListener, but for compatibility with existing HTML 'onclick',
    // we map these functions to window.

    // File Upload Handlers
    window.handleFileUpload = function (event, type) {
        const file = event.target.files[0];
        if (!file) return;
        App.Data.parseCSV(file, type);
    };

    // Tab Switching
    window.openTab = function (tabName) {
        const contents = document.getElementsByClassName("tab-content");
        for (let i = 0; i < contents.length; i++) {
            contents[i].classList.remove("active");
        }

        const buttons = document.getElementsByClassName("tab-btn");
        for (let i = 0; i < buttons.length; i++) {
            buttons[i].classList.remove("active");
        }

        document.getElementById(tabName).classList.add("active");

        // Find button that triggered this or matches the tab
        // Simple logic: we rely on the clicked button adding 'active' class itself? 
        // No, the original logic found the button by onclick attribute.
        const buttonsArray = Array.from(buttons);
        const clickedBtn = buttonsArray.find(btn => btn.getAttribute('onclick').includes(tabName));
        if (clickedBtn) clickedBtn.classList.add("active");
    };

    // Data Management
    window.clearAllData = function () {
        App.Data.clearAll();
    };

    // Bank Handlers
    window.renderBankAssets = function () {
        if (App.Modules.Bank) App.Modules.Bank.render();
    };

    // Stock Handlers
    window.renderStockHoldings = function () {
        if (App.Modules.Stock) App.Modules.Stock.render();
    };

    window.switchStockChart = function (type) {
        if (App.Modules.Stock) App.Modules.Stock.switchChart(type);
    };

    // PnL Handlers
    window.applyPnLFilter = function () {
        if (App.Modules.PnL) App.Modules.PnL.applyFilter();
    };

    window.resetPnLFilter = function () {
        if (App.Modules.PnL) App.Modules.PnL.resetFilter();
    };

})();
