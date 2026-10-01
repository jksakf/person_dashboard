/**
 * 個人資產一體化工作台 - 資料轉換與遷移模組 (DataConverter)
 * 職責：支援現有歷史 CSV (UTF-16 LE / UTF-8) 匯入、標準化 JSON 轉換，以及符合 Windows Excel 的 UTF-8 with BOM CSV 匯出
 * 編碼：UTF-8 with BOM
 */

class DataConverter {
    /**
     * 簡易通用 CSV 解析器 (相容雙引號與逗號)
     * @param {string} text 
     * @returns {Array<Array<string>>}
     */
    static parseCsvToRows(text) {
        if (!text || typeof text !== 'string') return [];
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const rows = [];

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;

            const row = [];
            let inQuotes = false;
            let currentField = '';

            for (let i = 0; i < trimmed.length; i++) {
                const char = trimmed[i];
                if (char === '"') {
                    if (inQuotes && trimmed[i + 1] === '"') {
                        currentField += '"';
                        i++; // 跳過下一個跳脫雙引號
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    row.push(currentField.trim());
                    currentField = '';
                } else {
                    currentField += char;
                }
            }
            row.push(currentField.trim());
            rows.push(row);
        }
        return rows;
    }

    /**
     * 將交易紀錄 CSV 轉換為標準結構
     * @param {string} csvText 
     * @returns {Array<Object>}
     */
    static parseTransactionsCsv(csvText) {
        const rows = this.parseCsvToRows(csvText);
        if (rows.length < 2) return [];

        const headers = rows[0].map(h => h.replace(/^["']|["']$/g, '').trim());
        const dateIdx = headers.indexOf('日期');
        const symbolIdx = headers.indexOf('代號') !== -1 ? headers.indexOf('代號') : headers.indexOf('股票代號');
        const nameIdx = headers.indexOf('名稱') !== -1 ? headers.indexOf('名稱') : headers.indexOf('股票名稱');
        const actionIdx = headers.indexOf('類別') !== -1 ? headers.indexOf('類別') : headers.indexOf('動作');
        const currIdx = headers.indexOf('幣別');
        const rateIdx = headers.indexOf('匯率');
        const priceIdx = headers.indexOf('價格') !== -1 ? headers.indexOf('價格') : headers.indexOf('買入價');
        const sharesIdx = headers.indexOf('股數');
        const feeIdx = headers.indexOf('手續費');
        const taxIdx = headers.indexOf('交易稅');
        const totalIdx = headers.indexOf('總金額');
        const noteIdx = headers.indexOf('備註');
        const netTwdIdx = headers.indexOf('交割金額(台幣)');

        const result = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 3) continue;

            const date = dateIdx !== -1 ? r[dateIdx] : '';
            const symbol = symbolIdx !== -1 ? r[symbolIdx] : '';
            if (!symbol) continue;

            let action = actionIdx !== -1 ? r[actionIdx] : '買入';
            if (action === '買進') action = '買入';

            const price = priceIdx !== -1 ? parseFloat(r[priceIdx]) || 0 : 0;
            const shares = sharesIdx !== -1 ? parseInt(r[sharesIdx], 10) || 0 : 0;
            const fee = feeIdx !== -1 ? parseFloat(r[feeIdx]) || 0 : 0;
            const tax = taxIdx !== -1 ? parseFloat(r[taxIdx]) || 0 : 0;
            const curr = currIdx !== -1 ? (r[currIdx] || 'TWD') : 'TWD';
            const rate = rateIdx !== -1 ? parseFloat(r[rateIdx]) || 1.0 : 1.0;
            const total = totalIdx !== -1 ? parseFloat(r[totalIdx]) || Math.round(price * shares) : Math.round(price * shares);
            const netTwd = netTwdIdx !== -1 ? parseFloat(r[netTwdIdx]) || total : total;
            const note = noteIdx !== -1 ? r[noteIdx] : '';

            result.push({
                id: `tx_${date.replace(/[\/\-]/g, '')}_${String(i).padStart(3, '0')}`,
                date: date.replace(/-/g, '/'),
                symbol: symbol,
                name: nameIdx !== -1 ? r[nameIdx] : symbol,
                action: action,
                price: price,
                shares: shares,
                fee: fee,
                tax: tax,
                totalAmount: total,
                currency: curr,
                exchangeRate: rate,
                netAmountTwd: netTwd,
                note: note
            });
        }
        return result;
    }

    /**
     * 將銀行資產 CSV 轉換為標準結構
     * @param {string} csvText 
     * @returns {Array<Object>}
     */
    static parseBankAssetsCsv(csvText) {
        const rows = this.parseCsvToRows(csvText);
        if (rows.length < 2) return [];

        const headers = rows[0].map(h => h.replace(/^["']|["']$/g, '').trim());
        const dateIdx = headers.indexOf('日期');
        const bankIdx = headers.indexOf('帳戶名稱') !== -1 ? headers.indexOf('帳戶名稱') : headers.indexOf('銀行名稱');
        const amountIdx = headers.indexOf('金額') !== -1 ? headers.indexOf('金額') : headers.indexOf('折合台幣');

        const result = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 2) continue;

            const date = dateIdx !== -1 ? r[dateIdx] : '';
            const bankName = bankIdx !== -1 ? r[bankIdx] : '';
            const amount = amountIdx !== -1 ? parseFloat(r[amountIdx]) || 0 : 0;

            if (!bankName && amount === 0) continue;

            result.push({
                id: `bank_${date.replace(/[\/\-]/g, '')}_${String(i).padStart(3, '0')}`,
                date: date.replace(/-/g, '/'),
                bankName: bankName || '未命名帳戶',
                accountType: '活存',
                currency: 'TWD',
                originalAmount: amount,
                exchangeRate: 1.0,
                twdAmount: amount,
                note: ''
            });
        }
        return result;
    }

    /**
     * 將已實現損益 CSV 轉換為標準結構
     * @param {string} csvText 
     * @returns {Array<Object>}
     */
    static parseRealizedPnlCsv(csvText) {
        const rows = this.parseCsvToRows(csvText);
        if (rows.length < 2) return [];

        const headers = rows[0].map(h => h.replace(/^["']|["']$/g, '').trim());
        const dateIdx = headers.indexOf('日期');
        const symbolIdx = headers.indexOf('股票代號') !== -1 ? headers.indexOf('股票代號') : headers.indexOf('代號');
        const nameIdx = headers.indexOf('股票名稱') !== -1 ? headers.indexOf('股票名稱') : headers.indexOf('名稱');
        const sharesIdx = headers.indexOf('賣出股數') !== -1 ? headers.indexOf('賣出股數') : headers.indexOf('股數');
        const costTwdIdx = headers.indexOf('總成本(台幣)') !== -1 ? headers.indexOf('總成本(台幣)') : headers.indexOf('成本');
        const revenueTwdIdx = headers.indexOf('賣出價(台幣)') !== -1 ? headers.indexOf('賣出價(台幣)') : headers.indexOf('賣出收入');
        const pnlTwdIdx = headers.indexOf('已實現損益(台幣)') !== -1 ? headers.indexOf('已實現損益(台幣)') : headers.indexOf('損益');
        const rateIdx = headers.indexOf('報酬率%');

        const result = [];
        for (let i = 1; i < rows.length; i++) {
            const r = rows[i];
            if (!r || r.length < 3) continue;

            const date = dateIdx !== -1 ? r[dateIdx] : '';
            const symbol = symbolIdx !== -1 ? r[symbolIdx] : '';
            if (!symbol) continue;

            const shares = sharesIdx !== -1 ? parseInt(r[sharesIdx], 10) || 0 : 0;
            const cost = costTwdIdx !== -1 ? parseFloat(r[costTwdIdx]) || 0 : 0;
            const rev = revenueTwdIdx !== -1 ? parseFloat(r[revenueTwdIdx]) || 0 : 0;
            const pnl = pnlTwdIdx !== -1 ? parseFloat(r[pnlTwdIdx]) || (rev - cost) : (rev - cost);
            let rate = 0;
            if (rateIdx !== -1 && r[rateIdx]) {
                rate = parseFloat(r[rateIdx].replace('%', '')) || 0;
            } else if (cost > 0) {
                rate = parseFloat(((pnl / cost) * 100).toFixed(2));
            }

            result.push({
                id: `pnl_${date.replace(/[\/\-]/g, '')}_${String(i).padStart(3, '0')}`,
                closeDate: date.replace(/-/g, '/'),
                symbol: symbol,
                name: nameIdx !== -1 ? r[nameIdx] : symbol,
                shares: shares,
                buyCost: cost,
                sellRevenue: rev,
                fee: 0,
                tax: 0,
                netProfit: pnl,
                profitRate: rate,
                note: ''
            });
        }
        return result;
    }

    /**
     * 產出包含 UTF-8 BOM 的 Blob，確保 Windows Excel 或記事本開啟不會亂碼
     * @param {string} content 
     * @param {string} mimeType 
     * @returns {Blob}
     */
    static createUtf8BomBlob(content, mimeType = 'text/plain;charset=utf-8') {
        const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
        return new Blob([bom, content], { type: mimeType });
    }

    /**
     * 將交易紀錄匯出為相容格式之 CSV 字串
     * @param {Array<Object>} transactions 
     * @returns {string}
     */
    static generateTransactionsCsv(transactions = []) {
        const headers = ["日期", "代號", "名稱", "類別", "幣別", "匯率", "價格", "股數", "手續費", "交易稅", "總金額", "備註", "交割金額(台幣)"];
        const lines = [headers.map(h => `"${h}"`).join(',')];

        for (const t of transactions) {
            const row = [
                t.date || '',
                t.symbol || '',
                t.name || '',
                t.action || '買入',
                t.currency || 'TWD',
                t.exchangeRate || 1,
                t.price || 0,
                t.shares || 0,
                t.fee || 0,
                t.tax || 0,
                t.totalAmount || 0,
                (t.note || '').replace(/"/g, '""'),
                t.netAmountTwd || t.totalAmount || 0
            ];
            lines.push(row.map(val => `"${val}"`).join(','));
        }
        return lines.join('\r\n');
    }

    /**
     * 將銀行資產匯出為 CSV 字串
     * @param {Array<Object>} bankAssets 
     * @returns {string}
     */
    static generateBankAssetsCsv(bankAssets = []) {
        const headers = ["日期", "帳戶名稱", "金額"];
        const lines = [headers.map(h => `"${h}"`).join(',')];

        for (const b of bankAssets) {
            const row = [
                b.date || '',
                b.bankName || '',
                b.twdAmount || b.originalAmount || 0
            ];
            lines.push(row.map(val => `"${val}"`).join(','));
        }
        return lines.join('\r\n');
    }

    /**
     * 解析 stock_list.txt 內容
     * @param {string} text 
     * @returns {Array<{ market: string, symbol: string, name: string }>}
     */
    static parseStockListTxt(text) {
        if (!text || typeof text !== 'string') return [];
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const list = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const parts = trimmed.split(',').map(p => p.trim());
            if (parts.length >= 3) {
                list.push({ market: parts[0] || '台股', symbol: parts[1], name: parts[2] });
            } else if (parts.length === 2) {
                list.push({ market: '台股', symbol: parts[0], name: parts[1] });
            }
        }
        return list;
    }

    /**
     * 解析 account_list.txt 內容
     * @param {string} text 
     * @returns {Array<string>}
     */
    static parseAccountListTxt(text) {
        if (!text || typeof text !== 'string') return [];
        const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const list = [];
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#') || trimmed.includes('[object')) continue;
            list.push(trimmed);
        }
        return Array.from(new Set(list));
    }

    /**
     * 產出 stock_list.txt 格式字串
     * @param {Array<Object>} stockDict 
     * @returns {string}
     */
    static generateStockListTxt(stockDict = []) {
        const lines = [];
        for (const s of stockDict) {
            if (!s || !s.symbol) continue;
            const market = s.market || '台股';
            const symbol = String(s.symbol).trim();
            const name = String(s.name || '').trim();
            lines.push(`${market},${symbol},${name}`);
        }
        return lines.join('\r\n');
    }

    /**
     * 產出 account_list.txt 格式字串
     * @param {Array<string>} accountList 
     * @returns {string}
     */
    static generateAccountListTxt(accountList = []) {
        const lines = [];
        for (const a of accountList) {
            if (typeof a === 'string' && a.trim() && !a.includes('[object')) {
                lines.push(a.trim());
            }
        }
        return Array.from(new Set(lines)).join('\r\n');
    }

    /**
     * 下載檔案到瀏覽器端
     * @param {Blob} blob 
     * @param {string} fileName 
     */
    static downloadBlob(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
}

if (typeof window !== 'undefined') {
    window.DataConverter = DataConverter;
}
if (typeof module !== 'undefined' && module.exports) {
    module.exports = DataConverter;
}
