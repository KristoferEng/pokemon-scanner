const express = require("express");
const path = require("path");
const cheerio = require("cheerio");

const PC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function fetchPage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': PC_UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: controller.signal,
    });
    return await resp.text();
  } finally {
    clearTimeout(timeout);
  }
}

process.on("uncaughtException", (err) => console.error("Uncaught:", err));
process.on("unhandledRejection", (err) => console.error("Unhandled:", err));

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

function delay(min, max) {
  return new Promise((r) => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
}

// ===== EBAY API (Browse API v1) =====
const EBAY_APP_ID = process.env.EBAY_APP_ID;
const EBAY_CERT_ID = process.env.EBAY_CERT_ID;

let ebayToken = null;
let ebayTokenExpiry = 0;

async function getEbayToken() {
  if (ebayToken && Date.now() < ebayTokenExpiry - 60000) return ebayToken;

  const credentials = Buffer.from(`${EBAY_APP_ID}:${EBAY_CERT_ID}`).toString("base64");
  const resp = await fetch("https://api.ebay.com/identity/v1/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Authorization": `Basic ${credentials}`,
    },
    body: "grant_type=client_credentials&scope=https%3A%2F%2Fapi.ebay.com%2Foauth%2Fapi_scope",
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`eBay OAuth failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  ebayToken = data.access_token;
  ebayTokenExpiry = Date.now() + (data.expires_in * 1000);
  return ebayToken;
}

async function ebaySearch(query, categoryId, limit, offset, filters, sort) {
  const token = await getEbayToken();

  const params = new URLSearchParams();
  params.set("q", query);
  if (categoryId) params.set("category_ids", categoryId);
  params.set("limit", String(Math.min(limit, 200)));
  params.set("offset", String(offset));
  if (filters) params.set("filter", filters);
  if (sort) params.set("sort", sort);

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?${params}`;

  const resp = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
      "X-EBAY-C-ENDUSERCTX": "affiliateCampaignId=<ePNCampaignId>,affiliateReferenceId=<referenceId>",
    },
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`eBay API error (${resp.status}): ${text.substring(0, 200)}`);
  }

  return resp.json();
}

// All 102 base set cards
const BASE_SET_CARDS = [
  {name:"Alakazam",number:1},{name:"Blastoise",number:2},{name:"Chansey",number:3},
  {name:"Charizard",number:4},{name:"Clefairy",number:5},{name:"Gyarados",number:6},
  {name:"Hitmonchan",number:7},{name:"Machamp",number:8},{name:"Magneton",number:9},
  {name:"Mewtwo",number:10},{name:"Nidoking",number:11},{name:"Ninetales",number:12},
  {name:"Poliwrath",number:13},{name:"Raichu",number:14},{name:"Venusaur",number:15},
  {name:"Zapdos",number:16},{name:"Beedrill",number:17},{name:"Dragonair",number:18},
  {name:"Dugtrio",number:19},{name:"Electabuzz",number:20},{name:"Electrode",number:21},
  {name:"Pidgeotto",number:22},{name:"Arcanine",number:23},{name:"Charmeleon",number:24},
  {name:"Dewgong",number:25},{name:"Dratini",number:26},{name:"Farfetch'd",number:27},
  {name:"Growlithe",number:28},{name:"Haunter",number:29},{name:"Ivysaur",number:30},
  {name:"Jynx",number:31},{name:"Kadabra",number:32},{name:"Kakuna",number:33},
  {name:"Machoke",number:34},{name:"Magikarp",number:35},{name:"Magmar",number:36},
  {name:"Nidorino",number:37},{name:"Poliwhirl",number:38},{name:"Porygon",number:39},
  {name:"Raticate",number:40},{name:"Seel",number:41},{name:"Wartortle",number:42},
  {name:"Abra",number:43},{name:"Bulbasaur",number:44},{name:"Caterpie",number:45},
  {name:"Charmander",number:46},{name:"Diglett",number:47},{name:"Doduo",number:48},
  {name:"Drowzee",number:49},{name:"Gastly",number:50},{name:"Koffing",number:51},
  {name:"Machop",number:52},{name:"Magnemite",number:53},{name:"Metapod",number:54},
  {name:"Nidoran",number:55},{name:"Onix",number:56},{name:"Pidgey",number:57},
  {name:"Pikachu",number:58},{name:"Poliwag",number:59},{name:"Ponyta",number:60},
  {name:"Rattata",number:61},{name:"Sandshrew",number:62},{name:"Squirtle",number:63},
  {name:"Starmie",number:64},{name:"Staryu",number:65},{name:"Tangela",number:66},
  {name:"Voltorb",number:67},{name:"Vulpix",number:68},{name:"Weedle",number:69},
  {name:"Clefairy Doll",number:70},{name:"Computer Search",number:71},
  {name:"Devolution Spray",number:72},{name:"Impostor Professor Oak",number:73},
  {name:"Item Finder",number:74},{name:"Lass",number:75},{name:"Pokemon Breeder",number:76},
  {name:"Pokemon Trader",number:77},{name:"Scoop Up",number:78},
  {name:"Super Energy Removal",number:79},{name:"Defender",number:80},
  {name:"Energy Retrieval",number:81},{name:"Full Heal",number:82},
  {name:"Maintenance",number:83},{name:"PlusPower",number:84},
  {name:"Pokemon Center",number:85},{name:"Pokemon Flute",number:86},
  {name:"Pokedex",number:87},{name:"Professor Oak",number:88},{name:"Revive",number:89},
  {name:"Super Potion",number:90},{name:"Bill",number:91},
  {name:"Energy Removal",number:92},{name:"Gust of Wind",number:93},
  {name:"Potion",number:94},{name:"Switch",number:95},
  {name:"Double Colorless Energy",number:96},{name:"Fighting Energy",number:97},
  {name:"Fire Energy",number:98},{name:"Grass Energy",number:99},
  {name:"Lightning Energy",number:100},{name:"Psychic Energy",number:101},
  {name:"Water Energy",number:102},
];

