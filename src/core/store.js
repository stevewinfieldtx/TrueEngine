/**
 * TrueEngine - Storage v2
 * =========================
 * PostgreSQL for persistent metadata (Railway).
 * Qdrant for vector search (Cloud).
 * SQLite as local-only fallback when no DATABASE_URL.
 */

const path = require('path');
const fs = require('fs');
const config = require('../config');

let Pool;
try { Pool = require('pg').Pool; } catch { Pool = null; }

let Database;
try { Database = require('better-sqlite3'); } catch { Database = null; }

let QdrantClient;
try { QdrantClient = require('@qdrant/js-client-rest').QdrantClient; } catch { QdrantClient = null; }

class Store {
  constructor(dataDir) {
    this.dataDir = dataDir || config.DATA_DIR;
    fs.mkdirSync(this.dataDir, { recursive: true });
    this.pg = null;
    this.db = null;
    this.qdrant = null;
    this.qdrantReady = false;
    this.pgReady = false;

    if (config.DATABASE_URL && Pool) {
      this.pg = new Pool({
        connectionString: config.DATABASE_URL,
        ssl: config.DATABASE_URL.includes('railway.internal') ? false : { rejectUnauthorized: false },
        max: 10,
      });
      this._initPostgres();
    } else if (Database) {
      this.db = new Database(path.join(this.dataDir, 'trueengine.db'));
      this.db.pragma('journal_mode = WAL');
      this._initSqliteTables();
      console.log('  Storage: SQLite (local only — set DATABASE_URL for persistence)');
    } else {
      console.log('  Storage: JSON fallback (no pg or better-sqlite3)');
    }

    this._initQdrant();
  }

  // ─── PostgreSQL Init ─────────────────────────────────────────────

  async _initPostgres() {
    try {
      await this.pg.query('SELECT 1');
      await this.pg.query(`
        CREATE TABLE IF NOT EXISTS collections (
          id TEXT PRIMARY KEY, name TEXT, template_id TEXT DEFAULT 'default',
          description TEXT DEFAULT '', metadata JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS sources (
          id TEXT, collection_id TEXT, source_type TEXT DEFAULT 'youtube',
          source_url TEXT DEFAULT '', title TEXT DEFAULT '', author TEXT DEFAULT '',
          published_at TEXT DEFAULT '', duration INTEGER DEFAULT 0,
          metadata JSONB DEFAULT '{}', status TEXT DEFAULT 'pending',
          ingested_at TIMESTAMPTZ DEFAULT NOW(),
          PRIMARY KEY (id, collection_id)
        );
        CREATE TABLE IF NOT EXISTS chunks (
          id TEXT PRIMARY KEY, source_id TEXT, collection_id TEXT,
          text TEXT, chunk_index INTEGER DEFAULT 0,
          start_time REAL DEFAULT 0, end_time REAL DEFAULT 0,
          word_count INTEGER DEFAULT 0, speaker TEXT,
          topics JSONB DEFAULT '[]', entities JSONB DEFAULT '[]',
          tone TEXT DEFAULT '', embedding JSONB
        );
        CREATE TABLE IF NOT EXISTS analysis (
          id SERIAL PRIMARY KEY, collection_id TEXT, source_id TEXT,
          analysis_type TEXT, data JSONB DEFAULT '{}',
          created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS intelligence (
          id SERIAL PRIMARY KEY, collection_id TEXT, intel_type TEXT,
          data JSONB DEFAULT '{}', created_at TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS idx_sources_col ON sources(collection_id);
        CREATE INDEX IF NOT EXISTS idx_chunks_src ON chunks(source_id);
        CREATE INDEX IF NOT EXISTS idx_chunks_col ON chunks(collection_id);
        CREATE INDEX IF NOT EXISTS idx_analysis_col ON analysis(collection_id);
        CREATE INDEX IF NOT EXISTS idx_intel_col ON intelligence(collection_id);
      `);
      this.pgReady = true;
      console.log('  Storage: PostgreSQL (persistent)');
    } catch (err) {
      console.error('  Storage: PostgreSQL init failed:', err.message);
      // Fallback to SQLite
      if (Database) {
        this.db = new Database(path.join(this.dataDir, 'trueengine.db'));
        this.db.pragma('journal_mode = WAL');
        this._initSqliteTables();
        console.log('  Storage: Fell back to SQLite');
      }
    }
  }

