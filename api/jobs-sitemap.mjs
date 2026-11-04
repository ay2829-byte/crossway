// Sitemap for the job search pages, rebuilt from the latest page list.
const DATA = "https://raw.githubusercontent.com/ay2829-byte/crossway/jobs-data/pages/_index.json";
export default async function handler(req, res) {
  try {
    const r = await fetch(DATA);
    if (!r.ok) throw new Error("no index");
    const ix = await r.json();
    const day = String(ix.updated || new Date().toISOString()).slice(0, 10);
    const urls = [`https://crosswayhq.com/jobs`, ...ix.pages.map(p => `https://crosswayhq.com/jobs/${p[0]}`)];
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${day}</lastmod><changefreq>daily</changefreq></url>`).join("\n")}\n</urlset>\n`);
  } catch (e) {
    res.status(503).send("Sitemap unavailable");
  }
}
