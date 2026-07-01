/**
 * generate-templates.js
 * -----------------------------------------------------------------------
 * Batch-generates SEO template pages (same format as promotion-request-email.html)
 * using the Anthropic API.
 *
 * SETUP
 *   npm install @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *
 * RUN
 *   node generate-templates.js
 *
 * OUTPUT
 *   Writes one .html file per topic into ./templates/
 *   Re-run any time to add new topics — already-generated files are skipped
 *   unless you pass --force.
 * -----------------------------------------------------------------------
 */

import Anthropic from "@anthropic-ai/sdk";
import fs from "fs";
import path from "path";

const anthropic = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const OUTPUT_DIR = path.join(process.cwd(), "templates");
const FORCE = process.argv.includes("--force");

// ---------------------------------------------------------------------
// 1. Your topic list — add new rows any time, no code changes needed.
// ---------------------------------------------------------------------
const TOPICS = [
  {
    slug: "performance-review-template",
    title: "Performance Review Template",
    keyword: "performance review template",
    docType: "form",
  },
  {
    slug: "career-growth-plan",
    title: "Career Growth Plan",
    keyword: "career growth plan template",
    docType: "plan",
  },
  {
    slug: "leadership-journal",
    title: "Leadership Journal",
    keyword: "leadership journal template",
    docType: "journal",
  },
  {
    slug: "achievement-tracker",
    title: "Achievement Tracker",
    keyword: "achievement tracker template",
    docType: "tracker",
  },
  {
    slug: "manager-one-on-one-notes",
    title: "Manager One-on-One Notes",
    keyword: "manager 1:1 notes template",
    docType: "notes",
  },
  {
    slug: "brag-document",
    title: "Brag Document",
    keyword: "brag document template",
    docType: "document",
  },
  {
    slug: "salary-negotiation-worksheet",
    title: "Salary Negotiation Worksheet",
    keyword: "salary negotiation worksheet",
    docType: "worksheet",
  },
  {
    slug: "career-development-plan",
    title: "Career Development Plan",
    keyword: "career development plan template",
    docType: "plan",
  },
  {
    slug: "promotion-checklist",
    title: "Promotion Checklist",
    keyword: "promotion checklist",
    docType: "checklist",
  },
];

// ---------------------------------------------------------------------
// 2. The shared HTML shell — same structure/classes as the hand-built
//    sample page, so every generated page matches the site's CSS.
// ---------------------------------------------------------------------
function renderPage({ title, keyword, metaDescription, schema, h1, dek, eyebrow,
                       docId, fields, steps, faqs, ctaHeadline, ctaBody, related, slug }) {
  const fieldsHtml = fields.map(f => `
    <div class="field">
      <span class="field-label">${escape(f.label)}</span>
      <div class="field-value">${escape(f.value)}</div>
    </div>`).join("\n");

  const stepsHtml = steps.map((s, i) => `
    <div class="step-row">
      <span class="step-num">${String(i + 1).padStart(2, "0")}</span>
      <div class="step-body"><p><strong>${escape(s.title)}</strong> ${escape(s.body)}</p></div>
    </div>`).join("\n");

  const faqHtml = faqs.map(f => `
    <div class="faq-item">
      <p class="faq-q">${escape(f.q)}</p>
      <p class="faq-a">${escape(f.a)}</p>
    </div>`).join("\n");

  const relatedHtml = related.map(r => `<li><a href="${r.slug}.html">${escape(r.title)}</a></li>`).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(title)} | Career Templates</title>
<meta name="description" content="${escape(metaDescription)}">
<link rel="canonical" href="https://yourdomain.github.io/career-templates/templates/${slug}.html">
<link rel="stylesheet" href="../styles.css">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:wght@500;600&family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;700&display=swap" rel="stylesheet">
<script type="application/ld+json">
${JSON.stringify(schema, null, 2)}
</script>
</head>
<body>

<header class="site-header">
  <div class="container">
    <a class="brand" href="../index.html">Career<span>Templates</span></a>
    <div class="crumb"><a href="../index.html">Templates</a> / ${escape(h1)}</div>
  </div>
</header>