function identifyCard(title) {
  const t = title.toLowerCase();
  // Must be PSA 10
  if (!/psa\s*10/i.test(title)) return null;
  // Exclude other graders
  if (/\b(bgs|cgc|sgc|ace|ags|beckett)\b/i.test(title)) return null;
  // Exclude non-slab items
  if (/\b(pack|booster|box|sealed|lot|bundle|case|etb|collection|wrapper|artwork|thick\s*font|thin\s*font|foil|additional\s*game\s*cards)\b/i.test(t)) return null;
  // Exclude raw/ungraded marketed as PSA quality
  if (/\b(raw|ungraded|comp|comparable|quality|worthy|potential|candidate|like\s+psa|nm|near\s*mint|excellent|lp|played)\b/i.test(t)) return null;
  // Exclude shadowless and 1st edition
  if (/shadowless|1st\s*edition|first\s*edition|1st\s*ed/i.test(t)) return null;
  // Exclude Base Set 2, Celebrations, Classic Collection, Legendary Collection, other reprints
  if (/base\s*set\s*2|base\s*ii|base\s*2\b|celebrations|classic\s*collection|legendary\s*collection|evolutions|reprint|promo|world\s*championship/i.test(t)) return null;
  // Exclude Japanese/foreign
  if (/\b(japanese|japan|jpn|jp\b|korean|chinese|french|german|italian|spanish)\b/i.test(t)) return null;
  const numMatch = t.match(/(?:#|no\.?\s*)?(\d{1,3})\s*\/\s*102/) || (t.includes('base set') && t.match(/(?:#|no\.?\s*)(\d{1,3})\b/));
  if (numMatch) {
    const num = parseInt(numMatch[1]);
    if (num >= 1 && num <= 102) {
      const card = BASE_SET_CARDS.find((c) => c.number === num);
      if (card) return card.name;
    }
    return null;
  }

  if (t.includes('base set')) {
    const sorted = [...BASE_SET_CARDS].sort((a, b) => b.name.length - a.name.length);
    for (const card of sorted) {
      if (t.includes(card.name.toLowerCase())) return card.name;
    }
  }
  return null;
}

function extractPrice(item) {
  if (item.price) return parseFloat(item.price.value);
  if (item.currentBidPrice) return parseFloat(item.currentBidPrice.value);
  return null;
}

function extractLocation(item) {
  if (item.itemLocation) {
    const parts = [];
    if (item.itemLocation.city) parts.push(item.itemLocation.city);
    if (item.itemLocation.country) parts.push(item.itemLocation.country);
    return parts.join(", ");
  }
  return "";
}

function countryFromLocation(loc) {
  const l = (loc || "").toUpperCase();
  if (l.includes("US") || l.includes("UNITED STATES")) return "United States";
  if (l.includes("CA") || l.includes("CANADA")) return "Canada";
  if (l.includes("GB") || l.includes("UNITED KINGDOM")) return "United Kingdom";
  if (l.includes("FR") || l.includes("FRANCE")) return "France";
  if (l.includes("DE") || l.includes("GERMANY")) return "Germany";
  if (l.includes("AU") || l.includes("AUSTRALIA")) return "Australia";
  if (l.includes("JP") || l.includes("JAPAN")) return "Japan";
  return loc || "";
}

// Blocked item IDs (persist bad listings here)
const BLOCKED_ITEMS = new Set([
  "157236327643", // Haunter misidentified listing
]);

// SSE endpoint — Base Set scan
app.get("/api/scan", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch(e) {}
  };

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch(e) {}
  }, 15000);

  try {
    send({ type: "log", message: "Phase 1: Collecting eBay listings via API..." });

    const allListings = [];
    const seenIds = new Set();
    const MAX_FOUND = 1000;

    const query = "psa 10 unlimited base set pokemon -shadowless -1st -bgs -cgc -pack -booster";
    const category = "183454"; // Pokemon cards
    const filters = "price:[25..25000],priceCurrency:USD";
    const pageSize = 200;
    const maxPages = 5; // 200 * 5 = 1000 max items from API

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      send({ type: "log", message: `Fetching page ${page + 1}/${maxPages} (offset ${offset})...` });

      try {
        const result = await ebaySearch(query, category, pageSize, offset, filters, "newlyListed");

        const items = result.itemSummaries || [];
        const total = result.total || 0;
        send({ type: "log", message: `  Got ${items.length} items (${total} total available)` });

        if (items.length === 0) break;

        for (const item of items) {
          const itemId = item.itemId;
          if (!itemId || seenIds.has(itemId)) continue;
          // eBay API itemId format is like "v1|123456|0", extract the numeric part
          const numericId = itemId.replace(/v1\|/g, '').replace(/\|.*/g, '');
          if (BLOCKED_ITEMS.has(itemId) || BLOCKED_ITEMS.has(numericId)) continue;

          const title = item.title || "";
          const cardName = identifyCard(title);
          if (!cardName) continue;

          const price = extractPrice(item);
          if (price === null || price <= 25 || price >= 25000) continue;

          const isAuction = (item.buyingOptions || []).includes("AUCTION");
          const location = countryFromLocation(extractLocation(item));
          const ebayUrl = item.itemWebUrl || `https://www.ebay.com/itm/${numericId}`;

          seenIds.add(itemId);
          allListings.push({ title, cardName, price, link: ebayUrl, isAuction, itemId, location });

          send({ type: "found", count: allListings.length, latest: cardName, price });

          if (allListings.length >= MAX_FOUND) break;
        }

        send({ type: "log", message: `  Total matched so far: ${allListings.length}` });

        if (allListings.length >= MAX_FOUND) break;
        if (offset + items.length >= total) break;
      } catch (err) {
        send({ type: "error", message: `API error: ${err.message}` });
        break;
      }
    }

    send({ type: "log", message: `Phase 1 complete: ${allListings.length} listings found.` });

    // ===== PHASE 2: PRICECHARTING LOOKUP =====
    send({ type: "log", message: "Phase 2: Looking up market prices on PriceCharting..." });

    const priceCache = {};
    const uniqueCards = [...new Set(allListings.map((l) => l.cardName))];

    for (let i = 0; i < uniqueCards.length; i++) {
      const cardName = uniqueCards[i];
      send({ type: "log", message: `PriceCharting ${i + 1}/${uniqueCards.length}: ${cardName}...` });
      send({ type: "verified", count: i + 1, card: cardName });

      try {
        const cardInfo = BASE_SET_CARDS.find((c) => c.name === cardName);
        const slug = cardName.toLowerCase().replace(/'/g, "%27").replace(/[^a-z0-9%]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const directUrl = `https://www.pricecharting.com/game/pokemon-base-set/${slug}-${cardInfo ? cardInfo.number : ''}`;

        const pcHtml = await fetchPage(directUrl);
        const $pc = cheerio.load(pcHtml);

        let marketPrice = null;
        const priceEl = $pc('#manual_only_price');
        if (priceEl.length) {
          const match = priceEl.text().match(/\$([\d,]+\.?\d*)/);
          if (match) marketPrice = parseFloat(match[1].replace(/,/g, ''));
        }

        send({ type: "log", message: `  ${cardName}: PSA 10 market price = ${marketPrice ? '$' + marketPrice : 'N/A'}` });
        priceCache[cardName] = { marketPrice, pricechartingUrl: directUrl };
      } catch (err) {
        send({ type: "error", message: `PriceCharting error for ${cardName}: ${err.message}` });
        priceCache[cardName] = { marketPrice: null, pricechartingUrl: null };
      }

      await delay(1500, 3000);
    }

    // ===== BUILD RESULTS =====
    send({ type: "log", message: "Building final results..." });

    const buyItNow = [];
    const auctions = [];

    for (const listing of allListings) {
      const pc = priceCache[listing.cardName] || {};
      const marketPrice = pc.marketPrice;
      const difference = marketPrice != null ? listing.price - marketPrice : null;
      const pctOverMarket = marketPrice != null && marketPrice > 0
        ? ((listing.price - marketPrice) / marketPrice) * 100
        : null;

      const item = {
        name: listing.cardName,
        title: listing.title,
        price: listing.price,
        marketPrice,
        difference,
        pctOverMarket,
        ebayUrl: listing.link,
        pricechartingUrl: pc.pricechartingUrl,
        verified: true,
        location: listing.location,
      };

      if (listing.isAuction) {
        auctions.push(item);
      } else {
        buyItNow.push(item);
      }
    }

    function countryOrder(loc) {
      const l = (loc || '').toLowerCase();
      if (l.includes('united states') || l.includes('us')) return 0;
      if (l.includes('canada')) return 1;
      if (l.includes('united kingdom') || l.includes('uk') || l.includes('great britain')) return 2;
      if (l.includes('france')) return 3;
      return 4;
    }

    function sortByCountryThenPct(a, b) {
      const ca = countryOrder(a.location);
      const cb = countryOrder(b.location);
      if (ca !== cb) return ca - cb;
      if (a.pctOverMarket == null) return 1;
      if (b.pctOverMarket == null) return -1;
      return a.pctOverMarket - b.pctOverMarket;
    }

    buyItNow.sort(sortByCountryThenPct);
    auctions.sort(sortByCountryThenPct);

    send({ type: "log", message: `Done! ${buyItNow.length} Buy It Now, ${auctions.length} Auctions.` });
    send({ type: "result", buyItNow, auctions });
    send({ type: "done" });
  } catch (e) {
    console.error("Scan error:", e);
    send({ type: "error", message: e.message });
    send({ type: "done" });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// Generic card search endpoint
app.get("/api/scan-card", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const send = (data) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch(e) {}
  };

  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch(e) {}
  }, 15000);

  const cardName = req.query.card || '';
  const maxPrice = parseFloat(req.query.maxPrice) || 100;

  if (!cardName) {
    send({ type: "error", message: "Missing card parameter" });
    send({ type: "done" });
    clearInterval(keepAlive);
    res.end();
    return;
  }

  try {
    send({ type: "log", message: `Searching eBay API for ${cardName} PSA 10 (max $${maxPrice})...` });

    const allListings = [];
    const seenIds = new Set();

    const query = `psa 10 ${cardName} -bgs -cgc -sgc -ags -lot -bundle -reprint -japanese -japan`;
    const filters = `price:[0..${maxPrice}],priceCurrency:USD`;
    const pageSize = 200;
    const maxPages = 4;

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      send({ type: "log", message: `Page ${page + 1}/${maxPages}...` });

      try {
        const result = await ebaySearch(query, null, pageSize, offset, filters, "newlyListed");
        const items = result.itemSummaries || [];
        const total = result.total || 0;
        send({ type: "log", message: `  ${items.length} items (${total} total)` });

        if (items.length === 0) break;

        for (const item of items) {
          const itemId = item.itemId;
          if (!itemId || seenIds.has(itemId)) continue;
          const numericId = itemId.replace(/v1\|/g, '').replace(/\|.*/g, '');
          if (BLOCKED_ITEMS.has(itemId) || BLOCKED_ITEMS.has(numericId)) continue;

          const title = item.title || "";
          const t = title.toLowerCase();

          if (!/psa\s*10/i.test(title)) continue;
          if (!t.includes(cardName.toLowerCase())) continue;
          if (/\b(bgs|cgc|sgc|ace|ags|beckett)\b/i.test(title)) continue;
          if (/\b(japanese|japan|jpn|jp|korean|chinese|svk)\b/i.test(t)) continue;

          const price = extractPrice(item);
          if (price === null || price > maxPrice) continue;

          const isAuction = (item.buyingOptions || []).includes("AUCTION");
          const location = countryFromLocation(extractLocation(item));
          const ebayUrl = item.itemWebUrl || `https://www.ebay.com/itm/${itemId}`;

          seenIds.add(itemId);
          allListings.push({ title, cardName, price, link: ebayUrl, isAuction, itemId, location });

          send({ type: "found", count: allListings.length, latest: title.substring(0, 50), price });
        }

        send({ type: "log", message: `  Total matched: ${allListings.length}` });
        if (offset + items.length >= total) break;
      } catch (err) {
        send({ type: "error", message: `API error: ${err.message}` });
        break;
      }
    }

    // PriceCharting lookup
    send({ type: "log", message: `Looking up market prices on PriceCharting...` });
    const pcCache = {};

    async function lookupPC(searchTerm) {
      if (pcCache[searchTerm] !== undefined) return pcCache[searchTerm];
      try {
        const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(searchTerm)}&type=prices`;
        const pcHtml = await fetchPage(searchUrl);
        const $pc = cheerio.load(pcHtml);
        const firstResult = $pc('table#games_table a[href*="game/"]').first();
        if (firstResult.length) {
          const href = firstResult.attr('href');
          const pcUrl = href.startsWith('http') ? href : 'https://www.pricecharting.com' + href;
          const detailHtml = await fetchPage(pcUrl);
          const $d = cheerio.load(detailHtml);
          const priceEl = $d('#manual_only_price');
          let mp = null;
          if (priceEl.length) {
            const match = priceEl.text().match(/\$([\d,]+\.?\d*)/);
            if (match) mp = parseFloat(match[1].replace(/,/g, ''));
          }
          pcCache[searchTerm] = { marketPrice: mp, pricechartingUrl: pcUrl };
          return pcCache[searchTerm];
        }
      } catch {}
      pcCache[searchTerm] = { marketPrice: null, pricechartingUrl: null };
      return pcCache[searchTerm];
    }

    function pcSearchKey(title) {
      let clean = title.replace(/psa\s*10/i, '').replace(/gem\s*mint/i, '').replace(/graded/i, '');
      clean = clean.replace(/\b(tcg|card|cards|mint|near|condition|unlimited|1999|2024|2023|2022|2021|2020)\b/gi, '');
      clean = clean.replace(/[^\w\s#\/&]/g, ' ').replace(/\s+/g, ' ').trim();
      return clean;
    }

    const buyItNow = [];
    const auctions = [];

    for (let i = 0; i < allListings.length; i++) {
      const listing = allListings[i];
      const searchKey = pcSearchKey(listing.title);
      send({ type: "log", message: `  PriceCharting ${i + 1}/${allListings.length}: ${searchKey.substring(0, 50)}...` });
      const pc = await lookupPC(searchKey);
      if (i % 3 === 2) await delay(1500, 2500);

      const marketPrice = pc.marketPrice;
      const difference = marketPrice != null ? listing.price - marketPrice : null;
      const pctOverMarket = marketPrice != null && marketPrice > 0
        ? ((listing.price - marketPrice) / marketPrice) * 100
        : null;

      const item = {
        name: cardName,
        title: listing.title,
        price: listing.price,
        marketPrice,
        difference,
        pctOverMarket,
        ebayUrl: listing.link,
        pricechartingUrl: pc.pricechartingUrl,
        verified: !!marketPrice,
        location: listing.location,
      };

      if (listing.isAuction) {
        auctions.push(item);
      } else {
        buyItNow.push(item);
      }
    }

    buyItNow.sort((a, b) => {
      if (a.pctOverMarket == null) return 1;
      if (b.pctOverMarket == null) return -1;
      return a.pctOverMarket - b.pctOverMarket;
    });
    auctions.sort((a, b) => {
      if (a.pctOverMarket == null) return 1;
      if (b.pctOverMarket == null) return -1;
      return a.pctOverMarket - b.pctOverMarket;
    });

    send({ type: "log", message: `Done! ${buyItNow.length} Buy It Now, ${auctions.length} Auctions.` });
    send({ type: "result", buyItNow, auctions, cardName });
    send({ type: "done" });
  } catch (e) {
    console.error("Scan-card error:", e);
    send({ type: "error", message: e.message });
    send({ type: "done" });
  } finally {
    clearInterval(keepAlive);
    res.end();
  }
});

// ===== CACHED DATA (persisted to disk) =====
const fs = require("fs");
// Use /tmp for cache on Render (survives restarts but not disk wipes)
// Use project dir locally
const CACHE_DIR = process.env.RENDER ? "/tmp" : __dirname;
const CACHE_FILE = path.join(CACHE_DIR, ".pokemon-cache.json");

let cachedResults = null;
let lastScanTime = null;
let scanInProgress = false;
let cachedMarketPrices = null;
let marketPricesLastUpdate = null;

function saveCache() {
  try {
    // Preserve last live PriceCharting prices separately for fallback on restart
    const existing = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
    const isLive = marketPricesLastUpdate && !String(marketPricesLastUpdate).includes('fallback');
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      cachedResults, lastScanTime, cachedMarketPrices, marketPricesLastUpdate,
      // Only update lastLive when we have a real PriceCharting fetch
      lastLiveMarketPrices: isLive ? cachedMarketPrices : (existing.lastLiveMarketPrices || null),
      lastLiveMarketPricesUpdate: isLive ? marketPricesLastUpdate : (existing.lastLiveMarketPricesUpdate || null),
    }));
  } catch (e) { console.error("[Cache] Save error:", e.message); }
}

function loadCache() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
      cachedResults = data.cachedResults || null;
      lastScanTime = data.lastScanTime || null;
      cachedMarketPrices = data.cachedMarketPrices || null;
      marketPricesLastUpdate = data.marketPricesLastUpdate || null;
      console.log("[Cache] Loaded from disk. LastScan:", lastScanTime);
    }
  } catch (e) { console.error("[Cache] Load error:", e.message); }
}

loadCache();

// Register all API routes up front
app.post("/api/trigger-scan", (req, res) => {
  if (scanInProgress) {
    return res.json({ status: "already_running" });
  }
  runAutoScan().catch(() => {});
  res.json({ status: "started" });
});

app.get("/api/cached-results", async (req, res) => {
  // If data is stale (past the next clock hour), trigger a refresh
  if (lastScanTime && !scanInProgress) {
    const lastScan = new Date(lastScanTime);
    const nextHour = new Date(lastScan);
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    if (Date.now() >= nextHour.getTime()) {
      console.log(`[AutoScan] Data from ${lastScan.toISOString()} is past the next hour mark, triggering refresh...`);
      runAutoScan().catch(() => {});
    }
  }
  const priceSource = (!marketPricesLastUpdate || String(marketPricesLastUpdate).includes('fallback')) ? 'fallback' : 'pricecharting';
  res.json({ results: cachedResults, lastScanTime, scanInProgress, priceSource });
});

app.get("/api/market-prices", (req, res) => {
  const priceSource = (!marketPricesLastUpdate || String(marketPricesLastUpdate).includes('fallback')) ? 'fallback' : 'pricecharting';
  res.json({ prices: cachedMarketPrices, lastUpdate: marketPricesLastUpdate, priceSource, inProgress: marketPricesInProgress });
});

let marketPricesInProgress = false;
let pikachu57InProgress = false;

app.post("/api/trigger-market", (req, res) => {
  if (marketPricesInProgress) return res.json({ status: "already_running" });
  marketPricesInProgress = true;
  fetchAllMarketPrices().catch(() => {}).finally(() => { marketPricesInProgress = false; });
  res.json({ status: "started" });
});

app.post("/api/trigger-pikachu57", (req, res) => {
  if (pikachu57InProgress) return res.json({ status: "already_running" });
  pikachu57InProgress = true;
  fetchPikachu57().catch(() => {}).finally(() => { pikachu57InProgress = false; });
  res.json({ status: "started" });
});

app.post("/api/trigger-perfect-order", (req, res) => {
  if (perfectOrderInProgress) return res.json({ status: "already_running" });
  fetchPerfectOrder().catch(() => {});
  res.json({ status: "started" });
});

// ===== AUTO-SCAN =====

async function runAutoScan() {
  if (scanInProgress) return;
  scanInProgress = true;
  console.log(`[AutoScan] Starting at ${new Date().toISOString()}`);

  try {
    const allListings = [];
    const seenIds = new Set();

    const query = "psa 10 unlimited base set pokemon -shadowless -1st -bgs -cgc -pack -booster";
    const category = "183454";
    const filters = "price:[25..25000],priceCurrency:USD";
    const pageSize = 200;
    const maxPages = 5;

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      try {
        const result = await ebaySearch(query, category, pageSize, offset, filters, "newlyListed");
        const items = result.itemSummaries || [];
        const total = result.total || 0;
        console.log(`[AutoScan] Page ${page + 1}: ${items.length} items (${total} total)`);
        if (items.length === 0) break;

        for (const item of items) {
          const itemId = item.itemId;
          if (!itemId || seenIds.has(itemId)) continue;
          const numericId = itemId.replace(/v1\|/g, '').replace(/\|.*/g, '');
          if (BLOCKED_ITEMS.has(itemId) || BLOCKED_ITEMS.has(numericId)) continue;

          const title = item.title || "";
          const cardName = identifyCard(title);
          if (!cardName) continue;

          const price = extractPrice(item);
          if (price === null || price <= 25 || price >= 25000) continue;

          const isAuction = (item.buyingOptions || []).includes("AUCTION");
          const location = countryFromLocation(extractLocation(item));
          const ebayUrl = item.itemWebUrl || `https://www.ebay.com/itm/${numericId}`;

          seenIds.add(itemId);
          allListings.push({ title, cardName, price, link: ebayUrl, isAuction, itemId, location });
        }

        if (offset + items.length >= total) break;
      } catch (err) {
        console.error(`[AutoScan] API error page ${page + 1}:`, err.message);
        break;
      }
    }

    console.log(`[AutoScan] Found ${allListings.length} listings.`);

    function countryOrder(loc) {
      const l = (loc || '').toLowerCase();
      if (l.includes('united states')) return 0;
      if (l.includes('canada')) return 1;
      if (l.includes('united kingdom')) return 2;
      return 3;
    }

    function buildAndCacheResults(priceCache) {
      const buyItNow = [];
      const auctions = [];
      for (const listing of allListings) {
        const pc = priceCache[listing.cardName] || {};
        const marketPrice = pc.marketPrice || null;
        const difference = marketPrice != null ? listing.price - marketPrice : null;
        const pctOverMarket = marketPrice != null && marketPrice > 0
          ? ((listing.price - marketPrice) / marketPrice) * 100 : null;
        const item = {
          name: listing.cardName, title: listing.title, price: listing.price,
          marketPrice, difference, pctOverMarket, ebayUrl: listing.link,
          pricechartingUrl: pc.pricechartingUrl || null, verified: !!marketPrice, location: listing.location,
        };
        if (listing.isAuction) auctions.push(item); else buyItNow.push(item);
      }
      buyItNow.sort((a, b) => {
        const ca = countryOrder(a.location), cb = countryOrder(b.location);
        if (ca !== cb) return ca - cb;
        if (a.pctOverMarket == null) return 1;
        if (b.pctOverMarket == null) return -1;
        return a.pctOverMarket - b.pctOverMarket;
      });
      auctions.sort((a, b) => {
        const ca = countryOrder(a.location), cb = countryOrder(b.location);
        if (ca !== cb) return ca - cb;
        if (a.pctOverMarket == null) return 1;
        if (b.pctOverMarket == null) return -1;
        return a.pctOverMarket - b.pctOverMarket;
      });
      cachedResults = { buyItNow, auctions };
      lastScanTime = new Date().toISOString();
      saveCache();
    }

    // Use cached market prices from the daily PriceCharting fetch
    const priceCache = {};
    if (cachedMarketPrices) {
      for (const mp of cachedMarketPrices) {
        priceCache[mp.name] = { marketPrice: mp.psa10Price, pricechartingUrl: mp.pricechartingUrl };
      }
    }

    buildAndCacheResults(priceCache);
    const r = cachedResults;
    console.log(`[AutoScan] Done! ${r.buyItNow.length} BIN, ${r.auctions.length} auctions. Cached at ${lastScanTime}`);
  } catch (e) {
    console.error("[AutoScan] Error:", e);
  } finally {
    scanInProgress = false;
  }
}

