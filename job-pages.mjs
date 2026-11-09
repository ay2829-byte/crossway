// Builds one small data file per search page ("Product Manager jobs in New York") from the jobs feed.
// Runs right after fetch-jobs.mjs in the jobs workflow. api/jobs.mjs renders the pages from these files.
// Usage: OUT=out node job-pages.mjs
import fs from "fs";
import path from "path";

const OUT = process.env.OUT || "jobs";
const MIN_JOBS = +(process.env.PAGE_MIN || 8);   // fewer than this and the page would be thin, so it isn't made
const CO_MIN = +(process.env.CO_PAGE_MIN || 12);  // a company page needs at least this many open roles
const CO_MAX = +(process.env.CO_PAGE_MAX || 700); // biggest employers first, so the site doesn't fill with thin pages
const SHOW = 60;                                 // jobs listed on each page, newest first

// role pages: slug, name, title pattern, and what to leave out
export const ROLES = [
  ["product-manager", "Product Manager", /product manag|\bproduct owner\b|\bpm\b/i, /product marketing|project manag|program manag|production/i],
  ["associate-product-manager", "Associate Product Manager", /associate product manag|\bapm\b|assistant product manag|product manag(?:er|ement) (?:i|1)\b|rotational product/i, /senior associate|director|vp\b/i],
  ["technical-product-manager", "Technical Product Manager", /technical product manag/i, null],
  ["product-analyst", "Product Analyst", /product (?:data )?analyst/i, null],
  ["data-analyst", "Data Analyst", /\bdata analyst|analytics analyst|\bbi analyst|business intelligence analyst|reporting analyst|insights analyst/i, null],
  ["data-scientist", "Data Scientist", /data scien/i, null],
  ["data-engineer", "Data Engineer", /data engineer|analytics engineer/i, null],
  ["machine-learning-engineer", "Machine Learning Engineer", /machine learning engineer|\bml engineer|ai engineer|applied scientist/i, null],
  ["software-engineer", "Software Engineer", /software (?:engineer|developer)|\bswe\b|full ?stack (?:engineer|developer)|back ?end (?:engineer|developer)|front ?end (?:engineer|developer)/i, /test|qa\b|manager|director/i],
  ["frontend-engineer", "Frontend Engineer", /front ?end (?:engineer|developer)|ui engineer|react (?:engineer|developer)/i, null],
  ["backend-engineer", "Backend Engineer", /back ?end (?:engineer|developer)/i, null],
  ["devops-engineer", "DevOps and SRE", /devops|site reliability|\bsre\b|platform engineer|infrastructure engineer/i, null],
  ["product-designer", "Product Designer", /product designer|ux designer|ui\/ux|ux\/ui|interaction designer|ux\/product designer/i, null],
  ["ux-researcher", "UX Researcher", /ux research|user research/i, null],
  ["product-marketing-manager", "Product Marketing Manager", /product marketing/i, null],
  ["growth-marketing-manager", "Growth Marketing", /growth market|growth manager|growth lead|lifecycle market|performance market/i, null],
  ["marketing-manager", "Marketing Manager", /marketing manager|marketing lead|brand manager/i, /product marketing/i],
  ["business-analyst", "Business Analyst", /business analyst|business systems analyst/i, null],
  ["financial-analyst", "Financial Analyst", /financial analyst|fp&a|finance analyst/i, null],
  ["strategy-and-operations", "Strategy and Operations", /strategy (?:&|and) operations|bizops|business operations|strategy analyst|strategy associate/i, null],
  ["program-manager", "Program Manager", /program manager|project manager/i, /technical program/i],
  ["technical-program-manager", "Technical Program Manager", /technical program manag/i, null],
  ["account-executive", "Account Executive", /account executive/i, null],
  ["customer-success-manager", "Customer Success Manager", /customer success/i, null],
  ["sales-development-representative", "Sales Development Rep", /\bsdr\b|\bbdr\b|sales development|business development rep/i, null],
  ["solutions-engineer", "Solutions Engineer", /solutions? engineer|sales engineer|solutions consultant/i, null],
];
// what to type in the app's Jobs search so a page opens the same list there
export const APPQ = { "associate-product-manager": "associate product manager", "machine-learning-engineer": "machine learning", "frontend-engineer": "frontend", "backend-engineer": "backend", "devops-engineer": "devops", "product-marketing-manager": "product marketing", "growth-marketing-manager": "growth", "strategy-and-operations": "strategy", "customer-success-manager": "customer success", "sales-development-representative": "sales development", "ux-researcher": "researcher" };
export const CITIES = [
  ["new-york", "New York", /new york|, ny\b|\bnyc\b|brooklyn|manhattan|jersey city|hoboken/i],
  ["san-francisco", "San Francisco Bay Area", /san francisco|bay area|palo alto|mountain view|sunnyvale|menlo park|san jose|santa clara|oakland|redwood city|san mateo|cupertino|foster city|south san francisco|berkeley/i],
  ["seattle", "Seattle", /seattle|bellevue|redmond|kirkland/i],
  ["austin", "Austin", /austin/i],
  ["boston", "Boston", /boston|cambridge, ma|somerville|waltham/i],
  ["chicago", "Chicago", /chicago/i],
  ["los-angeles", "Los Angeles", /los angeles|santa monica|culver city|irvine|pasadena|el segundo|playa vista/i],
  ["washington-dc", "Washington, DC", /washington,? d\.?c|arlington, va|mclean|reston|herndon|bethesda|tysons/i],
  ["atlanta", "Atlanta", /atlanta|alpharetta/i],
  ["denver", "Denver", /denver|boulder/i],
  ["dallas", "Dallas", /dallas|plano|irving|frisco|fort worth|addison, tx/i],
  ["houston", "Houston", /houston/i],
  ["miami", "Miami", /miami|fort lauderdale/i],
  ["san-diego", "San Diego", /san diego/i],
  ["philadelphia", "Philadelphia", /philadelphia/i],
  ["salt-lake-city", "Salt Lake City", /salt lake|lehi|draper|provo/i],
  ["raleigh", "Raleigh and Durham", /raleigh|durham|research triangle|cary, nc/i],
  ["phoenix", "Phoenix", /phoenix|scottsdale|tempe|chandler/i],
  ["minneapolis", "Minneapolis", /minneapolis|st\.? paul/i],
  ["nashville", "Nashville", /nashville/i],
];
const US = /\b(us|usa|u\.s\.a?|united states|america)\b|,\s*(a[lkzr]|c[aot]|d[ec]|fl|ga|hi|i[adln]|k[sy]|la|m[adeinost]|n[cdehjmvy]|o[hkr]|pa|ri|s[cd]|t[nx]|ut|v[at]|w[aivy])\b|new york|san francisco|seattle|austin|boston|chicago|los angeles|atlanta|denver|miami|dallas|houston/i;
const ELSE = /\b(india|bengaluru|bangalore|hyderabad|pune|mumbai|delhi|gurgaon|noida|chennai|canada|toronto|vancouver|montreal|united kingdom|\buk\b|london|ireland|dublin|germany|berlin|munich|france|paris|netherlands|amsterdam|spain|poland|singapore|australia|sydney|japan|tokyo|mexico|brazil|israel|philippines|china|emea|apac|latam|europe)\b/i;
const usLoc = l => US.test(l) && !ELSE.test(l);
const LV = ["intern", "entry", "mid", "senior"], WP = ["remote", "hybrid", "onsite"];

