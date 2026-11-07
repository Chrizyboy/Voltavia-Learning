/* ==========================================================================
   Voltavia Learning – KI-Tutor-Server (Cloudflare Worker)
   Hält den Anthropic-API-Schlüssel geheim und leitet Tutor-Fragen an Claude weiter.

   Einrichtung (einmalig, ca. 10 Min.):
   1. Konto auf https://dash.cloudflare.com (Gratis-Plan genügt) → Workers & Pages → Worker erstellen
   2. Diesen Code einfügen und «Deploy»
   3. Settings → Variables → Secret «ANTHROPIC_API_KEY» = dein API-Schlüssel von https://console.anthropic.com
   4. Variable «ALLOWED_ORIGIN» = Adresse der App, z. B. https://chrizyboy.github.io
   5. Die Worker-Adresse (…workers.dev) in config.js bei tutorUrl eintragen
   ========================================================================== */
const MODEL = 'claude-haiku-5-5';      // günstig & schnell; für bessere Antworten: 'claude-sonnet-5-5'
const MAX_TOKENS = 700;
const LIMIT_PER_HOUR = 40;            // Fragen pro IP-Adresse und Stunde (Kostenschutz)
const hits = new Map();

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN || '*';
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return new Response('Not found', { status: 404, headers: cors });

    const ip = req.headers.get('CF-Connecting-IP') || 'x';
    const now = Date.now(), h = (hits.get(ip) || []).filter(t => now - t < 3600e3);
    if (h.length >= LIMIT_PER_HOUR) return json({ error: 'rate_limited' }, 429, cors);
    h.push(now); hits.set(ip, h);

    let body; try { body = await req.json(); } catch (e) { return json({ error: 'bad_request' }, 400, cors); }
    const messages = (body.messages || []).slice(-12).map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '').slice(0, 9000) }));
    if (!messages.length || messages[messages.length - 1].role !== 'user') return json({ error: 'bad_request' }, 400, cors);

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages })
    });
    if (!r.ok) return json({ error: 'upstream' }, 502, cors);
    const j = await r.json();
    const text = (j.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    return json({ text }, 200, cors);
  }
};
const json = (o, status, cors) => new Response(JSON.stringify(o), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
