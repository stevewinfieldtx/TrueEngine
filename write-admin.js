// Run: node write-admin.js
// Decodes base64 admin dashboard and writes to src/public/admin.html
const fs = require('fs');
const path = require('path');
const b64 = fs.readFileSync(path.join(__dirname, 'admin-b64.txt'), 'utf-8').trim();
const html = Buffer.from(b64, 'base64').toString('utf-8');
const outPath = path.join(__dirname, 'src', 'public', 'admin.html');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
console.log('Written: ' + outPath + ' (' + html.length + ' bytes)');