function load() {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
  let own = new Set(); try { own = new Set(JSON.parse(fs.readFileSync(path.join(OUT, "logos", "_index.json"), "utf8")).have) } catch {}
  const urlOf = r => Array.isArray(r[7]) ? d.pres[r[7][0]] + r[7][1] : r[7];
  const shardCache = {};
  const snip = i => {
    const n = Math.floor(i / d.shard);
    if (!(n in shardCache)) {
      const f = d.ver ? path.join(OUT, "s", d.ver, `d${n}.json`) : path.join(OUT, `d${n}.json`);
      try { shardCache[n] = JSON.parse(fs.readFileSync(f, "utf8")) } catch { shardCache[n] = [] }
    }
    return (shardCache[n][i % d.shard] || "").slice(0, 320);
  };
  const jobs = d.rows.map((r, i) => ({ i, co: d.cos[r[0]], dom: (d.doms || [])[r[0]] || "", t: r[1], loc: d.locs[r[2]] || "", lvl: r[4], wp: r[5], day: r[6], url: urlOf(r), pay: r[8] || "", fam: (d.fams || [])[r[3]] || "ops", sk: (r[9] || []).map(k => d.skills[k]), yrs: typeof r[10] === "number" ? r[10] : -1 }));
  jobs.forEach(j => { j.own = own.has(j.dom) ? 1 : 0 });
  return { d, jobs, snip };
}

