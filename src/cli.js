#!/usr/bin/env node
/**
 * TrueEngine CLI
 * node src/cli.js create <id> <template> [name]
 * node src/cli.js ingest <collectionId> <youtubeUrl>
 * node src/cli.js channel <collectionId> <channelUrl> [maxVideos]
 * node src/cli.js tiktok <collectionId> <@username> [maxVideos]
 * node src/cli.js instagram <collectionId> <@username> [maxVideos]
 * node src/cli.js analyze <collectionId>
 * node src/cli.js dashboard <collectionId>
 * node src/cli.js search <collectionId> <query>
 * node src/cli.js ask <collectionId> <question>
 * node src/cli.js stats <collectionId>
 * node src/cli.js collections
 */
const TrueEngine = require('./core/engine');
const config = require('./config');
const engine = new TrueEngine();
const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'create': { const [id, template, ...rest] = args; const name = rest.join(' ') || id; if (!id) { console.log('Usage: create <id> <template> [name]'); return; } engine.createCollection(id, template || 'default', name); console.log(`Created: ${id} (${template || 'default'})`); break; }
    case 'ingest': { const [colId, url] = args; if (!colId || !url) { console.log('Usage: ingest <collectionId> <youtubeUrl>'); return; } await engine.ingestYouTubeVideo(colId, url); break; }
    case 'channel': { const [colId, channelUrl, maxStr] = args; if (!colId || !channelUrl) { console.log('Usage: channel <collectionId> <channelUrl> [maxVideos]'); return; } await engine.ingestYouTubeChannel(colId, channelUrl, parseInt(maxStr) || 50); break; }
    
    case 'tiktok': {
      const [colId, username, maxStr] = args;
      if (!colId || !username) { console.log('Usage: tiktok <collectionId> <@username> [maxVideos]'); return; }
      const { ingestPlatform } = require('./core/platform_ingest');
      await ingestPlatform(engine, colId, 'tiktok', username, parseInt(maxStr) || 100);
      break;
    }
    
    case 'instagram': {
      const [colId, username, maxStr] = args;
      if (!colId || !username) { console.log('Usage: instagram <collectionId> <@username> [maxVideos]'); return; }
      const { ingestPlatform } = require('./core/platform_ingest');
      await ingestPlatform(engine, colId, 'instagram', username, parseInt(maxStr) || 100);
      break;
    }

    case 'analyze': { const [colId] = args; if (!colId) { console.log('Usage: analyze <collectionId>'); return; } await engine.analyzeCollection(colId); break; }
    case 'dashboard': {
      const [colId] = args;
      if (!colId) { console.log('Usage: dashboard <collectionId>'); return; }
      const dashboard = require('./core/dashboard');
      const fs = require('fs');
      const pathMod = require('path');
      const html = await dashboard.generate(engine.store, colId);
      const outPath = pathMod.join(config.DATA_DIR, `dashboard-${colId}.html`);
      // Don't write empty HTML — the dashboard builder writes directly to the bundle
      if (typeof html === 'string' && html.length > 100) {
        fs.writeFileSync(outPath, html, 'utf-8');
        console.log(`\n  Dashboard generated: ${outPath} (${(html.length / 1024).toFixed(0)}KB)`);
        try { require('child_process').execSync(`start "" "${pathMod.resolve(outPath)}"`, { stdio: 'ignore' }); } catch {}
      }
      break;
    }
    case 'search': { const [colId, ...qParts] = args; const query = qParts.join(' '); if (!colId || !query) { console.log('Usage: search <collectionId> <query>'); return; } const results = await engine.search(colId, query); console.log(`\nSearch: "${query}" (${results.length} results)\n`); for (const r of results) { console.log(`  [${r.timestamp}] (${r.similarity}%) ${r.text.slice(0, 150)}...`); } break; }
    case 'ask': { const [colId, ...qParts] = args; const question = qParts.join(' '); if (!colId || !question) { console.log('Usage: ask <collectionId> <question>'); return; } const result = await engine.ask(colId, question); console.log(`\nQ: ${question}\nA: ${result.answer}\n`); if (result.sources?.length) { console.log('Sources:'); result.sources.forEach(s => console.log(`  [${s.timestamp}] ${s.text.slice(0, 100)}...`)); } break; }
    case 'stats': { const [colId] = args; if (!colId) { console.log('Usage: stats <collectionId>'); return; } const stats = engine.getStats(colId); console.log(`\nStats: ${colId}\n  Sources: ${stats.sourceCount}\n  Chunks: ${stats.chunkCount}\n  Hours: ${stats.totalDurationHours}`); break; }
    case 'collections': { const cols = engine.listCollections(); if (!cols.length) { console.log('No collections yet.'); return; } for (const c of cols) { console.log(`  ${c.id} (${c.template_id}) - ${c.name}`); } break; }
    default: console.log(`\nTrueEngine CLI\n==============\nCommands:\n  create <id> <template> [name]      Create collection (templates: ${Object.keys(config.TEMPLATES).join(', ')})\n  ingest <collectionId> <url>        Ingest YouTube video\n  channel <colId> <channelUrl> [max] Ingest YouTube channel\n  tiktok <colId> <@username> [max]   Ingest TikTok profile\n  instagram <colId> <@username> [max] Ingest Instagram profile\n  analyze <collectionId>             Run analysis\n  dashboard <collectionId>           Generate actionable dashboard HTML\n  search <collectionId> <query>      Search\n  ask <collectionId> <question>      RAG Q&A\n  stats <collectionId>               Show stats\n  collections                        List all collections`);
  }
}
main().catch(err => { console.error('Fatal:', err); process.exit(1); });
