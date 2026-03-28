// TrueGraph integration for TrueEngine
// Add this method to the TrueEngine class in engine.js
// Called from analyzeCollection after _buildVoiceProfile

/**
 * Call TrueGraph API to build knowledge graph from extracted entities.
 * TrueGraph finds relationships between topics, products, places, etc.
 * across the entire body of content.
 */
async _buildKnowledgeGraph(collectionId) {
  const apiUrl = config.TRUEGRAPH_API_URL;
  if (!apiUrl) {
    console.log('  Knowledge graph: TrueGraph API not configured (TRUEGRAPH_API_URL)');
    return null;
  }

  const col = this.store.getCollection(collectionId);
  const allAnalyses = this.store.getAnalysis(collectionId);
  const sources = this.store.getSources(collectionId).filter(s => s.status === 'ready');
  
  if (!allAnalyses.length) {
    console.log('  Knowledge graph: No analyses to build graph from');
    return null;
  }

  // Build source entities array for TrueGraph
  const graphSources = [];
  for (const source of sources) {
    const meta = typeof source.metadata === 'string' ? JSON.parse(source.metadata) : (source.metadata || {});
    const analysis = allAnalyses.find(a => a.source_id === source.id);
    if (!analysis) continue;

    const extractors = analysis.data?.extractors || {};
    
    // Extract entity names from each extractor's output
    const topics = (Array.isArray(extractors.topics) ? extractors.topics : [])
      .map(t => t.topic || t.name || '').filter(Boolean);
    
    const food = (Array.isArray(extractors.food) ? extractors.food : [])
      .map(f => f.restaurant_name || f.dish_name || '').filter(Boolean);
    
    const products = (Array.isArray(extractors.products) ? extractors.products : [])
      .map(p => p.product_name || '').filter(Boolean);

    // Religion/verses (for church template)
    const verses = (Array.isArray(extractors.religion) ? extractors.religion : [])
      .map(r => r.verse_reference || '').filter(Boolean);
    const themes = (Array.isArray(extractors.religion) ? extractors.religion : [])
      .map(r => r.theme || '').filter(Boolean);

    graphSources.push({
      source_id: source.id,
      title: source.title || '',
      published_at: source.published_at || meta.publishedAt || null,
      view_count: meta.viewCount || 0,
      like_count: meta.likeCount || 0,
      comment_count: meta.commentCount || 0,
      topics, food, products, verses, themes,
      tags: meta.tags || [],
      places: [], // Could extract from food locations
      people: (extractors.speakers?.speakers_identified || []),
    });
  }

  if (graphSources.length < 2) {
    console.log('  Knowledge graph: Not enough analyzed sources (need 2+)');
    return null;
  }

  console.log('\n  Building knowledge graph via TrueGraph API...');
  console.log('  Sending ' + graphSources.length + ' sources with extracted entities');

  try {
    const resp = await fetch(apiUrl + '/build-graph', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        collection_id: collectionId,
        collection_name: col?.name || collectionId,
        template: col?.template_id || 'default',
        sources: graphSources,
        generate_insights: true,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      console.log('  Knowledge graph: TrueGraph API error ' + resp.status + ': ' + errText.slice(0, 200));
      return null;
    }

    const graph = await resp.json();
    this.store.storeIntelligence(collectionId, 'knowledge_graph', graph);

    const stats = graph.stats || {};
    console.log('  Knowledge graph stored: ' + stats.total_nodes + ' nodes, ' + stats.total_edges + ' edges, ' + stats.total_clusters + ' clusters');
    
    const powerCombos = (graph.analytics?.power_combinations || []).length;
    const gaps = (graph.analytics?.content_gaps || []).length;
    if (powerCombos) console.log('  Power combinations found: ' + powerCombos);
    if (gaps) console.log('  Content gaps identified: ' + gaps);
    
    return graph;
  } catch (err) {
    console.log('  Knowledge graph: TrueGraph API unreachable (' + err.message + ')');
    console.log('  Tip: Start TrueGraph locally with: cd TrueGraph && py -m uvicorn api:app --port 8300');
    return null;
  }
}