const today = Math.round(Date.now() / 864e5);
function stats(list) {
  const yrs = list.map(j => j.yrs).filter(y => y > 0);
  const yb = { "0 to 2": 0, "3 to 4": 0, "5 to 6": 0, "7+": 0 };
  yrs.forEach(y => yb[y <= 2 ? "0 to 2" : y <= 4 ? "3 to 4" : y <= 6 ? "5 to 6" : "7+"]++);
  const pays = list.map(j => (j.pay.match(/\$(\d+)k to \$(\d+)k/) || null)).filter(Boolean).map(m => [+m[1], +m[2]]);
  const med = a => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)] };
  const count = (arr) => { const c = {}; arr.forEach(x => { if (x) c[x] = (c[x] || 0) + 1 }); return Object.entries(c).sort((a, b) => b[1] - a[1]) };
  return {
    n: list.length, new7: list.filter(j => today - j.day <= 7).length,
    pay: { lo: med(pays.map(p => p[0])), hi: med(pays.map(p => p[1])), n: pays.length },
    years: yb, yearsN: yrs.length,
    lv: [0, 1, 2, 3].map(k => list.filter(j => j.lvl === k).length),
    remote: list.filter(j => j.wp === 0).length,
    places: count(list.map(j => j.wp === 0 ? "Remote" : j.loc.split(/[;|]/)[0].replace(/,\s*(united states|usa|us)$/i, "").trim())).slice(0, 6),
    cos: count(list.map(j => j.co)).slice(0, 8),
    skills: count(list.flatMap(j => j.sk)).slice(0, 10),
  };
}

// newest first, but no company takes over the page: at most 2 per company in the first pass, 4 in the second, then fill
function mix(list, n) {
  const out = [], used = new Set();
  for (const cap of [2, 4, Infinity]) {
    const per = {};
    out.forEach(j => per[j.co] = (per[j.co] || 0) + 1);
    for (const j of list) { if (out.length >= n) break; if (used.has(j)) continue; if ((per[j.co] || 0) >= cap) continue; per[j.co] = (per[j.co] || 0) + 1; used.add(j); out.push(j); }
    if (out.length >= n) break;
  }
  return out;
}

