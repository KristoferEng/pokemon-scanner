// One-off: fetch last 10 PSA 10 comp avg from PriceCharting for each base set card,
// print as JS object literal to paste into FALLBACK_PSA10.
const cheerio = require("cheerio");

const PC_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

async function fetchPage(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 15000);
  try {
    const r = await fetch(url, {
      headers: { "User-Agent": PC_UA, "Accept": "text/html", "Accept-Language": "en-US,en;q=0.9" },
      signal: ctl.signal,
    });
    return await r.text();
  } finally { clearTimeout(t); }
}

const delay = (ms) => new Promise(r => setTimeout(r, ms));

// Pull BASE_SET_CARDS from server.js to stay in sync
const fs = require("fs");
const path = require("path");
const src = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const startIdx = src.indexOf("const BASE_SET_CARDS = [");
const endIdx = src.indexOf("];", startIdx) + 2;
const BASE_SET_CARDS = eval(src.slice(startIdx + "const BASE_SET_CARDS = ".length, endIdx));

(async () => {
  const out = {};
  for (const card of BASE_SET_CARDS) {
    const slug = card.name.toLowerCase().replace(/'/g, "%27").replace(/[^a-z0-9%]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    const url = `https://www.pricecharting.com/game/pokemon-base-set/${slug}-${card.number}`;
    let avg = null;
    try {
      const html = await fetchPage(url);
      const $ = cheerio.load(html);
      const section = $("div.completed-auctions-manual-only");
      const ps = [];
      section.find("tbody tr").each((i, row) => {
        if (ps.length >= 10) return false;
        const txt = $(row).find("td.numeric .js-price").first().text();
        const m = txt.match(/\$([\d,]+\.?\d*)/);
        if (m) ps.push(parseFloat(m[1].replace(/,/g, "")));
      });
      if (ps.length) avg = Math.round(ps.reduce((a, b) => a + b, 0) / ps.length * 100) / 100;
      console.error(`#${card.number} ${card.name}: ${avg != null ? "$" + avg : "N/A"} (${ps.length} comps)`);
    } catch (e) {
      console.error(`#${card.number} ${card.name}: ERR ${e.message}`);
    }
    out[card.name] = avg;
    await delay(800 + Math.random() * 800);
  }
  // Print as JS literal
  const lines = [];
  for (const card of BASE_SET_CARDS) {
    const v = out[card.name];
    lines.push(`  ${JSON.stringify(card.name)}: ${v == null ? "null" : v},`);
  }
  console.log("const FALLBACK_PSA10 = {\n" + lines.join("\n") + "\n};");
})();
