const fs = require('fs');
const path = require('path');

const dataFile = path.resolve(__dirname, 'assets_data.json');
const raw = fs.readFileSync(dataFile, 'utf8').replace(/^\uFEFF/, '');
const data = JSON.parse(raw);

const dir = path.resolve(__dirname, 'archive/legacy_system/output/history_data/Bank_assets');
const files = fs.readdirSync(dir).sort();

console.log('=== 比對開始 ===');
files.forEach(f => {
    const m = f.slice(0, 4) + '/' + f.slice(4, 6);
    const content = fs.readFileSync(path.join(dir, f));
    let text = '';
    if (content[0] === 0xFF && content[1] === 0xFE) {
        text = content.toString('utf16le');
    } else {
        text = content.toString('utf8');
    }
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    let legacyTotal = 0;
    lines.slice(1).forEach(l => {
        const cols = l.split(',').map(c => c.trim().replace(/^[']|[']$/g, ''));
        if (cols.length >= 3) {
            const val = parseFloat(cols[2]) || 0;
            legacyTotal += val;
        }
    });
    const snap = data.monthlySnapshots ? data.monthlySnapshots[m] : null;
    const snapVal = snap ? snap.totalNetWorth : '無快照';
    const diff = snap ? (snapVal - legacyTotal) : 'N/A';
    console.log(${ m } | 舊CSV總額:  | 快照淨值:  | 差額: );
});
