/**
 * TrueEngine — Admin Dashboard (v1.1.0)
 * Self-contained HTML admin dashboard served at GET /admin.
 * No external files needed.
 */

function getAdminHTML() {
  return ADMIN_HTML;
}

const ADMIN_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TrueEngine — Command Center</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root {
    --bg-deep: #0a0b0f;
    --bg-card: #12141c;
    --bg-hover: #1a1d28;
    --bg-input: #0e1017;
    --border: #1f2233;
    --border-bright: #2a2d44;
    --text-primary: #e8eaf0;
    --text-secondary: #8b8fa4;
    --text-dim: #555872;
    --accent-green: #22c55e;
    --accent-green-dim: rgba(34,197,94,0.12);
    --accent-blue: #3b82f6;
    --accent-blue-dim: rgba(59,130,246,0.12);
    --accent-amber: #f59e0b;
    --accent-amber-dim: rgba(245,158,11,0.12);
    --accent-red: #ef4444;
    --accent-red-dim: rgba(239,68,68,0.12);
    --accent-purple: #a855f7;
    --accent-purple-dim: rgba(168,85,247,0.12);
    --radius: 10px;
    --radius-sm: 6px;
  }
  * { margin:0; padding:0; box-sizing:border-box; }
  body {
    font-family: 'DM Sans', sans-serif;
    background: var(--bg-deep);
    color: var(--text-primary);
    min-height: 100vh;
    overflow-x: hidden;
  }
  code, .mono { font-family: 'JetBrains Mono', monospace; }

  /* ── LAYOUT ────────────────────────────────── */
  .shell { display: flex; min-height: 100vh; }
  .sidebar {
    width: 260px; flex-shrink:0;
    background: var(--bg-card);
    border-right: 1px solid var(--border);
    display: flex; flex-direction: column;
    padding: 24px 0;
  }
  .sidebar-brand {
    padding: 0 24px 24px;
    border-bottom: 1px solid var(--border);
    margin-bottom: 16px;
  }
  .sidebar-brand h1 {
    font-size: 18px; font-weight: 700;
    letter-spacing: -0.3px;
    display: flex; align-items: center; gap: 10px;
  }
  .sidebar-brand h1 .dot {
    width: 8px; height: 8px; border-radius: 50%;
    background: var(--accent-green);
    box-shadow: 0 0 8px rgba(34,197,94,0.5);
    animation: pulse 2s ease-in-out infinite;
  }
  @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
  .sidebar-brand .version {
    font-size: 11px; color: var(--text-dim);
    font-family: 'JetBrains Mono', monospace;
    margin-top: 4px;
  }
  .nav-section {
    padding: 0 12px; margin-bottom: 8px;
  }
  .nav-section-label {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 1.2px;
    color: var(--text-dim);
    padding: 8px 12px;
  }
  .nav-item {
    display: flex; align-items: center; gap: 10px;
    padding: 9px 12px;
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 14px; font-weight: 500;
    transition: all 0.15s;
  }
  .nav-item:hover { background: var(--bg-hover); color: var(--text-primary); }
  .nav-item.active {
    background: var(--accent-blue-dim);
    color: var(--accent-blue);
  }
  .nav-item .icon { font-size: 16px; width: 20px; text-align: center; }
  .nav-item .badge {
    margin-left: auto;
    font-size: 11px;
    font-family: 'JetBrains Mono', monospace;
    background: var(--bg-hover);
    padding: 2px 7px;
    border-radius: 99px;
    color: var(--text-dim);
  }

  .main {
    flex: 1; padding: 32px;
    overflow-y: auto;
    max-height: 100vh;
  }

  /* ── HEADER ────────────────────────────────── */
  .page-header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 28px;
  }
  .page-header h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.3px; }
  .page-header .subtitle { color: var(--text-secondary); font-size: 13px; margin-top: 2px; }
  .header-actions { display: flex; gap: 10px; }

  /* ── CARDS ─────────────────────────────────── */
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 14px;
    margin-bottom: 28px;
  }
  .stat-card {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 18px 20px;
    transition: border-color 0.2s;
  }
  .stat-card:hover { border-color: var(--border-bright); }
  .stat-card .label {
    font-size: 11px; font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-dim);
    margin-bottom: 8px;
  }
  .stat-card .value {
    font-size: 28px; font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: -1px;
  }
  .stat-card .sub {
    font-size: 12px; color: var(--text-secondary);
    margin-top: 4px;
  }
  .stat-card.green .value { color: var(--accent-green); }
  .stat-card.blue .value { color: var(--accent-blue); }
  .stat-card.amber .value { color: var(--accent-amber); }
  .stat-card.purple .value { color: var(--accent-purple); }

  /* ── STATUS INDICATORS ─────────────────────── */
  .status-dot {
    display: inline-block;
    width: 8px; height: 8px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .status-dot.on { background: var(--accent-green); box-shadow: 0 0 6px rgba(34,197,94,0.4); }
  .status-dot.off { background: var(--accent-red); }
  .status-dot.warn { background: var(--accent-amber); }

  /* ── TABLES ────────────────────────────────── */
  .panel {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    overflow: hidden;
    margin-bottom: 20px;
  }
  .panel-header {
    padding: 16px 20px;
    border-bottom: 1px solid var(--border);
    display: flex; align-items: center; justify-content: space-between;
  }
  .panel-header h3 { font-size: 14px; font-weight: 700; }
  .panel-body { padding: 0; }
  table { width: 100%; border-collapse: collapse; }
  th {
    text-align: left;
    padding: 10px 20px;
    font-size: 10px; font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-dim);
    border-bottom: 1px solid var(--border);
    background: var(--bg-deep);
  }
  td {
    padding: 12px 20px;
    font-size: 13px;
    border-bottom: 1px solid var(--border);
    color: var(--text-secondary);
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg-hover); }
  td .mono { font-size: 12px; color: var(--text-dim); }

  /* ── BUTTONS ───────────────────────────────── */
  .btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 8px 16px;
    border-radius: var(--radius-sm);
    font-size: 13px; font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--bg-card);
    color: var(--text-primary);
    transition: all 0.15s;
  }
  .btn:hover { background: var(--bg-hover); border-color: var(--border-bright); }
  .btn.primary {
    background: var(--accent-blue);
    border-color: var(--accent-blue);
    color: #fff;
  }
  .btn.primary:hover { background: #2563eb; }
  .btn.danger {
    background: var(--accent-red-dim);
    border-color: transparent;
    color: var(--accent-red);
  }
  .btn.sm { padding: 5px 10px; font-size: 12px; }

  /* ── FORMS ─────────────────────────────────── */
  .input-group { margin-bottom: 14px; }
  .input-group label {
    display: block;
    font-size: 11px; font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    color: var(--text-dim);
    margin-bottom: 6px;
  }
  input[type="text"], input[type="password"], input[type="url"], select, textarea {
    width: 100%;
    padding: 10px 14px;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    outline: none;
    transition: border-color 0.15s;
  }
  input:focus, select:focus, textarea:focus { border-color: var(--accent-blue); }
  textarea { resize: vertical; min-height: 80px; }

  /* ── LOG PANEL ─────────────────────────────── */
  .log-panel {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 16px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--text-secondary);
    max-height: 300px;
    overflow-y: auto;
    line-height: 1.8;
    white-space: pre-wrap;
  }
  .log-line.ok { color: var(--accent-green); }
  .log-line.err { color: var(--accent-red); }
  .log-line.info { color: var(--accent-blue); }
  .log-line.warn { color: var(--accent-amber); }

  /* ── TABS ──────────────────────────────────── */
  .tab-bar {
    display: flex; gap: 0;
    border-bottom: 1px solid var(--border);
    margin-bottom: 20px;
  }
  .tab {
    padding: 10px 20px;
    font-size: 13px; font-weight: 600;
    color: var(--text-dim);
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
  }
  .tab:hover { color: var(--text-secondary); }
  .tab.active { color: var(--accent-blue); border-bottom-color: var(--accent-blue); }

  /* ── GRID PANELS ───────────────────────────── */
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px; }

  /* ── TOAST ─────────────────────────────────── */
  .toast-container {
    position: fixed; bottom: 24px; right: 24px;
    z-index: 999; display: flex; flex-direction: column; gap: 8px;
  }
  .toast {
    padding: 12px 20px;
    border-radius: var(--radius-sm);
    font-size: 13px; font-weight: 500;
    animation: slideIn 0.3s ease;
    box-shadow: 0 8px 24px rgba(0,0,0,0.4);
  }
  .toast.success { background: var(--accent-green); color: #000; }
  .toast.error { background: var(--accent-red); color: #fff; }
  .toast.info { background: var(--accent-blue); color: #fff; }
  @keyframes slideIn { from { transform: translateX(100px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }

  /* ── LOADING ───────────────────────────────── */
  .spinner {
    width: 16px; height: 16px;
    border: 2px solid var(--border);
    border-top-color: var(--accent-blue);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
    display: inline-block;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  /* ── MODAL ─────────────────────────────────── */
  .modal-backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.6);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex; align-items: center; justify-content: center;
  }
  .modal {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 28px;
    width: 500px;
    max-width: 90vw;
    max-height: 80vh;
    overflow-y: auto;
  }
  .modal h3 { margin-bottom: 18px; font-size: 16px; }
  .modal-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 20px; }

  /* ── SCROLLBAR ─────────────────────────────── */
  ::-webkit-scrollbar { width: 6px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--border-bright); }

  /* ── EMPTY STATE ───────────────────────────── */
  .empty-state {
    text-align: center; padding: 48px 20px;
    color: var(--text-dim);
  }
  .empty-state .icon { font-size: 40px; margin-bottom: 12px; }
  .empty-state p { font-size: 14px; max-width: 400px; margin: 0 auto; }

  /* ── RESPONSIVE ────────────────────────────── */
  @media (max-width: 768px) {
    .sidebar { display: none; }
    .main { padding: 16px; }
    .stats-grid { grid-template-columns: 1fr 1fr; }
    .grid-2, .grid-3 { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>

<div class="shell" id="app"></div>

<script>
// ─── CONFIG ─────────────────────────────────────────────────────────
const API_BASE = window.location.origin;
let API_KEY = localStorage.getItem('te_api_key') || '';
let currentView = 'overview';

// ─── API HELPER ─────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (API_KEY) headers['x-api-key'] = API_KEY;
  const res = await fetch(\`\${API_BASE}\${path}\`, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(\`\${res.status}: \${text.slice(0, 200)}\`);
  }
  return res.json();
}

// ─── STATE ──────────────────────────────────────────────────────────
let state = {
  health: null,
  collections: [],
  vectorStatus: null,
  loading: true,
  selectedCollection: null,
  collectionDetail: null,
  collectionSources: [],
  logs: [],
  toasts: [],
};

function log(msg, type = '') {
  const ts = new Date().toLocaleTimeString();
  state.logs.unshift({ ts, msg, type });
  if (state.logs.length > 200) state.logs = state.logs.slice(0, 200);
}

function toast(msg, type = 'info') {
  const id = Date.now();
  state.toasts.push({ id, msg, type });
  setTimeout(() => { state.toasts = state.toasts.filter(t => t.id !== id); render(); }, 3500);
  render();
}

// ─── DATA FETCHING ──────────────────────────────────────────────────
async function fetchAll() {
  state.loading = true;
  render();
  try {
    const [health, collections, vectorStatus] = await Promise.all([
      api('/health'),
      api('/collections').catch(() => []),
      api('/admin/vector-status').catch(() => ({ vectorStore: 'unknown', qdrantConnected: false })),
    ]);
    state.health = health;
    state.collections = collections;
    state.vectorStatus = vectorStatus;
    log('System status loaded', 'ok');
  } catch (err) {
    log(\`Failed to load: \${err.message}\`, 'err');
    toast('Connection failed — check API key', 'error');
  }
  state.loading = false;
  render();
}

async function fetchCollectionDetail(id) {
  try {
    const [detail, sources] = await Promise.all([
      api(\`/collections/\${id}\`),
      api(\`/sources/\${id}\`),
    ]);
    state.collectionDetail = detail;
    state.collectionSources = sources;
  } catch (err) {
    log(\`Failed to load collection \${id}: \${err.message}\`, 'err');
  }
  render();
}

async function migrateVectors(collectionId) {
  log(\`Migrating vectors for \${collectionId}...\`, 'info');
  toast('Migrating vectors to Qdrant...', 'info');
  render();
  try {
    const result = await api(\`/admin/migrate-vectors/\${collectionId}\`, { method: 'POST' });
    log(\`Migrated \${result.migrated}/\${result.total} vectors → \${result.collection}\`, 'ok');
    toast(\`\${result.migrated} vectors migrated!\`, 'success');
  } catch (err) {
    log(\`Migration failed: \${err.message}\`, 'err');
    toast('Migration failed', 'error');
  }
  render();
}

async function ingestVideo(collectionId, videoUrl) {
  log(\`Ingesting \${videoUrl} → \${collectionId}...\`, 'info');
  toast('Ingestion started...', 'info');
  render();
  try {
    const result = await api('/ingest/youtube', {
      method: 'POST',
      body: JSON.stringify({ collectionId, videoUrl }),
    });
    log(\`Ingested: \${result.source?.title || 'done'}\`, 'ok');
    toast('Video ingested!', 'success');
    await fetchCollectionDetail(collectionId);
  } catch (err) {
    log(\`Ingest failed: \${err.message}\`, 'err');
    toast('Ingestion failed', 'error');
  }
  render();
}

async function createCollection(id, name, templateId) {
  try {
    await api('/collections', {
      method: 'POST',
      body: JSON.stringify({ id, name, templateId }),
    });
    log(\`Collection created: \${name} (\${templateId})\`, 'ok');
    toast('Collection created!', 'success');
    await fetchAll();
  } catch (err) {
    log(\`Create failed: \${err.message}\`, 'err');
    toast('Failed to create collection', 'error');
  }
}

async function testSearch(collectionId, query) {
  log(\`Searching "\${query}" in \${collectionId}...\`, 'info');
  try {
    const result = await api(\`/search/\${collectionId}?q=\${encodeURIComponent(query)}&top_k=5\`);
    log(\`Found \${result.results?.length || 0} results\`, 'ok');
    return result;
  } catch (err) {
    log(\`Search failed: \${err.message}\`, 'err');
    return null;
  }
}

async function testAsk(collectionId, question) {
  log(\`Asking "\${question}" in \${collectionId}...\`, 'info');
  try {
    const result = await api(\`/ask/\${collectionId}\`, {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
    log(\`Answer received (\${result.sources?.length || 0} sources)\`, 'ok');
    return result;
  } catch (err) {
    log(\`Ask failed: \${err.message}\`, 'err');
    return null;
  }
}

// ─── RENDER ─────────────────────────────────────────────────────────
function render() {
  const app = document.getElementById('app');
  app.innerHTML = \`
    \${renderSidebar()}
    <div class="main">
      \${currentView === 'overview' ? renderOverview() : ''}
      \${currentView === 'collections' ? renderCollections() : ''}
      \${currentView === 'collection-detail' ? renderCollectionDetail() : ''}
      \${currentView === 'playground' ? renderPlayground() : ''}
      \${currentView === 'api-keys' ? renderApiKeys() : ''}
      \${currentView === 'settings' ? renderSettings() : ''}
      \${currentView === 'logs' ? renderLogs() : ''}
    </div>
    <div class="toast-container">
      \${state.toasts.map(t => \`<div class="toast \${t.type}">\${t.msg}</div>\`).join('')}
    </div>
  \`;
}

function renderSidebar() {
  const h = state.health || {};
  return \`
    <div class="sidebar">
      <div class="sidebar-brand">
        <h1><span class="dot"></span> TrueEngine</h1>
        <div class="version">v\${h.version || '...'} — Command Center</div>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Monitor</div>
        <div class="nav-item \${currentView === 'overview' ? 'active' : ''}" onclick="navigate('overview')">
          <span class="icon">◎</span> Overview
        </div>
        <div class="nav-item \${currentView === 'collections' ? 'active' : ''}" onclick="navigate('collections')">
          <span class="icon">◫</span> Collections
          <span class="badge">\${state.collections.length}</span>
        </div>
        <div class="nav-item \${currentView === 'playground' ? 'active' : ''}" onclick="navigate('playground')">
          <span class="icon">▷</span> Playground
        </div>
      </div>

      <div class="nav-section">
        <div class="nav-section-label">Admin</div>
        <div class="nav-item \${currentView === 'api-keys' ? 'active' : ''}" onclick="navigate('api-keys')">
          <span class="icon">⚿</span> API Keys
        </div>
        <div class="nav-item \${currentView === 'settings' ? 'active' : ''}" onclick="navigate('settings')">
          <span class="icon">⚙</span> Settings
        </div>
        <div class="nav-item \${currentView === 'logs' ? 'active' : ''}" onclick="navigate('logs')">
          <span class="icon">▤</span> Activity Log
          <span class="badge">\${state.logs.length}</span>
        </div>
      </div>
    </div>
  \`;
}

function renderOverview() {
  const h = state.health || {};
  const v = state.vectorStatus || {};
  const totalSources = state.collections.reduce((s, c) => {
    const stats = c.stats || {};
    return s + (stats.sourceCount || 0);
  }, 0);
  const totalChunks = state.collections.reduce((s, c) => {
    const stats = c.stats || {};
    return s + (stats.chunkCount || 0);
  }, 0);

  return \`
    <div class="page-header">
      <div>
        <h2>System Overview</h2>
        <div class="subtitle">TrueEngine — Content Intelligence & Knowledge Extraction</div>
      </div>
      <div class="header-actions">
        <button class="btn" onclick="fetchAll()">↻ Refresh</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card green">
        <div class="label">Status</div>
        <div class="value" style="font-size:20px">\${h.status === 'ok' ? '● LIVE' : '○ DOWN'}</div>
        <div class="sub">Port \${window.location.port || '443'}</div>
      </div>
      <div class="stat-card blue">
        <div class="label">Collections</div>
        <div class="value">\${state.collections.length}</div>
        <div class="sub">\${totalSources} sources ingested</div>
      </div>
      <div class="stat-card purple">
        <div class="label">Vector Store</div>
        <div class="value" style="font-size:18px">\${v.qdrantConnected ? '● QDRANT' : '○ SQLite'}</div>
        <div class="sub">\${v.qdrantConnected ? 'Hybrid search active' : 'Cosine fallback'}</div>
      </div>
      <div class="stat-card amber">
        <div class="label">Total Chunks</div>
        <div class="value">\${totalChunks.toLocaleString()}</div>
        <div class="sub">Embedded & searchable</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h3>Services</h3></div>
        <div class="panel-body">
          <table>
            <tr>
              <td><span class="status-dot \${h.hasOpenRouter ? 'on' : 'off'}"></span>OpenRouter (LLM)</td>
              <td style="text-align:right"><span class="mono">\${h.hasOpenRouter ? 'Connected' : 'Missing'}</span></td>
            </tr>
            <tr>
              <td><span class="status-dot \${h.hasYouTubeAPI ? 'on' : 'off'}"></span>YouTube Data API</td>
              <td style="text-align:right"><span class="mono">\${h.hasYouTubeAPI ? 'Connected' : 'Missing'}</span></td>
            </tr>
            <tr>
              <td><span class="status-dot \${h.hasGroq ? 'on' : 'off'}"></span>Groq Whisper</td>
              <td style="text-align:right"><span class="mono">\${h.hasGroq ? 'Connected' : 'Missing'}</span></td>
            </tr>
            <tr>
              <td><span class="status-dot \${v.qdrantConnected ? 'on' : 'off'}"></span>Qdrant Vector DB</td>
              <td style="text-align:right"><span class="mono">\${v.qdrantConnected ? 'Connected' : 'Offline'}</span></td>
            </tr>
          </table>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Templates</h3></div>
        <div class="panel-body">
          <table>
            \${(h.templates || []).map(t => \`
              <tr>
                <td><span class="mono">\${t}</span></td>
                <td style="text-align:right;color:var(--text-dim)">\${state.collections.filter(c => c.template_id === t).length} collections</td>
              </tr>
            \`).join('')}
          </table>
        </div>
      </div>
    </div>

    <div class="panel" style="margin-top: 16px;">
      <div class="panel-header">
        <h3>Recent Activity</h3>
        <span class="mono" style="color:var(--text-dim)">\${state.logs.length} entries</span>
      </div>
      <div class="panel-body">
        <div class="log-panel">\${state.logs.slice(0, 15).map(l =>
          \`<div class="log-line \${l.type}"><span style="color:var(--text-dim)">[\${l.ts}]</span> \${escHtml(l.msg)}</div>\`
        ).join('') || '<div style="color:var(--text-dim)">No activity yet</div>'}</div>
      </div>
    </div>
  \`;
}

function renderCollections() {
  return \`
    <div class="page-header">
      <div>
        <h2>Collections</h2>
        <div class="subtitle">Each collection = one person, brand, or content source</div>
      </div>
      <div class="header-actions">
        <button class="btn primary" onclick="showCreateCollectionModal()">+ New Collection</button>
      </div>
    </div>

    \${state.collections.length === 0 ? \`
      <div class="empty-state">
        <div class="icon">◫</div>
        <p>No collections yet. Create one to start ingesting content.</p>
      </div>
    \` : \`
      <div class="panel">
        <div class="panel-body">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Template</th>
                <th>ID</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              \${state.collections.map(c => \`
                <tr style="cursor:pointer" onclick="viewCollection('\${c.id}')">
                  <td style="color:var(--text-primary);font-weight:600">\${escHtml(c.name)}</td>
                  <td><span class="mono">\${c.template_id}</span></td>
                  <td><span class="mono">\${c.id}</span></td>
                  <td><span class="mono">\${c.created_at ? new Date(c.created_at).toLocaleDateString() : '—'}</span></td>
                  <td style="text-align:right">
                    <button class="btn sm" onclick="event.stopPropagation();migrateVectors('\${c.id}')">⇢ Qdrant</button>
                  </td>
                </tr>
              \`).join('')}
            </tbody>
          </table>
        </div>
      </div>
    \`}
  \`;
}

function renderCollectionDetail() {
  const c = state.collectionDetail;
  if (!c) return '<div class="empty-state"><div class="spinner"></div></div>';

  const stats = c.stats || {};
  return \`
    <div class="page-header">
      <div>
        <h2>\${escHtml(c.name)}</h2>
        <div class="subtitle"><span class="mono">\${c.id}</span> · \${c.template_id} template</div>
      </div>
      <div class="header-actions">
        <button class="btn" onclick="navigate('collections')">← Back</button>
        <button class="btn" onclick="migrateVectors('\${c.id}')">⇢ Migrate to Qdrant</button>
        <button class="btn primary" onclick="showIngestModal('\${c.id}')">+ Ingest Video</button>
      </div>
    </div>

    <div class="stats-grid">
      <div class="stat-card blue">
        <div class="label">Sources</div>
        <div class="value">\${stats.sourceCount || 0}</div>
      </div>
      <div class="stat-card purple">
        <div class="label">Chunks</div>
        <div class="value">\${stats.chunkCount || 0}</div>
      </div>
      <div class="stat-card amber">
        <div class="label">Duration</div>
        <div class="value">\${stats.totalDurationHours || 0}h</div>
      </div>
      <div class="stat-card green">
        <div class="label">Vector Store</div>
        <div class="value" style="font-size:16px">\${stats.vectorStore || 'sqlite'}</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Sources</h3></div>
      <div class="panel-body">
        \${state.collectionSources.length === 0 ? \`
          <div class="empty-state"><p>No sources ingested yet.</p></div>
        \` : \`
          <table>
            <thead><tr><th>Title</th><th>Status</th><th>Type</th><th>Duration</th></tr></thead>
            <tbody>
              \${state.collectionSources.map(s => {
                const meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || {});
                return \`
                  <tr>
                    <td style="color:var(--text-primary)">\${escHtml(s.title || s.id)}</td>
                    <td><span class="status-dot \${s.status === 'ready' ? 'on' : s.status === 'error' ? 'off' : 'warn'}"></span>\${s.status}</td>
                    <td><span class="mono">\${s.source_type || 'youtube'}</span></td>
                    <td><span class="mono">\${s.duration ? Math.round(s.duration / 60) + 'm' : '—'}</span></td>
                  </tr>
                \`;
              }).join('')}
            </tbody>
          </table>
        \`}
      </div>
    </div>
  \`;
}

function renderPlayground() {
  return \`
    <div class="page-header">
      <div>
        <h2>Playground</h2>
        <div class="subtitle">Test search and ask against any collection</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="panel">
        <div class="panel-header"><h3>Search (Vector)</h3></div>
        <div class="panel-body" style="padding:20px">
          <div class="input-group">
            <label>Collection</label>
            <select id="search-collection">
              \${state.collections.map(c => \`<option value="\${c.id}">\${c.name}</option>\`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label>Query</label>
            <input type="text" id="search-query" placeholder="What topics do they cover?" onkeydown="if(event.key==='Enter')runSearch()">
          </div>
          <button class="btn primary" onclick="runSearch()">Search</button>
          <div id="search-results" style="margin-top:16px"></div>
        </div>
      </div>

      <div class="panel">
        <div class="panel-header"><h3>Ask (RAG + LLM)</h3></div>
        <div class="panel-body" style="padding:20px">
          <div class="input-group">
            <label>Collection</label>
            <select id="ask-collection">
              \${state.collections.map(c => \`<option value="\${c.id}">\${c.name}</option>\`).join('')}
            </select>
          </div>
          <div class="input-group">
            <label>Question</label>
            <input type="text" id="ask-question" placeholder="What's their opinion on...?" onkeydown="if(event.key==='Enter')runAsk()">
          </div>
          <button class="btn primary" onclick="runAsk()">Ask</button>
          <div id="ask-results" style="margin-top:16px"></div>
        </div>
      </div>
    </div>
  \`;
}

function renderApiKeys() {
  return \`
    <div class="page-header">
      <div>
        <h2>API Keys</h2>
        <div class="subtitle">Manage access for customers and integrations</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Current API Key (Admin)</h3></div>
      <div class="panel-body" style="padding:20px">
        <div class="input-group">
          <label>API Key (x-api-key header)</label>
          <input type="password" id="current-key" value="\${escHtml(API_KEY)}" readonly>
        </div>
        <p style="font-size:13px;color:var(--text-dim);margin-top:8px">
          Multi-key support with per-customer keys, rate limits, and usage tracking coming in v1.2.
          Currently using a single shared API key set via the API_SECRET_KEY environment variable.
        </p>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>API Endpoints</h3></div>
      <div class="panel-body">
        <table>
          <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
          <tbody>
            <tr><td><span class="mono" style="color:var(--accent-green)">GET</span></td><td><span class="mono">/health</span></td><td>System status</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-green)">GET</span></td><td><span class="mono">/collections</span></td><td>List all collections</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-blue)">POST</span></td><td><span class="mono">/collections</span></td><td>Create collection</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-blue)">POST</span></td><td><span class="mono">/ingest/youtube</span></td><td>Ingest YouTube video</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-blue)">POST</span></td><td><span class="mono">/ingest/youtube-channel</span></td><td>Ingest full channel</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-green)">GET</span></td><td><span class="mono">/search/:id?q=</span></td><td>Vector search</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-blue)">POST</span></td><td><span class="mono">/ask/:id</span></td><td>RAG question answering</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-blue)">POST</span></td><td><span class="mono">/analyze/:id</span></td><td>Run extractors on collection</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-green)">GET</span></td><td><span class="mono">/dashboard/:id</span></td><td>HTML dashboard</td></tr>
            <tr><td><span class="mono" style="color:var(--accent-green)">GET</span></td><td><span class="mono">/intelligence/:id</span></td><td>Extracted intelligence data</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  \`;
}

function renderSettings() {
  const h = state.health || {};
  return \`
    <div class="page-header">
      <div>
        <h2>Settings</h2>
        <div class="subtitle">Environment configuration — update on Railway dashboard</div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Connection</h3></div>
      <div class="panel-body" style="padding:20px">
        <div class="input-group">
          <label>Admin API Key</label>
          <div style="display:flex;gap:8px">
            <input type="password" id="api-key-input" value="\${escHtml(API_KEY)}" placeholder="Enter your API_SECRET_KEY">
            <button class="btn" onclick="saveApiKey()">Save</button>
          </div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-header"><h3>Environment Variables</h3></div>
      <div class="panel-body" style="padding:20px">
        <p style="font-size:13px;color:var(--text-secondary);margin-bottom:16px">
          These are read from the server environment. Update them on the Railway dashboard → Variables tab.
        </p>
        <table>
          <thead><tr><th>Variable</th><th>Status</th></tr></thead>
          <tbody>
            <tr><td><span class="mono">OPENROUTER_API_KEY</span></td><td><span class="status-dot \${h.hasOpenRouter ? 'on' : 'off'}"></span>\${h.hasOpenRouter ? 'Set' : 'Missing'}</td></tr>
            <tr><td><span class="mono">YOUTUBE_API_KEY</span></td><td><span class="status-dot \${h.hasYouTubeAPI ? 'on' : 'off'}"></span>\${h.hasYouTubeAPI ? 'Set' : 'Missing'}</td></tr>
            <tr><td><span class="mono">GROQ_API_KEY</span></td><td><span class="status-dot \${h.hasGroq ? 'on' : 'off'}"></span>\${h.hasGroq ? 'Set' : 'Missing'}</td></tr>
            <tr><td><span class="mono">QDRANT_URL</span></td><td><span class="status-dot \${state.vectorStatus?.qdrantConnected ? 'on' : 'off'}"></span>\${state.vectorStatus?.qdrantConnected ? 'Connected' : 'Not set'}</td></tr>
            <tr><td><span class="mono">QDRANT_API_KEY</span></td><td><span class="status-dot \${state.vectorStatus?.qdrantConnected ? 'on' : 'off'}"></span>\${state.vectorStatus?.qdrantConnected ? 'Set' : 'Not set'}</td></tr>
            <tr><td><span class="mono">EMBEDDING_MODEL</span></td><td><span class="mono" style="color:var(--text-secondary)">768d</span></td></tr>
            <tr><td><span class="mono">API_SECRET_KEY</span></td><td><span class="status-dot \${API_KEY ? 'on' : 'warn'}"></span>\${API_KEY ? 'Configured' : 'Using open access'}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  \`;
}

function renderLogs() {
  return \`
    <div class="page-header">
      <div>
        <h2>Activity Log</h2>
        <div class="subtitle">\${state.logs.length} entries this session</div>
      </div>
      <div class="header-actions">
        <button class="btn" onclick="state.logs=[];render()">Clear</button>
      </div>
    </div>
    <div class="panel">
      <div class="panel-body">
        <div class="log-panel" style="max-height:600px">
          \${state.logs.map(l =>
            \`<div class="log-line \${l.type}"><span style="color:var(--text-dim)">[\${l.ts}]</span> \${escHtml(l.msg)}</div>\`
          ).join('') || '<div style="color:var(--text-dim)">No activity yet</div>'}
        </div>
      </div>
    </div>
  \`;
}

// ─── MODALS ─────────────────────────────────────────────────────────
function showCreateCollectionModal() {
  const templates = state.health?.templates || ['default'];
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'modal';
  modal.innerHTML = \`
    <div class="modal">
      <h3>New Collection</h3>
      <div class="input-group">
        <label>ID (url-safe, lowercase)</label>
        <input type="text" id="new-col-id" placeholder="e.g. johndoe">
      </div>
      <div class="input-group">
        <label>Name</label>
        <input type="text" id="new-col-name" placeholder="e.g. John Doe">
      </div>
      <div class="input-group">
        <label>Template</label>
        <select id="new-col-template">
          \${templates.map(t => \`<option value="\${t}">\${t}</option>\`).join('')}
        </select>
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="submitCreateCollection()">Create</button>
      </div>
    </div>
  \`;
  document.body.appendChild(modal);
}

function showIngestModal(collectionId) {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'modal';
  modal.innerHTML = \`
    <div class="modal">
      <h3>Ingest YouTube Video</h3>
      <div class="input-group">
        <label>YouTube URL</label>
        <input type="url" id="ingest-url" placeholder="https://www.youtube.com/watch?v=...">
      </div>
      <div class="modal-actions">
        <button class="btn" onclick="closeModal()">Cancel</button>
        <button class="btn primary" onclick="submitIngest('\${collectionId}')">Ingest</button>
      </div>
    </div>
  \`;
  document.body.appendChild(modal);
}

function closeModal() {
  const m = document.getElementById('modal');
  if (m) m.remove();
}

function submitCreateCollection() {
  const id = document.getElementById('new-col-id').value.trim();
  const name = document.getElementById('new-col-name').value.trim();
  const template = document.getElementById('new-col-template').value;
  if (!id || !name) return toast('ID and Name required', 'error');
  closeModal();
  createCollection(id, name, template);
}

function submitIngest(collectionId) {
  const url = document.getElementById('ingest-url').value.trim();
  if (!url) return toast('URL required', 'error');
  closeModal();
  ingestVideo(collectionId, url);
}

// ─── PLAYGROUND ACTIONS ─────────────────────────────────────────────
async function runSearch() {
  const col = document.getElementById('search-collection').value;
  const q = document.getElementById('search-query').value.trim();
  if (!q) return;
  const el = document.getElementById('search-results');
  el.innerHTML = '<div class="spinner"></div>';
  const result = await testSearch(col, q);
  if (!result || !result.results) { el.innerHTML = '<p style="color:var(--text-dim)">No results</p>'; return; }
  el.innerHTML = result.results.map((r, i) => \`
    <div style="padding:10px 0;border-bottom:1px solid var(--border);font-size:13px">
      <div style="color:var(--accent-blue);font-size:11px;font-family:'JetBrains Mono',monospace;margin-bottom:4px">
        \${r.similarity}% · \${r.timestamp}
      </div>
      <div style="color:var(--text-secondary)">\${escHtml(r.text.slice(0, 200))}\${r.text.length > 200 ? '...' : ''}</div>
    </div>
  \`).join('');
}

async function runAsk() {
  const col = document.getElementById('ask-collection').value;
  const q = document.getElementById('ask-question').value.trim();
  if (!q) return;
  const el = document.getElementById('ask-results');
  el.innerHTML = '<div class="spinner"></div> <span style="color:var(--text-dim);font-size:13px">Thinking...</span>';
  const result = await testAsk(col, q);
  if (!result) { el.innerHTML = '<p style="color:var(--text-dim)">Error</p>'; return; }
  el.innerHTML = \`
    <div style="padding:14px;background:var(--bg-deep);border-radius:var(--radius-sm);border:1px solid var(--border);margin-top:8px">
      <div style="font-size:14px;color:var(--text-primary);line-height:1.6">\${escHtml(result.answer)}</div>
      \${result.sources?.length ? \`
        <div style="margin-top:12px;padding-top:10px;border-top:1px solid var(--border);font-size:11px;color:var(--text-dim)">
          Sources: \${result.sources.map(s => \`[\${s.timestamp} · \${s.similarity}%]\`).join(' ')}
        </div>
      \` : ''}
    </div>
  \`;
}

// ─── NAV & UTILS ────────────────────────────────────────────────────
function navigate(view) {
  currentView = view;
  render();
}

function viewCollection(id) {
  state.selectedCollection = id;
  currentView = 'collection-detail';
  state.collectionDetail = null;
  render();
  fetchCollectionDetail(id);
}

function saveApiKey() {
  API_KEY = document.getElementById('api-key-input').value.trim();
  localStorage.setItem('te_api_key', API_KEY);
  toast('API key saved', 'success');
  fetchAll();
}

function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ─── BOOT ───────────────────────────────────────────────────────────
render();
fetchAll();
</script>

</body>
</html>
`;

module.exports = { getAdminHTML };
