// Renders the public job search pages: /jobs, /jobs/product-manager-jobs-in-new-york and the rest.
// The data for each page is built every few hours by job-pages.mjs and published to the jobs-data branch.
const DATA = "https://raw.githubusercontent.com/ay2829-byte/crossway/jobs-data/pages/";
const SITE = "https://crosswayhq.com";
const cache = new Map();
async function getJSON(name) {
  const hit = cache.get(name);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.v;
  const r = await fetch(DATA + encodeURIComponent(name) + ".json");
  const v = r.ok ? await r.json() : null;
  cache.set(name, { v, at: Date.now() });
  return v;
}
const esc = s => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const LV = ["Intern", "Entry", "Mid", "Senior"], WP = ["Remote", "Hybrid", "Onsite"];
const ARROW = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h10M9 4l4 4-4 4"/></svg>';
const today = () => Math.round(Date.now() / 864e5);
const ago = day => { const n = today() - day; return n <= 0 ? "Today" : n === 1 ? "Yesterday" : n < 30 ? `${n} days ago` : `${Math.round(n / 30)} mo ago` };
const list = a => a.length < 2 ? (a[0] || "") : a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
const pct = (a, b) => b ? Math.round(a / b * 100) : 0;

// advice and next steps by kind of role, linking into the blog and Arena
const FAM = {
  product: { prep: [["product-manager-interview-practice", "How to practice for product manager interviews"], ["career-change-into-product-management", "Changing careers into product management"]], arena: "product sense, metrics and prioritization cases", tip: "Hiring managers want to see how you think about users, metrics and tradeoffs. A short write up of a real product decision you made, or a solved product case, says more than a list of tools." },
  data: { prep: [["sql-interview-practice", "How to practice SQL for interviews"], ["data-analyst-interview-questions", "Data analyst interview questions, solved"]], arena: "SQL problems on real tables and analytics cases", tip: "Most data interviews start with SQL on messy tables, then a metrics or experiment question. Being fast and correct with joins, window functions and A/B test math is what gets you through the first round." },
  eng: { prep: [["is-leetcode-still-worth-it", "Is LeetCode still worth it?"], ["system-design-estimation-questions", "System design estimation questions"]], arena: "coding problems and real bugs to fix", tip: "Beyond algorithm questions, more teams now ask you to debug real code, review a pull request or extend a small service. Practice reading code you didn't write." },
  design: { prep: [["real-work-interview-practice", "Practicing with real work problems"], ["get-hired-without-a-resume", "Getting hired without a resume"]], arena: "product and research cases", tip: "A portfolio with two or three deep case studies beats ten shallow ones. Show the problem, what you tried, what you threw away and the result." },
  growth: { prep: [["growth-marketing-interview-questions", "Growth marketing interview questions"], ["real-work-interview-practice", "Practicing with real work problems"]], arena: "funnel, CAC and channel math cases", tip: "Growth roles are judged on numbers: funnel math, CAC payback and how you'd test a channel. Bring one experiment you ran with the before and after." },
  ops: { prep: [["business-operations-interview-questions", "Business operations and strategy case questions"], ["case-interview-practice", "How to practice case interviews for free"]], arena: "ops, finance and strategy cases", tip: "Expect case style questions: break even, capacity, pricing and why a number moved. Structure first, then the math, then a decision." },
  sales: { prep: [["real-work-interview-practice", "Practicing with real work problems"], ["how-many-jobs-to-apply-for-per-week", "How many jobs to apply for each week"]], arena: "pipeline and pricing cases", tip: "Sales teams hire on evidence you can run a process: pipeline math, a mock discovery call and how you handle an objection." },
};

