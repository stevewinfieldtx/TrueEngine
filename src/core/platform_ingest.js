/**
 * TrueEngine - Multi-Platform Ingestion Commands
 * ================================================
 * Adds TikTok and Instagram ingestion to TrueEngine.
 * Each source is tagged with its platform for cross-platform analytics.
 * 
 * Two modes:
 *   - metadata: Fast. Uses title/description/hashtags as text. No audio download.
 *     Best for short-form (TikTok, IG Reels) where transcripts add little value.
 *   - full: Downloads audio + Groq Whisper transcription. 
 *     Best for long-form content where speech contains the real value.
 *
 * The system auto-selects: TikTok defaults to metadata mode.
 * YouTube uses full mode (already handled by youtube.js).
 * 
 * Usage:
 *   node src/cli.js tiktok <collectionId> <@username> [maxVideos]
 *   node src/cli.js instagram <collectionId> <@username> [maxVideos]
 */

const { getTikTokVideoUrls, getInstagramVideoUrls, downloadAndTranscribe } = require('./platforms');
const { chunkTranscript } = require('./chunker');
const { batchEmbed } = require('../utils/llm');
const config = require('../config');

/**
 * Ingest videos from TikTok or Instagram into an existing collection.
 * TikTok uses metadata-only mode (fast — descriptions + hashtags as text).
 * Can be overridden with mode='full' for audio transcription.
 */
async function ingestPlatform(engine, collectionId, platform, username, maxVideos = 100, mode = 'auto') {
  // Auto-select mode based on platform
  if (mode === 'auto') {
    mode = (platform === 'tiktok') ? 'metadata' : 'full';
  }

  // Get video list from the platform
  let videos;
  if (platform === 'tiktok') {
    videos = await getTikTokVideoUrls(username, maxVideos);
  } else if (platform === 'instagram') {
    videos = await getInstagramVideoUrls(username, maxVideos);
  } else {
    console.log(`  Unknown platform: ${platform}`);
    return { total: 0, ingested: 0, errors: 0 };
  }

  if (!videos.length) {
    console.log(`  No videos found on ${platform} for ${username}`);
    return { total: 0, ingested: 0, errors: 0 };
  }

  console.log(`  Mode: ${mode} (${mode === 'metadata' ? 'fast — using descriptions/hashtags' : 'full — downloading audio'})`);

  const results = { total: videos.length, ingested: 0, errors: 0, skipped: 0 };

  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    const sourceId = `${platform}_${video.videoId}`;
    
    // Check if already ingested
    const existing = engine.store.getSource(collectionId, sourceId);
    if (existing && existing.status === 'ready') {
      results.skipped++;
      continue;
    }

    if (mode === 'metadata') {
      // ── METADATA-ONLY MODE ──
      // Use title + description as the text content. No audio download.
      const text = [video.title || '', video.description || ''].filter(Boolean).join('\n\n').trim();
      
      if (text.length < 5) {
        // Even without text, store the metadata for engagement analytics
        const source = {
          id: sourceId, sourceType: platform, sourceUrl: video.url,
          title: (video.title || `${platform} ${video.videoId}`).slice(0, 200),
          author: username, publishedAt: video.publishedAt || '',
          duration: video.duration || 0,
          metadata: { ...video, platform },
          status: 'ready',
        };
        engine.store.addSource(collectionId, source);
        results.ingested++;
        continue;
      }

      // Create a simple transcript-like object from the text
      const transcript = {
        text: text,
        segments: [{ id: 0, start: 0, end: video.duration || 30, text: text }],
        source: 'metadata',
      };

      const chunks = chunkTranscript(transcript, sourceId);
      
      // Embed the text
      const texts = chunks.map(c => c.text);
      const embeddings = await batchEmbed(texts, 5);
      chunks.forEach((c, idx) => { c.embedding = embeddings[idx]; });

      const source = {
        id: sourceId, sourceType: platform, sourceUrl: video.url,
        title: (video.title || `${platform} ${video.videoId}`).slice(0, 200),
        author: username, publishedAt: video.publishedAt || '',
        duration: video.duration || 0,
        metadata: { ...video, platform, transcriptSource: 'metadata', chunkCount: chunks.length },
        status: 'ready',
      };

      engine.store.addSource(collectionId, source);
      engine.store.storeChunks(collectionId, sourceId, chunks);
      results.ingested++;

      // Progress log every 10 videos
      if ((i + 1) % 10 === 0 || i === 0) {
        console.log(`  [${i + 1}/${videos.length}] ${results.ingested} ingested | ${video.title?.slice(0, 50) || sourceId}`);
      }

    } else {
      // ── FULL MODE (audio download + transcription) ──
      console.log(`\n  [${i + 1}/${videos.length}] ${video.title?.slice(0, 60) || video.videoId}`);
      console.log(`  Downloading audio from ${platform}...`);
      
      const transcript = await downloadAndTranscribe(video.url, video.videoId, platform);
      
      if (!transcript) {
        const source = {
          id: sourceId, sourceType: platform, sourceUrl: video.url,
          title: (video.title || `${platform} ${video.videoId}`).slice(0, 200),
          author: username, publishedAt: video.publishedAt || '',
          duration: video.duration || 0,
          metadata: { ...video, platform, error: 'No transcript available' },
          status: 'error',
        };
        engine.store.addSource(collectionId, source);
        console.log(`  No transcript — metadata saved`);
        results.errors++;
        continue;
      }

      const chunks = chunkTranscript(transcript, sourceId);
      console.log(`  Chunked: ${chunks.length} chunks`);

      console.log(`  Embedding...`);
      const texts = chunks.map(c => c.text);
      const embeddings = await batchEmbed(texts, 5);
      chunks.forEach((c, idx) => { c.embedding = embeddings[idx]; });
      console.log(`  Embedded: ${embeddings.filter(Boolean).length}/${chunks.length}`);

      const source = {
        id: sourceId, sourceType: platform, sourceUrl: video.url,
        title: (video.title || `${platform} ${video.videoId}`).slice(0, 200),
        author: username, publishedAt: video.publishedAt || '',
        duration: video.duration || 0,
        metadata: { ...video, platform, transcriptSource: 'groq-whisper', chunkCount: chunks.length },
        status: 'ready',
      };

      engine.store.addSource(collectionId, source);
      engine.store.storeChunks(collectionId, sourceId, chunks);
      console.log(`  Ingested: ${video.title?.slice(0, 50) || sourceId}`);
      results.ingested++;

      if (i < videos.length - 1) await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log(`\n  ${platform} complete: ${results.ingested}/${results.total} ingested, ${results.errors} errors, ${results.skipped} skipped`);
  return results;
}

module.exports = { ingestPlatform };
