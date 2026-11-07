// Voltavia Learning – KI-Tutor (Supabase Edge Function «tutor»)
// Secret setzen: Edge Functions → Secrets → ANTHROPIC_API_KEY = dein Schlüssel von console.anthropic.com
import { createClient } from "jsr:@supabase/supabase-js@2";

const MODEL = "claude-haiku-5-5";   // günstig & schnell; für bessere Antworten: "claude-sonnet-5-5"
const MAX_TOKENS = 700;
const LIMIT_PER_HOUR = 40;          // Fragen pro Person und Stunde (Kostenschutz)
const hits = new Map<string, number[]>();
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "not_found" }, 404);

  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return json({ error: "unauthorized" }, 401);

  const now = Date.now();
  const h = (hits.get(user.id) ?? []).filter((t) => now - t < 3600e3);
  if (h.length >= LIMIT_PER_HOUR) return json({ error: "rate_limited" }, 429);
  h.push(now); hits.set(user.id, h);

  let body: { messages?: { role: string; content: string }[] };
  try { body = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const messages = (body.messages ?? []).slice(-12).map((m) => ({
    role: m.role === "assistant" ? "assistant" : "user",
    content: String(m.content ?? "").slice(0, 9000),
  }));
  if (!messages.length || messages[messages.length - 1].role !== "user") return json({ error: "bad_request" }, 400);

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: MODEL, max_tokens: MAX_TOKENS, messages }),
  });
  if (!r.ok) return json({ error: "upstream" }, 502);
  const j = await r.json();
  const text = (j.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  return json({ text });
});
