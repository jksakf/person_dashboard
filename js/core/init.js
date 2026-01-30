// Core Initialization
window.App = {
    Core: {},
    Modules: {},
    Charts: {}, // Store chart instances
    Config: {
        StorageKey: 'person_dashboard_data_v1'
    }
};

// Error Handling
window.onerror = function (message, source, lineno, colno, error) {
    alert(`🚨 發生未預期的錯誤:\n\n訊息: ${message}\n行號: ${lineno}\n來源: ${source}\n\n請截圖此畫面回報。`);
    return false;
};
