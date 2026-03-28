/**
 * TrueEngine - Core Engine
 * ==========================
 * INGEST > TRANSCRIBE > CHUNK > ANALYZE > STORE > SEARCH
 * One engine. Multiple templates. Infinite verticals.
 * 
 * Captures: views, likes, commentCount, tags, top comments
 * Comment mining extractor analyzes audience comments for actionable insight.
 * Calls TrueWriting API for CPP voice profiling (no forking).
 */

const config = require('../config');
const Store = require('./store');
const youtube = require('./youtube');
const { chunkTranscript } = require('./chunker');
const { runAnalysis } = require('./analyzers');
const { generateEmbedding, batchEmbed } = require('../utils/llm');

class TrueEngine {
  constructor(dataDir) {
    this.store = new Store(dataDir || config.DATA_DIR);
    console.log(`  TrueEngine initialized (data: ${dataDir || config.DATA_DIR})`);
  }

  createCollection(id, templateId = 'default', name = '', description = '') {
    const template = config.TEMPLATES[templateId] || config.TEMPLATES.default;
    return this.store.createCollection(id, name || id, templateId, description || template.description, { template });
  }
  getCollection(id) { return this.store.getCollection(id); }
  listCollections() { return this.store.listCollections(); }

  async ingestYouTubeVideo(collectionId, videoUrl) {
    const videoId = youtube.extractVideoId(videoUrl);
    if (!videoId) throw new Error(`Invalid YouTube URL: ${videoUrl}`);
    const existing = this.store.getSource(collectionId, videoId);
    if (existing && existing.status === 'ready') { console.log(`  Already ingested: ${existing.title}`); return existing; }

    console.log(`\n  Ingesting: ${videoUrl}`);
    const meta = await youtube.getVideoMetadata(videoId);
    
    // Fetch comments
    let comments = [];
    try {
      comments = await youtube.getVideoComments(videoId, 50);
      if (comments.length > 0) console.log(`  Comments: ${comments.length} fetched`);
    } catch (err) { console.log(`  Comments: unavailable`); }

    const source = { 
      id: videoId, sourceType: 'youtube', sourceUrl: videoUrl, 
      title: meta?.title || `Video ${videoId}`, author: meta?.author || '', 
      publishedAt: meta?.publishedAt || '', duration: meta?.duration || 0, 
      metadata: { 
        ...(meta || {}), 
        commentCount: meta?.commentCount || 0,
        tags: meta?.tags || [],
        comments: comments,
      }, 
      status: 'processing' 
    };
    console.log(`  ${source.title} (${Math.round(source.duration / 60)}m) | ${meta?.viewCount || 0} views, ${meta?.likeCount || 0} likes, ${meta?.commentCount || 0} comments`);

    const transcript = await youtube.getTranscript(videoId);
    if (!transcript) { source.status = 'error'; source.metadata.error = 'No transcript available'; this.store.addSource(collectionId, source); console.log(`  No transcript for: ${source.title}`); return null; }

    const chunks = chunkTranscript(transcript, videoId);
    console.log(`  Chunked: ${chunks.length} chunks`);

    console.log(`  Embedding...`);
    const texts = chunks.map(c => c.text);
    const embeddings = await batchEmbed(texts, 5);
    chunks.forEach((c, i) => { c.embedding = embeddings[i]; });
    console.log(`  Embedded: ${embeddings.filter(Boolean).length}/${chunks.length}`);

    source.status = 'ready';
    source.metadata.transcriptSource = transcript.source;
    source.metadata.chunkCount = chunks.length;
    this.store.addSource(collectionId, source);
    this.store.storeChunks(collectionId, videoId, chunks);
    console.log(`  Ingested: ${source.title}`);
    return source;
  }

