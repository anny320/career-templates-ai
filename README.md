# Career Templates — GitHub Pages + Claude API generator

## What this is
A static SEO template site. Each template is its own pre-rendered HTML page
(good for indexing), styled with a shared `styles.css`, with a CTA at the
bottom pointing to your AI version of the tool.

## Structure
```
career-templates/
├── index.html              ← hub page, links to all templates
├── styles.css               ← shared design system
├── ai-generator.html        ← AI tool, calls the worker proxy (not Anthropic directly)
├── generate-templates.js    ← batch-generates the remaining 9 pages via Claude API
├── worker/                  ← Cloudflare Worker proxy — deploy separately, NOT part of GitHub Pages
│   ├── worker.js
│   └── wrangler.toml
└── templates/
    └── promotion-request-email.html   ← hand-built reference page (this format = the target)
```

## To generate the rest of the templates
1. `npm install @anthropic-ai/sdk`
2. `export ANTHROPIC_API_KEY=sk-ant-...`
3. `node generate-templates.js`

This writes the other 9 pages (Performance Review, Career Growth Plan, Leadership
Journal, Achievement Tracker, Manager 1:1 Notes, Brag Document, Salary Negotiation
Worksheet, Career Development Plan, Promotion Checklist) into `templates/`, in the
exact same format as `promotion-request-email.html`.

Re-running the script later only generates files that don't exist yet — pass
`--force` to regenerate everything (e.g. after editing the prompt or design).

## To add a new template later
Add one object to the `TOPICS` array in `generate-templates.js` — slug, title,
target keyword, doc type — then re-run the script. No other code changes needed.

## Credit protection (two layers)

**1. Server-side (the real limit) — `worker/`**
A Cloudflare Worker sits between the browser and Anthropic. It holds the API
key as a secret (never shipped to the browser) and enforces 5 generations per
IP per day using Workers KV — a limit that can't be reset by clearing
`localStorage` or opening dev tools.

Deploy it:
```
cd worker
npm install -g wrangler        # if not already installed
wrangler login
wrangler kv namespace create CT_RATE_LIMIT
# paste the returned id into wrangler.toml
wrangler secret put ANTHROPIC_API_KEY
# paste your real Anthropic key when prompted
wrangler secret put ADMIN_KEY
# pick any long random string — your password for the usage view below
wrangler deploy
```
Then copy the deployed URL into `ai-generator.html` — search for `WORKER_URL`
near the top of the `<script>` block — and update `ALLOWED_ORIGIN` in
`worker/worker.js` to your actual GitHub Pages origin (CORS lock-down).

**Checking usage** — visit:
```
https://career-templates-proxy.YOURNAME.workers.dev/admin?key=YOUR_ADMIN_KEY
```
Returns JSON with total successful generations per day for the last 14 days
(adjust `ADMIN_LOOKBACK_DAYS` in `worker.js`), e.g.:
```json
{
  "lookback_days": 14,
  "total_generations": 37,
  "by_day": [{ "date": "2026-06-29", "generations": 5 }, ...]
}
```
Wrong or missing key returns a plain 404, so the endpoint doesn't advertise
its own existence to anyone probing the URL.

**2. Client-side (early warning only) — `ai-generator.html`**
The page also shows a friendly "X of 3 free generations left today" counter
via `localStorage`, so most people see the limit before hitting it server-side.
This is just UX — it has no security value on its own, the Worker is what
actually protects your credits.

## Before deploying
- Replace `https://yourdomain.github.io/career-templates/` in each page's
  `<link rel="canonical">` with your real GitHub Pages URL.
- Deploy the Worker (above) before pushing `ai-generator.html` live — otherwise
  the generator will fail since `WORKER_URL` still points at the placeholder.
- Generate a `sitemap.xml` listing all template URLs once the domain is final,
  and submit it in Google Search Console.
- Push to the repo root that GitHub Pages serves from (same pattern as the
  TinkerWithMe and CreatorPay AI sites — single static folder, no build step).

## Why pages are pre-rendered (not generated client-side like the course picker)
The course picker calls the API live because every visitor's output is unique.
These templates are evergreen — the same page should rank and load instantly for
every visitor, so they're generated once at build time and committed as plain HTML.
