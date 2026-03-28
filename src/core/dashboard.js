/**
 * TrueEngine → Dashboard Bundle Exporter
 * =========================================
 * Exports TrueEngine's SQLite intelligence data into the JSON bundle
 * format that build_actionable.py expects. One dashboard, one codebase.
 * 
 * Generates: manifest.json, channel_metrics.json, analytics_report.json,
 *            insights.json, voice_profile.json, sources.json, chunks.json
 * 
 * Then runs build_actionable.py to generate the HTML dashboard.
 * 
 * Usage: node src/cli.js dashboard <collectionId>
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const config = require('../config');

// Where TrueInfluenceAI dashboard builder lives
const DASHBOARD_BUILDER = path.resolve(__dirname, '..', '..', '..', 'TrueInfluenceAI', 'build_actionable.py');
const BUNDLE_DIR = path.resolve(__dirname, '..', '..', '..', 'TrueInfluenceAI', 'bundles');

async function generate(store, collectionId) {
  const col = store.getCollection(collectionId);
  if (!col) throw new Error(`Collection not found: ${collectionId}`);

  const sources = store.getSources(collectionId).filter(s => s.status === 'ready');
  const allAnalyses = store.getAnalysis(collectionId);
  const mergedIntel = store.getIntelligence(collectionId, 'merged_extractors');
  const engagementIntel = store.getIntelligence(collectionId, 'engagement_analytics');
  const voiceIntel = store.getIntelligence(collectionId, 'voice_profile');
  const graphIntel = store.getIntelligence(collectionId, 'knowledge_graph');

  const merged = mergedIntel?.data || {};
  const engagement = engagementIntel?.data || {};
  const voiceProfile = voiceIntel?.data || {};
  const graph = graphIntel?.data || {};

  console.log(`\n  Exporting dashboard bundle for: ${col.name}`);

  // Create bundle directory
  const bundleName = `${collectionId}_${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;
  const bundlePath = path.join(BUNDLE_DIR, bundleName);
  fs.mkdirSync(bundlePath, { recursive: true });

  // ── 1. manifest.json ──
  const manifest = {
    channel: col.name || collectionId,
    created: new Date().toISOString(),
    total_videos: sources.length,
    videos_with_captions: sources.length,
    total_chunks: sources.reduce((s, src) => {
      const meta = typeof src.metadata === 'string' ? JSON.parse(src.metadata) : (src.metadata || {});
      return s + (meta.chunkCount || 1);
    }, 0),
    embedded_chunks: sources.length,
    embedding_model: config.EMBEDDING_MODEL,
    template: col.template_id,
  };
  writeJSON(bundlePath, 'manifest', manifest);

  // ── 2. sources.json ──
  const sourcesData = sources.map(s => {
    const meta = typeof s.metadata === 'string' ? JSON.parse(s.metadata) : (s.metadata || {});
    return {
      source_id: s.id,
      title: s.title,
      url: s.source_url || `https://www.youtube.com/watch?v=${s.id}`,
      published_at: s.published_at || meta.publishedAt || '',
      duration: s.duration || meta.duration || 0,
      views: meta.viewCount || 0,
      likes: meta.likeCount || 0,
      comments: meta.commentCount || 0,
      engagement_rate: meta.viewCount > 0 ? 
        Math.round(((meta.likeCount || 0) + (meta.commentCount || 0)) / meta.viewCount * 10000) / 100 : 0,
      tags: meta.tags || [],
      thumbnail: meta.thumbnail || '',
    };
  });
  writeJSON(bundlePath, 'sources', sourcesData);

  // ── 3. channel_metrics.json ──
  const channelMetrics = {
    channel_avg_views: engagement.avgViews || 0,
    channel_avg_likes: Math.round((engagement.totalLikes || 0) / Math.max(sources.length, 1)),
    channel_avg_comments: Math.round((engagement.totalComments || 0) / Math.max(sources.length, 1)),
    channel_engagement_rate: engagement.avgLikeRate || 0,
    total_videos: sources.length,
    total_views: engagement.totalViews || 0,
    enriched_at: new Date().toISOString(),
  };
  writeJSON(bundlePath, 'channel_metrics', channelMetrics);

  // ── 4. analytics_report.json ──
  // Build topic data from merged extractors
  const videoTopics = {};
  const allTopicsList = [];
  
  for (const analysis of allAnalyses) {
    const ext = analysis.data?.extractors || {};
    const topics = Array.isArray(ext.topics) ? ext.topics : [];
    const topicNames = topics.map(t => t.topic || t.name || '').filter(Boolean);
    videoTopics[analysis.source_id] = topicNames;
    
    const source = sourcesData.find(s => s.source_id === analysis.source_id);
    for (const name of topicNames) {
      allTopicsList.push({
        topic: name,
        source_id: analysis.source_id,
        views: source?.views || 0,
        published_at: source?.published_at || '',
      });
    }
  }

  // Topic frequency
  const topicFreq = {};
  for (const t of allTopicsList) {
    topicFreq[t.topic] = (topicFreq[t.topic] || 0) + 1;
  }

  // Topic performance (avg views per topic)
  const topicViews = {};
  const topicCounts = {};
  for (const t of allTopicsList) {
    topicViews[t.topic] = (topicViews[t.topic] || 0) + t.views;
    topicCounts[t.topic] = (topicCounts[t.topic] || 0) + 1;
  }
  const topicPerf = {};
  for (const [topic, total] of Object.entries(topicViews)) {
    topicPerf[topic] = Math.round(total / topicCounts[topic]);
  }

  // Topic timeline (recent/middle/older based on publish date)
  const sortedSources = [...sourcesData].sort((a, b) => 
    new Date(b.published_at || 0) - new Date(a.published_at || 0)
  );
  const third = Math.ceil(sortedSources.length / 3);
  const recentIds = new Set(sortedSources.slice(0, third).map(s => s.source_id));
  const middleIds = new Set(sortedSources.slice(third, third * 2).map(s => s.source_id));
  // older = everything else

  const topicTimeline = {};
  for (const t of allTopicsList) {
    if (!topicTimeline[t.topic]) topicTimeline[t.topic] = { recent: 0, middle: 0, older: 0 };
    if (recentIds.has(t.source_id)) topicTimeline[t.topic].recent++;
    else if (middleIds.has(t.source_id)) topicTimeline[t.topic].middle++;
    else topicTimeline[t.topic].older++;
  }

  // Topic pairs (co-occurrence)
  const topicPairs = {};
  for (const [vid, topics] of Object.entries(videoTopics)) {
    for (let i = 0; i < topics.length; i++) {
      for (let j = i + 1; j < topics.length; j++) {
        const pair = `${topics[i]} + ${topics[j]}`;
        topicPairs[pair] = (topicPairs[pair] || 0) + 1;
      }
    }
  }

  const analyticsReport = {
    channel: col.name,
    generated: new Date().toISOString(),
    videos_analyzed: sources.length,
    video_topics: videoTopics,
    topic_frequency: topicFreq,
    topic_performance: topicPerf,
    topic_timeline: topicTimeline,
    topic_pairs: topicPairs,
  };
  writeJSON(bundlePath, 'analytics_report', analyticsReport);

  // ── 5. insights.json ──
  // Title pattern analysis
  const titlePatterns = analyzeTitlePatterns(sourcesData, channelMetrics.channel_avg_views);
  
  // Revival candidates (topics that performed well but stopped appearing)
  const revivalCandidates = [];
  for (const [topic, tl] of Object.entries(topicTimeline)) {
    if (tl.older > 0 && tl.recent === 0 && topicPerf[topic] > channelMetrics.channel_avg_views * 0.8) {
      revivalCandidates.push({
        topic,
        avg_views: topicPerf[topic],
        vs_channel: Math.round(topicPerf[topic] / Math.max(channelMetrics.channel_avg_views, 1) * 100) / 100,
        trend: 'dormant',
        ...tl,
      });
    }
  }
  revivalCandidates.sort((a, b) => b.avg_views - a.avg_views);

  // Engagement anomalies
  const avgCommentRate = engagement.avgCommentRate || 0;
  const highPassion = (engagement.highPassion || []).map(v => ({
    title: v.title, views: v.viewCount, 
    engagement_rate: v.likeRate, comment_rate: v.commentRate,
  }));

  // Content velocity
  const dates = sourcesData.map(s => new Date(s.published_at || 0)).filter(d => d.getTime() > 0).sort((a, b) => a - b);
  let avgGapDays = 0;
  if (dates.length > 1) {
    const gaps = [];
    for (let i = 1; i < dates.length; i++) {
      gaps.push((dates[i] - dates[i - 1]) / (1000 * 60 * 60 * 24));
    }
    avgGapDays = Math.round(gaps.reduce((s, g) => s + g, 0) / gaps.length);
  }

  // Cannibalization (from knowledge graph if available)
  const cannibalization = [];

  // Knowledge graph insights
  const graphAnalytics = graph.analytics || {};
  const contentGaps = graphAnalytics.content_gaps || [];
  const powerCombinations = graphAnalytics.power_combinations || [];

  const insights = {
    title_patterns: titlePatterns,
    contrarian_content: extractContrarianInsights(sourcesData, channelMetrics.channel_avg_views),
    engagement_anomalies: {
      channel_avg_comment_rate: avgCommentRate,
      high_passion: highPassion,
    },
    content_velocity: {
      avg_gap_days: avgGapDays,
      normal_posting: { label: 'Normal', avg_views: channelMetrics.channel_avg_views, count: sources.length },
    },
    revival_candidates: revivalCandidates,
    topic_cannibalization: cannibalization,
    ai_deep_analysis: {
      one_big_bet: '',  // Will be filled by LLM call if desired
      blind_spots: contentGaps.slice(0, 5).map(g => g.insight || `${g.entity_a} + ${g.entity_b}: never combined`),
      money_left_on_table: powerCombinations.slice(0, 5).map(p => p.insight || `${p.entity_a} + ${p.entity_b}`),
      title_formula_rec: titlePatterns.best_formula || {},
      posting_rhythm_rec: avgGapDays > 14 ? 'Consider posting more frequently — your gap is ' + avgGapDays + ' days.' : '',
    },
    // Include knowledge graph data for enhanced dashboard
    knowledge_graph: {
      total_nodes: graph.stats?.total_nodes || 0,
      total_edges: graph.stats?.total_edges || 0,
      content_gaps: contentGaps.slice(0, 10),
      power_combinations: powerCombinations.slice(0, 10),
      engagement_multipliers: (graphAnalytics.engagement_multipliers || []).slice(0, 10),
    },
  };
  writeJSON(bundlePath, 'insights', insights);

  // ── 6. voice_profile.json ──
  writeJSON(bundlePath, 'voice_profile', voiceProfile);

  // ── 7. comments.json (from merged comment mining) ──
  const commentData = merged.comments || [];
  writeJSON(bundlePath, 'comments', commentData);

  // ── 8. ready.flag ──
  fs.writeFileSync(path.join(bundlePath, 'ready.flag'), new Date().toISOString());

  console.log(`  Bundle exported: ${bundlePath}`);
  console.log(`  Files: manifest, sources, channel_metrics, analytics_report, insights, voice_profile, comments`);

  // ── 9. Run build_actionable.py ──
  if (fs.existsSync(DASHBOARD_BUILDER)) {
    console.log(`\n  Generating dashboard HTML...`);
    try {
      const result = execSync(`py "${DASHBOARD_BUILDER}" "${bundlePath}"`, {
        timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'],
        cwd: path.dirname(DASHBOARD_BUILDER),
      });
      console.log(`  ${result.toString().trim()}`);
    } catch (err) {
      console.log(`  Dashboard builder error: ${err.stderr?.toString().slice(0, 300) || err.message}`);
      console.log(`  You can run manually: py "${DASHBOARD_BUILDER}" "${bundlePath}"`);
    }
  } else {
    console.log(`\n  Dashboard builder not found at: ${DASHBOARD_BUILDER}`);
    console.log(`  Run manually: py build_actionable.py "${bundlePath}"`);
  }

  return bundlePath;
}


// ── Helper: Title Pattern Analysis ──────────────────────────

function analyzeTitlePatterns(sources, channelAvg) {
  const patterns = {
    negative_contrarian: { regex: /\b(without|never|stop|don'?t|won'?t|no one|nobody|isn'?t|anti|myth|wrong|lie|truth|secret|hidden)\b/i, count: 0, totalViews: 0, examples: [] },
    how_to: { regex: /^how\s+(to|i|we|my)/i, count: 0, totalViews: 0, examples: [] },
    question_title: { regex: /\?/, count: 0, totalViews: 0, examples: [] },
    listicle: { regex: /^\d+\s/, count: 0, totalViews: 0, examples: [] },
    pov: { regex: /^pov[:.]?\s/i, count: 0, totalViews: 0, examples: [] },
    challenge: { regex: /challenge/i, count: 0, totalViews: 0, examples: [] },
    emotional: { regex: /😂|🤣|😭|🥺|❤️|🙈|😍|💔/i, count: 0, totalViews: 0, examples: [] },
  };

  for (const s of sources) {
    for (const [name, pat] of Object.entries(patterns)) {
      if (pat.regex.test(s.title)) {
        pat.count++;
        pat.totalViews += s.views;
        if (pat.examples.length < 3) pat.examples.push(s.title);
      }
    }
  }

  const result = {};
  let bestLift = -999;
  let bestFormula = null;

  for (const [name, pat] of Object.entries(patterns)) {
    if (pat.count === 0) continue;
    const avg = Math.round(pat.totalViews / pat.count);
    const nonCount = sources.length - pat.count;
    const nonTotal = sources.reduce((s, src) => s + src.views, 0) - pat.totalViews;
    const nonAvg = nonCount > 0 ? Math.round(nonTotal / nonCount) : 0;
    const lift = nonAvg > 0 ? Math.round((avg - nonAvg) / nonAvg * 1000) / 10 : 0;

    result[name] = {
      count: pat.count, avg_views: avg, avg_views_without: nonAvg,
      lift_pct: lift, examples: pat.examples,
    };

    if (lift > bestLift && pat.count >= 2) {
      bestLift = lift;
      bestFormula = { formula: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), examples: pat.examples };
    }
  }

  result.best_formula = bestFormula;
  return result;
}


// ── Helper: Contrarian Analysis ──────────────────────────

function extractContrarianInsights(sources, channelAvg) {
  const contrarianRegex = /\b(without|never|stop|don'?t|won'?t|no one|anti|myth|wrong|lie|truth|secret|hidden|actually|real)\b/i;
  const contrarian = sources.filter(s => contrarianRegex.test(s.title));
  const conventional = sources.filter(s => !contrarianRegex.test(s.title));

  if (contrarian.length === 0) return {};

  const cAvg = Math.round(contrarian.reduce((s, c) => s + c.views, 0) / contrarian.length);
  const nAvg = conventional.length > 0 ? Math.round(conventional.reduce((s, c) => s + c.views, 0) / conventional.length) : 0;

  return {
    avg_views_contrarian: cAvg,
    avg_views_conventional: nAvg,
    lift_pct: nAvg > 0 ? Math.round((cAvg - nAvg) / nAvg * 100) : 0,
    top_contrarian: contrarian.sort((a, b) => b.views - a.views).slice(0, 5).map(s => ({ title: s.title, views: s.views })),
  };
}


// ── Helper: Write JSON ──────────────────────────────────

function writeJSON(dir, name, data) {
  const filepath = path.join(dir, `${name}.json`);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf-8');
  console.log(`  [OK] ${name}.json`);
}


module.exports = { generate };
