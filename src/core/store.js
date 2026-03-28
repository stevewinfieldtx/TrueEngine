/**
 * TrueEngine - Storage
 * ======================
 * SQLite for metadata + Qdrant for vector search.
 * Hybrid architecture: SQLite stores chunks/sources/analysis,
 * Qdrant handles fast vector similarity search.
 * 
 * Falls back gracefully to SQLite cosine loop if Qdrant is unavailable.
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');

let Database;
try { Database = require('better-sqlite3'); } catch { Database = null; }

let QdrantClient;
try { QdrantClient = require('@qdrant/js-client-rest').QdrantClient; } catch { QdrantClient = null; }

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir || config.DATA_DIR;
    fs.mkdirSync(this.dataDir, { recursive: true });

    // SQLite — metadata, chunks text, analysis, intelligence
    if (Database) {
      this.db = new Database(path.join(this.dataDir, 'trueengine.db'));
      this.db.pragma('journal_mode = WAL');
      this._initTables();
    } else {
      this.db = null;
      console.log('  better-sqlite3 not available, using JSON fallback');
    }

    // Qdrant — vector search
    this.qdrant = null;
    this.qdrantReady = false;
    this._initQdrant();
  }

  /**
   * Initialize Qdrant client and verify connection.
   * Non-blocking — if Qdrant is down, we fall back to SQLite cosine loop.
   */
  async _initQdrant() {
    if (!QdrantClient || !config.QDRANT_URL) {
      console.log('  Qdrant: not configured (falling back to SQLite vector search)');
      return;
    }

    try {
      const opts = { url: config.QDRANT_URL };
      if (config.QDRANT_API_KEY) opts.apiKey = config.QDRANT_API_KEY;

      this.qdrant = new QdrantClient(opts);
      // Test connection
      const result = await this.qdrant.getCollections();
      this.qdrantReady = true;
      const existing = result.collections.map(c => c.name);
      console.log(`  Qdrant: connected (${existing.length} collections: ${existing.join(', ') || 'none'})`);
    } catch (err) {
      console.log(`  Qdrant: connection failed (${err.message}) — falling back to SQLite`);
      this.qdrant = null;
      this.qdrantReady = false;
    }
  }

  /**
   * Ensure a Qdrant collection exists for this TrueEngine collection.
   * Collection name in Qdrant = "te_" + collectionId (sanitized).
   */
  async _ensureQdrantCollection(collectionId) {
    if (!this.qdrantReady) return false;

    const qName = this._qdrantCollectionName(collectionId);
    try {
      await this.qdrant.getCollection(qName);
      return true; // already exists
    } catch {
      // Collection doesn't exist — create it
      try {
        await this.qdrant.createCollection(qName, {
          vectors: {
            size: config.EMBEDDING_DIMENSION,
            distance: 'Cosine',
          },
          // Optimized for small-to-medium collections (per-creator)
          optimizers_config: {
            default_segment_number: 2,
          },
        });
        console.log(`  Qdrant: created collection "${qName}" (${config.EMBEDDING_DIMENSION}d)`);
        return true;
      } catch (err) {
        console.error(`  Qdrant: failed to create collection "${qName}": ${err.message}`);
        return false;
      }
    }
  }

  _qdrantCollectionName(collectionId) {
    // Qdrant collection names: alphanumeric + underscores, max 255 chars
    return 'te_' + collectionId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200);
  }

  _initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT, template_id TEXT DEFAULT 'default', description TEXT DEFAULT '', metadata TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS sources (id TEXT PRIMARY KEY, collection_id TEXT, source_type TEXT DEFAULT 'youtube', source_url TEXT DEFAULT '', title TEXT DEFAULT '', author TEXT DEFAULT '', published_at TEXT DEFAULT '', duration INTEGER DEFAULT 0, metadata TEXT DEFAULT '{}', status TEXT DEFAULT 'pending', ingested_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (collection_id) REFERENCES collections(id));
      CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, source_id TEXT, collection_id TEXT, text TEXT, chunk_index INTEGER DEFAULT 0, start_time REAL DEFAULT 0, end_time REAL DEFAULT 0, word_count INTEGER DEFAULT 0, speaker TEXT, topics TEXT DEFAULT '[]', entities TEXT DEFAULT '[]', tone TEXT DEFAULT '', embedding TEXT, FOREIGN KEY (source_id) REFERENCES sources(id), FOREIGN KEY (collection_id) REFERENCES collections(id));
      CREATE TABLE IF NOT EXISTS analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id TEXT, source_id TEXT, analysis_type TEXT, data TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (collection_id) REFERENCES collections(id));
      CREATE TABLE IF NOT EXISTS intelligence (id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id TEXT, intel_type TEXT, data TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), FOREIGN KEY (collection_id) REFERENCES collections(id));
      CREATE INDEX IF NOT EXISTS idx_sources_collection ON sources(collection_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_collection ON chunks(collection_id);
      CREATE INDEX IF NOT EXISTS idx_analysis_collection ON analysis(collection_id);
      CREATE INDEX IF NOT EXISTS idx_intelligence_collection ON intelligence(collection_id);
    `);
  }

  // ─── Collections ─────────────────────────────────────────────────────────

  createCollection(id, name, templateId = 'default', description = '', metadata = {}) {
    if (!this.db) return this._jsonCreateCollection(id, name, templateId, description, metadata);
    this.db.prepare('INSERT OR REPLACE INTO collections (id, name, template_id, description, metadata) VALUES (?, ?, ?, ?, ?)').run(id, name, templateId, description, JSON.stringify(metadata));
    // Pre-create Qdrant collection
    this._ensureQdrantCollection(id).catch(() => {});
    return { id, name, templateId, description, metadata };
  }

  getCollection(id) {
    if (!this.db) return this._jsonGetCollection(id);
    const row = this.db.prepare('SELECT * FROM collections WHERE id = ?').get(id);
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata || '{}') };
  }

  listCollections() {
    if (!this.db) return this._jsonListCollections();
    return this.db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all().map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
  }

  // ─── Sources ─────────────────────────────────────────────────────────────

  addSource(collectionId, source) {
    if (!this.db) return this._jsonAddSource(collectionId, source);
    this.db.prepare('INSERT OR REPLACE INTO sources (id, collection_id, source_type, source_url, title, author, published_at, duration, metadata, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(source.id, collectionId, source.sourceType || 'youtube', source.sourceUrl || '', source.title || '', source.author || '', source.publishedAt || '', source.duration || 0, JSON.stringify(source.metadata || {}), source.status || 'ready');
    return source;
  }

  getSource(collectionId, sourceId) {
    if (!this.db) return null;
    const row = this.db.prepare('SELECT * FROM sources WHERE id = ? AND collection_id = ?').get(sourceId, collectionId);
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata || '{}') };
  }

  getSources(collectionId) {
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM sources WHERE collection_id = ? ORDER BY published_at DESC').all(collectionId).map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
  }

  // ─── Chunks (SQLite + Qdrant) ────────────────────────────────────────────

  /**
   * Store chunks in SQLite AND upsert vectors into Qdrant.
   * SQLite keeps all chunk data (text, metadata, timestamps).
   * Qdrant only stores vectors + minimal payload for search.
   */
  storeChunks(collectionId, sourceId, chunks) {
    if (!this.db) return this._jsonStoreChunks(collectionId, sourceId, chunks);

    // SQLite — full chunk data
    const stmt = this.db.prepare('INSERT OR REPLACE INTO chunks (id, source_id, collection_id, text, chunk_index, start_time, end_time, word_count, speaker, topics, entities, tone, embedding) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    const tx = this.db.transaction((items) => {
      for (const c of items) {
        stmt.run(
          c.chunkId, sourceId, collectionId, c.text, c.chunkIndex,
          c.startTime || 0, c.endTime || 0, c.wordCount || 0,
          c.speaker || null, JSON.stringify(c.topics || []),
          JSON.stringify(c.entities || []), c.tone || '',
          c.embedding ? JSON.stringify(c.embedding) : null
        );
      }
    });
    tx(chunks);

    // Qdrant — vectors + search payload (async, non-blocking)
    this._upsertQdrantVectors(collectionId, sourceId, chunks).catch(err => {
      console.log(`  Qdrant upsert skipped: ${err.message}`);
    });
  }

  /**
   * Push vectors to Qdrant for fast similarity search.
   * Payload includes enough data to return useful results without
   * hitting SQLite for every search result.
   */
  async _upsertQdrantVectors(collectionId, sourceId, chunks) {
    if (!this.qdrantReady) return;

    const ready = await this._ensureQdrantCollection(collectionId);
    if (!ready) return;

    const qName = this._qdrantCollectionName(collectionId);
    const points = [];

    for (const c of chunks) {
      if (!c.embedding || !Array.isArray(c.embedding)) continue;
      points.push({
        id: this._hashToInt(c.chunkId),  // Qdrant needs numeric or UUID ids
        vector: c.embedding,
        payload: {
          chunk_id: c.chunkId,
          source_id: sourceId,
          collection_id: collectionId,
          text: c.text,
          chunk_index: c.chunkIndex || 0,
          start_time: c.startTime || 0,
          end_time: c.endTime || 0,
          speaker: c.speaker || '',
          topics: c.topics || [],
          word_count: c.wordCount || 0,
        },
      });
    }

    if (points.length === 0) return;

    // Batch upsert (Qdrant handles batching internally, but we cap at 100)
    const batchSize = 100;
    for (let i = 0; i < points.length; i += batchSize) {
      const batch = points.slice(i, i + batchSize);
      await this.qdrant.upsert(qName, { wait: true, points: batch });
    }

    console.log(`  Qdrant: upserted ${points.length} vectors to "${qName}"`);
  }

  /**
   * Convert a string ID to a numeric hash for Qdrant point IDs.
   * Uses a simple but collision-resistant hash.
   */
  _hashToInt(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit int
    }
    // Qdrant needs positive integers
    return Math.abs(hash);
  }

  getChunks(collectionId, sourceId = null) {
    if (!this.db) return [];
    let rows;
    if (sourceId) {
      rows = this.db.prepare('SELECT * FROM chunks WHERE collection_id = ? AND source_id = ? ORDER BY chunk_index').all(collectionId, sourceId);
    } else {
      rows = this.db.prepare('SELECT * FROM chunks WHERE collection_id = ? ORDER BY source_id, chunk_index').all(collectionId);
    }
    return rows.map(r => ({
      ...r,
      topics: JSON.parse(r.topics || '[]'),
      entities: JSON.parse(r.entities || '[]'),
      embedding: r.embedding ? JSON.parse(r.embedding) : null,
    }));
  }

  // ─── Search (Qdrant primary, SQLite fallback) ────────────────────────────

  /**
   * Vector similarity search.
   * Tries Qdrant first (fast, scalable).
   * Falls back to SQLite cosine loop if Qdrant unavailable.
   */
  async search(collectionId, queryEmbedding, topK = 10) {
    if (!queryEmbedding) return [];

    // Try Qdrant first
    if (this.qdrantReady) {
      try {
        return await this._qdrantSearch(collectionId, queryEmbedding, topK);
      } catch (err) {
        console.log(`  Qdrant search failed, falling back to SQLite: ${err.message}`);
      }
    }

    // Fallback: SQLite cosine loop
    return this._sqliteSearch(collectionId, queryEmbedding, topK);
  }

  /**
   * Qdrant vector search — fast, scales to millions of chunks.
   */
  async _qdrantSearch(collectionId, queryEmbedding, topK) {
    const qName = this._qdrantCollectionName(collectionId);

    const results = await this.qdrant.search(qName, {
      vector: queryEmbedding,
      limit: topK,
      with_payload: true,
      score_threshold: 0.1,  // Filter out very low matches
    });

    return results.map(r => ({
      id: r.payload.chunk_id,
      source_id: r.payload.source_id,
      collection_id: r.payload.collection_id,
      text: r.payload.text,
      chunk_index: r.payload.chunk_index,
      start_time: r.payload.start_time,
      end_time: r.payload.end_time,
      speaker: r.payload.speaker,
      topics: r.payload.topics || [],
      word_count: r.payload.word_count,
      similarity: r.score,
    }));
  }

  /**
   * SQLite cosine similarity fallback — loads all chunks, scores in JS.
   * Works but doesn't scale past a few hundred chunks per collection.
   */
  _sqliteSearch(collectionId, queryEmbedding, topK) {
    if (!this.db) return [];
    const chunks = this.getChunks(collectionId).filter(c => c.embedding);
    const scored = chunks.map(chunk => ({
      ...chunk,
      similarity: cosineSim(queryEmbedding, chunk.embedding),
    }));
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  // ─── Analysis & Intelligence ─────────────────────────────────────────────

  storeAnalysis(collectionId, sourceId, analysisType, data) {
    if (!this.db) return this._jsonStoreAnalysis(collectionId, sourceId, analysisType, data);
    this.db.prepare('INSERT INTO analysis (collection_id, source_id, analysis_type, data) VALUES (?, ?, ?, ?)').run(collectionId, sourceId, analysisType, JSON.stringify(data));
  }

  getAnalysis(collectionId, sourceId = null, analysisType = null) {
    if (!this.db) return [];
    let sql = 'SELECT * FROM analysis WHERE collection_id = ?';
    const params = [collectionId];
    if (sourceId) { sql += ' AND source_id = ?'; params.push(sourceId); }
    if (analysisType) { sql += ' AND analysis_type = ?'; params.push(analysisType); }
    sql += ' ORDER BY created_at DESC';
    return this.db.prepare(sql).all(...params).map(r => ({ ...r, data: JSON.parse(r.data || '{}') }));
  }

  storeIntelligence(collectionId, intelType, data) {
    if (!this.db) return;
    this.db.prepare('DELETE FROM intelligence WHERE collection_id = ? AND intel_type = ?').run(collectionId, intelType);
    this.db.prepare('INSERT INTO intelligence (collection_id, intel_type, data) VALUES (?, ?, ?)').run(collectionId, intelType, JSON.stringify(data));
  }

  getIntelligence(collectionId, intelType = null) {
    if (!this.db) return null;
    if (intelType) {
      const row = this.db.prepare('SELECT * FROM intelligence WHERE collection_id = ? AND intel_type = ? ORDER BY created_at DESC LIMIT 1').get(collectionId, intelType);
      return row ? { data: JSON.parse(row.data || '{}') } : null;
    }
    return this.db.prepare('SELECT * FROM intelligence WHERE collection_id = ? ORDER BY created_at DESC').all(collectionId)
      .map(r => ({ type: r.intel_type, data: JSON.parse(r.data || '{}'), createdAt: r.created_at }));
  }

  // ─── Stats ───────────────────────────────────────────────────────────────

  getStats(collectionId) {
    if (!this.db) return {};
    const sourceCount = this.db.prepare('SELECT COUNT(*) as n FROM sources WHERE collection_id = ?').get(collectionId)?.n || 0;
    const chunkCount = this.db.prepare('SELECT COUNT(*) as n FROM chunks WHERE collection_id = ?').get(collectionId)?.n || 0;
    const totalDuration = this.db.prepare('SELECT SUM(duration) as d FROM sources WHERE collection_id = ?').get(collectionId)?.d || 0;

    // Qdrant stats if available
    let qdrantVectors = null;
    if (this.qdrantReady) {
      const qName = this._qdrantCollectionName(collectionId);
      this.qdrant.getCollection(qName)
        .then(info => { qdrantVectors = info.points_count; })
        .catch(() => {});
    }

    return {
      collectionId,
      sourceCount,
      chunkCount,
      totalDurationHours: Math.round(totalDuration / 3600 * 10) / 10,
      vectorStore: this.qdrantReady ? 'qdrant' : 'sqlite',
      qdrantVectors,
    };
  }

  // ─── Qdrant Admin ────────────────────────────────────────────────────────

  /**
   * Migrate existing SQLite embeddings to Qdrant.
   * Run once after upgrade: POST /admin/migrate-vectors/:collectionId
   */
  async migrateToQdrant(collectionId) {
    if (!this.qdrantReady) throw new Error('Qdrant not connected');

    const ready = await this._ensureQdrantCollection(collectionId);
    if (!ready) throw new Error('Failed to create Qdrant collection');

    const chunks = this.getChunks(collectionId);
    const withEmbeddings = chunks.filter(c => c.embedding);

    if (withEmbeddings.length === 0) {
      return { migrated: 0, message: 'No embeddings found in SQLite' };
    }

    console.log(`  Migrating ${withEmbeddings.length} vectors to Qdrant...`);

    const qName = this._qdrantCollectionName(collectionId);
    const batchSize = 100;
    let migrated = 0;

    for (let i = 0; i < withEmbeddings.length; i += batchSize) {
      const batch = withEmbeddings.slice(i, i + batchSize);
      const points = batch.map(c => ({
        id: this._hashToInt(c.id),
        vector: c.embedding,
        payload: {
          chunk_id: c.id,
          source_id: c.source_id,
          collection_id: collectionId,
          text: c.text,
          chunk_index: c.chunk_index || 0,
          start_time: c.start_time || 0,
          end_time: c.end_time || 0,
          speaker: c.speaker || '',
          topics: c.topics || [],
          word_count: c.word_count || 0,
        },
      }));

      await this.qdrant.upsert(qName, { wait: true, points });
      migrated += points.length;
      console.log(`  Migrated ${migrated}/${withEmbeddings.length}`);
    }

    return { migrated, total: withEmbeddings.length, collection: qName };
  }

  // ─── JSON Fallback (no SQLite) ───────────────────────────────────────────

  _jsonPath(name) { return path.join(this.dataDir, `${name}.json`); }
  _jsonRead(name) { try { return JSON.parse(fs.readFileSync(this._jsonPath(name), 'utf8')); } catch { return null; } }
  _jsonWrite(name, data) { fs.writeFileSync(this._jsonPath(name), JSON.stringify(data, null, 2)); }
  _jsonCreateCollection(id, name, templateId, description, metadata) { const cols = this._jsonRead('collections') || {}; cols[id] = { id, name, template_id: templateId, description, metadata, created_at: new Date().toISOString() }; this._jsonWrite('collections', cols); return cols[id]; }
  _jsonGetCollection(id) { return (this._jsonRead('collections') || {})[id] || null; }
  _jsonListCollections() { return Object.values(this._jsonRead('collections') || {}); }
  _jsonAddSource(collectionId, source) { const sources = this._jsonRead(`sources_${collectionId}`) || {}; sources[source.id] = { ...source, collectionId }; this._jsonWrite(`sources_${collectionId}`, sources); }
  _jsonStoreChunks(collectionId, sourceId, chunks) { const existing = this._jsonRead(`chunks_${collectionId}`) || {}; for (const c of chunks) existing[c.chunkId] = { ...c, sourceId, collectionId }; this._jsonWrite(`chunks_${collectionId}`, existing); }
  _jsonStoreAnalysis(collectionId, sourceId, analysisType, data) { const all = this._jsonRead(`analysis_${collectionId}`) || []; all.push({ collectionId, sourceId, analysisType, data, createdAt: new Date().toISOString() }); this._jsonWrite(`analysis_${collectionId}`, all); }
}

function cosineSim(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

module.exports = Store;