<main class="container">

  <section class="hero">
    <div class="eyebrow">${escape(eyebrow)}</div>
    <h1>${escape(h1)}</h1>
    <p class="dek">${escape(dek)}</p>
  </section>

  <article class="doc-card" data-doc-id="${escape(docId)}">
    <h3>The Template</h3>
    ${fieldsHtml}
  </article>

  <section class="steps">
    <h2>How to use this template</h2>
    ${stepsHtml}
  </section>

  <section class="faq">
    <h2>Common questions</h2>
    ${faqHtml}
  </section>

  <section class="cta">
    <div class="cta-eyebrow">Free AI tool</div>
    <h3>${escape(ctaHeadline)}</h3>
    <p>${escape(ctaBody)}</p>
    <a class="cta-btn" href="../ai-generator.html?template=${slug}">Try the AI version →</a>
  </section>

  <section class="related">
    <h2>Related templates</h2>
    <ul>
      ${relatedHtml}
    </ul>
  </section>

</main>

<footer class="site-footer">
  <div class="container">© 2026 Career Templates. Free to use and edit.</div>
</footer>

</body>
</html>
`;
}

function escape(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// ---------------------------------------------------------------------
// 3. Prompt — asks Claude to return strict JSON matching the fields
//    renderPage() needs. Keep this prompt in sync if you change the
//    HTML shell above.
// ---------------------------------------------------------------------
function buildPrompt(topic, allTopics) {
  const others = allTopics
    .filter(t => t.slug !== topic.slug)
    .map(t => ({ slug: t.slug, title: t.title }));

  return `You are writing one page for an SEO-driven career templates site. The page is for the topic "${topic.title}" (target keyword: "${topic.keyword}", document type: ${topic.docType}).

Return ONLY valid JSON, no markdown fences, no preamble, matching exactly this shape:

{
  "title": "string, <60 chars, includes the keyword, e.g. 'X Template (Free, Editable) | Career Templates'",
  "metaDescription": "string, <155 chars, includes the keyword, mentions it's free/editable and that an AI version exists",
  "eyebrow": "short category label, e.g. 'Email template · Career growth'",
  "h1": "the page's main heading, human-readable, includes the keyword naturally",
  "dek": "1-2 sentence subheading explaining what this is and why someone would use it",
  "docId": "short mono-style doc reference code, e.g. 'DOC · PERF-REVIEW-01'",
  "fields": [ { "label": "FIELD LABEL", "value": "the actual template content for this field, using [bracketed placeholders] for things the user fills in" } ],
  "steps": [ { "title": "short imperative phrase", "body": "1-2 sentences of concrete advice" } ],
  "faqs": [ { "q": "question matching real search intent", "a": "concrete, specific answer, 1-3 sentences" } ],
  "ctaHeadline": "headline for the CTA box pitching the AI version of this template",
  "ctaBody": "1-2 sentences on what the AI version does differently (personalizes it to the user's role/results)",
  "schema": { valid schema.org FAQPage JSON-LD object built from the same faqs },
  "related": [ pick exactly 4 from this list: ${JSON.stringify(others)} ]
}

Rules:
- "fields" should be the actual usable template (3-6 fields), not a description of one. For a form/checklist, use one field per section with realistic placeholder structure inside the field value (use \\n for line breaks).
- Write 4 steps and 4 FAQs.
- No fluff, no generic corporate language. Specific and useful, the way a sharp career coach would write it.
- Keep total field content realistic — not padded.`;
}

// ---------------------------------------------------------------------
// 4. Main loop
// ---------------------------------------------------------------------
async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const topic of TOPICS) {
    const outPath = path.join(OUTPUT_DIR, `${topic.slug}.html`);
    if (fs.existsSync(outPath) && !FORCE) {
      console.log(`skip (exists): ${topic.slug}`);
      continue;
    }

    console.log(`generating: ${topic.slug} ...`);

    const msg = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2000,
      messages: [{ role: "user", content: buildPrompt(topic, TOPICS) }],
    });

    const raw = msg.content.find(b => b.type === "text")?.text ?? "";
    const clean = raw.replace(/^```json\s*|```$/g, "").trim();

    let data;
    try {
      data = JSON.parse(clean);
    } catch (err) {
      console.error(`  ✗ failed to parse JSON for ${topic.slug}:`, err.message);
      continue;
    }

    const html = renderPage({ ...data, slug: topic.slug });
    fs.writeFileSync(outPath, html, "utf-8");
    console.log(`  ✓ wrote ${outPath}`);
  }

  console.log("\nDone. Commit and push the templates/ folder to your GitHub Pages repo.");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