const CSS = `:root{--bg:#fff;--soft:#F7F7F8;--soft2:#F1F1F4;--ink:#1F1F23;--ink2:#46464F;--muted:#72727C;--faint:#A9A9B2;--line:#ECECEF;--line2:#DEDEE3;--orange:#F2643D;--greenT:#0B7A63;--card:#fff;--brand:#3B5BDB}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#111114;--soft:#1A1A1F;--soft2:#202027;--ink:#F2F2F5;--ink2:#C9C9D2;--muted:#9A9AA6;--faint:#6E6E78;--line:#26262D;--line2:#33333C;--greenT:#3CC9A8;--card:#16161A}}
:root[data-theme="dark"]{--bg:#111114;--soft:#1A1A1F;--soft2:#202027;--ink:#F2F2F5;--ink2:#C9C9D2;--muted:#9A9AA6;--faint:#6E6E78;--line:#26262D;--line2:#33333C;--greenT:#3CC9A8;--card:#16161A}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:clip}
a{color:inherit}.wrap{max-width:1200px;margin:0 auto;padding-inline:24px}
.nav{position:sticky;top:0;z-index:40;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:blur(14px)}.nav .wrap{display:flex;align-items:center;gap:24px;height:68px}
.brand{display:flex;align-items:center;gap:10px;text-decoration:none}.bars3{display:inline-flex;flex-direction:column;gap:3px}.bars3 i{display:block;height:4.5px;border-radius:9px}
.wordmark{font:800 24px/1 "Bricolage Grotesque",Inter,sans-serif;letter-spacing:-.04em}.wordmark .dot{color:var(--orange)}
.links{display:flex;gap:4px;font-size:14.5px;color:var(--ink2)}.links a{text-decoration:none;padding:8px 12px;border-radius:99px}.links a.on{background:var(--soft);color:var(--ink)}.sp{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:999px;padding:10px 18px;font-weight:600;font-size:14.5px;border:1px solid transparent;text-decoration:none;white-space:nowrap;transition:transform .16s cubic-bezier(.23,1,.32,1)}.btn:active{transform:scale(.97)}.btn svg{width:15px;height:15px}
.btn.dark{background:var(--ink);color:var(--bg)}.btn.line{border-color:var(--line2);background:var(--card)}.btn.brand{background:var(--brand);color:#fff}
.hero{position:relative;isolation:isolate;padding:36px 0 8px}.lane{position:absolute;height:160px;border-radius:999px;filter:blur(80px);z-index:-1}
.l1{top:-40px;left:-15vw;width:65vw;background:#4C6BF5;opacity:.16}.l2{top:0;right:-15vw;width:50vw;background:#F2643D;opacity:.11}
.crumb{font-size:13.5px;color:var(--muted)}.crumb a{text-decoration:none}.crumb a:hover{color:var(--ink)}
h1{font:700 clamp(28px,3.4vw,40px)/1.1 Inter,sans-serif;letter-spacing:-.035em;margin:10px 0 0;text-wrap:balance}
.lede{font-size:16px;color:var(--muted);max-width:62ch;line-height:1.55;margin:8px 0 0}
.facts{display:flex;flex-wrap:wrap;gap:6px 22px;margin:16px 0 0;font-size:14.5px;color:var(--muted)}.facts b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:18px 0 0}.chips a{text-decoration:none;font-size:14px;padding:8px 14px;border-radius:99px;border:1px solid var(--line2);background:var(--card)}.chips a.on{background:var(--ink);color:var(--bg);border-color:var(--ink)}
.grid{display:grid;grid-template-columns:minmax(0,1fr) 330px;gap:28px;margin-top:20px;align-items:start}
.list{list-style:none;margin:0;padding:0;border:1px solid var(--line);border-radius:22px;background:var(--card);overflow:hidden}
.job+.job{border-top:1px solid var(--line)}.job summary{list-style:none;display:grid;grid-template-columns:40px minmax(0,1fr) auto;gap:14px;align-items:center;padding:16px 18px;cursor:pointer}.job summary::-webkit-details-marker{display:none}
.job summary:hover{background:var(--soft)}.lg{width:40px;height:40px;border-radius:11px;background:var(--soft2);display:grid;place-items:center;overflow:hidden;position:relative;font-weight:700;color:var(--brand)}.lg img{position:absolute;inset:7px;width:26px;height:26px;background:var(--soft2)}
.jt b{display:block;font-size:15.5px;font-weight:600}.jt span{font-size:13.5px;color:var(--muted)}
.jm{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}.tag{font-size:12.5px;padding:3px 9px;border-radius:99px;background:var(--soft2);color:var(--ink2)}.tag.pay{color:var(--greenT)}.when{font-size:12.5px;color:var(--faint);min-width:72px;text-align:right}
.jd{padding:2px 18px 18px 72px}.jd dl{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin:0}.jd dl div{background:var(--soft);border-radius:12px;padding:10px 12px}.jd dt{font-size:12px;color:var(--muted)}.jd dd{margin:2px 0 0;font-weight:600;font-size:14px}
.sn{font-size:14.5px;color:var(--ink2);line-height:1.6;margin:12px 0 0}.sk{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}.sk span{font-size:12.5px;padding:3px 9px;border-radius:99px;border:1px solid var(--line2)}.ja{display:flex;gap:8px;flex-wrap:wrap;margin-top:14px}
.more{display:flex;justify-content:center;padding:16px;border-top:1px solid var(--line)}
.side{position:sticky;top:84px;display:flex;flex-direction:column;gap:16px}.card{border:1px solid var(--line);border-radius:22px;padding:20px;background:var(--card)}
.card h2{font-size:17px;margin:0 0 6px;letter-spacing:-.01em}.card p{font-size:14px;color:var(--ink2);line-height:1.55;margin:0 0 14px}
.cta{background:linear-gradient(160deg,color-mix(in srgb,#4C6BF5 12%,var(--card)),var(--card))}
.br{display:grid;grid-template-columns:62px minmax(0,1fr) 30px;gap:10px;align-items:center;font-size:13.5px;margin-top:8px}.bt{height:8px;border-radius:9px;background:var(--soft2);overflow:hidden}.bt i{display:block;height:100%;border-radius:9px}.br b{text-align:right;font-variant-numeric:tabular-nums}
.cos{list-style:none;padding:0;margin:0}.cos li{display:flex;justify-content:space-between;gap:10px;font-size:14px;padding:7px 0;border-top:1px solid var(--line)}.cos li:first-child{border-top:0}.cos span{color:var(--muted);white-space:nowrap}
.guide{max-width:760px;margin:56px 0 0}.guide h2{font-size:26px;letter-spacing:-.03em;margin:40px 0 10px}.guide p,.guide li{font-size:16.5px;line-height:1.7;color:var(--ink2)}.guide a{color:var(--brand)}
.rel{display:flex;flex-wrap:wrap;gap:8px}.rel a{font-size:14px;text-decoration:none;padding:8px 14px;border-radius:99px;background:var(--soft);color:var(--ink)}
details.q{border-top:1px solid var(--line);padding:14px 0}details.q summary{font-weight:600;font-size:16px;cursor:pointer}details.q p{margin:8px 0 0}
.hub h2{font-size:22px;letter-spacing:-.02em;margin:36px 0 12px}.hubg{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}.hubg a{display:flex;justify-content:space-between;gap:10px;text-decoration:none;border:1px solid var(--line);border-radius:14px;padding:12px 14px;font-size:14.5px;background:var(--card)}.hubg a span{color:var(--muted);font-variant-numeric:tabular-nums}
footer{border-top:1px solid var(--line);margin-top:72px;padding:28px 0;font-size:14px;color:var(--muted)}footer .wrap{display:flex;flex-wrap:wrap;gap:8px 18px}footer a{text-decoration:none}
@media (max-width:900px){.grid{grid-template-columns:1fr}.side{position:static}.links{display:none}}
@media (max-width:560px){.wrap{padding-inline:16px}.job summary{grid-template-columns:36px minmax(0,1fr)}.jm{grid-column:2;justify-content:flex-start}.when{text-align:left;min-width:0}.jd{padding:2px 16px 16px}.jd dl{grid-template-columns:repeat(2,minmax(0,1fr))}.nav .btn.line{display:none}}`;

