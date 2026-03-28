/**
 * TrueEngine - LLM Utility
 * ==========================
 * All LLM calls go through OpenRouter. Never Anthropic SDK directly.
 */

const config = require('../config');

/**
 * Call an LLM through OpenRouter
 */
async function callLLM(prompt, options = {}) {
  const {
    model = config.ANALYSIS_MODEL,
    maxTokens = 4000,
    temperature = 0.3,
    system = '',
    jsonMode = false,
  } = options;

  if (!config.OPENROUTER_API_KEY) {
    console.error('  OPENROUTER_API_KEY not set');
    return null;
  }

  const messages = [];
  if (system) messages.push({ role: 'system', content: system });
  messages.push({ role: 'user', content: prompt });

  try {
    const resp = await fetch(`${config.OPENROUTER_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        temperature,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`  LLM error ${resp.status}: ${text.slice(0, 200)}`);
      return null;
    }

    const data = await resp.json();
    return data.choices?.[0]?.message?.content || null;
  } catch (err) {
    console.error(`  LLM call failed: ${err.message}`);
    return null;
  }
}

/**
 * Call LLM and parse JSON response
 */
async function callLLMJSON(prompt, options = {}) {
  const raw = await callLLM(prompt, { ...options, jsonMode: true });
  if (!raw) return null;
  return parseJSONResponse(raw);
}

/**
 * Generate embeddings via OpenRouter
 */
async function generateEmbedding(text) {
  if (!config.OPENROUTER_API_KEY) return null;

  try {
    const resp = await fetch(`${config.OPENROUTER_BASE_URL}/embeddings`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.EMBEDDING_MODEL,
        input: text.slice(0, 8000),
      }),
    });

    if (!resp.ok) {
      console.error(`  Embedding error ${resp.status}`);
      return null;
    }

    const data = await resp.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    console.error(`  Embedding failed: ${err.message}`);
    return null;
  }
}

/**
 * Batch embed multiple texts
 */
async function batchEmbed(texts, maxParallel = 5) {
  const results = [];
  for (let i = 0; i < texts.length; i += maxParallel) {
    const batch = texts.slice(i, i + maxParallel);
    const embeddings = await Promise.all(batch.map(t => generateEmbedding(t)));
    results.push(...embeddings);
  }
  return results;
}

/**
 * Parse JSON from LLM response (handles markdown code blocks)
 */
function parseJSONResponse(text) {
  if (!text) return null;

  // Try raw parse
  try { return JSON.parse(text); } catch {}

  // Try extracting from code block
  const codeMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeMatch) {
    try { return JSON.parse(codeMatch[1]); } catch {}
  }

  // Try finding JSON object or array
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]); } catch {}
  }

  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) {
    try { return JSON.parse(arrMatch[0]); } catch {}
  }

  return null;
}

module.exports = { callLLM, callLLMJSON, generateEmbedding, batchEmbed, parseJSONResponse };
