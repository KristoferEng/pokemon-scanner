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
  // Exclude trainer cards and energy cards
  if (/\b(doll|computer search|devolution spray|impostor|item finder|lass|pokemon breeder|pokemon trader|scoop up|super energy removal|defender|energy retrieval|full heal|maintenance|pluspower|pokemon center|pokemon flute|pokedex|professor oak|revive|super potion|bill|energy removal|gust of wind|potion|switch|double colorless|fighting energy|fire energy|grass energy|lightning energy|psychic energy|water energy)\b/i.test(t)) return null;

  const numMatch = t.match(/(?:#|no\.?\s*)?(\d{1,3})\s*\/\s*102/) || (t.includes('base set') && t.match(/(?:#|no\.?\s*)(\d{1,3})\b/));
  if (numMatch) {
    const num = parseInt(numMatch[1]);
    if (num >= 1 && num <= 69) {
      const card = BASE_SET_CARDS.find((c) => c.number === num);
      if (card) return card.name;
    }
    return null;
  }

  if (t.includes('base set')) {
    const sorted = [...BASE_SET_CARDS].filter(c => c.number <= 69).sort((a, b) => b.name.length - a.name.length);
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
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      cachedResults, lastScanTime, cachedMarketPrices, marketPricesLastUpdate,
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
app.get("/api/cached-results", (req, res) => {
  res.json({ results: cachedResults, lastScanTime, scanInProgress });
});

app.get("/api/market-prices", (req, res) => {
  res.json({ prices: cachedMarketPrices, lastUpdate: marketPricesLastUpdate });
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
const FALLBACK_PSA10 = {
  "Alakazam":1620.64,"Blastoise":6263.98,"Chansey":3051,"Charizard":12221.02,"Clefairy":3268.50,
  "Gyarados":1790.37,"Hitmonchan":1248.80,"Machamp":null,"Magneton":861.22,"Mewtwo":2750.50,
  "Nidoking":1150.92,"Ninetales":927.70,"Poliwrath":947.29,"Raichu":2500,"Venusaur":3111.21,
  "Zapdos":1229.72,"Beedrill":115,"Dragonair":200,"Dugtrio":170,"Electabuzz":155,
  "Electrode":120,"Pidgeotto":215,"Arcanine":450,"Charmeleon":350,"Dewgong":100,
  "Dratini":120,"Farfetch'd":100,"Growlithe":175,"Haunter":170,"Ivysaur":295,
  "Jynx":100,"Kadabra":110,"Kakuna":100,"Machoke":100,"Magikarp":200,
  "Magmar":100,"Nidorino":100,"Poliwhirl":100,"Porygon":150,"Raticate":100,
  "Seel":100,"Wartortle":300,"Abra":100,"Bulbasaur":450,"Caterpie":150,
  "Charmander":750,"Diglett":100,"Doduo":100,"Drowzee":100,"Gastly":120,
  "Koffing":100,"Machop":100,"Magnemite":100,"Metapod":100,"Nidoran":100,
  "Onix":120,"Pidgey":100,"Pikachu":800,"Poliwag":100,"Ponyta":120,
  "Rattata":100,"Sandshrew":100,"Squirtle":500,"Starmie":120,"Staryu":100,
  "Tangela":100,"Voltorb":100,"Vulpix":150,"Weedle":100,
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
      const priceEl = $pc('#manual_only_price');
      if (priceEl.length) {
        const match = priceEl.text().match(/\$([\d,]+\.?\d*)/);
        if (match) psa10Price = parseFloat(match[1].replace(/,/g, ''));
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
  console.log(`[MarketPrices] Done. ${successCount} live prices, ${prices.length - successCount} fallback. Cached.`);
}

// ===== ENDING AUCTIONS: PSA 10 auctions for specific cards =====
const AUCTION_CARDS = ["dragonite", "pikachu", "vulpix", "wigglytuff"];
const MAX_PER_CARD = 10;

// PriceCharting lookup cache keyed by search term
let auctionPriceCache = {};

async function getAuctionCardPrice(title) {
  // Build a search key from the eBay title: card name + set + card number
  // e.g. "2019 POKEMON SUN & MOON UNIFIED MINDS #152 DRAGONITE GX PSA 10" -> "pokemon unified minds 152 dragonite gx"
  let searchKey = title
    .replace(/psa\s*10/i, '').replace(/gem\s*mint/i, '')
    .replace(/\b\d{4}\b/g, '') // remove years
    .replace(/\b(graded|slab|card|tcg|holo|rare|eng?|en\b)\b/gi, '')
    .replace(/[^\w\s#\/&-]/g, ' ').replace(/\s+/g, ' ').trim();

  if (auctionPriceCache[searchKey] !== undefined) return auctionPriceCache[searchKey];

  try {
    const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(searchKey)}&type=prices`;
    const html = await fetchPage(searchUrl);
    const $ = cheerio.load(html);
    const firstResult = $('table#games_table a[href*="game/"]').first();
    if (firstResult.length) {
      const href = firstResult.attr('href');
      const pcUrl = href.startsWith('http') ? href : 'https://www.pricecharting.com' + href;
      const detailHtml = await fetchPage(pcUrl);
      const $d = cheerio.load(detailHtml);
      let marketPrice = null;
      const priceEl = $d('#manual_only_price');
      if (priceEl.length) {
        const match = priceEl.text().match(/\$([\d,]+\.?\d*)/);
        if (match) marketPrice = parseFloat(match[1].replace(/,/g, ''));
      }
      console.log(`[AuctionPC] "${searchKey.substring(0,50)}" -> $${marketPrice || 'N/A'} (${pcUrl})`);
      auctionPriceCache[searchKey] = { marketPrice, pcUrl };
      return auctionPriceCache[searchKey];
    }
  } catch (err) {
    console.error(`[AuctionPC] Error: ${err.message}`);
  }
  auctionPriceCache[searchKey] = null;
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
      const pc = await getAuctionCardPrice(a.title);
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
    // If refresh requested or no cache, fetch fresh
    const forceRefresh = req.query.refresh === "1";
    if (forceRefresh || !cachedEndingAuctions) {
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

const PORT = process.env.PORT || 3456;
(async () => {
  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  server.keepAliveTimeout = 600000;
  server.headersTimeout = 600000;

  // On deploy: use fallback prices immediately if no cache, then try live fetch
  setTimeout(async () => {
    if (!cachedMarketPrices || cachedMarketPrices.length === 0) {
      console.log("[Startup] No cached market prices, loading fallback...");
      cachedMarketPrices = buildFallbackMarketPrices();
      marketPricesLastUpdate = "2026-03-18T00:00:00Z (fallback)";
      saveCache();
    } else {
      console.log("[Startup] Using cached market prices from", marketPricesLastUpdate);
    }
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