const head = (title, desc, canon, ld, robots) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><link rel="canonical" href="${canon}">${robots ? `<meta name="robots" content="${robots}">` : ""}
<meta property="og:type" content="website"><meta property="og:site_name" content="Crossway"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}"><meta property="og:url" content="${canon}"><meta property="og:image" content="${SITE}/logo.png"><meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.ico" sizes="48x48"><link rel="icon" href="/favicon.svg" type="image/svg+xml"><link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,800&display=swap">
${(ld || []).map(x => `<script type="application/ld+json">${JSON.stringify(x).replace(/</g, "\\u003c")}</script>`).join("")}<style>${CSS}</style></head><body>
<header class="nav"><div class="wrap"><a class="brand" href="/" aria-label="Crossway home"><span class="bars3" aria-hidden="true"><i style="width:19px;background:#4C6BF5"></i><i style="width:12px;background:#F2643D"></i><i style="width:23px;background:#12A38A"></i></span><span class="wordmark">crossway<span class="dot">.</span></span></a>
<nav class="links"><a href="/jobs" class="on">Jobs</a><a href="/compare/leetcode-alternative">Arena</a><a href="/blog">Blog</a></nav><span class="sp"></span><a class="btn line" href="/app">Log in</a><a class="btn dark" href="/app?join=seeker">Get my matches</a></div></header>`;
const foot = `<footer><div class="wrap"><span>© 2026 Crossway</span><span class="sp"></span><a href="/jobs">Jobs</a><a href="/blog">Blog</a><a href="/compare/linkedin-alternative">vs LinkedIn</a><a href="/compare/jobright-alternative">vs Jobright</a><a href="/compare/leetcode-alternative">vs LeetCode</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></div><div class="wrap"><p style="font-size:12.5px;color:var(--faint);margin:10px 0 0">Jobs come from company career pages and refresh every few hours. Crossway isn't affiliated with the companies listed.</p></div></footer></body></html>`;

