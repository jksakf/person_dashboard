# 🚀 個人資產管理系統：優化藍圖 (Optimization Roadmap)

## Phase 1: 核心數據與邏輯重構 (Backend & Logic)
**目標：建立精準的交易流水帳與成本計算核心。**

### 📌 核心邏輯轉變
* **舊流程**：手動計算總成本 -> 手動輸入 `StockHolding.ps1`。
* **新流程**：輸入交易明細（買入/賣出） -> 系統自動計算累計股數、平均成本、手續費 -> 聯動生成報表。

---

### 🛠 步驟一：定義對帳單數據結構 (Transaction Schema)
**目標：建立一個能完整記錄交易細節的 CSV 格式。**

* **執行內容**：
    1.  定義 `transactions.csv` 欄位：`日期`, `標的代號`, `標的名稱`, `動作(買入/賣出)`, `成交單價`, `成交股數`, `手續費`, `交易稅`, `總金額(淨值)`。
    2.  在 `config.json` 加入手續費率設定（例如 `0.001425`），作為輸入時的自動計算參考。
* **檢查點**：手動建立一個測試 CSV，確認能正確表達「分批買入」的兩筆資料。

---

### 🛠 步驟二：開發交易錄入模組 (`Invoke-TransactionFlow`)
**目標：建立 PowerShell 介面，讓使用者可以輸入每一筆買賣。**

* **執行內容**：
    1.  在 `modules/` 資料夾建立 `Transaction.ps1`。
    2.  實作輸入邏輯：當使用者輸入單價與股數，系統自動根據 `config.json` 計算預估手續費，並允許使用者手動修正為「實際金額」。
    3.  將資料存入 `output/history_data/Transactions/`。
* **檢查點**：在 `AssetManager.ps1` 選單中新增「錄入交易明細」選項，並確認能成功存檔。

---

### 🛠 步驟三：開發核心計算引擎 (The Calculator)
**目標：將零散的交易紀錄轉換為「當前庫存狀態」。**

* **執行內容**：
    1.  撰寫邏輯處理 `transactions.csv`：
        * **總持有股數** = 累計買入股數 - 累計賣出股數。
        * **加權平均成本** = (Σ買入成交總額) / 總買入股數。
    2.  處理「已實現損益」：當有「賣出」動作時，自動計算與「平均成本」的價差。
* **檢查點**：執行腳本後，能在終端機正確顯示某支股票目前的「精準總成本（含手續費）」。

---

### 🛠 步驟四：重構舊有模組與聯動 (Refactoring)
**目標：讓原本需要手動輸入的模組改為「自動計算」。**

* **執行內容**：
    1.  **修改 `StockHolding.ps1`**：取消「輸入總成本」的步驟，改為從步驟三的計算結果自動帶入。
    2.  **修改 `RealizedPnL.ps1`**：賣出時，自動帶入該股票的平均成本，使用者只需確認賣出價格。
* **檢查點**：確認產出的 `stock_holdings.csv` 中的「總成本」與你證券對帳單上的數字完全吻合。

---

### 🛠 步驟五：視覺化呈現與自動股價 (Enhancement)
**目標：在前端呈現精準數據，並引入自動市值更新。**

* **執行內容**：
    1.  在 `index.html` 中新增「交易流水帳」的分頁展示。
    2.  整合 Web API（如 Yahoo Finance）：此時自動抓取的股價僅用於更新「市值」與「未實現損益」，**不觸碰**由對帳單算出的「總成本」。
* **檢查點**：儀表板能同時顯示「實際投入成本（含費）」與「當前即時市值」。

---
---

## Phase 2: 儀表板 2.0 視覺與體驗升級 (Frontend Design & UX)
**目標：提升視覺質感、互動體驗與資料呈現的專業度（SaaS 風格）。**

### 1. 視覺設計升級 (Visual Design Overhaul)

#### 🎨 設計語彙：Glassmorphism (毛玻璃) + 深色模式
從傳統的亮色平面設計，轉向現代金融 App 主流的深色毛玻璃風格。

