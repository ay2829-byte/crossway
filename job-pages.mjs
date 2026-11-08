// Builds one small data file per search page ("Product Manager jobs in New York") from the jobs feed.
// Runs right after fetch-jobs.mjs in the jobs workflow. api/jobs.mjs renders the pages from these files.
// Usage: OUT=out node job-pages.mjs
import fs from "fs";
import path from "path";

const OUT = process.env.OUT || "jobs";
const MIN_JOBS = +(process.env.PAGE_MIN || 8);   // fewer than this and the page would be thin, so it isn't made
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
  const jobs = d.rows.map((r, i) => ({ i, co: d.cos[r[0]], dom: (d.doms || [])[r[0]] || "", t: r[1], loc: d.locs[r[2]] || "", lvl: r[4], wp: r[5], day: r[6], url: urlOf(r), pay: r[8] || "", sk: (r[9] || []).map(k => d.skills[k]), yrs: typeof r[10] === "number" ? r[10] : -1 }));
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

function build() {
  const { d, jobs, snip } = load();
  const recent = jobs.filter(j => today - j.day <= 45);
  const pages = [];
  const byRole = {};
  for (const [rs, rn, re, ex] of ROLES) byRole[rs] = recent.filter(j => re.test(j.t) && !(ex && ex.test(j.t)));
  const add = (slug, kind, role, city, list, h1, title) => { if (list.length >= MIN_JOBS) pages.push({ slug, kind, role, city, list, h1, title }) };
  for (const [rs, rn] of ROLES) {
    const all = byRole[rs], us = all.filter(j => usLoc(j.loc) || (j.wp === 0 && !ELSE.test(j.loc)));
    add(`${rs}-jobs`, "role", rs, null, us, `${rn} jobs`, `${rn} Jobs in the US`);
    add(`remote-${rs}-jobs`, "remote", rs, "remote", us.filter(j => j.wp === 0), `Remote ${rn} jobs`, `Remote ${rn} Jobs`);
    add(`entry-level-${rs}-jobs`, "entry", rs, null, us.filter(j => j.lvl <= 1 || (j.yrs > 0 && j.yrs <= 2)), `Entry level ${rn} jobs`, `Entry Level ${rn} Jobs`);
    for (const [cs, cn, cre] of CITIES) add(`${rs}-jobs-in-${cs}`, "city", rs, cs, all.filter(j => cre.test(j.loc)), `${rn} jobs in ${cn}`, `${rn} Jobs in ${cn}`);
  }
  const have = new Set(pages.map(p => p.slug));
  const roleName = Object.fromEntries(ROLES.map(r => [r[0], r[1]])), cityName = Object.fromEntries(CITIES.map(c => [c[0], c[1]]));
  // nearby roles share a family, so related links stay useful
  const FAMILY = { product: ["product-manager", "associate-product-manager", "technical-product-manager", "product-analyst", "product-marketing-manager"], data: ["data-analyst", "data-scientist", "data-engineer", "product-analyst", "business-analyst", "machine-learning-engineer"], eng: ["software-engineer", "frontend-engineer", "backend-engineer", "devops-engineer", "machine-learning-engineer", "data-engineer"], design: ["product-designer", "ux-researcher"], growth: ["growth-marketing-manager", "product-marketing-manager", "marketing-manager"], ops: ["business-analyst", "financial-analyst", "strategy-and-operations", "program-manager", "technical-program-manager"], sales: ["account-executive", "customer-success-manager", "sales-development-representative", "solutions-engineer"] };
  const famOf = rs => Object.keys(FAMILY).find(f => FAMILY[f].includes(rs)) || "ops";
  const outDir = path.join(OUT, "pages"); fs.rmSync(outDir, { recursive: true, force: true }); fs.mkdirSync(outDir, { recursive: true });
  const index = [];
  for (const p of pages) {
    const list = [...p.list].sort((a, b) => b.day - a.day || (b.pay ? 1 : 0) - (a.pay ? 1 : 0));
    const shown = mix(list, SHOW);
    const s = stats(list);
    const roles = FAMILY[famOf(p.role)].filter(r => r !== p.role).map(r => p.city && p.city !== "remote" ? `${r}-jobs-in-${p.city}` : `${r}-jobs`).filter(x => have.has(x)).map(x => [x, x.includes("-jobs-in-") ? `${roleName[x.split("-jobs-in-")[0]]} jobs in ${cityName[p.city]}` : `${roleName[x.replace(/-jobs$/, "")]} jobs`]);
    const cities = CITIES.map(c => c[0]).filter(c => c !== p.city).map(c => `${p.role}-jobs-in-${c}`).filter(x => have.has(x)).slice(0, 10).map(x => [x, `${roleName[p.role]} jobs in ${cityName[x.split("-jobs-in-")[1]]}`]);
    const narrow = [[`${p.role}-jobs`, `All US`], [`entry-level-${p.role}-jobs`, "Entry level"], [`remote-${p.role}-jobs`, "Remote"]].filter(([x]) => have.has(x) && x !== p.slug);
    const data = {
      slug: p.slug, kind: p.kind, role: p.role, roleName: roleName[p.role], city: p.city, cityName: p.city === "remote" ? "Remote" : cityName[p.city] || "", fam: famOf(p.role),
      h1: p.h1, title: p.title, updated: d.updated, ...s,
      jobs: shown.map(j => [j.t, j.co, j.loc.slice(0, 90), j.lvl, j.wp, j.day, j.pay, j.yrs, j.url, snip(j.i), j.sk.slice(0, 5), j.dom, j.own]),
      related: { roles, cities, narrow },
    };
    fs.writeFileSync(path.join(outDir, p.slug + ".json"), JSON.stringify(data));
    index.push([p.slug, p.kind, p.role, p.city, s.n]);
  }
  fs.writeFileSync(path.join(outDir, "_index.json"), JSON.stringify({ updated: d.updated, roles: Object.fromEntries(ROLES.map(r => [r[0], r[1]])), cities: Object.fromEntries(CITIES.map(c => [c[0], c[1]])), pages: index }));
  console.log(`::notice title=Job pages::${pages.length} pages from ${jobs.length} jobs`);
}

if (import.meta.url === `file://${process.argv[1]}`) build();