  _usePg() { return this.pgReady && this.pg; }

  // ─── Qdrant Init ─────────────────────────────────────────────────

  async _initQdrant() {
    if (!QdrantClient || !config.QDRANT_URL) {
      console.log('  Qdrant: not configured (falling back to SQLite vector search)');
      return;
    }
    try {
      const opts = { url: config.QDRANT_URL };
      if (config.QDRANT_API_KEY) opts.apiKey = config.QDRANT_API_KEY;
      this.qdrant = new QdrantClient(opts);
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

  async _ensureQdrantCollection(collectionId) {
    if (!this.qdrantReady) return false;
    const qName = this._qdrantCollectionName(collectionId);
    try { await this.qdrant.getCollection(qName); return true; } catch {}
    try {
      await this.qdrant.createCollection(qName, { vectors: { size: config.EMBEDDING_DIMENSION, distance: 'Cosine' } });
      console.log(`  Qdrant: created "${qName}" (${config.EMBEDDING_DIMENSION}d)`);
      return true;
    } catch (err) { console.error(`  Qdrant: create failed: ${err.message}`); return false; }
  }

  _qdrantCollectionName(id) { return 'te_' + id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 200); }

  // ─── Collections ─────────────────────────────────────────────────

  async createCollection(id, name, templateId = 'default', description = '', metadata = {}) {
    if (this._usePg()) {
      await this.pg.query(
        `INSERT INTO collections (id, name, template_id, description, metadata) VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET name=$2, template_id=$3, description=$4, metadata=$5, updated_at=NOW()`,
        [id, name, templateId, description, JSON.stringify(metadata)]
      );
    } else if (this.db) {
      this.db.prepare('INSERT OR REPLACE INTO collections (id,name,template_id,description,metadata) VALUES (?,?,?,?,?)')
        .run(id, name, templateId, description, JSON.stringify(metadata));
    }
    this._ensureQdrantCollection(id).catch(() => {});
    return { id, name, templateId, description, metadata };
  }

  async getCollection(id) {
    if (this._usePg()) {
      const r = await this.pg.query('SELECT * FROM collections WHERE id=$1', [id]);
      if (!r.rows[0]) return null;
      const row = r.rows[0];
      return { ...row, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata };
    }
    if (!this.db) return null;
    const row = this.db.prepare('SELECT * FROM collections WHERE id=?').get(id);
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata || '{}') };
  }

  async listCollections() {
    if (this._usePg()) {
      const r = await this.pg.query('SELECT * FROM collections ORDER BY created_at DESC');
      return r.rows.map(row => ({ ...row, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata }));
    }
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM collections ORDER BY created_at DESC').all()
      .map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
  }

  // ─── Sources ─────────────────────────────────────────────────────

  async addSource(collectionId, source) {
    const meta = JSON.stringify(source.metadata || {});
    if (this._usePg()) {
      await this.pg.query(
        `INSERT INTO sources (id,collection_id,source_type,source_url,title,author,published_at,duration,metadata,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (id,collection_id) DO UPDATE SET title=$5,author=$6,metadata=$9,status=$10`,
        [source.id, collectionId, source.sourceType||'youtube', source.sourceUrl||'', source.title||'',
         source.author||'', source.publishedAt||'', source.duration||0, meta, source.status||'ready']
      );
    } else if (this.db) {
      this.db.prepare('INSERT OR REPLACE INTO sources (id,collection_id,source_type,source_url,title,author,published_at,duration,metadata,status) VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(source.id, collectionId, source.sourceType||'youtube', source.sourceUrl||'', source.title||'', source.author||'', source.publishedAt||'', source.duration||0, meta, source.status||'ready');
    }
    return source;
  }

  async getSource(collectionId, sourceId) {
    if (this._usePg()) {
      const r = await this.pg.query('SELECT * FROM sources WHERE id=$1 AND collection_id=$2', [sourceId, collectionId]);
      if (!r.rows[0]) return null;
      const row = r.rows[0];
      return { ...row, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata };
    }
    if (!this.db) return null;
    const row = this.db.prepare('SELECT * FROM sources WHERE id=? AND collection_id=?').get(sourceId, collectionId);
    if (!row) return null;
    return { ...row, metadata: JSON.parse(row.metadata || '{}') };
  }

  async getSources(collectionId) {
    if (this._usePg()) {
      const r = await this.pg.query('SELECT * FROM sources WHERE collection_id=$1 ORDER BY published_at DESC', [collectionId]);
      return r.rows.map(row => ({ ...row, metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata }));
    }
    if (!this.db) return [];
    return this.db.prepare('SELECT * FROM sources WHERE collection_id=? ORDER BY published_at DESC').all(collectionId)
      .map(r => ({ ...r, metadata: JSON.parse(r.metadata || '{}') }));
  }

  // ─── Chunks ──────────────────────────────────────────────────────

  async storeChunks(collectionId, sourceId, chunks) {
    if (this._usePg()) {
      const client = await this.pg.connect();
      try {
        await client.query('BEGIN');
        for (const c of chunks) {
          await client.query(
            `INSERT INTO chunks (id,source_id,collection_id,text,chunk_index,start_time,end_time,word_count,speaker,topics,entities,tone,embedding)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             ON CONFLICT (id) DO UPDATE SET text=$4,embedding=$13`,
            [c.chunkId, sourceId, collectionId, c.text, c.chunkIndex, c.startTime||0, c.endTime||0,
             c.wordCount||0, c.speaker||null, JSON.stringify(c.topics||[]), JSON.stringify(c.entities||[]),
             c.tone||'', c.embedding ? JSON.stringify(c.embedding) : null]
          );
        }
        await client.query('COMMIT');
      } catch (err) { await client.query('ROLLBACK'); throw err; }
      finally { client.release(); }
    } else if (this.db) {
      const stmt = this.db.prepare('INSERT OR REPLACE INTO chunks (id,source_id,collection_id,text,chunk_index,start_time,end_time,word_count,speaker,topics,entities,tone,embedding) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)');
      const tx = this.db.transaction((items) => { for (const c of items) { stmt.run(c.chunkId, sourceId, collectionId, c.text, c.chunkIndex, c.startTime||0, c.endTime||0, c.wordCount||0, c.speaker||null, JSON.stringify(c.topics||[]), JSON.stringify(c.entities||[]), c.tone||'', c.embedding ? JSON.stringify(c.embedding) : null); } });
      tx(chunks);
    }
    this._upsertQdrantVectors(collectionId, sourceId, chunks).catch(err => console.log(`  Qdrant upsert skipped: ${err.message}`));
  }

  async getChunks(collectionId, sourceId = null) {
    if (this._usePg()) {
      let r;
      if (sourceId) { r = await this.pg.query('SELECT * FROM chunks WHERE collection_id=$1 AND source_id=$2 ORDER BY chunk_index', [collectionId, sourceId]); }
      else { r = await this.pg.query('SELECT * FROM chunks WHERE collection_id=$1 ORDER BY source_id, chunk_index', [collectionId]); }
      return r.rows.map(row => ({
        ...row,
        topics: typeof row.topics === 'string' ? JSON.parse(row.topics) : (row.topics || []),
        entities: typeof row.entities === 'string' ? JSON.parse(row.entities) : (row.entities || []),
        embedding: typeof row.embedding === 'string' ? JSON.parse(row.embedding) : row.embedding,
      }));
    }
    if (!this.db) return [];
    let rows;
    if (sourceId) { rows = this.db.prepare('SELECT * FROM chunks WHERE collection_id=? AND source_id=? ORDER BY chunk_index').all(collectionId, sourceId); }
    else { rows = this.db.prepare('SELECT * FROM chunks WHERE collection_id=? ORDER BY source_id, chunk_index').all(collectionId); }
    return rows.map(r => ({ ...r, topics: JSON.parse(r.topics||'[]'), entities: JSON.parse(r.entities||'[]'), embedding: r.embedding ? JSON.parse(r.embedding) : null }));
  }

  // ─── Search ──────────────────────────────────────────────────────

  async search(collectionId, queryEmbedding, topK = 10) {
    if (!queryEmbedding) return [];
    if (this.qdrantReady) {
      try { return await this._qdrantSearch(collectionId, queryEmbedding, topK); }
      catch (err) { console.log(`  Qdrant search failed, fallback: ${err.message}`); }
    }
    return this._localSearch(collectionId, queryEmbedding, topK);
  }

  async _qdrantSearch(collectionId, queryEmbedding, topK) {
    const qName = this._qdrantCollectionName(collectionId);
    const results = await this.qdrant.search(qName, { vector: queryEmbedding, limit: topK, with_payload: true, score_threshold: 0.1 });
    return results.map(r => ({
      id: r.payload.chunk_id, source_id: r.payload.source_id, collection_id: r.payload.collection_id,
      text: r.payload.text, chunk_index: r.payload.chunk_index, start_time: r.payload.start_time,
      end_time: r.payload.end_time, speaker: r.payload.speaker, topics: r.payload.topics || [],
      word_count: r.payload.word_count, similarity: r.score,
    }));
  }

  async _localSearch(collectionId, queryEmbedding, topK) {
    const chunks = (await this.getChunks(collectionId)).filter(c => c.embedding);
    const scored = chunks.map(chunk => ({ ...chunk, similarity: cosineSim(queryEmbedding, chunk.embedding) }));
    scored.sort((a, b) => b.similarity - a.similarity);
    return scored.slice(0, topK);
  }

  // ─── Analysis & Intelligence ─────────────────────────────────────

  async storeAnalysis(collectionId, sourceId, analysisType, data) {
    if (this._usePg()) {
      await this.pg.query('INSERT INTO analysis (collection_id,source_id,analysis_type,data) VALUES ($1,$2,$3,$4)',
        [collectionId, sourceId, analysisType, JSON.stringify(data)]);
    } else if (this.db) {
      this.db.prepare('INSERT INTO analysis (collection_id,source_id,analysis_type,data) VALUES (?,?,?,?)')
        .run(collectionId, sourceId, analysisType, JSON.stringify(data));
    }
  }

  async getAnalysis(collectionId, sourceId = null, analysisType = null) {
    if (this._usePg()) {
      let sql = 'SELECT * FROM analysis WHERE collection_id=$1';
      const params = [collectionId];
      let i = 2;
      if (sourceId) { sql += ` AND source_id=$${i++}`; params.push(sourceId); }
      if (analysisType) { sql += ` AND analysis_type=$${i++}`; params.push(analysisType); }
      sql += ' ORDER BY created_at DESC';
      const r = await this.pg.query(sql, params);
      return r.rows.map(row => ({ ...row, data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data }));
    }
    if (!this.db) return [];
    let sql = 'SELECT * FROM analysis WHERE collection_id=?';
    const params = [collectionId];
    if (sourceId) { sql += ' AND source_id=?'; params.push(sourceId); }
    if (analysisType) { sql += ' AND analysis_type=?'; params.push(analysisType); }
    sql += ' ORDER BY created_at DESC';
    return this.db.prepare(sql).all(...params).map(r => ({ ...r, data: JSON.parse(r.data||'{}') }));
  }

  async storeIntelligence(collectionId, intelType, data) {
    if (this._usePg()) {
      await this.pg.query('DELETE FROM intelligence WHERE collection_id=$1 AND intel_type=$2', [collectionId, intelType]);
      await this.pg.query('INSERT INTO intelligence (collection_id,intel_type,data) VALUES ($1,$2,$3)',
        [collectionId, intelType, JSON.stringify(data)]);
    } else if (this.db) {
      this.db.prepare('DELETE FROM intelligence WHERE collection_id=? AND intel_type=?').run(collectionId, intelType);
      this.db.prepare('INSERT INTO intelligence (collection_id,intel_type,data) VALUES (?,?,?)')
        .run(collectionId, intelType, JSON.stringify(data));
    }
  }

  async getIntelligence(collectionId, intelType = null) {
    if (this._usePg()) {
      if (intelType) {
        const r = await this.pg.query('SELECT * FROM intelligence WHERE collection_id=$1 AND intel_type=$2 ORDER BY created_at DESC LIMIT 1', [collectionId, intelType]);
        if (!r.rows[0]) return null;
        return { data: typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data) : r.rows[0].data };
      }
      const r = await this.pg.query('SELECT * FROM intelligence WHERE collection_id=$1 ORDER BY created_at DESC', [collectionId]);
      return r.rows.map(row => ({ type: row.intel_type, data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data, createdAt: row.created_at }));
    }
    if (!this.db) return null;
    if (intelType) {
      const row = this.db.prepare('SELECT * FROM intelligence WHERE collection_id=? AND intel_type=? ORDER BY created_at DESC LIMIT 1').get(collectionId, intelType);
      return row ? { data: JSON.parse(row.data||'{}') } : null;
    }
    return this.db.prepare('SELECT * FROM intelligence WHERE collection_id=? ORDER BY created_at DESC').all(collectionId)
      .map(r => ({ type: r.intel_type, data: JSON.parse(r.data||'{}'), createdAt: r.created_at }));
  }

  // ─── Stats ───────────────────────────────────────────────────────

  async getStats(collectionId) {
    if (this._usePg()) {
      const sc = await this.pg.query('SELECT COUNT(*) as n FROM sources WHERE collection_id=$1', [collectionId]);
      const cc = await this.pg.query('SELECT COUNT(*) as n FROM chunks WHERE collection_id=$1', [collectionId]);
      const dur = await this.pg.query('SELECT COALESCE(SUM(duration),0) as d FROM sources WHERE collection_id=$1', [collectionId]);
      return { collectionId, sourceCount: parseInt(sc.rows[0].n), chunkCount: parseInt(cc.rows[0].n),
        totalDurationHours: Math.round(parseInt(dur.rows[0].d) / 3600 * 10) / 10,
        vectorStore: this.qdrantReady ? 'qdrant' : 'postgres' };
    }
    if (!this.db) return {};
    const sourceCount = this.db.prepare('SELECT COUNT(*) as n FROM sources WHERE collection_id=?').get(collectionId)?.n || 0;
    const chunkCount = this.db.prepare('SELECT COUNT(*) as n FROM chunks WHERE collection_id=?').get(collectionId)?.n || 0;
    const totalDuration = this.db.prepare('SELECT SUM(duration) as d FROM sources WHERE collection_id=?').get(collectionId)?.d || 0;
    return { collectionId, sourceCount, chunkCount, totalDurationHours: Math.round(totalDuration / 3600 * 10) / 10,
      vectorStore: this.qdrantReady ? 'qdrant' : 'sqlite' };
  }

  // ─── Qdrant Vectors ──────────────────────────────────────────────

  async _upsertQdrantVectors(collectionId, sourceId, chunks) {
    if (!this.qdrantReady) return;
    const ready = await this._ensureQdrantCollection(collectionId);
    if (!ready) return;
    const qName = this._qdrantCollectionName(collectionId);
    const points = [];
    for (const c of chunks) {
      if (!c.embedding || !Array.isArray(c.embedding)) continue;
      points.push({
        id: this._hashToInt(c.chunkId),
        vector: c.embedding,
        payload: { chunk_id: c.chunkId, source_id: sourceId, collection_id: collectionId, text: c.text,
          chunk_index: c.chunkIndex||0, start_time: c.startTime||0, end_time: c.endTime||0,
          speaker: c.speaker||'', topics: c.topics||[], word_count: c.wordCount||0 },
      });
    }
    if (!points.length) return;
    for (let i = 0; i < points.length; i += 100) {
      await this.qdrant.upsert(qName, { wait: true, points: points.slice(i, i + 100) });
    }
    console.log(`  Qdrant: upserted ${points.length} vectors to "${qName}"`);
  }

  async migrateToQdrant(collectionId) {
    if (!this.qdrantReady) throw new Error('Qdrant not connected');
    const ready = await this._ensureQdrantCollection(collectionId);
    if (!ready) throw new Error('Failed to create Qdrant collection');
    const chunks = await this.getChunks(collectionId);
    const withEmb = chunks.filter(c => c.embedding);
    if (!withEmb.length) return { migrated: 0, message: 'No embeddings found' };
    const qName = this._qdrantCollectionName(collectionId);
    let migrated = 0;
    for (let i = 0; i < withEmb.length; i += 100) {
      const batch = withEmb.slice(i, i + 100);
      const points = batch.map(c => ({
        id: this._hashToInt(c.id),
        vector: c.embedding,
        payload: { chunk_id: c.id, source_id: c.source_id, collection_id: collectionId, text: c.text,
          chunk_index: c.chunk_index||0, start_time: c.start_time||0, end_time: c.end_time||0,
          speaker: c.speaker||'', topics: c.topics||[], word_count: c.word_count||0 },
      }));
      await this.qdrant.upsert(qName, { wait: true, points });
      migrated += points.length;
    }
    return { migrated, total: withEmb.length, collection: qName };
  }

  _hashToInt(str) { let h = 0; for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h = h & h; } return Math.abs(h); }

  // ─── SQLite Init ─────────────────────────────────────────────────

  _initSqliteTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY, name TEXT, template_id TEXT DEFAULT 'default', description TEXT DEFAULT '', metadata TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS sources (id TEXT, collection_id TEXT, source_type TEXT DEFAULT 'youtube', source_url TEXT DEFAULT '', title TEXT DEFAULT '', author TEXT DEFAULT '', published_at TEXT DEFAULT '', duration INTEGER DEFAULT 0, metadata TEXT DEFAULT '{}', status TEXT DEFAULT 'pending', ingested_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (id, collection_id));
      CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, source_id TEXT, collection_id TEXT, text TEXT, chunk_index INTEGER DEFAULT 0, start_time REAL DEFAULT 0, end_time REAL DEFAULT 0, word_count INTEGER DEFAULT 0, speaker TEXT, topics TEXT DEFAULT '[]', entities TEXT DEFAULT '[]', tone TEXT DEFAULT '', embedding TEXT);
      CREATE TABLE IF NOT EXISTS analysis (id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id TEXT, source_id TEXT, analysis_type TEXT, data TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
      CREATE TABLE IF NOT EXISTS intelligence (id INTEGER PRIMARY KEY AUTOINCREMENT, collection_id TEXT, intel_type TEXT, data TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')));
      CREATE INDEX IF NOT EXISTS idx_sources_collection ON sources(collection_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_source ON chunks(source_id);
      CREATE INDEX IF NOT EXISTS idx_chunks_collection ON chunks(collection_id);
    `);
  }
}

function cosineSim(a, b) { if (!a || !b || a.length !== b.length) return 0; let dot = 0, magA = 0, magB = 0; for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; magA += a[i] * a[i]; magB += b[i] * b[i]; } const denom = Math.sqrt(magA) * Math.sqrt(magB); return denom === 0 ? 0 : dot / denom; }

module.exports = Store;
