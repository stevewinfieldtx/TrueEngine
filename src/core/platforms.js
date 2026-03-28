/**
 * TrueEngine - Multi-Platform Ingestor
 * ======================================
 * Downloads and transcribes content from TikTok and Instagram.
 * Uses yt-dlp for download + Groq Whisper for transcription.
 * Same audio pipeline as YouTube, different metadata sources.
 * 
 * Platforms supported:
 *   - TikTok: yt-dlp downloads from @username profile page
 *   - Instagram: yt-dlp downloads from @username profile page
 * 
 * Each source is tagged with platform for cross-platform analytics.
 */
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const FormData = require('form-data');
const config = require('../config');


/**
 * Get video URLs from a TikTok profile using yt-dlp --flat-playlist
 */
async function getTikTokVideoUrls(username, maxVideos = 100) {
  const handle = username.startsWith('@') ? username : `@${username}`;
  const profileUrl = `https://www.tiktok.com/${handle}`;
  console.log(`  Scanning TikTok: ${profileUrl}`);
  
  try {
    const result = execSync(
      `yt-dlp --flat-playlist -j --playlist-end ${maxVideos} "${profileUrl}"`,
      { timeout: 180000, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    
    const lines = result.toString().trim().split('\n').filter(Boolean);
    const videos = lines.map(line => {
      try {
        const j = JSON.parse(line);
        return {
          videoId: j.id || '',
          title: (j.title || j.description || '').slice(0, 200),
          url: j.url || j.webpage_url || `https://www.tiktok.com/${handle}/video/${j.id}`,
          viewCount: j.view_count || 0,
          likeCount: j.like_count || 0,
          commentCount: j.comment_count || 0,
          publishedAt: j.upload_date ? `${j.upload_date.slice(0,4)}-${j.upload_date.slice(4,6)}-${j.upload_date.slice(6,8)}` : '',
          duration: j.duration || 0,
          platform: 'tiktok',
        };
      } catch { return null; }
    }).filter(Boolean);
    
    console.log(`  Found ${videos.length} TikTok videos`);
    return videos.slice(0, maxVideos);
  } catch (err) {
    console.log(`  TikTok scan error: ${err.stderr?.toString().slice(0, 300) || err.message?.slice(0, 200)}`);
    return [];
  }
}


/**
 * Get video URLs from an Instagram profile using yt-dlp
 */
async function getInstagramVideoUrls(username, maxVideos = 100) {
  const handle = username.startsWith('@') ? username.slice(1) : username;
  const profileUrl = `https://www.instagram.com/${handle}/`;
  console.log(`  Scanning Instagram: ${profileUrl}`);
  
  try {
    const result = execSync(
      `yt-dlp --flat-playlist -j --playlist-end ${maxVideos} "${profileUrl}"`,
      { timeout: 180000, maxBuffer: 20 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'] }
    );
    
    const lines = result.toString().trim().split('\n').filter(Boolean);
    const videos = lines.map(line => {
      try {
        const j = JSON.parse(line);
        return {
          videoId: j.id || '',
          title: (j.title || j.description || '').slice(0, 200),
          url: j.url || j.webpage_url || '',
          viewCount: j.view_count || 0,
          likeCount: j.like_count || 0,
          commentCount: j.comment_count || 0,
          publishedAt: j.upload_date ? `${j.upload_date.slice(0,4)}-${j.upload_date.slice(4,6)}-${j.upload_date.slice(6,8)}` : '',
          duration: j.duration || 0,
          platform: 'instagram',
        };
      } catch { return null; }
    }).filter(Boolean);
    
    console.log(`  Found ${videos.length} Instagram posts`);
    return videos.slice(0, maxVideos);
  } catch (err) {
    console.log(`  Instagram scan error: ${err.stderr?.toString().slice(0, 300) || err.message?.slice(0, 200)}`);
    return [];
  }
}


/**
 * Download audio from any URL using yt-dlp and transcribe with Groq Whisper.
 * Works for TikTok, Instagram, or any yt-dlp supported platform.
 */
async function downloadAndTranscribe(videoUrl, videoId, platform = 'unknown') {
  const audioDir = path.join(config.DATA_DIR, 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const audioPath = path.join(audioDir, `${platform}_${videoId}.m4a`);
  
  try {
    if (!fs.existsSync(audioPath)) {
      try {
        execSync(`yt-dlp -f "ba[ext=m4a]/ba/b" --no-playlist -o "${audioPath}" "${videoUrl}"`, 
          { timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
      } catch {
        try {
          execSync(`yt-dlp -x --audio-format m4a --no-playlist -o "${audioPath}" "${videoUrl}"`,
            { timeout: 120000, stdio: ['pipe', 'pipe', 'pipe'] });
        } catch {
          console.log(`  Audio download failed for ${platform}`);
          return null;
        }
      }
    }
    
    if (!fs.existsSync(audioPath)) return null;
    const fileSize = fs.statSync(audioPath).size;
    if (fileSize < 100) { try { fs.unlinkSync(audioPath); } catch {} return null; }
    if (fileSize > 25 * 1024 * 1024) { console.log(`  Too large for Groq`); try { fs.unlinkSync(audioPath); } catch {} return null; }
    console.log(`  Audio: ${Math.round(fileSize / 1024)}KB - sending to Groq...`);
    
    const result = await new Promise((resolve) => {
      const form = new FormData();
      form.append('file', fs.createReadStream(audioPath), { filename: `${videoId}.m4a`, contentType: 'audio/mp4' });
      form.append('model', 'whisper-large-v3-turbo');
      form.append('response_format', 'verbose_json');
      form.append('language', 'en');
      
      const req = https.request({
        hostname: 'api.groq.com', path: '/openai/v1/audio/transcriptions', method: 'POST',
        headers: { 'Authorization': `Bearer ${config.GROQ_API_KEY}`, ...form.getHeaders() },
      }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode !== 200) { console.log(`  Groq error ${res.statusCode}`); resolve(null); return; }
          try {
            const data = JSON.parse(body);
            const segments = (data.segments || []).map((seg, i) => ({ id: i, start: seg.start || 0, end: seg.end || 0, text: (seg.text || '').trim() }));
            resolve({ text: (data.text || '').trim(), segments, language: data.language || 'en', source: 'groq-whisper' });
          } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      form.pipe(req);
    });
    
    try { fs.unlinkSync(audioPath); } catch {}
    if (result && result.text.length > 20) {
      console.log(`  Groq Whisper OK: ${result.text.length} chars`);
    }
    return result;
  } catch (err) {
    console.log(`  Transcription failed: ${err.message}`);
    try { fs.unlinkSync(audioPath); } catch {}
    return null;
  }
}


module.exports = { 
  getTikTokVideoUrls, 
  getInstagramVideoUrls, 
  downloadAndTranscribe,
};
