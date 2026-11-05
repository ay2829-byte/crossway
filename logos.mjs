// Finds a sharp logo for each company in the jobs feed and stores it as a 64px PNG next to the feed,
// so the app and job pages don't depend on a third party favicon service at view time.
// Runs in the jobs workflow after fetch-jobs.mjs. Usage: OUT=out node logos.mjs
import fs from "fs";
import path from "path";
import sharp from "sharp";

const OUT = process.env.OUT || "jobs";
const DIR = path.join(OUT, "logos");
const MINUTES = +(process.env.LOGO_ART_MINUTES || 12);
const MIN_PX = 48;            // smaller than this looks blurry at tile size
const RETRY_DAYS = 14;        // try again for companies we couldn't find a logo for
const UA = { "User-Agent": "Mozilla/5.0 (compatible; CrosswayLogoBot/1.0; +https://crosswayhq.com)", Accept: "image/avif,image/webp,image/png,image/svg+xml,image/*,text/html;q=0.8,*/*;q=0.5" };
const today = Math.round(Date.now() / 864e5);
const deadline = Date.now() + MINUTES * 60e3;

async function get(url, ms = 8000) {
  try {
    const r = await fetch(url, { headers: UA, redirect: "follow", signal: AbortSignal.timeout(ms) });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length || buf.length > 2e6) return null;
    return { buf, type, url: r.url };
  } catch { return null; }
}

// pull the largest PNG out of an .ico file; BMP entries are skipped
function fromIco(buf) {
  if (buf.length < 6 || buf.readUInt16LE(0) !== 0 || buf.readUInt16LE(2) !== 1) return null;
  const n = buf.readUInt16LE(4); let best = null;
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 16; if (o + 16 > buf.length) break;
    const w = buf[o] || 256, size = buf.readUInt32LE(o + 8), off = buf.readUInt32LE(o + 12);
    const img = buf.subarray(off, off + size);
    if (img.length > 8 && img[0] === 0x89 && img[1] === 0x50 && (!best || w > best.w)) best = { w, img };
  }
  return best ? best.img : null;
}

let GLOBE = null; // Google's "no icon" placeholder, so we never store it as a logo
async function toLogo(res) {
  if (!res) return null;
  let buf = res.buf;
  if (/icon|ico/.test(res.type) || /\.ico(\?|$)/.test(res.url)) { const p = fromIco(buf); if (p) buf = p; else if (buf.readUInt16LE(0) === 0) return null; }
  try {
    const img = sharp(buf, { density: 300 });
    const m = await img.metadata();
    if (!m.width || !m.height) return null;
    if (m.format !== "svg" && Math.min(m.width, m.height) < MIN_PX) return null;
    if (m.width / m.height > 2.2 || m.height / m.width > 2.2) return null; // banners and wordmarks don't fit a square tile
    const out = await sharp(buf, { density: 300 }).resize(64, 64, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer();
    if (GLOBE && out.equals(GLOBE)) return null;
    return out;
  } catch { return null; }
}

// icons the site lists itself, biggest first
function linkedIcons(html, base) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    const rel = (tag.match(/rel=["']?([^"'>]+)/i) || [])[1] || "";
    if (!/icon/i.test(rel)) continue;
    const href = (tag.match(/href=["']?([^"' >]+)/i) || [])[1]; if (!href) continue;
    const sizes = (tag.match(/sizes=["']?(\d+)/i) || [])[1];
    const score = (/apple-touch/i.test(rel) ? 180 : 0) + (sizes ? +sizes : /\.svg/i.test(href) ? 256 : 16);
    try { out.push([new URL(href, base).href, score]); } catch {}
  }
  return out.sort((a, b) => b[1] - a[1]).map(x => x[0]);
}

async function findLogo(dom) {
  const tries = [
    () => get(`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&url=https://${dom}&size=128`),
    async () => {
      const page = await get(`https://${dom}/`, 9000) || await get(`https://www.${dom}/`, 9000);
      if (!page || !/html/i.test(page.type)) return null;
      for (const u of linkedIcons(page.buf.toString("utf8").slice(0, 200000), page.url).slice(0, 3)) {
        const l = await toLogo(await get(u)); if (l) return { logo: l };
      }
      return null;
    },
    () => get(`https://${dom}/apple-touch-icon.png`),
    () => get(`https://icons.duckduckgo.com/ip3/${dom}.ico`),
  ];
  for (const t of tries) {
    if (Date.now() > deadline) return undefined;
    const r = await t();
    if (r && r.logo) return r.logo;
    const l = await toLogo(r); if (l) return l;
  }
  return null;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length && Date.now() < deadline) await fn(items[i++]); }));
}

async function main() {
  const d = JSON.parse(fs.readFileSync(path.join(OUT, "index.json"), "utf8"));
  fs.mkdirSync(DIR, { recursive: true });
  const idxFile = path.join(DIR, "_index.json");
  const prev = (() => { try { return JSON.parse(fs.readFileSync(idxFile, "utf8")) } catch { return { have: [], miss: {} } } })();
  const have = new Set(prev.have.filter(x => fs.existsSync(path.join(DIR, x + ".png")))), miss = prev.miss || {};
  const g = await get(`https://t1.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://no-such-site-${today}.invalid&size=128`);
  if (g) { try { GLOBE = await sharp(g.buf).resize(64, 64, { fit: "contain", background: { r: 255, g: 255, b: 255, alpha: 0 } }).png({ compressionLevel: 9 }).toBuffer() } catch {} }
  // companies with the most jobs first
  const jobs = {}; d.rows.forEach(r => { const dom = (d.doms || [])[r[0]]; if (dom) jobs[dom] = (jobs[dom] || 0) + 1 });
  const todo = Object.keys(jobs).filter(dom => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(dom) && !have.has(dom) && !(miss[dom] && today - miss[dom] < RETRY_DAYS)).sort((a, b) => jobs[b] - jobs[a]);
  let found = 0, tried = 0;
  await pool(todo, 16, async dom => {
    const logo = await findLogo(dom); if (logo === undefined) return;
    tried++;
    if (logo) { fs.writeFileSync(path.join(DIR, dom + ".png"), logo); have.add(dom); delete miss[dom]; found++; }
    else miss[dom] = today;
  });
  const live = new Set(Object.keys(jobs));
  const keep = [...have].filter(x => live.has(x)).sort();
  for (const f of fs.readdirSync(DIR)) if (f.endsWith(".png") && !live.has(f.slice(0, -4))) fs.rmSync(path.join(DIR, f));
  fs.writeFileSync(idxFile, JSON.stringify({ updated: new Date().toISOString(), have: keep, miss }));
  const covered = d.rows.filter(r => have.has((d.doms || [])[r[0]])).length;
  console.log(`::notice title=Logos::${keep.length} companies with a stored logo (${found} new of ${tried} tried, ${todo.length - tried} left for later); ${Math.round(covered / d.rows.length * 100)}% of jobs covered`);
}
if (import.meta.url === `file://${process.argv[1]}`) main();
export { toLogo, fromIco, linkedIcons };