export const slugify = s => String(s || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const NEWGRAD = /new grad|graduate|university|campus|early career|entry[ -]level|\bjunior\b|\bjr\.?\b|associate\b|\b(?:i|1)$|\b(?:i|1)\b(?=[ ,(-])|rotational|residency|apprentice/i;
const SENIORT = /\b(senior|sr\.?|lead|staff|principal|manager ii|director|head)\b/i;
const FAMILY = { product: ["product-manager", "associate-product-manager", "technical-product-manager", "product-analyst", "product-marketing-manager"], data: ["data-analyst", "data-scientist", "data-engineer", "product-analyst", "business-analyst", "machine-learning-engineer"], eng: ["software-engineer", "frontend-engineer", "backend-engineer", "devops-engineer", "machine-learning-engineer", "data-engineer"], design: ["product-designer", "ux-researcher"], growth: ["growth-marketing-manager", "product-marketing-manager", "marketing-manager"], ops: ["business-analyst", "financial-analyst", "strategy-and-operations", "program-manager", "technical-program-manager"], sales: ["account-executive", "customer-success-manager", "sales-development-representative", "solutions-engineer"] };
const famOf = rs => Object.keys(FAMILY).find(f => FAMILY[f].includes(rs)) || "ops";
const topFam = list => { const c = {}; list.forEach(j => c[j.fam] = (c[j.fam] || 0) + 1); return (Object.entries(c).filter(([f]) => FAMILY[f]).sort((a, b) => b[1] - a[1])[0] || ["ops"])[0] };

function build() {
  const { d, jobs, snip } = load();
  const recent = jobs.filter(j => today - j.day <= 45);
  const inUS = j => usLoc(j.loc) || (j.wp === 0 && !ELSE.test(j.loc));
  const pages = [];
  const byRole = {}, roleOf = new Map();
  for (const [rs, rn, re, ex] of ROLES) byRole[rs] = recent.filter(j => { const ok = re.test(j.t) && !(ex && ex.test(j.t)); if (ok && !roleOf.has(j)) roleOf.set(j, rs); return ok });
  const add = (slug, kind, role, city, list, h1, title, extra) => { if (list.length >= MIN_JOBS) pages.push({ slug, kind, role, city, list, h1, title, ...extra }) };
  const roleName = Object.fromEntries(ROLES.map(r => [r[0], r[1]])), cityName = Object.fromEntries(CITIES.map(c => [c[0], c[1]]));
  for (const [rs, rn] of ROLES) {
    const all = byRole[rs], us = all.filter(inUS);
    const entry = j => j.lvl <= 1 || (j.yrs > 0 && j.yrs <= 2);
    add(`${rs}-jobs`, "role", rs, null, us, `${rn} jobs`, `${rn} Jobs in the US`);
    add(`remote-${rs}-jobs`, "remote", rs, "remote", us.filter(j => j.wp === 0), `Remote ${rn} jobs`, `Remote ${rn} Jobs`);
    add(`entry-level-${rs}-jobs`, "entry", rs, null, us.filter(entry), `Entry level ${rn} jobs`, `Entry Level ${rn} Jobs`);
    add(`${rs}-internships`, "intern", rs, null, us.filter(j => j.lvl === 0), `${rn} internships`, `${rn} Internships`);
    add(`new-grad-${rs}-jobs`, "newgrad", rs, null, us.filter(j => j.lvl === 1 && !SENIORT.test(j.t) && j.yrs <= 2 && (NEWGRAD.test(j.t) || j.yrs >= 0)), `New grad ${rn} jobs`, `New Grad ${rn} Jobs`);
    for (const [cs, cn, cre] of CITIES) {
      const here = all.filter(j => cre.test(j.loc));
      add(`${rs}-jobs-in-${cs}`, "city", rs, cs, here, `${rn} jobs in ${cn}`, `${rn} Jobs in ${cn}`);
      add(`entry-level-${rs}-jobs-in-${cs}`, "entrycity", rs, cs, here.filter(entry), `Entry level ${rn} jobs in ${cn}`, `Entry Level ${rn} Jobs in ${cn}`);
    }
  }
  // company pages: "Stripe jobs" and "Stripe software engineer jobs". Every row in the feed is open right now,
  // so these use all of a company's jobs, not only the recent ones (some boards never say when a job was posted)
  const taken = new Set(pages.map(p => p.slug));
  // same company spelled two ways ("Figma" and "figma") becomes one page, named the way it's spelled most
  const coKey = co => slugify(String(co).replace(/[,.]?\s+(usa|us|inc\.?|llc|corp\.?|corporation|group,? inc\.?|holdings|co\.?|ltd\.?|plc)$/i, ""));
  const byCo = Object.create(null); jobs.forEach(j => { const k = coKey(j.co); if (k.length >= 2) (byCo[k] = byCo[k] || []).push(j) });
  const cos = Object.entries(byCo).filter(([, l]) => l.length >= CO_MIN).sort((a, b) => b[1].length - a[1].length).slice(0, CO_MAX);
  const coSlugs = {};
  for (const [cs, list] of cos) {
    if (taken.has(`${cs}-jobs`)) continue;
    const names = Object.create(null); list.forEach(j => names[j.co] = (names[j.co] || 0) + 1);
    const variants = Object.keys(names), co = variants.sort((a, b) => names[b] - names[a])[0];
    variants.forEach(v => coSlugs[v] = cs); taken.add(`${cs}-jobs`);
    const dom = (list.find(j => j.dom) || {}).dom || "";
    add(`${cs}-jobs`, "company", null, null, list, `${co} jobs`, `${co} Jobs`, { co, coSlug: cs, dom, fam: topFam(list) });
    for (const [rs, rn, re, ex] of ROLES) {
      const l = list.filter(j => roleOf.has(j) ? roleOf.get(j) === rs : re.test(j.t) && !(ex && ex.test(j.t)));
      if (!taken.has(`${cs}-${rs}-jobs`)) { add(`${cs}-${rs}-jobs`, "corole", rs, null, l, `${co} ${rn} jobs`, `${co} ${rn} Jobs`, { co, coSlug: cs, dom }); taken.add(`${cs}-${rs}-jobs`) }
    }
  }
  const have = new Set(pages.map(p => p.slug));
  const outDir = path.join(OUT, "pages"); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const index = [];
  const roleLink = (r, city) => city && city !== "remote" ? [`${r}-jobs-in-${city}`, `${roleName[r]} jobs in ${cityName[city]}`] : [`${r}-jobs`, `${roleName[r]} jobs`];
  for (const p of pages) {
    const list = [...p.list].sort((a, b) => b.day - a.day || (b.pay ? 1 : 0) - (a.pay ? 1 : 0));
    const shown = p.kind === "company" || p.kind === "corole" ? [...list].sort((a, b) => (inUS(b) ? 1 : 0) - (inUS(a) ? 1 : 0) || b.day - a.day).slice(0, SHOW) : mix(list, SHOW);
    const s = stats(list);
    const fam = p.fam || famOf(p.role);
    let roles = [], cities = [], narrow = [];
    if (p.kind === "company") {
      roles = ROLES.map(r => r[0]).filter(r => have.has(`${p.coSlug}-${r}-jobs`)).map(r => [`${p.coSlug}-${r}-jobs`, `${roleName[r]} at ${p.co}`]);
    } else if (p.kind === "corole") {
      roles = ROLES.map(r => r[0]).filter(r => r !== p.role && have.has(`${p.coSlug}-${r}-jobs`)).map(r => [`${p.coSlug}-${r}-jobs`, `${roleName[r]} at ${p.co}`]);
      narrow = [[`${p.coSlug}-jobs`, `All ${p.co} jobs`], [`${p.role}-jobs`, `${roleName[p.role]} jobs everywhere`]].filter(([x]) => have.has(x));
    } else {
      const c = p.kind === "entrycity" ? p.city : p.city;
      roles = FAMILY[fam].filter(r => r !== p.role).map(r => roleLink(r, c)).filter(([x]) => have.has(x));
      cities = CITIES.map(c => c[0]).filter(c => c !== p.city).map(c => p.kind === "entrycity" ? [`entry-level-${p.role}-jobs-in-${c}`, `Entry level ${roleName[p.role]} jobs in ${cityName[c]}`] : [`${p.role}-jobs-in-${c}`, `${roleName[p.role]} jobs in ${cityName[c]}`]).filter(([x]) => have.has(x)).slice(0, 10);
      narrow = [[`${p.role}-jobs`, "All US"], [`entry-level-${p.role}-jobs`, "Entry level"], [`new-grad-${p.role}-jobs`, "New grad"], [`${p.role}-internships`, "Internships"], [`remote-${p.role}-jobs`, "Remote"]];
      if (p.city && p.city !== "remote") narrow.push(p.kind === "entrycity" ? [`${p.role}-jobs-in-${p.city}`, `All in ${cityName[p.city]}`] : [`entry-level-${p.role}-jobs-in-${p.city}`, `Entry level in ${cityName[p.city]}`]);
      narrow = narrow.filter(([x]) => have.has(x) && x !== p.slug);
    }
    // companies with their own page, so the side list can link to them
    const coPages = s.cos.map(([c]) => c).filter(c => coSlugs[c] && have.has(`${coSlugs[c]}-jobs`)).map(c => [c, `${coSlugs[c]}-jobs`]);
    const data = {
      slug: p.slug, kind: p.kind, role: p.role, roleName: roleName[p.role] || "", city: p.city, cityName: p.city === "remote" ? "Remote" : cityName[p.city] || "", fam,
      co: p.co || "", coSlug: p.coSlug || "", dom: p.dom || "", q: p.co ? (p.role ? `${APPQ[p.role] || roleName[p.role].toLowerCase()} ${p.co.toLowerCase()}` : p.co.toLowerCase()) : APPQ[p.role] || (roleName[p.role] || "").toLowerCase(),
      h1: p.h1, title: p.title, updated: d.updated, ...s, coPages: Object.fromEntries(coPages),
      jobs: shown.map(j => [j.t, j.co, j.loc.slice(0, 90), j.lvl, j.wp, j.day, j.pay, j.yrs, j.url, snip(j.i), j.sk.slice(0, 5), j.dom, j.own]),
      related: { roles, cities, narrow },
    };
    fs.writeFileSync(path.join(outDir, p.slug + ".json"), JSON.stringify(data));
    index.push([p.slug, p.kind, p.role, p.city, s.n, p.co || ""]);
  }
  fs.writeFileSync(path.join(outDir, "_index.json"), JSON.stringify({ updated: d.updated, roles: roleName, cities: cityName, pages: index }));
  const kinds = {}; pages.forEach(p => kinds[p.kind] = (kinds[p.kind] || 0) + 1);
  console.log(`::notice title=Job pages::${pages.length} pages from ${jobs.length} jobs (${Object.entries(kinds).map(([k, n]) => `${n} ${k}`).join(", ")})`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
