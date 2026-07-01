/**
 * worker.js
 * -----------------------------------------------------------------------
 * Cloudflare Worker: proxies the AI generator's API calls so the
 * Anthropic key never reaches the browser, and enforces a real
 * server-side rate limit by IP (not bypassable via localStorage/devtools).
 *
 * SETUP (one-time)
 *   1. npm install -g wrangler
 *   2. wrangler login
 *   3. From the worker/ folder: wrangler kv namespace create CT_RATE_LIMIT
 *      → copy the returned "id" into wrangler.toml under kv_namespaces
 *   4. wrangler secret put ANTHROPIC_API_KEY
 *      → paste your real key when prompted (never goes in any file)
 *   5. wrangler secret put ADMIN_KEY
 *      → pick any long random string — this is your password for the
 *        /admin usage view, not related to Anthropic
 *   6. wrangler deploy
 *   7. Copy the deployed URL (e.g. https://career-templates-proxy.YOURNAME.workers.dev)
 *      into ai-generator.html where it calls the API (see WORKER_URL there).
 *
 * VIEWING USAGE
 *   Visit: https://career-templates-proxy.YOURNAME.workers.dev/admin?key=YOUR_ADMIN_KEY
 *   Returns JSON with total generations per day for the last 14 days.
 *
 * RATE LIMIT
 *   Default: 5 requests per IP per rolling 24 hours, stored in Workers KV.
 *   Adjust DAILY_LIMIT_PER_IP below. This is enforced here, server-side —
 *   it cannot be reset by clearing browser storage.
 * -----------------------------------------------------------------------
 */

const DAILY_LIMIT_PER_IP = 5;
const ALLOWED_ORIGIN = "https://yourusername.github.io"; // lock to your GitHub Pages origin
const ADMIN_LOOKBACK_DAYS = 14; // how many days the /admin view reports on

function dateKeysBack(n) {
  const dates = [];
  for (let i = 0; i < n; i++) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---- Admin view: GET /admin?key=YOUR_ADMIN_KEY ----
    // Set the real value with: wrangler secret put ADMIN_KEY
    if (url.pathname === "/admin") {
      const suppliedKey = url.searchParams.get("key");
      if (!env.ADMIN_KEY || suppliedKey !== env.ADMIN_KEY) {
        return new Response("Not found", { status: 404 });
      }

      const dates = dateKeysBack(ADMIN_LOOKBACK_DAYS);
      const rows = [];
      let total = 0;
      for (const date of dates) {
        const raw = await env.CT_RATE_LIMIT.get(`total:${date}`);
        const count = raw ? parseInt(raw, 10) : 0;
        total += count;
        rows.push({ date, generations: count });
      }

      return new Response(
        JSON.stringify({ lookback_days: ADMIN_LOOKBACK_DAYS, total_generations: total, by_day: rows }, null, 2),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // ---- CORS ----
    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    }

    // ---- Rate limit by IP, stored server-side in KV ----
    const ip = request.headers.get("CF-Connecting-IP") || "unknown";
    const today = new Date().toISOString().slice(0, 10);
    const kvKey = `rl:${ip}:${today}`;

    const currentRaw = await env.CT_RATE_LIMIT.get(kvKey);
    const current = currentRaw ? parseInt(currentRaw, 10) : 0;

    if (current >= DAILY_LIMIT_PER_IP) {
      return new Response(
        JSON.stringify({
          error: `Daily limit reached (${DAILY_LIMIT_PER_IP} per day). Please try again tomorrow.`,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ---- Validate and forward the request body ----
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.prompt || typeof body.prompt !== "string" || body.prompt.length > 4000) {
      return new Response(JSON.stringify({ error: "Missing or invalid 'prompt'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ---- Call Anthropic with the secret key (server-side only) ----
    let anthropicRes;
    try {
      anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": env.ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [{ role: "user", content: body.prompt }],
        }),
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: "Upstream request failed" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!anthropicRes.ok) {
      const errText = await anthropicRes.text();
      return new Response(JSON.stringify({ error: "Upstream API error", detail: errText }), {
        status: anthropicRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await anthropicRes.json();

    // ---- Only increment the counters on a successful generation ----
    await env.CT_RATE_LIMIT.put(kvKey, String(current + 1), { expirationTtl: 60 * 60 * 26 });

    const totalKey = `total:${today}`;
    const totalRaw = await env.CT_RATE_LIMIT.get(totalKey);
    const totalCount = totalRaw ? parseInt(totalRaw, 10) : 0;
    await env.CT_RATE_LIMIT.put(totalKey, String(totalCount + 1), { expirationTtl: 60 * 60 * 24 * (ADMIN_LOOKBACK_DAYS + 2) });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