  async ingestYouTubeChannel(collectionId, channelInput, maxVideos = 50) {
    console.log(`\n  Scanning channel: ${channelInput}`);
    const videoList = await youtube.getChannelVideoIds(channelInput, maxVideos);
    const results = { total: videoList.length, ingested: 0, errors: 0, skipped: 0 };
    for (let i = 0; i < videoList.length; i++) {
      const { videoId, title } = videoList[i];
      console.log(`\n  [${i + 1}/${videoList.length}] ${title || videoId}`);
      try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const result = await this.ingestYouTubeVideo(collectionId, url);
        if (result) { if (result.status === 'ready') results.ingested++; else results.skipped++; }
        else { results.errors++; }
      } catch (err) { console.error(`  Error: ${err.message}`); results.errors++; }
      if (i < videoList.length - 1) await sleep(1000);
    }
    console.log(`\n  Channel complete: ${results.ingested}/${results.total} ingested, ${results.errors} errors`);
    return results;
  }

  async analyzeSource(collectionId, sourceId) {
    const col = this.store.getCollection(collectionId);
    if (!col) throw new Error(`Collection not found: ${collectionId}`);
    const chunks = this.store.getChunks(collectionId, sourceId);
    if (!chunks.length) throw new Error(`No chunks for source: ${sourceId}`);
    const source = this.store.getSource(collectionId, sourceId);
    const templateId = col.template_id || 'default';
    
    // Parse source metadata and attach comments for the comment mining extractor
    const sourceMeta = { ...source };
    const meta = typeof source.metadata === 'string' ? JSON.parse(source.metadata) : (source.metadata || {});
    sourceMeta.viewCount = meta.viewCount || 0;
    sourceMeta.likeCount = meta.likeCount || 0;
    sourceMeta.commentCount = meta.commentCount || 0;
    sourceMeta._comments = meta.comments || [];
    sourceMeta.tags = meta.tags || [];
    sourceMeta.speakerNames = col.metadata?.speakerNames || [];
    sourceMeta.productContext = col.metadata?.productContext || '';

    console.log(`\n  Analyzing: ${source?.title || sourceId} (template: ${templateId})`);
    if (sourceMeta._comments.length > 0) console.log(`  Comments available: ${sourceMeta._comments.length}`);
    
    const analysis = await runAnalysis(chunks, sourceMeta, templateId);
    this.store.storeAnalysis(collectionId, sourceId, 'full', analysis);
    console.log(`  Analysis stored`);
    return analysis;
  }

  async analyzeCollection(collectionId) {
    const sources = this.store.getSources(collectionId).filter(s => s.status === 'ready');
    console.log(`\n  Analyzing collection: ${collectionId} (${sources.length} sources)`);
    const results = [];
    for (const source of sources) {
      try { const analysis = await this.analyzeSource(collectionId, source.id); results.push({ sourceId: source.id, title: source.title, analysis }); }
      catch (err) { console.error(`  Analysis failed for ${source.title}: ${err.message}`); }
    }
    await this._buildCollectionIntelligence(collectionId);
    
    // Call TrueWriting for CPP voice profile
    await this._buildVoiceProfile(collectionId);
    
    // Call TrueGraph for knowledge graph
    await this._buildKnowledgeGraph(collectionId);
    
    return results;
  }

  /**
   * Call TrueWriting API to generate CPP voice profile from all transcripts.
   * TrueWriting is the single source of truth for voice profiling.
   * TrueEngine does NOT do this itself — it delegates to TrueWriting.
   */
  async _buildVoiceProfile(collectionId) {
    const apiUrl = config.TRUEWRITING_API_URL;
    if (!apiUrl) {
      console.log(`  Voice profile: TrueWriting API not configured (TRUEWRITING_API_URL)`);
      return null;
    }

    // Gather all transcripts from the collection
    const sources = this.store.getSources(collectionId).filter(s => s.status === 'ready');
    const segments = [];
    for (const source of sources) {
      const chunks = this.store.getChunks(collectionId, source.id);
      const meta = typeof source.metadata === 'string' ? JSON.parse(source.metadata) : (source.metadata || {});
      // Combine all chunks for a source into one text block
      const fullText = chunks.map(c => c.text).join(' ');
      if (fullText.length > 20) {
        segments.push({
          text: fullText,
          source_id: source.id,
          title: source.title || '',
          date: source.published_at || meta.publishedAt || null,
        });
      }
    }

    if (segments.length < 3) {
      console.log(`  Voice profile: Not enough content (${segments.length} sources, need 3+)`);
      return null;
    }

    console.log(`\n  Building voice profile via TrueWriting API...`);
    console.log(`  Sending ${segments.length} transcripts (${segments.reduce((s, t) => s + t.text.split(' ').length, 0)} words)`);

    try {
      const resp = await fetch(`${apiUrl}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source_type: 'transcript',
          segments: segments,
          min_words: 50,
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text();
        console.log(`  Voice profile: TrueWriting API error ${resp.status}: ${errText.slice(0, 200)}`);
        return null;
      }

      const profile = await resp.json();
      this.store.storeIntelligence(collectionId, 'voice_profile', profile);
      
      const words = profile.corpus_stats?.total_words || 0;
      const formality = profile.tone_indicators?.formality_label || 'unknown';
      const sigPhrases = profile.phrase_fingerprint?.signature_phrases?.length || 0;
      console.log(`  Voice profile stored: ${words} words analyzed, ${formality} tone, ${sigPhrases} signature phrases`);
      return profile;
    } catch (err) {
      console.log(`  Voice profile: TrueWriting API unreachable (${err.message})`);
      console.log(`  Tip: Start TrueWriting locally with: cd TrueWriting && py -m uvicorn api:app --port 8200`);
      return null;
    }
  }


  /**
   * Call TrueGraph API to build knowledge graph from extracted entities.
   * Finds how topics, products, places, verses, etc. interrelate across all content.
   */
  async _buildKnowledgeGraph(collectionId) {
    const apiUrl = config.TRUEGRAPH_API_URL;
    if (!apiUrl) { console.log(`  Knowledge graph: TRUEGRAPH_API_URL not configured`); return null; }

    const col = this.store.getCollection(collectionId);
    const allAnalyses = this.store.getAnalysis(collectionId);
    const sources = this.store.getSources(collectionId).filter(s => s.status === 'ready');
    if (!allAnalyses.length) { console.log(`  Knowledge graph: No analyses available`); return null; }

    const graphSources = [];
    for (const source of sources) {
      const meta = typeof source.metadata === 'string' ? JSON.parse(source.metadata) : (source.metadata || {});
      const analysis = allAnalyses.find(a => a.source_id === source.id);
      if (!analysis) continue;
      const ext = analysis.data?.extractors || {};
      graphSources.push({
        source_id: source.id, title: source.title || '',
        published_at: source.published_at || meta.publishedAt || null,
        view_count: meta.viewCount || 0, like_count: meta.likeCount || 0, comment_count: meta.commentCount || 0,
        topics: (Array.isArray(ext.topics) ? ext.topics : []).map(t => t.topic || t.name || '').filter(Boolean),
        food: (Array.isArray(ext.food) ? ext.food : []).map(f => f.restaurant_name || f.dish_name || '').filter(Boolean),
        products: (Array.isArray(ext.products) ? ext.products : []).map(p => p.product_name || '').filter(Boolean),
        verses: (Array.isArray(ext.religion) ? ext.religion : []).map(r => r.verse_reference || '').filter(Boolean),
        themes: (Array.isArray(ext.religion) ? ext.religion : []).map(r => r.theme || '').filter(Boolean),
        tags: meta.tags || [], places: [],
        people: (ext.speakers?.speakers_identified || []),
      });
    }

    if (graphSources.length < 2) { console.log(`  Knowledge graph: Need 2+ analyzed sources`); return null; }
    console.log(`\n  Building knowledge graph via TrueGraph API...`);
    console.log(`  Sending ${graphSources.length} sources with extracted entities`);

    try {
      const resp = await fetch(`${apiUrl}/build-graph`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection_id: collectionId, collection_name: col?.name || collectionId, template: col?.template_id || 'default', sources: graphSources, generate_insights: true }),
      });
      if (!resp.ok) { const err = await resp.text(); console.log(`  Knowledge graph: TrueGraph error ${resp.status}: ${err.slice(0, 200)}`); return null; }
      const graph = await resp.json();
      this.store.storeIntelligence(collectionId, 'knowledge_graph', graph);
      const stats = graph.stats || {};
      console.log(`  Knowledge graph stored: ${stats.total_nodes} nodes, ${stats.total_edges} edges, ${stats.total_clusters} clusters`);
      if (graph.analytics?.power_combinations?.length) console.log(`  Power combinations: ${graph.analytics.power_combinations.length}`);
      if (graph.analytics?.content_gaps?.length) console.log(`  Content gaps: ${graph.analytics.content_gaps.length}`);
      return graph;
    } catch (err) {
      console.log(`  Knowledge graph: TrueGraph unreachable (${err.message})`);
      console.log(`  Tip: cd TrueGraph && py -m uvicorn api:app --port 8300`);
      return null;
    }
  }

  async _buildCollectionIntelligence(collectionId) {
    const allAnalyses = this.store.getAnalysis(collectionId);
    if (!allAnalyses.length) return;
    const merged = {};
    for (const a of allAnalyses) { const extractors = a.data?.extractors || {}; for (const [key, value] of Object.entries(extractors)) { if (!merged[key]) merged[key] = []; merged[key].push(value); } }
    this.store.storeIntelligence(collectionId, 'merged_extractors', merged);
    
    // Build engagement analytics from source metadata
    const sources = this.store.getSources(collectionId).filter(s => s.status === 'ready');
    const engagement = sources.map(s => {
      const meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || {});
      return {
        id: s.id, title: s.title, publishedAt: s.published_at || meta.publishedAt,
        viewCount: meta.viewCount || 0, likeCount: meta.likeCount || 0,
        commentCount: meta.commentCount || 0,
        likeRate: meta.viewCount > 0 ? Math.round((meta.likeCount / meta.viewCount) * 10000) / 100 : 0,
        commentRate: meta.viewCount > 0 ? Math.round((meta.commentCount / meta.viewCount) * 10000) / 100 : 0,
        tags: meta.tags || [],
      };
    });
    
    const totalViews = engagement.reduce((s, e) => s + e.viewCount, 0);
    const totalLikes = engagement.reduce((s, e) => s + e.likeCount, 0);
    const totalComments = engagement.reduce((s, e) => s + e.commentCount, 0);
    const avgViews = engagement.length > 0 ? Math.round(totalViews / engagement.length) : 0;
    const avgLikeRate = engagement.length > 0 ? Math.round(engagement.reduce((s, e) => s + e.likeRate, 0) / engagement.length * 100) / 100 : 0;
    const avgCommentRate = engagement.length > 0 ? Math.round(engagement.reduce((s, e) => s + e.commentRate, 0) / engagement.length * 100) / 100 : 0;
    
    const topByViews = [...engagement].sort((a, b) => b.viewCount - a.viewCount).slice(0, 10);
    const highPassion = [...engagement].sort((a, b) => b.commentRate - a.commentRate).slice(0, 10);
    const highEngagement = [...engagement].sort((a, b) => b.likeRate - a.likeRate).slice(0, 10);
    
    this.store.storeIntelligence(collectionId, 'engagement_analytics', {
      totalVideos: engagement.length,
      totalViews, totalLikes, totalComments,
      avgViews, avgLikeRate, avgCommentRate,
      topByViews, highPassion, highEngagement,
      allVideos: engagement,
    });
    
    console.log(`  Intelligence merged: ${Object.keys(merged).join(', ')}`);
    console.log(`  Engagement analytics: ${engagement.length} videos, ${totalViews} total views, ${avgLikeRate}% avg like rate`);
  }

  async search(collectionId, query, topK = 10) {
    const queryEmb = await generateEmbedding(query);
    if (!queryEmb) return this._keywordSearch(collectionId, query, topK);
    const results = await this.store.search(collectionId, queryEmb, topK);
    return results.map(r => ({ chunkId: r.id, sourceId: r.source_id, text: r.text, similarity: Math.round((r.similarity || 0) * 1000) / 10, timestamp: formatTime(r.start_time), startTime: r.start_time, speaker: r.speaker, topics: r.topics }));
  }

  _keywordSearch(collectionId, query, topK) {
    const chunks = this.store.getChunks(collectionId);
    const terms = query.toLowerCase().split(/\s+/);
    const scored = chunks.map(c => { const lower = c.text.toLowerCase(); const matches = terms.filter(t => lower.includes(t)).length; return { ...c, score: matches / terms.length }; }).filter(c => c.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK).map(r => ({ chunkId: r.id, sourceId: r.source_id, text: r.text, similarity: Math.round(r.score * 100), timestamp: formatTime(r.start_time), startTime: r.start_time, speaker: r.speaker, topics: r.topics }));
  }

  async ask(collectionId, question, topK = 8) {
    const { callLLM } = require('../utils/llm');
    const results = await this.search(collectionId, question, topK);
    if (!results.length) return { answer: 'Not enough information to answer.', sources: [] };
    const context = results.map(r => `[${r.timestamp}${r.speaker ? ' - ' + r.speaker : ''}] ${r.text}`).join('\n\n---\n\n');
    const col = this.store.getCollection(collectionId);
    
    // Load voice profile if available — makes the chatbot sound like the creator
    let voiceInstruction = '';
    const voiceProfile = this.store.getIntelligence(collectionId, 'voice_profile');
    if (voiceProfile?.data) {
      const vp = voiceProfile.data;
      const tone = vp.tone_indicators || {};
      const phrases = (vp.phrase_fingerprint?.signature_phrases || []).slice(0, 10).map(p => p.phrase);
      const greetings = (vp.phrase_fingerprint?.greeting_expressions || []).slice(0, 3).map(g => g.greeting_pattern);
      const grammar = vp.grammar_signature || {};
      voiceInstruction = `\n\nIMPORTANT - Match this communication style:\n- Tone: ${tone.formality_label || 'conversational'}, ${tone.energy || 'moderate'} energy\n- Use contractions: ${grammar.contraction_style || 'mixed'}\n- Signature phrases to naturally incorporate: ${phrases.join(', ') || 'none detected'}\n- Greeting style: ${greetings.join(' / ') || 'casual'}\n- Perspective: ${grammar.perspective?.dominant || 'balanced'}`;
    }
    
    const answer = await callLLM(`Based on the following content, answer this question:\n\nQUESTION: ${question}\n\nCONTENT:\n${context}\n\nAnswer based on the content. If unsure, say so.`, { 
      model: config.CONTENT_MODEL, 
      system: `You answer questions based ONLY on provided content from ${col?.name || 'this collection'}. Be conversational but accurate.${voiceInstruction}`, 
      maxTokens: 1500, temperature: 0.3 
    });
    return { answer: answer || 'Error generating response.', sources: results.slice(0, 3).map(r => ({ timestamp: r.timestamp, text: r.text.slice(0, 200), similarity: r.similarity })) };
  }

  async getStats(collectionId) { return await this.store.getStats(collectionId); }
  async getIntelligence(collectionId, type) { return await this.store.getIntelligence(collectionId, type); }
}

function formatTime(seconds) { if (!seconds) return '0:00'; const m = Math.floor(seconds / 60); const s = Math.floor(seconds % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = TrueEngine;