function jobRow(j, k) {
  const [t, co, loc, lvl, wp, day, pay0, yrs, url, sn, sk, dom] = j;
  const pay = String(pay0 || "").replace(/^(\$\d+k) to \1$/, "$1");
  const logo = `${esc((co || "?")[0])}${dom ? `<img src="https://www.google.com/s2/favicons?domain=${encodeURIComponent(dom)}&sz=64" alt="" loading="lazy" onload="if(this.naturalWidth<32)this.remove()" onerror="this.remove()">` : ""}`;
  return `<li class="job"><details${k === 0 ? " open" : ""}><summary><span class="lg" aria-hidden="true">${logo}</span><span class="jt"><b>${esc(t)}</b><span>${esc(co)} · ${esc(loc.slice(0, 60))}</span></span>
<span class="jm"><span class="tag">${LV[lvl] || "Mid"}</span>${pay ? `<span class="tag pay">${esc(pay)}</span>` : ""}<span class="when">${ago(day)}</span></span></summary>
<div class="jd"><dl><div><dt>Experience</dt><dd>${yrs > 0 ? `${yrs}+ years` : "Not listed"}</dd></div><div><dt>Work</dt><dd>${WP[wp] || "Onsite"}</dd></div><div><dt>Pay</dt><dd>${esc(pay || "Not listed")}</dd></div><div><dt>Posted</dt><dd>${ago(day)}</dd></div></dl>
${sn ? `<p class="sn">${esc(sn.slice(0, 300))}${sn.length > 300 ? "…" : ""}</p>` : ""}${sk && sk.length ? `<div class="sk">${sk.map(s => `<span>${esc(s)}</span>`).join("")}</div>` : ""}
<div class="ja"><a class="btn dark" href="${esc(url)}" target="_blank" rel="noopener nofollow">Apply on ${esc(co)}'s site</a><a class="btn line" href="/app?join=seeker">See your match score</a></div></div></details></li>`;
}
const bar = (label, n, tot, col) => `<div class="br"><span>${label}</span><span class="bt"><i style="width:${tot ? Math.round(n / tot * 100) : 0}%;background:${col}"></i></span><b>${n}</b></div>`;

