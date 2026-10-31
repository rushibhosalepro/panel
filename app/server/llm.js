const fs = require('fs');

const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';

function modelFor(kind) {
  if (kind === 'debate') return process.env.OPENROUTER_DEBATE_MODEL || process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  return process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
}

function parseJson(text) {
  const fenced = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = fenced ? fenced[1] : String(text || '');
  return JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
}

async function callOpenRouter({ prompt, model, kind, fallbackPath, label }) {
  const key = process.env.OPENROUTER_KEY;
  const loadFallback = () => ({ usedFallback: true, data: JSON.parse(fs.readFileSync(fallbackPath, 'utf8')) });
  if (process.env.OPENROUTER_OFF === '1') return { ...loadFallback(), fallbackReason: 'OPENROUTER_OFF=1 (demo safety switch)' };
  if (!key) return { ...loadFallback(), fallbackReason: 'no OPENROUTER_KEY' };
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3100',
          'X-Title': 'panel-hackathon'
        },
        body: JSON.stringify({
          model: model || modelFor(kind),
          messages: [{ role: 'user', content: prompt }],
          temperature: 0
        })
      });
      if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
      const body = await res.json();
      return { usedFallback: false, data: parseJson(body.choices[0].message.content) };
    } catch (e) {
      if (attempt === 2) {
        console.error(`[llm:${label}] ${e.message} — using fallback`);
        return { ...loadFallback(), fallbackReason: String(e.message) };
      }
    }
  }
}

// One tool-calling turn. Returns the assistant message ({content, tool_calls}); throws on failure
// so the caller can drop to the deterministic pipeline.
async function chatWithTools({ messages, tools, kind, label }) {
  const key = process.env.OPENROUTER_KEY;
  if (!key) throw new Error('no OPENROUTER_KEY');
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3100',
          'X-Title': 'panel-hackathon'
        },
        body: JSON.stringify({ model: modelFor(kind), messages, tools, tool_choice: 'auto', temperature: 0 })
      });
      if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`);
      const body = await res.json();
      const message = body.choices && body.choices[0] && body.choices[0].message;
      if (!message) throw new Error('OpenRouter returned no message');
      return message;
    } catch (e) {
      lastError = e;
      console.error(`[llm:${label}] attempt ${attempt}: ${e.message}`);
    }
  }
  throw lastError;
}

module.exports = { callOpenRouter, chatWithTools, parseJson, modelFor };
