/**
 * TrueEngine - REST API Server
 * Deploy on Railway. All endpoints return JSON.
 */
const express = require('express');
const cors = require('cors');
const config = require('./config');
const TrueEngine = require('./core/engine');
const dashboard = require('./core/dashboard');
const { getAdminHTML } = require('./core/admin');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));
const engine = new TrueEngine();

function authMiddleware(req, res, next) {
  if (!config.API_SECRET_KEY) return next();
  const key = req.headers['x-api-key'] || req.query.api_key;
  if (key !== config.API_SECRET_KEY) return res.status(401).json({ error: 'Invalid API key' });
  next();
}

app.get('/health', (req, res) => { res.json({ status: 'ok', engine: 'TrueEngine', version: '1.1.0', templates: Object.keys(config.TEMPLATES), hasOpenRouter: !!config.OPENROUTER_API_KEY, hasYouTubeAPI: !!config.YOUTUBE_API_KEY, hasGroq: !!config.GROQ_API_KEY, vectorStore: engine.store.qdrantReady ? 'qdrant' : 'sqlite', qdrantConnected: engine.store.qdrantReady }); });

app.post('/collections', authMiddleware, (req, res) => { try { const { id, templateId, name, description, metadata } = req.body; if (!id) return res.status(400).json({ error: 'id is required' }); const col = engine.createCollection(id, templateId, name, description); res.json({ ok: true, collection: col }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.get('/collections', authMiddleware, (req, res) => { res.json(engine.listCollections()); });
app.get('/collections/:id', authMiddleware, (req, res) => { const col = engine.getCollection(req.params.id); if (!col) return res.status(404).json({ error: 'Collection not found' }); const stats = engine.getStats(req.params.id); res.json({ ...col, stats }); });

app.post('/ingest/youtube', authMiddleware, async (req, res) => { try { const { collectionId, videoUrl } = req.body; if (!collectionId || !videoUrl) return res.status(400).json({ error: 'collectionId and videoUrl required' }); const result = await engine.ingestYouTubeVideo(collectionId, videoUrl); res.json({ ok: true, source: result }); } catch (err) { res.status(500).json({ error: err.message }); } });

app.post('/ingest/youtube-channel', authMiddleware, async (req, res) => { try { const { collectionId, channelUrl, maxVideos } = req.body; if (!collectionId || !channelUrl) return res.status(400).json({ error: 'collectionId and channelUrl required' }); res.json({ ok: true, status: 'ingestion_started', collectionId, channelUrl, maxVideos: maxVideos || 50 }); engine.ingestYouTubeChannel(collectionId, channelUrl, maxVideos || 50).then(results => console.log(`  Channel ingestion complete:`, results)).catch(err => console.error(`  Channel ingestion error:`, err.message)); } catch (err) { res.status(500).json({ error: err.message }); } });

app.post('/analyze/:collectionId', authMiddleware, async (req, res) => { try { const results = await engine.analyzeCollection(req.params.collectionId); res.json({ ok: true, results }); } catch (err) { res.status(500).json({ error: err.message }); } });
app.post('/analyze/:collectionId/:sourceId', authMiddleware, async (req, res) => { try { const result = await engine.analyzeSource(req.params.collectionId, req.params.sourceId); res.json({ ok: true, result }); } catch (err) { res.status(500).json({ error: err.message }); } });

// Dashboard - serves full HTML page
app.get('/dashboard/:collectionId', async (req, res) => {
  try {
    const html = await dashboard.generate(engine.store, req.params.collectionId);
    res.type('html').send(html);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Dashboard JSON - raw intelligence data for custom frontends
app.get('/dashboard/:collectionId/json', authMiddleware, async (req, res) => {
  try {
    const col = engine.getCollection(req.params.collectionId);
    if (!col) return res.status(404).json({ error: 'Collection not found' });
    const mergedIntel = engine.getIntelligence(req.params.collectionId, 'merged_extractors');
    const engagementIntel = engine.getIntelligence(req.params.collectionId, 'engagement_analytics');
    const sources = engine.store.getSources(req.params.collectionId);
    res.json({ collection: col, intelligence: mergedIntel?.data || {}, engagement: engagementIntel?.data || {}, sources: sources.map(s => ({ id: s.id, title: s.title, status: s.status })) });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/search/:collectionId', authMiddleware, async (req, res) => { try { const { q, top_k } = req.query; if (!q) return res.status(400).json({ error: 'q (query) required' }); const results = await engine.search(req.params.collectionId, q, parseInt(top_k) || 10); res.json({ query: q, results }); } catch (err) { res.status(500).json({ error: err.message }); } });

app.post('/ask/:collectionId', authMiddleware, async (req, res) => { try { const { question } = req.body; if (!question) return res.status(400).json({ error: 'question required' }); const result = await engine.ask(req.params.collectionId, question); res.json(result); } catch (err) { res.status(500).json({ error: err.message }); } });

// ─── Admin: Migrate existing SQLite vectors to Qdrant ────────────────────
app.post('/admin/migrate-vectors/:collectionId', authMiddleware, async (req, res) => {
  try {
    const result = await engine.store.migrateToQdrant(req.params.collectionId);
    res.json({ ok: true, ...result });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── Admin: Qdrant status ─────────────────────────────────────────────────
app.get('/admin/vector-status', authMiddleware, async (req, res) => {
  res.json({
    vectorStore: engine.store.qdrantReady ? 'qdrant' : 'sqlite',
    qdrantConnected: engine.store.qdrantReady,
    qdrantUrl: config.QDRANT_URL || 'not configured',
  });
});

app.get('/sources/:collectionId', authMiddleware, (req, res) => { res.json(engine.store.getSources(req.params.collectionId)); });
app.get('/intelligence/:collectionId', authMiddleware, (req, res) => { const { type } = req.query; res.json(engine.getIntelligence(req.params.collectionId, type || null)); });
app.get('/stats/:collectionId', authMiddleware, (req, res) => { res.json(engine.getStats(req.params.collectionId)); });

app.get('/admin', (req, res) => { res.type('html').send(getAdminHTML()); });

app.listen(config.PORT, '0.0.0.0', () => { console.log(`\n${'='.repeat(60)}`); console.log(`  TrueEngine API Server`); console.log(`  Port: ${config.PORT}`); console.log(`  OpenRouter: ${config.OPENROUTER_API_KEY ? 'YES' : 'NO'}`); console.log(`  YouTube API: ${config.YOUTUBE_API_KEY ? 'YES' : 'NO'}`); console.log(`  Groq: ${config.GROQ_API_KEY ? 'YES' : 'NO'}`); console.log(`  Templates: ${Object.keys(config.TEMPLATES).join(', ')}`); console.log(`${'='.repeat(60)}\n`); });

module.exports = app;