function page(p) {
  const canon = `${SITE}/jobs/${p.slug}`;
  const where = p.kind === "city" ? ` in ${p.cityName}` : p.kind === "remote" ? " you can do remotely" : " in the US";
  const role = p.roleName, rl = role.toLowerCase();
  const Y = p.years, yN = p.yearsN, early = p.lv[0] + p.lv[1], senior = p.lv[3];
  const payTxt = p.pay.n ? `$${p.pay.lo}k to $${p.pay.hi}k` : "";
  const title = `${p.n} ${p.title} (Updated Today) | Crossway`;
  const desc = `Browse ${p.n} ${rl} jobs${where} from company career pages, updated every few hours.${payTxt ? ` Typical posted pay ${payTxt}.` : ""} See years asked, pay and skills, then apply direct.`;
  const fam = FAM[p.fam] || FAM.ops;
  const top = p.cos.slice(0, 3).map(c => c[0]);
  const faq = [
    [`How many ${rl} jobs are open${where} right now?`, `${p.n} ${rl} roles${where} are open on Crossway today, pulled from company career pages. ${p.new7} were posted in the last 7 days.`],
    p.pay.n ? [`How much do ${rl} roles${where} pay?`, `Across the ${p.pay.n} postings that list pay, the typical posted range runs from $${p.pay.lo}k to $${p.pay.hi}k a year. Senior and staff roles sit above that, and entry level roles below it.`] : null,
    yN ? [`How many years of experience do ${rl} jobs${where} ask for?`, `Of the ${yN} postings that state it, ${Y["0 to 2"]} (${pct(Y["0 to 2"], yN)}%) accept 0 to 2 years, ${Y["3 to 4"]} ask for 3 to 4, ${Y["5 to 6"]} ask for 5 to 6 and ${Y["7+"]} ask for 7 or more.`] : null,
    [`Which companies are hiring the most ${rl}s${where}?`, `Right now: ${list(p.cos.slice(0, 5).map(([c, n]) => `${c} (${n})`))}.`],
    [`Can I get a ${rl} job${where} with little experience?`, early ? `Yes. ${early} of the ${p.n} open roles are entry level or junior. Filter for entry level, and show proof of work: a project, a solved case or a work sample gets you further than a resume line.` : `It's hard here: almost every open role is mid level or above. Look at the entry level ${rl} page for the whole US, and build proof of work you can show.`],
  ].filter(Boolean);
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: "Jobs", item: `${SITE}/jobs` }, { "@type": "ListItem", position: 2, name: `${role} jobs`, item: `${SITE}/jobs/${p.role}-jobs` }, ...(p.kind !== "role" ? [{ "@type": "ListItem", position: 3, name: p.h1, item: canon }] : [])] },
    { "@context": "https://schema.org", "@type": "ItemList", name: p.h1, numberOfItems: p.n, itemListElement: p.jobs.slice(0, 20).map((j, k) => ({ "@type": "ListItem", position: k + 1, name: `${j[0]} at ${j[1]}`, url: j[8] })) },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
  ];
  const chips = [[p.slug, `All ${p.n}`], ...p.related.narrow];
  const guide = [
    `<h2>What it takes to land a ${rl} job${where}</h2>`,
    yN ? `<p>${Y["5 to 6"] + Y["7+"] > Y["0 to 2"] + Y["3 to 4"] ? "Hiring here leans experienced." : "There's real room here for people earlier in their careers."} Of the ${yN} postings that state years, ${Y["5 to 6"] + Y["7+"]} ask for 5 or more and ${Y["0 to 2"]} accept 0 to 2. ${early} of all ${p.n} roles are entry level or junior and ${senior} are senior or above.</p>` : `<p>Most postings here don't state years of experience, so read the level in the title. ${early} of the ${p.n} roles are entry level or junior and ${senior} are senior or above.</p>`,
    p.pay.n ? `<p>Pay: ${p.pay.n} of the ${p.n} postings list a range, and the typical posted range is $${p.pay.lo}k to $${p.pay.hi}k. Pay transparency laws in states like New York, California, Colorado and Washington mean more postings list pay there, so use those as a guide when a posting doesn't.</p>` : "",
    top.length ? `<p>${list(top)} ${top.length > 1 ? "are" : "is"} posting the most right now. ${p.remote} of the ${p.n} roles are fully remote.</p>` : "",
    p.skills.length ? `<p>The skills that come up most in these postings: ${list(p.skills.slice(0, 8).map(s => s[0]))}.</p>` : "",
    `<h2>How to stand out</h2><p>${fam.tip}</p><p>You can practice on <a href="/compare/leetcode-alternative">Crossway Arena</a>, which has timed ${fam.arena}. Companies on Crossway can replay how you solved them, which counts for more than a line on a resume.</p>`,
    `<p>Further reading: ${fam.prep.map(([s, t]) => `<a href="/blog/${s}">${t}</a>`).join(" and ")}.</p>`,
    p.related.roles.length ? `<h2>Related roles</h2><div class="rel">${p.related.roles.map(([s, t]) => `<a href="/jobs/${s}">${esc(t)}</a>`).join("")}</div>` : "",
    p.related.cities.length ? `<h2>${role} jobs in other cities</h2><div class="rel">${p.related.cities.map(([s, t]) => `<a href="/jobs/${s}">${esc(t)}</a>`).join("")}</div>` : "",
    `<h2>Questions</h2>${faq.map(([q, a]) => `<details class="q"><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}`,
  ].join("\n");
  const ytot = yN || 1;
  return head(title, desc, canon, ld) + `<section class="hero"><i class="lane l1"></i><i class="lane l2"></i><div class="wrap">