**核心配色變數 (CSS Variables 建議):**
```css
:root {
    /* 深色背景漸層：營造深邃感 */
    --bg-gradient: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
    
    /* 毛玻璃卡片背景 */
    --glass-bg: rgba(30, 41, 59, 0.7);
    --glass-border: rgba(255, 255, 255, 0.1);
    
    /* 文字系統 */
    --text-main: #f8fafc;       /* 主要文字 (亮白) */
    --text-muted: #94a3b8;      /* 次要文字 (灰藍) */
    
    /* 數據色彩 */
    --accent: #38bdf8;          /* 強調色 (天空藍) */
    --success: #34d399;         /* 獲利 (薄荷綠) */
    --danger: #f87171;          /* 虧損 (柔和紅) */
}
```
*   **背景模糊 (Backdrop Filter)**: 所有卡片 (`.dashboard-card`) 需加上 `backdrop-filter: blur(12px);`。
*   **圓角與陰影**: 增加 `border-radius: 24px` 與更柔和的擴散陰影 (`box-shadow: 0 8px 32px 0 rgba(0, 0, 0, 0.37);`)。

#### 🔠 字體優化
金融數字需具備專業感與易讀性。
*   **數字字體**: 強制使用等寬字體 (Monospace)，例如 'Roboto Mono', 'DM Mono' 或 'Fira Code'。
*   **優點**: 數字對齊整齊，便於比較金額大小，且具有「數據終端機」的科技感。

### 2. 微互動與動畫 (Micro-interactions)
讓靜態的數據「活」起來。
*   **🔢 數字捲動特效 (CountUp)**: 切換分頁或載入數據時，金額從 0 快速跳動至目標金額 (使用 CountUp.js)。
*   **📊 圖表進場動畫**: 優化 Chart.js 的 `animation` 設定 (e.g., 圆饼图 `animateScale: true`)。
*   **按鈕回饋**: 加入點擊縮放效果 (`transform: scale(0.95)`)。

### 3. 使用者體驗優化 (UX Improvements)
*   **📥 拖放式上傳 (Drag & Drop Zone)**: 隱藏傳統按鈕，建立支援拖放的大面積虛線框區域。
*   **💀 骨架屏載入 (Skeleton Loading)**: 資料載入時顯示閃爍的灰色色塊，而非「(尚未載入資料)」文字，減少等待焦慮。

### 4. 進階資料視覺化 (Advanced Visualization)
*   **🗺️ 樹狀圖 (Treemap)**: 取代圓餅圖展示股票庫存，利用矩形面積與顏色呈現市值與損益 (使用 `chartjs-chart-treemap`)。
*   **📉 迷你走勢圖 (Sparklines)**: 在總資產卡片加入小型折線圖，快速預覽近 30 天趨勢。

### 5. 程式架構重構 (Architecture Refactoring)
*   **🏗️ 導入輕量級框架**: 推薦使用 Alpine.js 或 Vue.js (CDN)，將 HTML 模板與邏輯分離，實現更乾淨的代碼與狀態管理。

---

## ✅ 實作檢核清單 (Implementation Checklist)

### [ ] Phase 2.1: 基礎建設 (The Foundation)
- [ ] 備份目前的 `index.html`。
- [ ] 引入 Google Fonts (Noto Sans TC + Roboto Mono)。
- [ ] 建立 CSS `:root` 變數，定義深色主題配色。

### [ ] Phase 2.2: 介面重構 (UI Overhaul)
- [ ] 將 `.dashboard-card` 樣式全面改為毛玻璃風格。
- [ ] 重寫「檔案上傳區」，實作 Drag & Drop 事件監聽。
- [ ] 優化表格樣式，標題列固定 (Sticky Header)。

### [ ] Phase 2.3: 動態體驗 (Motion & Interaction)
- [ ] 引入 CountUp.js CDN。
- [ ] 修改 `renderBankAssets` 等函式，套用數字捲動效果。
- [ ] 調整 Chart.js 動畫參數。

### [ ] Phase 2.5: 使用者體驗優化 (UX Polish) - **Current Focus**
- [ ] **迷你走勢圖 (Sparklines)**: 在「總資產」下方顯示近期趨勢小圖。
- [ ] **骨架屏 (Skeleton Loading)**: 資料載入前顯示閃爍色塊，提升質感。
- [ ] **表格標題固定 (Sticky Header)**: 確保「交易明細」等長表格捲動時標題可見。