// ===== MARKET PRICES: all 102 base set cards =====
// Hardcoded fallback PSA 10 prices (from PriceCharting 3/18/2026)
// Used when PriceCharting blocks Render's IP
// Last 10 PSA 10 PriceCharting comp averages, refreshed 2026-04-14.
// Machamp & Impostor Professor Oak retain manual values (no PSA 10 comps on PC).
const FALLBACK_PSA10 = {
  "Alakazam":1734.62,"Blastoise":7540.9,"Chansey":3908.18,"Charizard":16717.6,"Clefairy":2720.95,
  "Gyarados":2215.93,"Hitmonchan":1303.12,"Machamp":1500,"Magneton":722.55,"Mewtwo":3061.04,
  "Nidoking":1324.39,"Ninetales":1076.29,"Poliwrath":1100.55,"Raichu":2532.59,"Venusaur":2386.28,
  "Zapdos":1372.6,"Beedrill":120.57,"Dragonair":277.44,"Dugtrio":141.53,"Electabuzz":199.64,
  "Electrode":182.67,"Pidgeotto":182.65,"Arcanine":272.7,"Charmeleon":199.78,"Dewgong":150.4,
  "Dratini":153.16,"Farfetch'd":121.28,"Growlithe":110.63,"Haunter":185.28,"Ivysaur":180.48,
  "Jynx":151,"Kadabra":211.45,"Kakuna":89.47,"Machoke":108.4,"Magikarp":338.89,
  "Magmar":141.98,"Nidorino":213.99,"Poliwhirl":137.11,"Porygon":194.81,"Raticate":171.75,
  "Seel":94.71,"Wartortle":236.26,"Abra":130.27,"Bulbasaur":239.82,"Caterpie":85.78,
  "Charmander":264.01,"Diglett":82.08,"Doduo":113.63,"Drowzee":102.12,"Gastly":167.65,
  "Koffing":84.85,"Machop":100.79,"Magnemite":78.98,"Metapod":81.42,"Nidoran":82.23,
  "Onix":116.61,"Pidgey":108.6,"Pikachu":520.1,"Poliwag":104.28,"Ponyta":132.62,
  "Rattata":99.68,"Sandshrew":116.25,"Squirtle":367,"Starmie":81.49,"Staryu":77.42,
  "Tangela":86.35,"Voltorb":163.24,"Vulpix":137.66,"Weedle":77.02,
  "Clefairy Doll":389.28,"Computer Search":83.7,"Devolution Spray":433.22,
  "Impostor Professor Oak":1200,"Item Finder":193.85,"Lass":104.71,
  "Pokemon Breeder":274.96,"Pokemon Trader":208.51,"Scoop Up":163.58,
  "Super Energy Removal":79.71,"Defender":363.75,"Energy Retrieval":98.35,
  "Full Heal":557.47,"Maintenance":494.58,"PlusPower":99.96,
  "Pokemon Center":551.59,"Pokemon Flute":394.48,"Pokedex":224.4,
  "Professor Oak":104.9,"Revive":627.61,"Super Potion":53.32,"Bill":82.46,
  "Energy Removal":64.6,"Gust of Wind":94.49,"Potion":65.92,"Switch":79.84,
  "Double Colorless Energy":791.09,"Fighting Energy":65.11,"Fire Energy":61.55,
  "Grass Energy":74.2,"Lightning Energy":71.7,"Psychic Energy":73.75,
  "Water Energy":85.58,
};