<div class="crumb"><a href="/jobs">Jobs</a> / <a href="/jobs/${p.role}-jobs">${esc(role)}</a>${p.kind !== "role" ? ` / ${esc(p.kind === "entry" ? "Entry level" : p.cityName)}` : ""}</div>
<h1>${esc(p.h1)}</h1><p class="lede">Straight from company career pages, refreshed every few hours. Open a role to see pay and years asked, then apply on the company's site.</p>
<p class="facts"><span><b>${p.n}</b> open</span><span><b>${p.new7}</b> new this week</span>${payTxt ? `<span>Typical pay <b>${payTxt}</b></span>` : ""}<span><b>${early}</b> entry level</span>${p.remote && p.kind !== "remote" ? `<span><b>${p.remote}</b> remote</span>` : ""}</p>
<nav class="chips" aria-label="Narrow this list">${chips.map(([s, t], k) => `<a${k === 0 ? ' class="on" aria-current="page"' : ""} href="/jobs/${s}">${esc(t)}</a>`).join("")}</nav></div></section>
<main class="wrap"><div class="grid"><div><ul class="list">${p.jobs.map(jobRow).join("")}</ul>${p.n > p.jobs.length ? `<div class="more"><a class="btn line" href="/app?join=seeker">See all ${p.n}, ranked for you ${ARROW}</a></div>` : ""}</div>
<aside class="side"><div class="card cta"><h2>Which of these fit you?</h2><p>Add your skills and years once. Crossway scores every role against your profile and sends your 10 best every morning. Free, no resume.</p><a class="btn brand" style="width:100%" href="/app?join=seeker">Get my match scores</a></div>
${yN ? `<div class="card"><h2>Years these roles ask for</h2><p style="margin-bottom:4px">From the ${yN} postings that state it.</p>${bar("0 to 2", Y["0 to 2"], ytot, "#12A38A")}${bar("3 to 4", Y["3 to 4"], ytot, "#4C6BF5")}${bar("5 to 6", Y["5 to 6"], ytot, "#8B5CF6")}${bar("7+", Y["7+"], ytot, "#F2643D")}</div>` : ""}
<div class="card"><h2>Hiring the most</h2><ul class="cos">${p.cos.slice(0, 7).map(([c, n]) => `<li>${esc(c)}<span>${n} ${n === 1 ? "role" : "roles"}</span></li>`).join("")}</ul></div></aside></div>
<article class="guide">${guide}</article></main>` + foot;
}

function hub(ix) {
  const title = "Jobs by role and city, from company career pages | Crossway";
  const desc = "Browse open jobs by role and city: product, data, engineering, design, marketing, ops and sales. Pulled from company career pages and refreshed every few hours.";
  const by = (k) => ix.pages.filter(p => p[1] === k);
  const roles = by("role").sort((a, b) => b[4] - a[4]);
  const cities = {};
  by("city").forEach(p => { (cities[p[3]] = cities[p[3]] || []).push(p) });
  const cityOrder = Object.keys(cities).sort((a, b) => cities[b].reduce((s, p) => s + p[4], 0) - cities[a].reduce((s, p) => s + p[4], 0));
  const link = (p, label) => `<a href="/jobs/${p[0]}">${esc(label)}<span>${p[4]}</span></a>`;
  return head(title, desc, `${SITE}/jobs`, [{ "@context": "https://schema.org", "@type": "CollectionPage", name: "Jobs by role and city", url: `${SITE}/jobs` }]) + `<section class="hero"><i class="lane l1"></i><i class="lane l2"></i><div class="wrap">
