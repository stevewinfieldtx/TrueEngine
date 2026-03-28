# TrueEngine — Master Architecture

**One engine. Multiple templates. Infinite verticals.**

Every True* product is TrueEngine with a template applied.

---

## The Mental Model

```
Content Source  →  [Core Pipeline]  →  [Template Extractors]  →  [Intelligence Services]  →  Output
```

**Core pipeline** — always runs, same for every vertical:
- Ingest (YouTube, podcast, PDF, blog, social, raw text)
- Transcribe (captions-first, fallback to Groq Whisper)
- Chunk (500-word windows with 50-word overlap)
- Embed (vector store, semantic search)
- Comms extractor (voice, vocabulary, style)
- Topics extractor (themes, depth, sentiment)
- Comment mining (audience questions, requests, product mentions)

**Template extractors** — the plug-in layer. Define which specialized extractors run:

| Extractor | Fields extracted | Used in templates |
|---|---|---|
| `food` | restaurant_name, dish_name, rating, cuisine_type, location_description, price, recommended | food, influencer, couple |
| `religion` | verse_reference, theme, message_summary, audience_application, connected_verses | church |
| `products` | product_name, category, sentiment, is_sponsored, recommendation_strength | influencer, couple |
| `speakers` | speaker attribution, talk%, communication style per speaker | couple |
| `competitive` | competitors_mentioned, differentiators, objections, social_proof | business |
| `pitch_ready` | counter_ammunition, pitch_fragments, knowledge_gaps | business |

**Intelligence services** — called after analysis, delegate to specialist APIs:
- `TrueWriting` → CPP voice profile (formality, signature phrases, grammar signature)
- `TrueGraph` → Knowledge graph (nodes, edges, clusters, content gaps)

---

## Standard Data Shape

Every collection produces these fields regardless of template:

```json
{
  "collection_id": "string",
  "template_id": "influencer | church | food | business | couple | custom",
  "name": "string",
  "description": "string",
  "sources": [
    {
      "id": "string",
      "sourceType": "youtube | podcast | pdf | blog | social | text",
      "title": "string",
      "author": "string",
      "publishedAt": "ISO date",
      "duration": "seconds",
      "status": "processing | ready | error",
      "metadata": {
        "viewCount": 0,
        "likeCount": 0,
        "commentCount": 0,
        "tags": [],
        "comments": []
      }
    }
  ],
  "intelligence": {
    "merged_extractors": {},
    "engagement_analytics": {
      "totalVideos": 0,
      "totalViews": 0,
      "avgLikeRate": 0,
      "topByViews": [],
      "highPassion": [],
      "highEngagement": []
    },
    "voice_profile": {},
    "knowledge_graph": {}
  }
}
```

---

## Template Definitions

### How to add a new template

1. Add an entry to `config.TEMPLATES`
2. List the extractors you need (core extractors are always included)
3. If a new extractor is needed, add it to `src/core/analyzers.js`
4. No other changes required

### Current templates

#### `influencer`
Extractors: `communication, topics, food, products, comments`
Use for: YouTube creators, influencers, coaches, podcasters

#### `church`
Extractors: `communication, topics, religion, comments`
Use for: Pastors, sermon series, church content libraries
Extra fields: verse_reference, theme, message_summary, audience_application, connected_verses

#### `food`
Extractors: `communication, food, products, comments`
Use for: Food influencers, restaurant reviewers, culinary channels
Extra fields: restaurant_name, dish_name, rating (hate/dislike/meh/good/great), cuisine_type, location_description, price_mentioned

#### `business`
Extractors: `communication, topics, objections, competitive, pitch_ready, comments`
Use for: Sales intelligence, competitive research, pitch prep
Extra fields: competitors_mentioned, counter_ammunition, pitch_fragments, knowledge_gaps

#### `couple`
Extractors: `communication, topics, food, products, speaker_separation, comments`
Use for: Couple content creators (Jules & Andy, etc.)
Extra fields: All food + product fields, plus speaker attribution and talk percentage

#### `education`
Extractors: `communication, topics, comments`
Use for: Teachers, online courses, tutorial channels

