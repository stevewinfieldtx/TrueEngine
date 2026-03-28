/**
 * TrueEngine - Chunker
 * Splits transcripts into overlapping chunks preserving timestamps.
 */
const config = require('../config');

function chunkTranscript(transcript, sourceId) {
  const segments = transcript.segments || [];
  if (!segments.length) return chunkText(transcript.text || '', sourceId);

  const wordsWithTime = [];
  for (const seg of segments) {
    const words = seg.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const wordDur = (seg.end - seg.start) / words.length;
    words.forEach((word, i) => {
      wordsWithTime.push({ word, time: seg.start + i * wordDur });
    });
  }
  if (!wordsWithTime.length) return [];

  const chunks = [];
  let i = 0, idx = 0;
  while (i < wordsWithTime.length) {
    const end = Math.min(i + config.CHUNK_SIZE, wordsWithTime.length);
    const slice = wordsWithTime.slice(i, end);
    chunks.push({
      chunkId: `${sourceId}_c${String(idx).padStart(4, '0')}`,
      sourceId,
      text: slice.map(w => w.word).join(' '),
      chunkIndex: idx,
      startTime: slice[0].time,
      endTime: slice[slice.length - 1].time,
      wordCount: slice.length,
      speaker: null,
      topics: [],
      entities: [],
      tone: '',
    });
    idx++;
    i += config.CHUNK_SIZE - config.CHUNK_OVERLAP;
  }
  return chunks;
}

function chunkText(text, sourceId) {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const chunks = [];
  let i = 0, idx = 0;
  while (i < words.length) {
    const end = Math.min(i + config.CHUNK_SIZE, words.length);
    const slice = words.slice(i, end);
    chunks.push({
      chunkId: `${sourceId}_c${String(idx).padStart(4, '0')}`,
      sourceId,
      text: slice.join(' '),
      chunkIndex: idx,
      startTime: 0,
      endTime: 0,
      wordCount: slice.length,
      speaker: null,
      topics: [],
      entities: [],
      tone: '',
    });
    idx++;
    i += config.CHUNK_SIZE - config.CHUNK_OVERLAP;
  }
  return chunks;
}

module.exports = { chunkTranscript, chunkText };