<h1>Jobs by role and city</h1><p class="lede">Open roles from company career pages, refreshed every few hours. Pick a role to see every opening, what it pays and how many years it asks for.</p></div></section>
<main class="wrap hub"><h2>By role, across the US</h2><div class="hubg">${roles.map(p => link(p, ix.roles[p[2]])).join("")}</div>
<h2>Entry level</h2><div class="hubg">${by("entry").sort((a, b) => b[4] - a[4]).map(p => link(p, `Entry level ${ix.roles[p[2]]}`)).join("")}</div>
<h2>Remote</h2><div class="hubg">${by("remote").sort((a, b) => b[4] - a[4]).map(p => link(p, `Remote ${ix.roles[p[2]]}`)).join("")}</div>
${cityOrder.map(c => `<h2>${esc(ix.cities[c])}</h2><div class="hubg">${cities[c].sort((a, b) => b[4] - a[4]).map(p => link(p, ix.roles[p[2]])).join("")}</div>`).join("")}</main>` + foot;
}

export default async function handler(req, res) {
  const slug = String((req.query && req.query.slug) || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  try {
    if (!slug) {
      const ix = await getJSON("_index");
      if (!ix) throw new Error("no index");
      res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
      return res.status(200).send(hub(ix));
    }
    const p = await getJSON(slug);
    if (!p) {
      res.setHeader("Cache-Control", "public, s-maxage=600");
      return res.status(404).send(head("Page not found | Crossway", "This job page isn't available right now.", `${SITE}/jobs`, [], "noindex") + `<main class="wrap" style="padding:72px 24px"><h1>No open roles here right now</h1><p class="lede">This search has too few openings at the moment. Browse <a href="/jobs">all jobs by role and city</a>.</p></main>` + foot);
    }
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    return res.status(200).send(page(p));
  } catch (e) {
    res.setHeader("Cache-Control", "no-store");
    return res.status(503).send(head("Jobs | Crossway", "Jobs are loading.", `${SITE}/jobs`, [], "noindex") + `<main class="wrap" style="padding:72px 24px"><h1>Jobs are refreshing</h1><p class="lede">Try again in a minute, or <a href="/app">open Crossway</a>.</p></main>` + foot);
  }
}
export { page, hub };