#### `custom`
Extractors: `communication, topics, comments` (baseline)
Add any extractor from the table above as needed

---

## InfluencerEats Template

For food discovery / restaurant review content (e.g., InfluencerFood.com)

```js
influencereats: {
  id: 'influencereats',
  name: 'InfluencerEats',
  description: 'Food influencer — restaurant and dish extraction for map pins',
  extractors: ['communication', 'food', 'comments'],
  pinSchema: {
    restaurant_name: 'string',
    restaurant_location: 'string (city, neighborhood, or address)',
    food_selected: 'string (dish ordered)',
    food_review: 'string (direct quote from creator)',
    rating: 'good | meh | bad',
    video_timestamp: 'MM:SS',
    source_video_id: 'string',
    source_channel: 'string',
    confidence: '0.0 – 1.0'
  }
}
```

The `food` extractor already captures most of this. The `pinSchema` is documentation of which fields map to map pins in InfluencerFood.com.

---

## Church / TrueTeachings Template

For sermon content libraries (e.g., Fielder Church, Miracles Ministry)

```js
church: {
  id: 'church',
  name: 'TrueTeachings',
  description: 'Sermon and religious content analysis',
  extractors: ['communication', 'topics', 'religion', 'comments'],
  sermonSchema: {
    sermon_title: 'string (from source title)',
    series_name: 'string (if part of a series)',
    verse_reference: 'string (e.g. John 3:16)',
    theme: 'string (forgiveness, grace, faith, etc.)',
    message_summary: 'string',
    audience_application: 'string',
    connected_verses: 'array of strings',
    emotional_intensity: 'low | medium | high',
    timestamp: 'MM:SS'
  }
}
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Status check |
| GET | `/collections` | List all collections |
| POST | `/collections` | Create collection (`{id, templateId, name}`) |
| GET | `/collections/:id` | Collection details + stats |
| POST | `/collections/:id/ingest` | Ingest content (`{type, url}`) |
| POST | `/collections/:id/channel` | Ingest full YouTube channel |
| POST | `/collections/:id/analyze` | Run analysis on all ready sources |
| GET | `/collections/:id/search?q=...` | Semantic search |
| POST | `/collections/:id/ask` | Ask a question (`{question}`) |
| GET | `/collections/:id/intelligence/:type` | Get intelligence data |
| GET | `/collections/:id/dashboard` | Full dashboard data |

---

## Service Architecture

```
TrueEngine (port 8100)         TrueWriting (port 8200)        TrueGraph (port 8300)
─────────────────────          ──────────────────────          ─────────────────────
Core content engine            CPP voice profiling             Knowledge graph
Ingest, chunk, embed           Formality spectrum              Nodes, edges, clusters
Analyze via templates          Signature phrases               Content gaps
Search + RAG chat              Grammar signature               Power combinations
Calls TrueWriting →            ← Called by TrueEngine          ← Called by TrueEngine
Calls TrueGraph →
```

All three run independently. TrueEngine degrades gracefully if the others are offline.

---

## Quick Start (any vertical)

```bash
# Start the engine
cd TrueEngine && npm install && npm start

# Create a collection with a template
node src/cli.js create my-channel influencer "My YouTube Channel"

# Ingest a channel
node src/cli.js channel my-channel @channelhandle 50

# Run analysis
node src/cli.js analyze my-channel

# Search
node src/cli.js search my-channel "what restaurants did they go to"

# Ask
node src/cli.js ask my-channel "What products has she recommended?"
```

---

## What to Archive / Delete

| Folder | Action | Reason |
|---|---|---|
| `TrueInfluenceAI` | Archive | Original Python prototype, superseded |
| `TrueInfluenceAI-v2` | Archive | Python rewrite, superseded |
| `TrueInfluence-platform` | Delete | Empty shell, never finished |
| `TruePlatformAI` | Review then archive | Python multi-ingestor; check for any extractors not yet in TrueEngine |
| `TrueEngine` | ACTIVE | This is the engine |
| `TrueGraph` | ACTIVE | Standalone microservice, keep separate |

---

*Built by Steve Winfield / WinTech Partners*
*One engine. Multiple templates. Infinite verticals.*
