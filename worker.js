// Yorgo Builds blog robot: one Cloudflare Worker, free plan only.
// Bindings: DB (D1), AI (Workers AI). Secret: CRON_SECRET. Cron: "0 */6 * * *".
const SITE = "https://yorgobuilds.com";
const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_PER_DAY = 4;
const MIN_WORDS = 900;

// Pages the writer may link to. Only these links survive.
const LINKS = [
  ["/how-much-does-a-website-cost.html", "How much does a website cost in 2026?"],
  ["/what-to-put-on-a-cafe-website.html", "What to put on a café website"],
  ["/freelance-web-designer-vs-agency.html", "Freelance web designer vs agency"],
  ["/website-check.html", "Free website check"],
  ["/website-for-cafe.html", "Website for cafés"],
  ["/website-for-restaurant.html", "Website for restaurants"],
  ["/website-for-clinic.html", "Website for clinics"],
  ["/website-for-dentist.html", "Website for dentists"],
  ["/online-store-for-clothing.html", "Online store for clothing brands"],
  ["/website-for-phone-repair-shop.html", "Website for phone repair shops"],
  ["/website-for-lawyer.html", "Website for lawyers"],
  ["/website-for-real-estate.html", "Website for real estate agents"],
  ["/website-for-barber-shop.html", "Website for barber shops"],
  ["/website-for-salon.html", "Website for salons"],
  ["/website-for-gym.html", "Website for gyms"],
  ["/website-design-uae.html", "Website design in Dubai and the UAE"],
];
// "My app" links: at most one per post.
const SELL = [
  ["/prices.html", "Prices"], ["/quote.html", "Get a quote"], ["/google-maps-setup.html", "Google Maps setup ($49)"],
];
// The only numbers the writer may use (Yorgo's own offer). Anything else is treated as invented.
const FACTS = `Yorgo Builds facts (the ONLY numbers you may use):
- Starter website from $190, Business website from $390 (includes basic SEO and Google Maps setup), Shopify store from $490 (up to 20 products, +$50 per 10 extra).
- Websites ready in 7 days once photos and text are in; online stores 10 to 14 days.
- Add-ons: online payments $100, booking $150, Arabic + English +25%. Google Maps setup alone $49.
- Care plan $25/month, optional. Payment 50% to start, 50% before launch.
- Hosting free for normal sites; domain about $10 to $20 a year, paid by the client.
- Yorgo works remotely, for any business anywhere, over WhatsApp.`;
const OK_NUMBERS = new Set(["190","390","490","50","20","10","14","7","100","150","25","49","12"]);
const BANNED = /\b(delve|delving|testament to|in conclusion|in today's (fast-paced|digital)|game[- ]changer|unlock(ing)? the|navigat(e|ing) the (world|landscape)|look no further|rest assured|elevate your|seamless(ly)?|in summary|ultimately,|it's important to note|whether you're)\b/i;
const PLACEHOLDER = /\[[^\]]{1,40}\]|\{\{|lorem|ipsum|TODO|TBD|XXX|insert (link|image|name)|your-?link|example\.com/i;


// ---------- first run: create tables and add the 50 starter questions ----------
const TABLES = ["CREATE TABLE IF NOT EXISTS blog_questions (   id INTEGER PRIMARY KEY,   question TEXT NOT NULL UNIQUE,   intent TEXT,   status TEXT NOT NULL DEFAULT 'queued',   topic TEXT,   priority INTEGER NOT NULL DEFAULT 0,   note TEXT,   slug TEXT,   added TEXT DEFAULT (date('now')),   published_at TEXT )", "CREATE TABLE IF NOT EXISTS posts (   slug TEXT PRIMARY KEY,   question_id INTEGER,   title TEXT, meta_title TEXT, meta_desc TEXT, intent TEXT, topic TEXT,   html TEXT, faq TEXT, words INTEGER, image_alt TEXT,   status TEXT NOT NULL DEFAULT 'live',   created_at TEXT )"];
const SEED = [["Do I need a website if I already have Instagram?", "explain"], ["Do I need a website if I have a Google Business Profile?", "explain"], ["How much does a website cost for a small business?", "explain"], ["Is there a monthly fee for a website?", "explain"], ["What is the difference between a domain and hosting?", "explain"], ["How much does a domain name cost per year?", "explain"], ["How do I buy a domain name for my business?", "how-to"], ["How do I get a business email like hello@mybusiness.com?", "how-to"], ["Wix vs Squarespace vs hiring a freelancer: which is best for a small business?", "compare"], ["Shopify vs WooCommerce for a small online store", "compare"], ["Shopify vs Wix for selling clothes online", "compare"], ["Shopify vs Salla for selling in Saudi Arabia", "compare"], ["How much does Shopify really cost per month with apps and fees?", "explain"], ["Can I sell online without Shopify?", "explain"], ["How do I sell on Instagram and WhatsApp without a website?", "how-to"], ["How do I add a WhatsApp button to my website?", "how-to"], ["How do I take online payments on my website?", "how-to"], ["How do I add online booking to my salon or clinic website?", "how-to"], ["How do I get my business to show up on Google?", "how-to"], ["How long does it take for a new website to show up on Google?", "how-to"], ["How do I submit my website to Google Search Console?", "how-to"], ["Why is my website not showing up on Google?", "explain"], ["How do I get more Google reviews for my business?", "how-to"], ["How do I reply to a bad Google review?", "how-to"], ["What pages should a small business website have?", "explain"], ["What should a restaurant website include?", "explain"], ["What should a clinic or doctor website include?", "explain"], ["What should a real estate agent website include?", "explain"], ["What should a salon or barber website include?", "explain"], ["Does a one-page website work for a small business?", "explain"], ["How do I write the text for my business website?", "how-to"], ["What photos do I need for my website and how do I take them on a phone?", "how-to"], ["Freelancer vs agency vs website builder: who should build my site?", "compare"], ["How do I choose a web designer and avoid getting scammed?", "how-to"], ["What questions should I ask a web designer before paying?", "explain"], ["Who should own my domain and website, me or the designer?", "explain"], ["What happens to my website if my web designer disappears?", "explain"], ["How long does it take to build a small business website?", "explain"], ["Why is my website slow on phones and how much does it matter?", "explain"], ["Do I need a cookie banner or privacy policy on a small website?", "explain"], ["How do I make a bilingual Arabic and English website?", "how-to"], ["Arabic or English: which language should my website be in for the Gulf?", "explain"], ["How much does a website cost in Dubai or the UAE?", "explain"], ["How much does a website cost in Saudi Arabia?", "explain"], ["How do I accept online payments in the UAE or Saudi Arabia?", "how-to"], ["Is a website worth it for a home-based business?", "explain"], ["How do I move from Instagram-only selling to an online store?", "how-to"], ["What is a website care plan and do I need one?", "explain"], ["How do I check if my current website is good enough?", "how-to"], ["Do I need a new website or just a redesign?", "explain"]];
let ready = false;
async function ensureDb(env) {
  if (ready) return;
  await env.DB.batch(TABLES.map(s => env.DB.prepare(s)));
  const n = await env.DB.prepare("SELECT COUNT(*) n FROM blog_questions").first();
  if (!n.n) await env.DB.batch(SEED.map(([q, i]) => env.DB.prepare("INSERT OR IGNORE INTO blog_questions (question,intent) VALUES (?,?)").bind(q, i)));
  ready = true;
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(ensureDb(env).then(() => runOnce(env)));
  },
  async fetch(req, env) {
    try { return await handle(req, env); }
    catch (e) { return new Response("Robot error: " + (e && e.message || e), { status: 500, headers: { "content-type": "text/plain; charset=utf-8" } }); }
  },
};

async function handle(req, env) {
  {
    await ensureDb(env);
    const url = new URL(req.url);
    const p = url.pathname.replace(/\/+$/, "") || "/";
    if (p === "/api/blog/generate") {
      if ((req.headers.get("authorization") || "") !== `Bearer ${env.CRON_SECRET}` || !env.CRON_SECRET)
        return new Response("Unauthorized", { status: 401 });
      return json(await runOnce(env));
    }
    if (p === "/api/blog/learn") return learn(req, env);
    if (p === "/api/blog/review") return review(req, env);
    if (p === "/blog-sitemap.xml") return sitemap(env);
    if (p === "/blog") return blogIndex(env);
    let m = p.match(/^\/blog\/img\/([a-z0-9-]+)\.svg$/);
    if (m) return featuredSvg(env, m[1]);
    m = p.match(/^\/blog\/([a-z0-9-]+)$/);
    if (m) return postPage(env, m[1]);
    return new Response("Not found", { status: 404 });
  }
}

// ---------- the writer job ----------
async function runOnce(env) {
  const today = new Date().toISOString().slice(0, 10);
  const done = await env.DB.prepare("SELECT COUNT(*) n FROM posts WHERE substr(created_at,1,10)=?").bind(today).first();
  if (done.n >= MAX_PER_DAY) return { skipped: "daily limit reached" };

  let q = await nextQuestion(env);
  if (!q) { await refill(env); q = await nextQuestion(env); }
  if (!q) return { skipped: "queue empty" };
  await env.DB.prepare("UPDATE blog_questions SET status='writing' WHERE id=?").bind(q.id).run();

  try {
    let post = await write(env, q);
    let fail = await qualityGate(env, post, q);
    if (fail) { post = await write(env, q); const again = await qualityGate(env, post, q); fail = again && `${fail} / retry: ${again}`; }
    if (fail) {
      await env.DB.prepare("UPDATE blog_questions SET status='failed', note=? WHERE id=?").bind(fail, q.id).run();
      return { failed: q.question, reason: fail };
    }
    await env.DB.prepare(`INSERT INTO posts (slug,question_id,title,meta_title,meta_desc,intent,topic,html,faq,words,image_alt,created_at,status)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(post.slug, q.id, post.title, post.meta_title, post.meta_desc, post.intent,
      q.topic || post.topic, post.html, JSON.stringify(post.faq), post.words, post.image_alt, new Date().toISOString(), env.REVIEW === "1" ? "draft" : "live").run();
    await env.DB.prepare("UPDATE blog_questions SET status='published', slug=?, published_at=? WHERE id=?")
      .bind(post.slug, today, q.id).run();
    return env.REVIEW === "1" ? { draft: `${SITE}/api/blog/review`, words: post.words } : { published: `${SITE}/blog/${post.slug}`, words: post.words };
  } catch (e) {
    await env.DB.prepare("UPDATE blog_questions SET status='failed', note=? WHERE id=?").bind(String(e).slice(0, 300), q.id).run();
    return { failed: q.question, reason: String(e) };
  }
}

// Oldest queued question whose topic wasn't published in the last 7 days.
async function nextQuestion(env) {
  return env.DB.prepare(`SELECT * FROM blog_questions WHERE status='queued' AND intent != 'compare'
    AND (topic IS NULL OR topic NOT IN (SELECT topic FROM posts WHERE created_at >= datetime('now','-7 days') AND topic IS NOT NULL))
    ORDER BY priority DESC, id LIMIT 1`).first();
}

async function refill(env, seedTitles, count = 20) {
  const all = await env.DB.prepare("SELECT question FROM blog_questions").all();
  const have = all.results.map(r => r.question);
  const about = seedTitles ? `closely related to these posts that get clicks: ${seedTitles.join("; ")}`
    : "about getting a website, online store, Google, Instagram, WhatsApp, Shopify, costs, and the Gulf/Arabic market";
  const out = await ask(env, [
    { role: "system", content: "You suggest blog questions that small business owners really type into Google or Reddit. Reply with JSON only." },
    { role: "user", content: `Give ${count} new questions ${about}. Not duplicates of: ${have.slice(-120).join(" | ")}.
JSON: {"questions":[{"q":"...","intent":"explain|compare|how-to","topic":"one or two words"}]}` },
  ], 1500);
  const list = (parseJson(out).questions || []).slice(0, count);
  let added = 0;
  for (const it of list) {
    if (!it.q || have.some(h => similar(h, it.q) > 0.6)) continue;
    const r = await env.DB.prepare("INSERT OR IGNORE INTO blog_questions (question,intent,topic,priority) VALUES (?,?,?,?)")
      .bind(it.q.trim(), ["explain", "compare", "how-to"].includes(it.intent) ? it.intent : "explain", (it.topic || "").toLowerCase().slice(0, 30), seedTitles ? 1 : 0).run();
    added += r.meta.changes || 0; have.push(it.q);
  }
  return added;
}

async function write(env, q) {
  // b. intent + outline
  const plan = parseJson(await ask(env, [
    { role: "system", content: "You plan blog posts for Yorgo, a freelance web designer who builds websites for small businesses anywhere. Reply with JSON only." },
    { role: "user", content: `Question: "${q.question}"
Decide the intent (explain, compare or how-to) and plan a post that answers it.
JSON: {"intent":"...","title":"the question, natural wording","meta_title":"max 60 characters","meta_desc":"max 155 characters, says what the reader gets","slug":"short-hyphen-slug","topic":"one or two words","image_alt":"describe a simple card image with the title","outline":["6 to 9 section headings, uneven depth, ending with Quick answers"]}` },
  ], 800));
  const intent = ["explain", "compare", "how-to"].includes(plan.intent) ? plan.intent : (q.intent || "explain");
  const linkList = LINKS.map(([u, t]) => `${t}: ${u}`).join("\n");
  const sellList = SELL.map(([u, t]) => `${t}: ${u}`).join("\n");

  // c. draft
  const draft = await ask(env, [
    { role: "system", content: `You are Yorgo, a freelance web designer. Plain English, short sentences, concrete examples from small shops (cafés, salons, clinics, clothing brands). No hype.
${FACTS}
Never invent statistics, studies, percentages, prices of other companies or quotes. If a number isn't in the facts, describe it in words ("a monthly fee", "a few hundred dollars").` },
    { role: "user", content: `Write a ${intent} blog post answering: "${q.question}"
Outline: ${JSON.stringify(plan.outline || [])}
Rules:
- Output HTML only, using only <h2>, <h3>, <p>, <ul>, <ol>, <li>, <strong>, <a href>. No <html>, no title, no markdown.
- First <p>: the direct answer in 2 to 3 sentences.
- Then details, real-life examples, and steps or a comparison if it fits.
- One section titled "My take" with one honest opinion, and one short paragraph that starts "Where this falls short" with an honest limitation.
- Add 3 to 5 links, written naturally in sentences, chosen only from:\n${linkList}
- At most one link from this list, only if it truly helps the reader:\n${sellList}
- End with <h2>Quick answers</h2> then 4 or 5 pairs of <h3>question?</h3><p>answer</p>.
- Length: 1100 to 1400 words.
- Say nothing about other companies' features, prices, fees, payment methods, security or support unless it is in the facts above. If you don't know, leave it out. Never write "based on my experience" or invent clients, shops or cities.
- Add 3 to 5 links only where a reader would really click them. Do not add a "More information on..." sentence to every section.
- Never say the same thing twice. Every section must add a new fact or example. No section may repeat an earlier paragraph.
- Headings must be specific to the question. No "Introduction", "Overview", "Conclusion" or "What is X?" headings.
- Take a side: say plainly which option you would pick for a small shop and why, in "My take".
- Use plain, concrete wording a shop owner would use. No filler like "a wide range of features" or "ease of use".` },
  ], 3500);

  // d. humanize pass (separate prompt)
  const human = await ask(env, [
    { role: "system", content: "You are a blunt human editor. You make AI-sounding drafts read like a real person wrote them. Return the edited HTML only, same tags, nothing else." },
    { role: "user", content: `Edit this draft:
- Make section lengths uneven: some sections 1 short paragraph, some longer.
- Delete any sentence that restates the main point or summarises the post.
- Remove: delve, testament to, in conclusion, in today's world, game-changer, seamless, elevate, navigate the landscape, look no further, "whether you're", "it's important to note".
- Remove fake friendliness ("Great question!", "Happy building!", "I hope this helps").
- Keep every fact, link, the "My take" section, the "Where this falls short" paragraph and the Quick answers section. Don't add numbers.
- Keep it over 1000 words.

${draft}` },
  ], 3500);

  const html = cleanHtml(human.length > draft.length * 0.7 ? human : draft);
  const faq = [...html.split(/<h2>\s*Quick answers\s*<\/h2>/i)[1]?.matchAll(/<h3>(.*?)<\/h3>\s*<p>(.*?)<\/p>/gis) || []]
    .map(m => ({ q: strip(m[1]), a: strip(m[2]) })).filter(f => f.q && f.a);
  return {
    intent, html, faq, topic: (plan.topic || "").toLowerCase().slice(0, 30),
    title: clip(strip(plan.title || q.question), 90),
    meta_title: clip(strip(plan.meta_title || plan.title || q.question), 60),
    meta_desc: clip(strip(plan.meta_desc || ""), 155),
    slug: slugify(plan.slug || q.question),
    image_alt: clip(strip(plan.image_alt || `Card with the title: ${q.question}`), 140),
    words: strip(html).split(/\s+/).filter(Boolean).length,
  };
}

// f. quality gate. Returns a reason string to reject, or null.
async function qualityGate(env, post, q) {
  const text = strip(post.html);
  if (post.words < MIN_WORDS) return `too short (${post.words} words)`;
  if (/<h2>\s*(introduction|overview|conclusion|summary)\b/i.test(post.html)) return "generic heading";
  const sents = text.split(/(?<=[.!?])\s+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 70);
  const seen = new Set(); for (const s of sents) { if (seen.has(s)) return "repeats itself: " + s.slice(0, 40); seen.add(s); }
  if (PLACEHOLDER.test(post.html)) return "placeholder found: " + String(post.html.match(PLACEHOLDER)[0]).slice(0, 40);
  if (BANNED.test(text)) return "AI phrase left: " + text.match(BANNED)[0];
  if (/\d+(\.\d+)?\s?%|\bpercent\b/i.test(text)) return "percentage (likely invented)";
  const nums = [...text.matchAll(/\$\s?([\d,]+)|\b(\d{2,})\b/g)].map(m => (m[1] || m[2]).replace(/,/g, ""));
  const bad = nums.filter(n => !OK_NUMBERS.has(n) && !/^20[2-3]\d$/.test(n));
  if (bad.length) return "number not in facts: " + bad.slice(0, 3).join(", ");
  if (post.faq.length < 3) return "FAQ missing";
  if (!/My take/i.test(post.html) || !/falls short/i.test(post.html)) return "opinion or limitation missing";
  const internal = (post.html.match(/href="\/(?!prices|quote|google-maps-setup)/g) || []).length;
  if (internal < 3) return `only ${internal} internal links`;
  if (!post.meta_desc || !post.slug) return "meta missing";
  const old = await env.DB.prepare("SELECT slug,title FROM posts").all();
  for (const o of old.results) {
    if (o.slug === post.slug) post.slug = `${post.slug}-${q.id}`;
    if (similar(o.title, post.title) > 0.7) return "duplicates: " + o.slug;
  }
  return null;
}

// ---------- learn: paste a Search Console "Pages" export ----------
async function learn(req, env) {
  if (req.method === "GET")
    return html(`<!doctype html><meta name="viewport" content="width=device-width"><title>Blog learn</title>
<body style="font:16px system-ui;background:#000;color:#F5F5F7;padding:20px;max-width:640px">
<h1>Learn from Search Console</h1><p>Search Console → Performance → Pages tab → Export → Download CSV → open <b>Pages.csv</b>, copy everything, paste below.</p>
<form method="post"><input name="secret" type="password" placeholder="CRON_SECRET" style="width:100%;padding:12px;margin:8px 0">
<textarea name="csv" rows="12" style="width:100%;padding:12px"></textarea>
<button style="background:#C8F031;border:0;padding:14px 20px;font-weight:700;margin-top:8px">Add 10 related questions</button></form>`);
  const f = await req.formData();
  if (!env.CRON_SECRET || f.get("secret") !== env.CRON_SECRET) return new Response("Unauthorized", { status: 401 });
  const rows = String(f.get("csv") || "").split(/\r?\n/).slice(1).map(l => l.split(","));
  const slugs = rows.filter(r => /\/blog\/[a-z0-9-]+/.test(r[0]) && +r[1] > 0)
    .sort((a, b) => +b[1] - +a[1]).map(r => r[0].match(/\/blog\/([a-z0-9-]+)/)[1]).slice(0, 5);
  if (!slugs.length) return html("<p>No blog posts with clicks yet. Try again next week.</p>");
  const titles = [];
  for (const s of slugs) { const p = await env.DB.prepare("SELECT title FROM posts WHERE slug=?").bind(s).first(); if (p) titles.push(p.title); }
  const added = await refill(env, titles, 10);
  return html(`<p style="font:18px system-ui">Done: ${added} new questions added, based on: ${titles.map(esc).join(", ")}</p>`);
}


// ---------- review: approve or delete drafts (only when REVIEW=1) ----------
async function review(req, env) {
  const form = req.method === "POST" ? await req.formData() : null;
  const secret = form ? form.get("secret") : new URL(req.url).searchParams.get("secret");
  if (!env.CRON_SECRET || secret !== env.CRON_SECRET)
    return html(`<!doctype html><meta name="viewport" content="width=device-width"><body style="font:16px system-ui;background:#000;color:#F5F5F7;padding:20px"><h1>Blog review</h1><form><input name="secret" type="password" placeholder="CRON_SECRET" style="padding:12px;width:100%"><button style="background:#C8F031;border:0;padding:14px 20px;font-weight:700;margin-top:8px">Open</button></form>`);
  if (form && (form.get("slug") || form.get("act") === "run" || form.get("act") === "requeue")) {
    const slug = String(form.get("slug"));
    if (form.get("act") === "run") { const out = await runOnce(env); return html(`<body style="font:16px system-ui;background:#000;color:#F5F5F7;padding:20px"><pre>${esc(JSON.stringify(out, null, 2))}</pre><p><a style="color:#C8F031" href="/api/blog/review">Back</a> (log in again)</p>`); }
    if (form.get("act") === "requeue") await env.DB.prepare("UPDATE blog_questions SET status='queued' WHERE status='failed'").run();
    if (form.get("act") === "approve") await env.DB.prepare("UPDATE posts SET status='live', created_at=? WHERE slug=?").bind(new Date().toISOString(), slug).run();
    else await env.DB.prepare("DELETE FROM posts WHERE slug=?").bind(slug).run();
  }
  const r = await env.DB.prepare("SELECT slug,title,words,html FROM posts WHERE status='draft' ORDER BY created_at").all();
  const items = r.results.map(p => `<div style="border:1px solid #333;padding:16px;margin:16px 0"><h2>${esc(p.title)}</h2><p>${p.words} words</p>
<details><summary>Read it</summary><div style="max-width:640px;line-height:1.6">${p.html}</div></details>
<form method="post"><input type="hidden" name="secret" value="${esc(secret)}"><input type="hidden" name="slug" value="${esc(p.slug)}">
<button name="act" value="approve" style="background:#C8F031;border:0;padding:12px 18px;font-weight:700">Publish</button>
<button name="act" value="delete" style="background:#333;color:#fff;border:0;padding:12px 18px;margin-left:8px">Delete</button></form></div>`).join("");
  return html(`<!doctype html><meta name="viewport" content="width=device-width"><title>Blog review</title><body style="font:16px system-ui;background:#000;color:#F5F5F7;padding:20px;max-width:720px"><h1>Drafts waiting (${r.results.length})</h1>${items || "<p>Nothing waiting.</p>"}<form method="post"><input type="hidden" name="secret" value="${esc(secret)}"><button name="act" value="run" style="background:#C8F031;border:0;padding:14px 20px;font-weight:700;margin-top:24px">Write one post now (takes about 1 minute)</button><button name="act" value="requeue" style="background:#333;color:#fff;border:0;padding:14px 20px;margin:24px 0 0 8px">Retry failed questions</button></form>`);
}

// ---------- pages ----------
async function postPage(env, slug) {
  const p = await env.DB.prepare("SELECT * FROM posts WHERE slug=? AND status='live'").bind(slug).first();
  if (!p) return new Response("Not found", { status: 404 });
  const url = `${SITE}/blog/${p.slug}`, img = `${SITE}/blog/img/${p.slug}.svg`;
  const date = p.created_at.slice(0, 10), nice = new Date(p.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const faq = JSON.parse(p.faq || "[]");
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE + "/" },
      { "@type": "ListItem", position: 2, name: "Blog", item: SITE + "/blog" },
      { "@type": "ListItem", position: 3, name: p.title, item: url }] },
    { "@context": "https://schema.org", "@type": "Article", headline: p.title, description: p.meta_desc, image: `${SITE}/og-image.png?v=3`,
      datePublished: date, dateModified: date, inLanguage: "en", mainEntityOfPage: url,
      author: { "@type": "Person", name: "Yorgo", jobTitle: "Web designer, founder of Yorgo Builds", url: SITE + "/about.html",
        sameAs: ["https://www.instagram.com/yorgobuilds/", "https://www.linkedin.com/in/yorgo-aoun-669133439/"] },
      publisher: { "@type": "Organization", name: "Yorgo Builds", url: SITE + "/", logo: { "@type": "ImageObject", url: SITE + "/favicon-192.png" } } },
  ];
  if (faq.length) ld.push({ "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: faq.map(f => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) });
  const body = p.html.replace(/^\s*<p>([\s\S]*?)<\/p>/, '<div class="ans"><p>$1</p></div>');
  const mins = Math.max(3, Math.round(p.words / 220));
  return html(page({
    title: p.meta_title, desc: p.meta_desc, url, ld,
    main: `<header class="jh"><p class="kick"><a href="/journal.html">Journal</a> <em>/ ${esc(p.topic || "Guide")}</em></p>
    <h1>${esc(p.title)}</h1><p class="meta">By <b>Yorgo</b> · ${nice} · ${mins} min read</p></header>
  <article class="art"><figure class="fig"><img src="${img}" width="1200" height="630" alt="${esc(p.image_alt)}"></figure>
${body}
${AUTHOR}
<div class="cta"><h2>Want a website that brings customers?</h2><p>Tell me about your business on WhatsApp and I send a fixed price and launch date the same day.</p>
<div class="row"><a class="btn wa-link" href="#"><i><svg viewBox="0 0 24 24"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2z"/></svg></i>Chat on WhatsApp</a></div></div>
  </article>`,
    wa: `Hi Yorgo, I read your article "${p.title}". Can you help me?`,
  }));
}

async function blogIndex(env) {
  const r = await env.DB.prepare("SELECT slug,title,meta_desc,created_at FROM posts WHERE status='live' ORDER BY created_at DESC LIMIT 200").all();
  const cards = r.results.map((p, i) => `<a class="jc" href="/blog/${p.slug}"><span class="n">${String(r.results.length - i).padStart(2, "0")}</span><h2>${esc(p.title)}</h2><p>${esc(p.meta_desc)}</p><span>READ →</span></a>`).join("");
  return html(page({
    title: "Blog: website answers for small businesses · Yorgo Builds", desc: "Plain answers to the questions small business owners ask about websites, online stores, Google Maps and Instagram.",
    url: SITE + "/blog", ld: [],
    main: `<header class="jh"><p class="kick">Blog</p><h1>Website answers<span>, in plain English.</span></h1></header><section class="jl">${cards || "<p>First posts coming soon.</p>"}</section>`,
    wa: "Hi Yorgo, I read your blog. Can you help me with a website?",
  }));
}

async function sitemap(env) {
  const r = await env.DB.prepare("SELECT slug,created_at FROM posts WHERE status='live' ORDER BY created_at DESC").all();
  const urls = [`<url><loc>${SITE}/blog</loc></url>`, ...r.results.map(p => `<url><loc>${SITE}/blog/${p.slug}</loc><lastmod>${p.created_at.slice(0, 10)}</lastmod></url>`)];
  return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`,
    { headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

// g. featured image: brand card drawn as SVG, free.
async function featuredSvg(env, slug) {
  const p = await env.DB.prepare("SELECT title FROM posts WHERE slug=? AND status='live'").bind(slug).first();
  if (!p) return new Response("Not found", { status: 404 });
  const lines = wrap(p.title, 22).slice(0, 4);
  const t = lines.map((l, i) => `<text x="72" y="${200 + i * 84}" font-family="Inter,Arial,sans-serif" font-weight="800" font-size="76" letter-spacing="-3" fill="#F5F5F7">${esc(l)}</text>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630"><rect width="1200" height="630" fill="#000"/>
<text x="72" y="96" font-family="JetBrains Mono,monospace" font-weight="700" font-size="22" letter-spacing="2" fill="#C8F031">YORGO BUILDS / BLOG</text>${t}
<rect x="1010" y="72" width="118" height="118" rx="22" fill="#C8F031"/><path d="M1045 108l24 30 24-30M1069 138v32" stroke="#000" stroke-width="12" fill="none"/>
<text x="72" y="574" font-family="JetBrains Mono,monospace" font-size="20" letter-spacing="2" fill="#86868B">YORGOBUILDS.COM</text></svg>`;
  return new Response(svg, { headers: { "content-type": "image/svg+xml", "cache-control": "public, max-age=86400" } });
}

const AUTHOR = `<div class="author"><img src="/favicon.svg" width="72" height="72" alt="Yorgo, founder of Yorgo Builds"><div><p class="kick">Written by</p><h3>Yorgo</h3><p>Web designer and founder of Yorgo Builds. I build fast websites and Shopify stores for small businesses anywhere.</p><p class="al"><a href="/about.html">About me</a><a href="https://www.instagram.com/yorgobuilds/" target="_blank" rel="noopener me">Instagram</a><a href="https://www.linkedin.com/in/yorgo-aoun-669133439/" target="_blank" rel="noopener me">LinkedIn</a></p></div></div>`;

function page({ title, desc, url, ld, main, wa }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="theme-color" content="#000000">
<meta property="og:type" content="article"><meta property="og:site_name" content="Yorgo Builds">
<meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${url}"><meta property="og:image" content="${SITE}/og-image.png?v=3"><meta name="twitter:card" content="summary_large_image">
<meta name="robots" content="index,follow,max-image-preview:large">
<link rel="canonical" href="${url}">
${ld.map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("")}
<link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon-180.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/site.css">
<style>
.jh{padding:130px 0 50px;max-width:860px}
.jh h1{font-size:clamp(40px,6vw,76px);line-height:.95;letter-spacing:-.055em;font-weight:800}
.jh h1 span{color:var(--muted)}
.jh .lead{color:var(--soft);font-size:19px;max-width:640px;margin-top:22px}
.meta{font:500 12px var(--mono);letter-spacing:.06em;text-transform:uppercase;color:var(--muted);margin-top:22px}
.meta b{color:var(--lime);font-weight:600}
.jl{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:110px}
.jc{border:1px solid var(--line);background:var(--card);padding:28px;display:flex;flex-direction:column;gap:12px;min-height:280px;transition:transform .3s var(--ease),box-shadow .3s,border-color .3s}
.jc:hover{transform:translate(-4px,-4px);box-shadow:4px 4px 0 var(--lime);border-color:var(--lime)}
.jc .n{font:700 12px var(--mono);letter-spacing:.08em;background:var(--lime);color:#000;padding:5px 9px;align-self:flex-start}
.jc h2{font-size:26px;line-height:1.05;letter-spacing:-.035em;font-weight:800}
.jc p{color:var(--soft);font-size:15px;flex:1}
.jc span{font:600 12px var(--mono);letter-spacing:.06em;color:var(--lime)}
.art{max-width:720px;padding-bottom:40px}
.art h2{font-size:clamp(28px,3.4vw,38px);line-height:1.05;letter-spacing:-.045em;font-weight:800;margin:56px 0 16px}
.art h3{font-size:21px;letter-spacing:-.02em;margin:28px 0 8px}
.art p,.art li{color:var(--soft);font-size:18px;line-height:1.65}
.art p+p{margin-top:16px}
.art ul,.art ol{margin:14px 0 0 22px}.art li{margin:6px 0}
.art strong{color:var(--ink)}
.art a{color:var(--lime);border-bottom:1px solid rgba(200,240,49,.4)}
.ans{border-left:4px solid var(--lime);background:var(--card);padding:22px 24px;margin-top:8px}
.ans p{color:var(--ink);font-size:19px}
.tbl{border:1px solid var(--line);margin-top:18px}
.tbl div{display:flex;justify-content:space-between;gap:20px;padding:16px 20px;border-top:1px solid var(--line);font-size:16px}
.tbl div:first-child{border-top:none}
.tbl span{color:var(--soft)}.tbl b{font:600 14px var(--mono);color:var(--lime);text-align:right;white-space:nowrap}
.cta{background:var(--lime);color:#000;padding:34px;margin:60px 0 0}
.cta h2{margin:0 0 10px;color:#000}.cta p{color:#000;opacity:.8;font-size:17px}
.cta .row{display:flex;gap:12px;flex-wrap:wrap;margin-top:22px}
.cta .btn{border-color:#000;color:#000}.cta .btn i{background:#000}.cta .btn i svg{fill:var(--lime)}
.next{margin:90px 0 110px}
.next .g{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.next a{border:1px solid var(--line);padding:22px;font-size:19px;font-weight:600;letter-spacing:-.02em;display:flex;justify-content:space-between;gap:12px;transition:border-color .25s,color .25s}
.next a::after{content:"→";font:600 16px var(--mono);color:var(--lime)}
.next a:hover{border-color:var(--lime);color:var(--lime)}
@media (max-width:980px){.jl,.next .g{grid-template-columns:1fr}.jh{padding-top:110px}.tbl div{flex-direction:column;gap:4px}.tbl b{text-align:left}.cta{padding:26px}}
.fig{margin:0 0 40px;border:1px solid var(--line)}.fig img{display:block;width:100%;height:auto}
.src{border-top:1px solid var(--line);margin-top:56px;padding-top:22px}.src ol{margin-top:10px}.src li{font-size:15px}
.author{display:flex;gap:20px;align-items:flex-start;border:1px solid var(--line);background:var(--card);padding:24px;margin-top:40px}
.author img{background:#000;padding:8px;flex:none}.author h3{margin:2px 0 6px}.author p{font-size:16px}
.author .al{display:flex;gap:16px;flex-wrap:wrap;margin-top:10px}.author .al a{font:600 12px var(--mono);letter-spacing:.06em;text-transform:uppercase}
</style>
<script src="/analytics.js" defer></script>
</head>
<body>
<nav>
  <a href="index.html" class="logo"><img src="favicon.svg" width="28" height="28" alt="">Yorgo <span>Builds</span></a>
  <div class="links">
    <a href="index.html"><svg viewBox="0 0 24 24"><path d="M3 11l9-8 9 8v10h-6v-6H9v6H3z"/></svg>Home</a>
    <a href="about.html"><svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/></svg>About</a>
    <a href="projects.html"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14"/><path d="M3 9h18"/></svg>Work</a>
    <a href="demos.html"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="8" height="8"/><rect x="13" y="3" width="8" height="8"/><rect x="3" y="13" width="8" height="8"/><rect x="13" y="13" width="8" height="8"/></svg>Concepts</a>
    <a href="prices.html"><svg viewBox="0 0 24 24"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>Prices</a>
    <a href="journal.html" class="on"><svg viewBox="0 0 24 24"><path d="M4 4h10l6 6v10H4z"/><path d="M14 4v6h6M8 14h8M8 17h5"/></svg>Journal</a>
    <a href="quote.html"><svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="18"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>Quote</a>
  </div>
  <div class="nav-r"><a class="nbtn wa-link" href="#">LET'S BUILD →</a></div>
</nav>
<main class="wrap">
${main}
</main>
<footer><div class="wrap ft"><div class="fb"><a href="index.html" class="logo"><img src="favicon.svg" width="22" height="22" alt="">Yorgo <span>Builds</span></a><span class="soc"><a class="ig" href="https://www.instagram.com/yorgobuilds/" target="_blank" rel="noopener me" aria-label="Instagram @yorgobuilds"><i><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.3" cy="6.7" r="1.1" fill="#000" stroke="none"/></svg></i>@yorgobuilds</a><a class="ig" href="https://www.facebook.com/profile.php?id=61595552976827" target="_blank" rel="noopener me" aria-label="Facebook Yorgo Builds"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.8v3h2.6V21z" fill="#000" stroke="none"/></svg></i>Facebook</a><a class="ig" href="https://www.linkedin.com/in/yorgo-aoun-669133439/" target="_blank" rel="noopener me" aria-label="LinkedIn Yorgo Aoun"><i><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 9h3v10H5zM6.5 4.5a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5zM10 9h2.9v1.4c.4-.8 1.4-1.6 2.9-1.6 3.1 0 3.7 2 3.7 4.7V19h-3v-4.8c0-1.2 0-2.6-1.6-2.6s-1.9 1.2-1.9 2.5V19h-3z" fill="#000" stroke="none"/></svg></i>LinkedIn</a></span></div><div class="fc"><h4>Learn</h4><a href="/journal.html">Journal</a><a href="/website-check.html">Free site check</a><a href="/refer.html">Refer &amp; earn $30</a><a href="/google-maps-setup.html">Google Maps setup</a></div><div class="fc fw"><h4>Websites for</h4><div class="two"><a href="/website-for-cafe.html">Cafés</a><a href="/website-for-restaurant.html">Restaurants</a><a href="/website-for-clinic.html">Clinics</a><a href="/website-for-dentist.html">Dentists</a><a href="/online-store-for-clothing.html">Clothing brands</a><a href="/website-for-phone-repair-shop.html">Phone repair</a><a href="/website-for-lawyer.html">Lawyers</a><a href="/website-for-real-estate.html">Real estate</a><a href="/website-for-barber-shop.html">Barber shops</a><a href="/website-for-salon.html">Salons</a><a href="/website-for-gym.html">Gyms &amp; trainers</a></div></div><div class="fc"><h4>Gulf &amp; Arabic</h4><a href="/website-design-uae.html">Dubai &amp; UAE</a><a href="/ar/" lang="ar" hreflang="ar">تصميم مواقع بالعربية</a><a href="/ar/online-store.html" lang="ar" hreflang="ar">متجر إلكتروني</a></div><div class="fbot"><span>© 2026 Yorgo Builds</span><span class="legal"><a href="/privacy.html">Privacy</a><a href="/terms.html">Terms</a></span></div></div></footer>
<script>
const PHONE="96171361160";
document.querySelectorAll(".wa-link").forEach(a=>{a.href="https://wa.me/"+PHONE+"?text="+encodeURIComponent(${JSON.stringify(wa).replace(/</g, "\\u003c")});a.target="_blank";a.rel="noopener"});
</script>
<script src="/menu.js"></script>
<script src="/bg.js?v=3" defer></script>
</body>
</html>`;
}

// ---------- helpers ----------
async function ask(env, messages, max_tokens) {
  const r = await env.AI.run(MODEL, { messages, max_tokens, temperature: 0.6 });
  return String(r.response ?? r.result?.response ?? "").trim();
}
function parseJson(s) {
  try { return JSON.parse(s.slice(s.indexOf("{"), s.lastIndexOf("}") + 1)); } catch { return {}; }
}
// Keep only allowed tags; links only to known internal pages.
function cleanHtml(s) {
  const okHref = new Set([...LINKS, ...SELL].map(l => l[0]));
  s = s.replace(/```(html)?/g, "").replace(/<(\/?)(h1)\b/gi, "<$1h2");
  s = s.replace(/<a\b[^>]*href="(?:https?:\/\/(?:www\.)?yorgobuilds\.com)?([^"#?]*)[^"]*"[^>]*>([\s\S]*?)<\/a>/gi,
    (_, h, t) => okHref.has(h) ? `<a href="${h}">${t}</a>` : t);
  s = s.replace(/<(?!\/?(h2|h3|p|ul|ol|li|strong|a)\b)[^>]*>/gi, "");
  s = s.replace(/<(h2|h3|p|ul|ol|li|strong)\b[^>]*>/gi, "<$1>");
  let sells = 0;
  s = s.replace(/<a href="(\/(?:prices|quote|google-maps-setup)\.html)">([\s\S]*?)<\/a>/g, (m, h, t) => (++sells > 1 ? t : m));
  s = s.replace(/<h2>\s*(introduction|overview|conclusion|summary)\b[^<]*<\/h2>/gi, "");
  return s.replace(/<p>\s*<\/p>/g, "").trim();
}
const strip = s => String(s).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const clip = (s, n) => s.length <= n ? s : s.slice(0, s.lastIndexOf(" ", n - 1)).replace(/[,:;.\s-]+$/, "");
const slugify = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").split("-").slice(0, 9).join("-");
const words = s => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(w => w.length > 3));
function similar(a, b) { const A = words(a), B = words(b); const i = [...A].filter(w => B.has(w)).length; return i / Math.max(1, Math.min(A.size, B.size)); }
function wrap(t, n) { const out = []; let line = ""; for (const w of t.split(" ")) { if ((line + " " + w).trim().length > n) { out.push(line); line = w; } else line = (line + " " + w).trim(); } if (line) out.push(line); return out; }
const html = b => new Response(b, { headers: { "content-type": "text/html; charset=utf-8" } });
const json = o => new Response(JSON.stringify(o, null, 2), { headers: { "content-type": "application/json" } });