function buildFallbackMarketPrices() {
  return BASE_SET_CARDS.map(card => {
    const type = card.number <= 16 ? 'Holo Rare' : card.number <= 42 ? 'Rare' : card.number <= 69 ? 'Common/Uncommon' : card.number <= 95 ? 'Trainer' : 'Energy';
    const slug = card.name.toLowerCase().replace(/'/g, "%27").replace(/[^a-z0-9%]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return {
      number: card.number, name: card.name, type,
      psa10Price: FALLBACK_PSA10[card.name] || null,
      ungradedPrice: null,
      pricechartingUrl: `https://www.pricecharting.com/game/pokemon-base-set/${slug}-${card.number}`,
    };
  });
}

async function fetchAllMarketPrices() {
  console.log("[MarketPrices] Fetching all 102 base set card prices...");
  const prices = [];
  let successCount = 0;

  for (const card of BASE_SET_CARDS) {
    const slug = card.name.toLowerCase().replace(/'/g, "%27").replace(/[^a-z0-9%]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const directUrl = `https://www.pricecharting.com/game/pokemon-base-set/${slug}-${card.number}`;
    const type = card.number <= 16 ? 'Holo Rare' : card.number <= 42 ? 'Rare' : card.number <= 69 ? 'Common/Uncommon' : card.number <= 95 ? 'Trainer' : 'Energy';

    try {
      const pcHtml2 = await fetchPage(directUrl);
      const $pc = cheerio.load(pcHtml2);

      let psa10Price = null;
      // Use average of last 10 comps from PSA 10 sold listings
      const psa10Section = $pc('div.completed-auctions-manual-only');
      if (psa10Section.length) {
        const prices = [];
        psa10Section.find('tbody tr').each((i, row) => {
          if (prices.length >= 10) return false;
          const priceText = $pc(row).find('td.numeric .js-price').first().text();
          const match = priceText.match(/\$([\d,]+\.?\d*)/);
          if (match) prices.push(parseFloat(match[1].replace(/,/g, '')));
        });
        if (prices.length > 0) {
          psa10Price = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100;
        }
      }
      // Fallback to manual_only_price if no comps found
      if (!psa10Price) {
        const priceEl = $pc('#manual_only_price');
        if (priceEl.length) {
          const match = priceEl.text().match(/\$([\d,]+\.?\d*)/);
          if (match) psa10Price = parseFloat(match[1].replace(/,/g, ''));
        }
      }

      let ungradedPrice = null;
      const ungradedEl = $pc('#used-price');
      if (ungradedEl.length) {
        const match = ungradedEl.text().match(/\$([\d,]+\.?\d*)/);
        if (match) ungradedPrice = parseFloat(match[1].replace(/,/g, ''));
      }

      prices.push({ number: card.number, name: card.name, type, psa10Price, ungradedPrice, pricechartingUrl: directUrl });
      if (psa10Price) successCount++;
      console.log(`[MarketPrices] #${card.number} ${card.name}: PSA 10 = ${psa10Price ? '$' + psa10Price : 'N/A'}`);
    } catch (err) {
      // Use fallback price if PriceCharting fails
      prices.push({
        number: card.number, name: card.name, type,
        psa10Price: FALLBACK_PSA10[card.name] || null,
        ungradedPrice: null, pricechartingUrl: directUrl,
      });
      console.log(`[MarketPrices] #${card.number} ${card.name}: using fallback`);
    }
    await delay(1000, 2000);

    // If too many failures, just use fallback for the rest
    if (prices.length >= 5 && successCount === 0) {
      console.log("[MarketPrices] PriceCharting appears blocked, using fallback prices for remaining cards.");
      for (let i = prices.length; i < BASE_SET_CARDS.length; i++) {
        const c = BASE_SET_CARDS[i];
        const s = c.name.toLowerCase().replace(/'/g, "%27").replace(/[^a-z0-9%]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const t = c.number <= 16 ? 'Holo Rare' : c.number <= 42 ? 'Rare' : c.number <= 69 ? 'Common/Uncommon' : c.number <= 95 ? 'Trainer' : 'Energy';
        prices.push({
          number: c.number, name: c.name, type: t,
          psa10Price: FALLBACK_PSA10[c.name] || null,
          ungradedPrice: null,
          pricechartingUrl: `https://www.pricecharting.com/game/pokemon-base-set/${s}-${c.number}`,
        });
      }
      break;
    }
  }

  cachedMarketPrices = prices;
  marketPricesLastUpdate = new Date().toISOString();
  saveCache();
  // Update in-memory fallback prices so future blocked requests use latest values
  if (successCount > 0) {
    for (const p of prices) {
      if (p.psa10Price) FALLBACK_PSA10[p.name] = p.psa10Price;
    }
  }
  console.log(`[MarketPrices] Done. ${successCount} live prices, ${prices.length - successCount} fallback. Cached.`);
}

// ===== ENDING AUCTIONS: PSA 10 auctions for specific cards =====
const AUCTION_CARDS = ["dragonite", "pikachu", "vulpix", "wigglytuff"];
const MAX_PER_CARD = 10;

// PriceCharting lookup cache keyed by search term
let auctionPriceCache = {};

async function getAuctionCardPrice(title, pokemonName) {
  // Extract card number from title (e.g. "#152" or "152/236")
  const cardNumMatch = title.match(/#(\d+)/) || title.match(/\b(\d+)\/\d+\b/);
  const cardNum = cardNumMatch ? cardNumMatch[1] : null;

  const cacheKey = `${pokemonName}|${cardNum || 'none'}|${title.substring(0, 60)}`;
  if (auctionPriceCache[cacheKey] !== undefined) return auctionPriceCache[cacheKey];

  // Search PriceCharting like a human would: "pikachu 52"
  const searchQuery = cardNum ? `${pokemonName} ${cardNum}` : pokemonName;

  try {
    const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(searchQuery)}&type=prices`;
    const html = await fetchPage(searchUrl);
    const $ = cheerio.load(html);

    const nameLower = pokemonName.toLowerCase();
    let matchedHref = null;

    // Collect all unique result hrefs
    const allHrefs = [];
    $('table#games_table a[href*="game/"]').each((i, el) => {
      const href = $(el).attr('href');
      if (href && !allHrefs.includes(href)) allHrefs.push(href);
    });

    // Priority 1: URL contains pokemon name AND ends with card number
    if (cardNum) {
      matchedHref = allHrefs.find(h =>
        h.toLowerCase().includes(nameLower) && h.match(new RegExp(`-${cardNum}$`))
      );
    }

    // Priority 2: URL contains the pokemon name (first match)
    if (!matchedHref) {
      matchedHref = allHrefs.find(h => h.toLowerCase().includes(nameLower));
    }

    if (!matchedHref) {
      console.log(`[AuctionPC] No match for "${searchQuery}" in search results`);
      auctionPriceCache[cacheKey] = null;
      return null;
    }

    const pcUrl = matchedHref.startsWith('http') ? matchedHref : 'https://www.pricecharting.com' + matchedHref;

    // Validate: URL must contain the pokemon name
    if (!pcUrl.toLowerCase().includes(nameLower)) {
      console.log(`[AuctionPC] URL doesn't contain "${pokemonName}", skipping: ${pcUrl}`);
      auctionPriceCache[cacheKey] = null;
      return null;
    }

    const detailHtml = await fetchPage(pcUrl);
    const $d = cheerio.load(detailHtml);

    // Verify the page title contains the pokemon name
    const pageTitle = $d('h1').first().text().toLowerCase();
    if (!pageTitle.includes(nameLower)) {
      console.log(`[AuctionPC] Page title "${pageTitle}" doesn't contain "${pokemonName}", skipping`);
      auctionPriceCache[cacheKey] = null;
      return null;
    }

    let marketPrice = null;
    // Use average of last 5 comps from PSA 10 sold listings
    const psa10Section = $d('div.completed-auctions-manual-only');
    if (psa10Section.length) {
      const prices = [];
      psa10Section.find('tbody tr').each((i, row) => {
        if (prices.length >= 5) return false;
        const priceText = $d(row).find('td.numeric .js-price').first().text();
        const match = priceText.match(/\$([\d,]+\.?\d*)/);
        if (match) prices.push(parseFloat(match[1].replace(/,/g, '')));
      });
      if (prices.length > 0) {
        marketPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100;
      }
    }
    // Fallback to manual_only_price if no comps found
    if (!marketPrice) {
      const priceEl = $d('#manual_only_price');
      if (priceEl.length) {
        const match = priceEl.text().match(/\$([\d,]+\.?\d*)/);
        if (match) marketPrice = parseFloat(match[1].replace(/,/g, ''));
      }
    }
    console.log(`[AuctionPC] "${pokemonName}" #${cardNum || '?'} -> $${marketPrice || 'N/A'} (${pcUrl})`);
    auctionPriceCache[cacheKey] = { marketPrice, pcUrl };
    return auctionPriceCache[cacheKey];
  } catch (err) {
    console.error(`[AuctionPC] Error for "${pokemonName}" #${cardNum || '?'}: ${err.message}`);
  }
  auctionPriceCache[cacheKey] = null;
  return null;
}

let cachedEndingAuctions = null;
let endingAuctionsLastUpdate = null;

async function fetchEndingAuctions() {
  console.log("[EndingAuctions] Fetching...");
  const allAuctions = [];
  const seenIds = new Set();

  for (const cardName of AUCTION_CARDS) {
    let found = 0;
    const query = `"psa 10" ${cardName} pokemon -bgs -cgc -sgc -lot -bundle -raw -ungraded -japanese -japan -jpn -korean -chinese`;
    const filters = "price:[10..1000],priceCurrency:USD,buyingOptions:{AUCTION}";

    try {
      // Fetch up to 200 results sorted by ending soonest to cover 24h window
      const result = await ebaySearch(query, "183454", 200, 0, filters, "endingSoonest");
      const items = result.itemSummaries || [];

      for (const item of items) {
        if (found >= MAX_PER_CARD) break;

        const endDate = item.itemEndDate ? new Date(item.itemEndDate) : null;
        if (!endDate) continue;
        const minutesLeft = (endDate - Date.now()) / 60000;
        if (minutesLeft < 0) continue;
        if (minutesLeft > 1440) break; // 24 hours max

        const itemId = item.itemId;
        if (!itemId || seenIds.has(itemId)) continue;
        const numericId = itemId.replace(/v1\|/g, '').replace(/\|.*/g, '');
        if (BLOCKED_ITEMS.has(itemId) || BLOCKED_ITEMS.has(numericId)) continue;

        const title = item.title || "";
        const tl = title.toLowerCase();
        if (!/psa\s*10/i.test(title)) continue;
        if (/\b(bgs|cgc|sgc|ace|ags|beckett)\b/i.test(title)) continue;
        if (/\b(jpn|jap|japanese|japanse|japan|chinese|korean|spanish|french|german|italian|portuguese|simplified)\b/i.test(tl)) continue;
        if (/\bjp\b/i.test(tl)) continue;
        if (/\b(pack|booster|box|sealed|lot|bundle|case|etb|collection|raw|ungraded)\b/i.test(tl)) continue;
        // Exclude Japanese-language cards (often not in title but are illustration contest / promo cards from Japan)
        if (/illustration\s*contest|world\s*art|ryo\s*ueda/i.test(tl)) continue;
        // Exclude items located in Japan (catches Japanese cards even when title doesn't say it)
        const itemCountry = item.itemLocation?.country || "";
        if (/^JP$/i.test(itemCountry)) continue;
        if (!tl.includes(cardName)) continue;

        const price = extractPrice(item);
        if (price === null || price < 10 || price > 1000) continue;

        const location = countryFromLocation(extractLocation(item));
        const ebayUrl = item.itemWebUrl || `https://www.ebay.com/itm/${numericId}`;

        // Format end time with date if >12h away
        const hoursLeft = minutesLeft / 60;
        let endTimeStr;
        if (hoursLeft > 12) {
          endTimeStr = endDate.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
        } else {
          endTimeStr = endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/Los_Angeles' });
        }

        // Time left display
        let timeLeftStr;
        if (minutesLeft < 60) timeLeftStr = Math.round(minutesLeft) + 'm';
        else if (minutesLeft < 1440) timeLeftStr = Math.floor(minutesLeft / 60) + 'h ' + Math.round(minutesLeft % 60) + 'm';
        else timeLeftStr = Math.floor(minutesLeft / 1440) + 'd';

        seenIds.add(itemId);
        found++;

        allAuctions.push({
          name: cardName.charAt(0).toUpperCase() + cardName.slice(1),
          title, price, ebayUrl, location,
          endTime: endTimeStr,
          minutesLeft: Math.round(minutesLeft),
          timeLeftStr,
          marketPrice: null, difference: null, pctOverMarket: null, pricechartingUrl: null, verified: false,
        });
      }
      console.log(`[EndingAuctions] ${cardName}: ${found} auctions within 24h`);
    } catch (err) {
      console.error(`[EndingAuctions] Error for ${cardName}:`, err.message);
    }
  }

  // Look up PriceCharting for each auction using its specific title
  for (const a of allAuctions) {
    try {
      const pc = await getAuctionCardPrice(a.title, a.name.toLowerCase());
      if (pc && pc.marketPrice) {
        a.marketPrice = pc.marketPrice;
        a.pricechartingUrl = pc.pcUrl;
        a.verified = true;
        a.difference = a.price - pc.marketPrice;
        a.pctOverMarket = pc.marketPrice > 0 ? ((a.price - pc.marketPrice) / pc.marketPrice) * 100 : null;
      }
    } catch {}
    await delay(1000, 1500);
  }

  // Sort: US first, then other countries, then by soonest ending
  allAuctions.sort((a, b) => {
    const aUS = (a.location || '').toLowerCase().includes('united states') ? 0 : 1;
    const bUS = (b.location || '').toLowerCase().includes('united states') ? 0 : 1;
    if (aUS !== bUS) return aUS - bUS;
    return a.minutesLeft - b.minutesLeft;
  });

  cachedEndingAuctions = allAuctions;
  endingAuctionsLastUpdate = new Date().toISOString();
  console.log(`[EndingAuctions] Done. ${allAuctions.length} total auctions cached.`);
  return allAuctions;
}

app.get("/api/ending-auctions", async (req, res) => {
  try {
    // Fetch fresh if no cache or data is older than 5 minutes
    const stale = !cachedEndingAuctions || !endingAuctionsLastUpdate ||
      (Date.now() - new Date(endingAuctionsLastUpdate).getTime()) > 5 * 60 * 1000;
    if (stale) {
      await fetchEndingAuctions();
    }
    // Recalculate minutesLeft from cached data (times shift as time passes)
    const now = Date.now();
    const auctions = (cachedEndingAuctions || []).map(a => {
      // Recalc from endTime is hard since we stored formatted string; just use original minutesLeft adjusted
      const elapsed = endingAuctionsLastUpdate ? (now - new Date(endingAuctionsLastUpdate).getTime()) / 60000 : 0;
      const newMinutes = Math.round(a.minutesLeft - elapsed);
      let timeLeftStr;
      if (newMinutes < 0) return null; // expired
      if (newMinutes < 60) timeLeftStr = newMinutes + 'm';
      else if (newMinutes < 1440) timeLeftStr = Math.floor(newMinutes / 60) + 'h ' + Math.round(newMinutes % 60) + 'm';
      else timeLeftStr = Math.floor(newMinutes / 1440) + 'd';
      return { ...a, minutesLeft: newMinutes, timeLeftStr };
    }).filter(Boolean);

    res.json({ auctions, lastUpdate: endingAuctionsLastUpdate });
  } catch (e) {
    console.error("[EndingAuctions] Error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ===== PIKACHU 57 (Surging Sparks) PSA 10 =====
let cachedPikachu57 = null;
let pikachu57LastUpdate = null;

async function fetchPikachu57() {
  console.log("[Pikachu57] Fetching...");
  const allListings = [];
  const seenIds = new Set();
  const query = `pikachu surging sparks psa 10 -bgs -cgc -sgc -lot -bundle -raw -japanese -japan`;
  const filters = "price:[10..5000],priceCurrency:USD";

  for (let page = 0; page < 3; page++) {
    try {
      const result = await ebaySearch(query, "183454", 200, page * 200, filters, "newlyListed");
      const items = result.itemSummaries || [];
      if (!items.length) break;
      for (const item of items) {
        const itemId = item.itemId;
        if (!itemId || seenIds.has(itemId)) continue;
        const numericId = itemId.replace(/v1\|/g, '').replace(/\|.*/g, '');
        if (BLOCKED_ITEMS.has(itemId) || BLOCKED_ITEMS.has(numericId)) continue;
        const title = item.title || "";
        const tl = title.toLowerCase();
        if (!/psa\s*10/i.test(title)) continue;
        if (!/pikachu/i.test(tl)) continue;
        // Must have 57 or 057 reference
        if (!/(^|[^0-9])0?57(\/|\s|$|[^0-9])/.test(tl)) continue;
        // Must reference Surging Sparks (to exclude other Pikachu 057s like 151)
        if (!/surg|spark|ssp/i.test(tl)) continue;
        if (/\b(bgs|cgc|sgc|ace|ags|beckett|jpn|japanese|japan|korean|chinese|lot|bundle|pack|booster|sealed|raw|ungraded)\b/i.test(tl)) continue;
        const price = extractPrice(item);
        if (price === null) continue;
        const isAuction = (item.buyingOptions || []).includes("AUCTION");
        const location = countryFromLocation(extractLocation(item));
        const ebayUrl = item.itemWebUrl || `https://www.ebay.com/itm/${numericId}`;
        seenIds.add(itemId);
        allListings.push({ title, price, link: ebayUrl, isAuction, itemId, location });
      }
      if ((result.total || 0) <= (page + 1) * 200) break;
    } catch (err) {
      console.error(`[Pikachu57] API error page ${page + 1}:`, err.message);
      break;
    }
  }

  // PriceCharting lookup for Pikachu 57 Surging Sparks
  let marketPrice = null;
  let pricechartingUrl = "https://www.pricecharting.com/game/pokemon-surging-sparks/pikachu-57";
  try {
    const html = await fetchPage(pricechartingUrl);
    const $ = cheerio.load(html);
    const psa10Section = $('div.completed-auctions-manual-only');
    if (psa10Section.length) {
      const prices = [];
      psa10Section.find('tbody tr').each((i, row) => {
        if (prices.length >= 5) return false;
        const priceText = $(row).find('td.numeric .js-price').first().text();
        const m = priceText.match(/\$([\d,]+\.?\d*)/);
        if (m) prices.push(parseFloat(m[1].replace(/,/g, '')));
      });
      if (prices.length) marketPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length * 100) / 100;
    }
    if (!marketPrice) {
      const priceEl = $('#manual_only_price');
      if (priceEl.length) {
        const m = priceEl.text().match(/\$([\d,]+\.?\d*)/);
        if (m) marketPrice = parseFloat(m[1].replace(/,/g, ''));
      }
    }
  } catch (err) { console.error("[Pikachu57] PC error:", err.message); }

  const buyItNow = [];
  const auctions = [];
  for (const l of allListings) {
    const difference = marketPrice != null ? l.price - marketPrice : null;
    const pctOverMarket = marketPrice != null && marketPrice > 0 ? ((l.price - marketPrice) / marketPrice) * 100 : null;
    const item = { name: "Pikachu 57", title: l.title, price: l.price, marketPrice, difference, pctOverMarket,
      ebayUrl: l.link, pricechartingUrl, verified: !!marketPrice, location: l.location };
    if (l.isAuction) auctions.push(item); else buyItNow.push(item);
  }
  function countryOrder(loc) {
    const x = (loc || '').toLowerCase();
    if (x.includes('united states')) return 0;
    if (x.includes('canada')) return 1;
    if (x.includes('united kingdom')) return 2;
    return 3;
  }
  const sortFn = (a, b) => {
    const ca = countryOrder(a.location), cb = countryOrder(b.location);
    if (ca !== cb) return ca - cb;
    if (a.pctOverMarket == null) return 1;
    if (b.pctOverMarket == null) return -1;
    return a.pctOverMarket - b.pctOverMarket;
  };
  buyItNow.sort(sortFn); auctions.sort(sortFn);
  cachedPikachu57 = { buyItNow, auctions, marketPrice, pricechartingUrl };
  pikachu57LastUpdate = new Date().toISOString();
  console.log(`[Pikachu57] Done. ${buyItNow.length} BIN, ${auctions.length} auctions. Market=${marketPrice}`);
}

app.get("/api/pikachu57", async (req, res) => {
  const stale = !cachedPikachu57 || !pikachu57LastUpdate ||
    (Date.now() - new Date(pikachu57LastUpdate).getTime()) > 60 * 60 * 1000;
  if (stale) {
    try { await fetchPikachu57(); } catch (e) { console.error(e); }
  }
  res.json({ ...(cachedPikachu57 || { buyItNow: [], auctions: [] }), lastUpdate: pikachu57LastUpdate, inProgress: pikachu57InProgress });
});

// ===== PERFECT ORDER =====
const PERFECT_ORDER_CARDS = [
  {n:1,name:"Spinarak",v:"N"},{n:1,name:"Spinarak",v:"R"},{n:2,name:"Ariados",v:"N"},{n:2,name:"Ariados",v:"R"},
  {n:3,name:"Shaymin",v:"N"},{n:3,name:"Shaymin",v:"R"},{n:4,name:"Snivy",v:"N"},{n:4,name:"Snivy",v:"R"},
  {n:5,name:"Servine",v:"N"},{n:5,name:"Servine",v:"R"},{n:6,name:"Serperior",v:"H"},{n:6,name:"Serperior",v:"R"},
  {n:7,name:"Scatterbug",v:"N"},{n:7,name:"Scatterbug",v:"R"},{n:8,name:"Spewpa",v:"N"},{n:8,name:"Spewpa",v:"R"},
  {n:9,name:"Vivillon",v:"N"},{n:9,name:"Vivillon",v:"R"},{n:10,name:"Rowlet",v:"N"},{n:10,name:"Rowlet",v:"R"},
  {n:11,name:"Dartrix",v:"N"},{n:11,name:"Dartrix",v:"R"},{n:12,name:"Decidueye ex",v:"H"},
  {n:13,name:"Fletchinder",v:"N"},{n:13,name:"Fletchinder",v:"R"},{n:14,name:"Talonflame",v:"N"},{n:14,name:"Talonflame",v:"R"},
  {n:15,name:"Salandit",v:"N"},{n:15,name:"Salandit",v:"R"},{n:16,name:"Salazzle ex",v:"H"},
  {n:17,name:"Turtonator",v:"N"},{n:17,name:"Turtonator",v:"R"},{n:18,name:"Seel",v:"N"},{n:18,name:"Seel",v:"R"},
  {n:19,name:"Dewgong",v:"H"},{n:19,name:"Dewgong",v:"R"},{n:20,name:"Staryu",v:"N"},{n:20,name:"Staryu",v:"R"},
  {n:21,name:"Mega Starmie ex",v:"H"},{n:22,name:"Lapras ex",v:"H"},
  {n:23,name:"Amaura",v:"N"},{n:23,name:"Amaura",v:"R"},{n:24,name:"Aurorus",v:"H"},{n:24,name:"Aurorus",v:"R"},
  {n:25,name:"Volcanion",v:"N"},{n:25,name:"Volcanion",v:"R"},{n:26,name:"Shinx",v:"N"},{n:26,name:"Shinx",v:"R"},
  {n:27,name:"Luxio",v:"N"},{n:27,name:"Luxio",v:"R"},{n:28,name:"Luxray",v:"H"},{n:28,name:"Luxray",v:"R"},
  {n:29,name:"Dedenne",v:"N"},{n:29,name:"Dedenne",v:"R"},{n:30,name:"Clefairy",v:"N"},{n:30,name:"Clefairy",v:"R"},
  {n:31,name:"Mega Clefable ex",v:"H"},{n:32,name:"Mawile",v:"N"},{n:32,name:"Mawile",v:"R"},
  {n:33,name:"Espurr",v:"N"},{n:33,name:"Espurr",v:"R"},{n:34,name:"Meowstic",v:"N"},{n:34,name:"Meowstic",v:"R"},
  {n:35,name:"Spritzee",v:"N"},{n:35,name:"Spritzee",v:"R"},{n:36,name:"Aromatisse",v:"N"},{n:36,name:"Aromatisse",v:"R"},
  {n:37,name:"Nosepass",v:"N"},{n:37,name:"Nosepass",v:"R"},{n:38,name:"Probopass",v:"N"},{n:38,name:"Probopass",v:"R"},
  {n:39,name:"Hippopotas",v:"N"},{n:39,name:"Hippopotas",v:"R"},{n:40,name:"Hippowdon",v:"N"},{n:40,name:"Hippowdon",v:"R"},
  {n:41,name:"Landorus",v:"H"},{n:41,name:"Landorus",v:"R"},{n:42,name:"Binacle",v:"N"},{n:42,name:"Binacle",v:"R"},
  {n:43,name:"Barbaracle",v:"N"},{n:43,name:"Barbaracle",v:"R"},{n:44,name:"Tyrunt",v:"N"},{n:44,name:"Tyrunt",v:"R"},
  {n:45,name:"Tyrantrum",v:"H"},{n:45,name:"Tyrantrum",v:"R"},{n:46,name:"Hawlucha",v:"N"},{n:46,name:"Hawlucha",v:"R"},
  {n:47,name:"Mega Zygarde ex",v:"H"},{n:48,name:"Gastly",v:"N"},{n:48,name:"Gastly",v:"R"},
  {n:49,name:"Haunter",v:"N"},{n:49,name:"Haunter",v:"R"},{n:50,name:"Gengar",v:"H"},{n:50,name:"Gengar",v:"R"},
  {n:51,name:"Skorupi",v:"N"},{n:51,name:"Skorupi",v:"R"},{n:52,name:"Drapion",v:"N"},{n:52,name:"Drapion",v:"R"},
  {n:53,name:"Yveltal ex",v:"H"},{n:54,name:"Chien-Pao",v:"H"},{n:54,name:"Chien-Pao",v:"R"},
  {n:55,name:"Mega Skarmory ex",v:"H"},{n:56,name:"Honedge",v:"N"},{n:56,name:"Honedge",v:"R"},
  {n:57,name:"Doublade",v:"N"},{n:57,name:"Doublade",v:"R"},{n:58,name:"Aegislash",v:"N"},{n:58,name:"Aegislash",v:"R"},
  {n:59,name:"Klefki",v:"N"},{n:59,name:"Klefki",v:"R"},{n:60,name:"Rattata",v:"N"},{n:60,name:"Rattata",v:"R"},
  {n:61,name:"Raticate",v:"N"},{n:61,name:"Raticate",v:"R"},{n:62,name:"Meowth ex",v:"H"},
  {n:63,name:"Snorlax",v:"N"},{n:63,name:"Snorlax",v:"R"},{n:64,name:"Bunnelby",v:"N"},{n:64,name:"Bunnelby",v:"R"},
  {n:65,name:"Diggersby",v:"N"},{n:65,name:"Diggersby",v:"R"},{n:66,name:"Fletchling",v:"N"},{n:66,name:"Fletchling",v:"R"},
  {n:67,name:"Furfrou",v:"N"},{n:67,name:"Furfrou",v:"R"},{n:68,name:"Antique Jaw Fossil",v:"N"},{n:68,name:"Antique Jaw Fossil",v:"R"},
  {n:69,name:"Antique Sail Fossil",v:"N"},{n:69,name:"Antique Sail Fossil",v:"R"},
  {n:70,name:"Core Memory",v:"N"},{n:70,name:"Core Memory",v:"R"},{n:71,name:"Crushing Hammer",v:"N"},{n:71,name:"Crushing Hammer",v:"R"},
  {n:72,name:"Energy Search",v:"N"},{n:72,name:"Energy Search",v:"R"},{n:73,name:"Energy Swatter",v:"N"},{n:73,name:"Energy Swatter",v:"R"},
  {n:74,name:"Hole-Digging Shovel",v:"N"},{n:74,name:"Hole-Digging Shovel",v:"R"},{n:75,name:"Jacinthe",v:"N"},{n:75,name:"Jacinthe",v:"R"},
  {n:76,name:"Judge",v:"N"},{n:76,name:"Judge",v:"R"},{n:77,name:"Lumiose City",v:"N"},{n:77,name:"Lumiose City",v:"R"},
  {n:78,name:"Lumiose Galette",v:"N"},{n:78,name:"Lumiose Galette",v:"R"},{n:79,name:"Naveen",v:"N"},{n:79,name:"Naveen",v:"R"},
  {n:80,name:"Poke Ball",v:"N"},{n:80,name:"Poke Ball",v:"R"},{n:81,name:"Poke Pad",v:"N"},{n:81,name:"Poke Pad",v:"R"},
  {n:82,name:"Pokemon Catcher",v:"N"},{n:82,name:"Pokemon Catcher",v:"R"},{n:83,name:"Potion",v:"N"},{n:83,name:"Potion",v:"R"},
  {n:84,name:"Rosa's Encouragement",v:"N"},{n:84,name:"Rosa's Encouragement",v:"R"},{n:85,name:"Tarragon",v:"N"},{n:85,name:"Tarragon",v:"R"},
  {n:86,name:"Growing Grass Energy",v:"H"},{n:86,name:"Growing Grass Energy",v:"R"},
  {n:87,name:"Rocky Fighting Energy",v:"H"},{n:87,name:"Rocky Fighting Energy",v:"R"},
  {n:88,name:"Telepathic Psychic Energy",v:"H"},{n:88,name:"Telepathic Psychic Energy",v:"R"},
  {n:89,name:"Spewpa",v:"H"},{n:90,name:"Rowlet",v:"H"},{n:91,name:"Talonflame",v:"H"},{n:92,name:"Aurorus",v:"H"},
  {n:93,name:"Dedenne",v:"H"},{n:94,name:"Clefairy",v:"H"},{n:95,name:"Espurr",v:"H"},{n:96,name:"Probopass",v:"H"},
  {n:97,name:"Drapion",v:"H"},{n:98,name:"Doublade",v:"H"},{n:99,name:"Raticate",v:"H"},
  {n:100,name:"Decidueye ex",v:"H"},{n:101,name:"Salazzle ex",v:"H"},{n:102,name:"Mega Starmie ex",v:"H"},
  {n:103,name:"Mega Clefable ex",v:"H"},{n:104,name:"Mega Zygarde ex",v:"H"},{n:105,name:"Yveltal ex",v:"H"},
  {n:106,name:"Mega Skarmory ex",v:"H"},{n:107,name:"Meowth ex",v:"H"},{n:108,name:"Energy Recycler",v:"H"},
  {n:109,name:"Forest of Vitality",v:"H"},{n:110,name:"Jacinthe",v:"H"},{n:111,name:"Lumiose City",v:"H"},
  {n:112,name:"Naveen",v:"H"},{n:113,name:"Poke Pad",v:"H"},{n:114,name:"Rosa's Encouragement",v:"H"},
  {n:115,name:"Sacred Ash",v:"H"},{n:116,name:"Tarragon",v:"H"},{n:117,name:"Wondrous Patch",v:"H"},
  {n:118,name:"Mega Starmie ex",v:"H"},{n:119,name:"Mega Clefable ex",v:"H"},{n:120,name:"Mega Zygarde ex",v:"H"},
  {n:121,name:"Meowth ex",v:"H"},{n:122,name:"Jacinthe",v:"H"},{n:123,name:"Rosa's Encouragement",v:"H"},
  {n:124,name:"Mega Zygarde ex",v:"H"},
];

function variantLabel(v) { return v === 'N' ? 'Normal' : v === 'R' ? 'Reverse Holo' : 'Holo'; }

// Market prices from Collectr PDF (4/14/26)
const PERFECT_ORDER_PRICES = {'1|N':0.07,'1|R':0.17,'2|N':0.08,'3|N':0.08,'3|R':0.2,'4|N':0.15,'4|R':0.19,'5|N':0.11,'5|R':0.2,'6|H':0.13,'6|R':0.45,'7|N':0.09,'7|R':0.2,'8|N':0.11,'8|R':0.27,'9|N':0.11,'9|R':0.23,'10|N':0.16,'10|R':0.22,'11|N':0.18,'11|R':0.2,'12|H':0.52,'13|N':0.12,'13|R':0.25,'14|N':0.14,'14|R':0.25,'15|N':0.1,'15|R':0.18,'16|H':0.39,'17|N':0.09,'17|R':0.19,'18|N':0.1,'18|R':0.25,'19|H':0.12,'19|R':0.25,'20|N':0.2,'20|R':0.17,'21|H':1.31,'22|H':0.48,'23|N':0.18,'23|R':0.28,'24|H':0.2,'24|R':0.26,'25|N':0.07,'25|R':0.17,'26|N':0.1,'26|R':0.26,'27|N':0.07,'27|R':0.25,'28|H':0.13,'28|R':0.19,'29|N':0.08,'29|R':0.2,'30|N':0.16,'30|R':0.24,'31|H':0.65,'32|N':0.12,'32|R':0.15,'33|N':0.11,'33|R':0.25,'34|N':0.1,'34|R':0.16,'35|N':0.12,'35|R':0.23,'36|N':0.09,'36|R':0.22,'37|N':0.09,'37|R':0.19,'38|N':0.09,'38|R':0.22,'39|N':0.1,'39|R':0.19,'40|N':0.1,'40|R':0.19,'41|H':0.13,'41|R':0.2,'42|N':0.15,'42|R':0.26,'43|N':0.13,'43|R':0.18,'44|N':0.16,'44|R':0.25,'45|H':0.21,'45|R':0.25,'46|N':0.08,'46|R':0.23,'47|H':0.81,'48|N':0.11,'48|R':0.2,'49|N':0.15,'49|R':0.2,'50|H':0.87,'50|R':1.07,'51|N':0.08,'51|R':0.14,'52|N':0.06,'52|R':0.2,'53|H':0.46,'54|H':0.1,'54|R':0.23,'55|H':0.54,'56|N':0.14,'56|R':0.23,'57|N':0.11,'57|R':0.23,'58|N':0.13,'58|R':0.21,'59|N':0.1,'59|R':0.19,'60|N':0.1,'60|R':0.22,'61|N':0.1,'61|R':0.21,'62|H':7.44,'63|N':0.19,'63|R':0.46,'64|N':0.1,'64|R':0.17,'65|N':0.09,'65|R':0.22,'66|N':0.09,'66|R':0.09,'67|N':0.08,'67|R':0.1,'68|N':0.18,'68|R':0.33,'69|N':0.19,'69|R':0.25,'70|N':0.13,'70|R':0.23,'71|N':0.18,'71|R':0.22,'73|N':0.09,'73|R':0.25,'74|N':0.11,'74|R':0.23,'75|N':0.16,'75|R':0.25,'76|N':0.22,'76|R':0.32,'77|N':0.1,'77|R':0.23,'78|N':0.09,'78|R':0.2,'79|N':0.11,'79|R':0.22,'80|N':0.11,'80|R':0.24,'81|N':0.8,'81|R':0.97,'82|N':0.1,'82|R':0.24,'83|N':0.14,'83|R':0.19,'84|N':0.2,'84|R':0.22,'85|N':0.17,'85|R':0.29,'86|H':0.24,'86|R':0.27,'87|H':0.21,'87|R':0.35,'88|H':0.74,'88|R':0.61,'89|H':2.72,'90|H':7.43,'91|H':3.69,'92|H':5.09,'93|H':7.41,'94|H':32.25,'95|H':5.41,'96|H':1.42,'97|H':1.52,'98|H':4.18,'99|H':4.03,'100|H':3.92,'101|H':2.27,'102|H':12.17,'103|H':6.79,'104|H':12.15,'105|H':6.94,'106|H':7.19,'107|H':21.95,'108|H':3.37,'109|H':8.17,'110|H':5.08,'111|H':2.93,'112|H':2.6,'113|H':23.34,'114|H':12.78,'115|H':3.86,'116|H':4.42,'117|H':5.01,'118|H':85.68,'119|H':69.45,'120|H':103.24,'121|H':169.62,'122|H':33.91,'123|H':83.97,'124|H':181.19};

function extractShipping(item) {
  const s = (item.shippingOptions && item.shippingOptions[0] && item.shippingOptions[0].shippingCost) || null;
  if (!s || s.value == null) return 0;
  return parseFloat(s.value) || 0;
}

let cachedPerfectOrder = null;
let perfectOrderLastUpdate = null;
let perfectOrderInProgress = false;

async function fetchPerfectOrder() {
  if (perfectOrderInProgress) return;
  perfectOrderInProgress = true;
  console.log("[PerfectOrder] Fetching...");
  const results = [];
  try {
    // Group by unique card number to reduce queries; filter variant client-side from returned titles
    const byNumber = new Map();
    for (const c of PERFECT_ORDER_CARDS) {
      if (!byNumber.has(c.n)) byNumber.set(c.n, []);
      byNumber.get(c.n).push(c);
    }

    for (const [num, variants] of byNumber) {
      const padded = String(num).padStart(3, '0');
      const baseName = variants[0].name;
      // Use set name + number for query
      const query = `${baseName} ${padded}/088 perfect order -bgs -cgc -sgc -lot -bundle`;
      const filters = "price:[0.01..5000],priceCurrency:USD,buyingOptions:{FIXED_PRICE}";

      // For each variant, find cheapest BIN
      const perVariantBest = { N: null, R: null, H: null };

      try {
        const result = await ebaySearch(query, "183454", 50, 0, filters, "price");
        const items = result.itemSummaries || [];
        for (const item of items) {
          const title = (item.title || "").toLowerCase();
          if (!title.includes(`${padded}/088`) && !title.includes(`${num}/088`)) continue;
          if (!title.includes(baseName.toLowerCase().split(' ')[0])) continue;
          if (/\b(jpn|japanese|japan|korean|chinese)\b/i.test(title)) continue;
          if (/\b(lot|bundle|pack|booster|box|sealed|etb|proxy|custom)\b/i.test(title)) continue;

          const price = extractPrice(item);
          if (price == null) continue;
          const shipping = extractShipping(item);
          const total = price + shipping;

          // classify variant
          let variant = 'N';
          if (/reverse\s*holo/i.test(title)) variant = 'R';
          else if (/holo|foil/i.test(title) && !/reverse/i.test(title)) variant = 'H';

          const location = countryFromLocation(extractLocation(item));
          if (!location || !/united states/i.test(location)) continue;
          const numericId = (item.itemId || '').replace(/v1\|/g, '').replace(/\|.*/g, '');
          const ebayUrl = item.itemWebUrl || `https://www.ebay.com/itm/${numericId}`;

          const entry = { price, shipping, total, title: item.title, ebayUrl, location };
          if (!perVariantBest[variant] || perVariantBest[variant].total > total) {
            perVariantBest[variant] = entry;
          }
        }
      } catch (err) {
        console.error(`[PerfectOrder] API err for #${num}:`, err.message);
      }

      for (const c of variants) {
        const best = perVariantBest[c.v];
        const marketPrice = PERFECT_ORDER_PRICES[`${c.n}|${c.v}`] != null ? PERFECT_ORDER_PRICES[`${c.n}|${c.v}`] : null;
        const listPrice = best ? best.total : null;
        const difference = (listPrice != null && marketPrice != null) ? listPrice - marketPrice : null;
        const pctOverMarket = (listPrice != null && marketPrice != null && marketPrice > 0)
          ? ((listPrice - marketPrice) / marketPrice) * 100 : null;
        const pcQuery = `perfect order ${c.name} ${c.n}`;
        const pricechartingUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(pcQuery)}&type=prices`;
        results.push({
          number: c.n, name: c.name, variant: variantLabel(c.v),
          variantKey: c.v,
          price: listPrice,
          basePrice: best ? best.price : null,
          shipping: best ? best.shipping : null,
          marketPrice, difference, pctOverMarket,
          pricechartingUrl,
          ebayUrl: best ? best.ebayUrl : null,
          location: best ? best.location : null,
          title: best ? best.title : null,
        });
      }

      await delay(150, 350);
    }

    cachedPerfectOrder = results;
    perfectOrderLastUpdate = new Date().toISOString();
    console.log(`[PerfectOrder] Done. ${results.length} rows, ${results.filter(r=>r.price).length} with listings.`);
  } catch (e) {
    console.error("[PerfectOrder] Error:", e);
  } finally {
    perfectOrderInProgress = false;
  }
}

app.get("/api/perfect-order", async (req, res) => {
  const stale = !cachedPerfectOrder || !perfectOrderLastUpdate ||
    (Date.now() - new Date(perfectOrderLastUpdate).getTime()) > 6 * 60 * 60 * 1000;
  if (stale && !perfectOrderInProgress) {
    fetchPerfectOrder().catch(()=>{});
  }
  res.json({ cards: cachedPerfectOrder || [], lastUpdate: perfectOrderLastUpdate, inProgress: perfectOrderInProgress });
});

const PORT = process.env.PORT || 3456;
(async () => {
  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  server.keepAliveTimeout = 600000;
  server.headersTimeout = 600000;

  // On deploy: use last live PriceCharting prices from cache, or hardcoded fallback if none
  setTimeout(async () => {
    let lastLive = null;
    let lastLiveUpdate = null;
    try {
      if (fs.existsSync(CACHE_FILE)) {
        const cacheData = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
        lastLive = cacheData.lastLiveMarketPrices;
        lastLiveUpdate = cacheData.lastLiveMarketPricesUpdate;
      }
    } catch {}

    if (lastLive && lastLive.length > 0) {
      console.log(`[Startup] Using last live PriceCharting prices from ${lastLiveUpdate}`);
      cachedMarketPrices = lastLive;
      marketPricesLastUpdate = lastLiveUpdate;
    } else {
      console.log("[Startup] No live prices cached, using hardcoded fallback...");
      cachedMarketPrices = buildFallbackMarketPrices();
      marketPricesLastUpdate = "2026-03-19T00:00:00Z (fallback)";
    }
    saveCache();
    // Run deals scan with whatever prices we have
    await runAutoScan();
    // Try fetching live prices in background (will use fallback if blocked)
    fetchAllMarketPrices().then(() => runAutoScan()).catch(() => {});
  }, 3000);

  // Deals scan: every clock hour
  function scheduleNextHour() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(next.getHours() + 1, 0, 0, 0);
    const msUntil = next - now;
    console.log(`[Scheduler] Next deals scan at ${next.toISOString()} (in ${Math.round(msUntil/60000)}m)`);
    setTimeout(async () => {
      await runAutoScan();
      scheduleNextHour();
    }, msUntil);
  }
  scheduleNextHour();

  // Market prices: once a day at midnight Pacific
  function scheduleNextMidnight() {
    const now = new Date();
    // Next midnight Pacific = next day 07:00 UTC (or 08:00 UTC during DST)
    const pacific = new Date(now.toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
    const tomorrow = new Date(pacific);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    // Convert back to UTC offset
    const midnightPT = new Date(now.getTime() + (tomorrow - pacific));
    const msUntil = midnightPT - now;
    console.log(`[Scheduler] Next market prices at midnight PT (in ${Math.round(msUntil/3600000)}h)`);
    setTimeout(async () => {
      await fetchAllMarketPrices();
      await runAutoScan(); // re-run deals to pick up new prices
      scheduleNextMidnight();
    }, msUntil);
  }
  scheduleNextMidnight();
})();
process.stdin.resume();
