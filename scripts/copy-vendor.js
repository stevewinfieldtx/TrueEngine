/**
 * copy-vendor.js
 * Runs as postinstall — copies 3d-force-graph from node_modules
 * into src/public/lib/ so it's served locally. Zero CDN dependency.
 * 
 * Note: 3d-force-graph bundles Three.js and exposes window.THREE,
 * so we only need this one file.
 */
const fs = require('fs');
const path = require('path');

const libDir = path.join(__dirname, '..', 'src', 'public', 'lib');

if (!fs.existsSync(libDir)) {
  fs.mkdirSync(libDir, { recursive: true });
}

const src = path.join(__dirname, '..', 'node_modules', '3d-force-graph', 'dist', '3d-force-graph.min.js');
const dest = path.join(libDir, '3d-force-graph.min.js');

try {
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    const size = (fs.statSync(dest).size / 1024).toFixed(0);
    console.log(`[copy-vendor] Copied 3d-force-graph.min.js (${size}KB) -> src/public/lib/`);
    console.log('[copy-vendor] This bundle includes Three.js (window.THREE) — no separate three.js needed.');
  } else {
    console.warn('[copy-vendor] Source not found:', src);
    console.warn('[copy-vendor] Run "npm install" first.');
  }
} catch (err) {
  console.error('[copy-vendor] Failed:', err.message);
}
