require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

(async () => {
  const want = process.env.OPENROUTER_MODEL || 'anthropic/claude-haiku-4.5';
  const res = await fetch('https://openrouter.ai/api/v1/models');
  if (!res.ok) {
    console.error(`models endpoint HTTP ${res.status} — are you online?`);
    process.exit(1);
  }
  const { data } = await res.json();
  const ids = data.map((m) => m.id);
  const claude = ids.filter((id) => /anthropic\/claude/i.test(id));
  console.log(`configured: ${want} → ${ids.includes(want) ? 'EXISTS live' : 'NOT FOUND — pick one below'}`);
  console.log('claude models on openrouter:');
  for (const id of claude.slice(0, 25)) console.log(` - ${id}`);
  if (!process.env.OPENROUTER_KEY) console.log('(no OPENROUTER_KEY in .env — create app/.env to run live calls)');
})().catch((e) => {
  console.error(`check failed: ${e.message}`);
  process.exit(1);
});
