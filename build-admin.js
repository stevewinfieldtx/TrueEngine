// build-admin.js - Downloads admin dashboard from Claude's output and writes to src/public/admin.html
// Run: node build-admin.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const b64 = fs.readFileSync(path.join(__dirname, 'admin-b64.txt'), 'utf-8').trim();
const html = Buffer.from(b64, 'base64').toString('utf-8');
const outDir = path.join(__dirname, 'src', 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'admin.html'), html);
console.log('Written: src/public/admin.html (' + html.length + ' bytes)');
