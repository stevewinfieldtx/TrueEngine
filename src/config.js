/**
 * TrueEngine - Configuration
 * ============================
 * All config from env vars. No hardcoded models.
 *
 * TEMPLATE SYSTEM
 * ---------------
 * Core extractors always run: communication, topics, comments
 * Template extractors add domain-specific fields on top.
 *
 * To add a new vertical:
 *   1. Add a template entry below
 *   2. List extractors needed
 *   3. Add any new extractor to src/core/analyzers.js
 *   4. Done — no other changes required
 */

require('dotenv').config();

module.exports = {
  // Server
  PORT: process.env.PORT || 8100,

  // OpenRouter
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY || '',
  OPENROUTER_BASE_URL: process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1',

  // Models (never hardcoded - always from env)
  ANALYSIS_MODEL: process.env.ANALYSIS_MODEL || 'qwen/qwen-2.5-72b-instruct',
  CONTENT_MODEL: process.env.CONTENT_MODEL || 'meta-llama/llama-3.1-70b-instruct',
  EMBEDDING_MODEL: process.env.EMBEDDING_MODEL || 'sentence-transformers/multi-qa-mpnet-base-dot-v1',

  // YouTube
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY || '',

  // Transcription
  GROQ_API_KEY: process.env.GROQ_API_KEY || '',

  // ElevenLabs
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY || '',

  // Service APIs (no forking — each service owns its domain)
  TRUEWRITING_API_URL: process.env.TRUEWRITING_API_URL || 'http://localhost:8200',
  TRUEGRAPH_API_URL:   process.env.TRUEGRAPH_API_URL   || 'http://localhost:8300',

  // Qdrant (vector search)
  QDRANT_URL: process.env.QDRANT_URL || '',
  QDRANT_API_KEY: process.env.QDRANT_API_KEY || '',
  EMBEDDING_DIMENSION: parseInt(process.env.EMBEDDING_DIMENSION || '768'),

  // Redis (job queue)
  REDIS_URL: process.env.REDIS_URL || '',

  // Processing
  CHUNK_SIZE:    parseInt(process.env.CHUNK_SIZE    || '500'),
  CHUNK_OVERLAP: parseInt(process.env.CHUNK_OVERLAP || '50'),

  // Storage
  DATA_DIR: process.env.DATA_DIR || './data',

  // API security
  API_SECRET_KEY: process.env.API_SECRET_KEY || '',

  // ─── Collection Templates ──────────────────────────────────────────────────
  //
  // Core extractors run on every template: communication, topics, comments
  // Template extractors add domain-specific fields on top.
  //
  // Available extractors:
  //   food             → restaurant_name, dish_name, rating, cuisine_type,
  //                       location_description, price_mentioned, recommended
  //   religion         → verse_reference, theme, message_summary,
  //                       audience_application, connected_verses, emotional_intensity
  //   products         → product_name, category, sentiment, is_sponsored,
  //                       recommendation_strength
  //   speaker_separation → speakers_identified, talk%, communication_style per speaker
  //   competitive      → competitors_mentioned, differentiators, objections, social_proof
  //   pitch_ready      → counter_ammunition, pitch_fragments, knowledge_gaps
  //   objections       → objections raised, responses, effectiveness scores
  //
  TEMPLATES: {

    // ── Influencer / Creator ───────────────────────────────────────────────
    influencer: {
      id: 'influencer',
      name: 'TrueInfluence',
      description: 'Content creator / influencer — voice, topics, products, and audience intel',
      extractors: ['communication', 'topics', 'food', 'products', 'comments'],
    },

    // ── Church / Sermon ────────────────────────────────────────────────────
    // Extra fields: verse_reference, theme, sermon point, audience application
    church: {
      id: 'church',
      name: 'TrueTeachings',
      description: 'Sermon and religious content — verse extraction and theological themes',
      extractors: ['communication', 'topics', 'religion', 'comments'],
      sermonFields: [
        'sermon_title', 'series_name', 'verse_reference', 'theme',
        'message_summary', 'audience_application', 'connected_verses',
        'emotional_intensity', 'timestamp',
      ],
    },

    // ── Food Influencer ────────────────────────────────────────────────────
    // Extra fields: restaurant_name, dish_name, rating, cuisine_type, location
    food: {
      id: 'food',
      name: 'TrueFood',
      description: 'Food influencer — every restaurant, dish, and opinion extracted',
      extractors: ['communication', 'food', 'products', 'comments'],
    },

    // ── InfluencerEats (map pin format) ────────────────────────────────────
    // Extra fields: restaurant_name, restaurant_location, food_selected,
    //               food_review (quote), rating (good/meh/bad), timestamp
    //
    // Same engine as 'food' — pinSchema defines which fields map to map pins.
    // Use this template when the output feeds InfluencerFood.com map pins.
    influencereats: {
      id: 'influencereats',
      name: 'InfluencerEats',
      description: 'Food discovery map — restaurant pins with structured review data',
      extractors: ['communication', 'food', 'comments'],
      pinSchema: {
        restaurant_name:     'string',
        restaurant_location: 'string — city, neighborhood, or address',
        food_selected:       'string — dish ordered',
        food_review:         'string — direct quote from creator',
        rating:              'good | meh | bad',
        video_timestamp:     'MM:SS',
        source_video_id:     'string',
        source_channel:      'string',
        confidence:          '0.0 – 1.0',
      },
    },

    // ── Business / Sales Intelligence ──────────────────────────────────────
    // Extra fields: competitive intel, objection handling, pitch fragments
    business: {
      id: 'business',
      name: 'TrueComms',
      description: 'Business communication, competitive intelligence, Pretty Good Pitch',
      extractors: ['communication', 'topics', 'objections', 'competitive', 'pitch_ready'],
    },

    // ── Couple Creators ────────────────────────────────────────────────────
    // Extra fields: speaker attribution, talk%, individual communication styles
    couple: {
      id: 'couple',
      name: 'TrueCouple',
      description: 'Couple content creators — speaker-separated analysis',
      extractors: ['communication', 'topics', 'food', 'products', 'speaker_separation', 'comments'],
    },

    // ── Education ──────────────────────────────────────────────────────────
    education: {
      id: 'education',
      name: 'TrueTeach',
      description: 'Educational content — topics, depth, and audience questions',
      extractors: ['communication', 'topics', 'comments'],
    },

    // ── Default / General ──────────────────────────────────────────────────
    default: {
      id: 'default',
      name: 'TrueEngine',
      description: 'General content intelligence — use this when no vertical fits',
      extractors: ['communication', 'topics', 'comments'],
    },
  },
};
