const fs = require('fs');
const path = 'archive/legacy_system/output/history_data/Bank_assets';
const files = fs.readdirSync(path).sort();

console.log('檔案日期 | 純銀行存款 | 舊系統留存之股票估值 | 舊系統留存總額');
console.log('------------------------------------------------------------');

files.forEach(f => {
    const buf = fs.readFileSync(path + '/' + f);
    const text = (buf[0] === 0xFF && buf[1] === 0xFE) ? buf.toString('utf16le') : buf.toString('utf8');
    const lines = text.trim().split(/\r?\n/);
    let bankPure = 0;
    let stockRecorded = 0;
    let total = 0;
    for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',').map(s => s.replace(/^"|"$/g, '').trim());
        if (parts.length >= 3) {
            const name = parts[1];
            const amt = parseFloat(parts[2]) || 0;
            total += amt;
            if (name.includes('股票') || name.includes('ETF')) {
                stockRecorded += amt;
            } else {
                bankPure += amt;
            }
        }
    }
    const d = f.slice(0, 8);
    console.log(`${d} | $${bankPure.toLocaleString().padStart(8)} | $${stockRecorded.toLocaleString().padStart(12)} | $${total.toLocaleString().padStart(10)}`);
});
