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
let marketPricesInProgress = false;
let cachedCollectionPrices = {};
let collectionPricesInProgress = false;

// New marketplace caches
let cachedFanaticsListings = null;
let fanaticsLastUpdate = null;
let fanaticsInProgress = false;
let cachedMercariListings = null;
let mercariLastUpdate = null;
let mercariInProgress = false;
let cachedTcgListings = null;
let tcgLastUpdate = null;
let tcgInProgress = false;

function saveCache() {
  try {
    // Preserve last live PriceCharting prices separately for fallback on restart
    const existing = fs.existsSync(CACHE_FILE) ? JSON.parse(fs.readFileSync(CACHE_FILE, "utf8")) : {};
    const isLive = marketPricesLastUpdate && !String(marketPricesLastUpdate).includes('fallback');
    fs.writeFileSync(CACHE_FILE, JSON.stringify({
      cachedResults, lastScanTime, cachedMarketPrices, marketPricesLastUpdate,
      cachedCollectionPrices,
      cachedFanaticsListings, fanaticsLastUpdate,
      cachedMercariListings, mercariLastUpdate,
      cachedTcgListings, tcgLastUpdate,
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
      cachedCollectionPrices = data.cachedCollectionPrices || {};
      cachedFanaticsListings = data.cachedFanaticsListings || null;
      fanaticsLastUpdate = data.fanaticsLastUpdate || null;
      cachedMercariListings = data.cachedMercariListings || null;
      mercariLastUpdate = data.mercariLastUpdate || null;
      cachedTcgListings = data.cachedTcgListings || null;
      tcgLastUpdate = data.tcgLastUpdate || null;
      console.log("[Cache] Loaded from disk. LastScan:", lastScanTime);
    }
  } catch (e) { console.error("[Cache] Load error:", e.message); }
}

loadCache();

// Register all API routes up front
app.post("/api/trigger-scan", (req, res) => {
  if (scanInProgress || marketPricesInProgress) {
    return res.json({ status: "already_running" });
  }
  scanInProgress = true;
  (async () => {
    try {
      marketPricesInProgress = true;
      await fetchAllMarketPrices();
    } catch (e) { console.error("[TriggerScan] market refresh error:", e.message); }
    finally { marketPricesInProgress = false; }
    await runAutoScan({ force: true });
  })().catch((e) => { console.error("[TriggerScan]", e); scanInProgress = false; marketPricesInProgress = false; });
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

app.post("/api/trigger-market", (req, res) => {
  if (marketPricesInProgress) return res.json({ status: "already_running" });
  marketPricesInProgress = true;
  fetchAllMarketPrices().catch(() => {}).finally(() => { marketPricesInProgress = false; });
  res.json({ status: "started" });
});

app.post("/api/trigger-collection", (req, res) => {
  if (collectionPricesInProgress) return res.json({ status: "already_running" });
  const items = (req.body && Array.isArray(req.body.items)) ? req.body.items : [];
  if (!items.length) return res.json({ status: "no_items" });
  collectionPricesInProgress = true;
  fetchCollectionPrices(items)
    .catch((e) => console.error("[CollectionPrices]", e))
    .finally(() => { collectionPricesInProgress = false; saveCache(); });
  res.json({ status: "started", count: items.length });
});

app.get("/api/collection-prices", (req, res) => {
  res.json({ prices: cachedCollectionPrices, inProgress: collectionPricesInProgress });
});

async function fetchCollectionPrices(items) {
  console.log(`[CollectionPrices] Scraping ${items.length} items...`);
  for (const item of items) {
    const pcUrl = item.pc;
    if (!pcUrl) continue;
    try {
      const fragMatch = pcUrl.match(/#completed-auctions(?:-([\w-]+))?/);
      const suffix = item.section || (fragMatch && fragMatch[1]) || 'used';
      const html = await fetchPage(pcUrl);
      const $ = cheerio.load(html);
      const section = $(`div.completed-auctions-${suffix}`);
      const comps = [];
      section.find('tbody tr').each((i, row) => {
        if (comps.length >= 5) return false;
        const priceText = $(row).find('td.numeric .js-price').first().text();
        const m = priceText.match(/\$([\d,]+\.?\d*)/);
        if (m) comps.push(parseFloat(m[1].replace(/,/g, '')));
      });
      if (comps.length > 0) {
        let avg = comps.reduce((a, b) => a + b, 0) / comps.length;
        if (typeof item.discountPct === 'number' && item.discountPct > 0 && item.discountPct < 1) {
          avg = avg * (1 - item.discountPct);
        }
        const price = Math.round(avg * 100) / 100;
        cachedCollectionPrices[pcUrl] = { price, compCount: comps.length, section: suffix, lastUpdate: new Date().toISOString() };
        console.log(`[CollectionPrices] ${pcUrl.split('/').pop()} (${suffix}): $${price} from ${comps.length} comps`);
      } else {
        cachedCollectionPrices[pcUrl] = { price: null, compCount: 0, section: suffix, lastUpdate: new Date().toISOString() };
        console.log(`[CollectionPrices] ${pcUrl.split('/').pop()} (${suffix}): no comps found`);
      }
    } catch (e) {
      console.error(`[CollectionPrices] Error for ${pcUrl}:`, e.message);
    }
    await delay(1000, 2000);
  }
  console.log(`[CollectionPrices] Done.`);
}

// ===== AUTO-SCAN =====

async function runAutoScan(opts = {}) {
  if (!opts.force && scanInProgress) return;
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
      // Use average of last 5 comps from PSA 10 sold listings
      const psa10Section = $pc('div.completed-auctions-manual-only');
      if (psa10Section.length) {
        const prices = [];
        psa10Section.find('tbody tr').each((i, row) => {
          if (prices.length >= 5) return false;
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

// ============================================================================
// MULTI-SOURCE SCRAPERS: Fanatics Collect, Mercari, TCGplayer
// ============================================================================

// Identify base set card from a listing title. Returns { cardName, isOneOfOne } or null.
// Same exclusion rules as identifyCard, but a bit more lenient for non-eBay sources.
function identifyBaseSetCard(title) {
  const t = (title || '').toLowerCase();
  if (!/psa\s*10/i.test(title)) return null;
  // If title also mentions any other PSA grade (PSA 1..9), reject — likely two-card listing
  if (/\bpsa\s*[1-9](\.\d)?\b/i.test(t)) return null;
  // Reject sold / completed listings
  if (/\b(sold|completed|ended|out\s*of\s*stock)\b/i.test(t)) return null;
  if (/\b(bgs|cgc|sgc|ace|ags|beckett)\b/i.test(title)) return null;
  if (/\b(pack|booster|box|sealed|lot|bundle|case|etb|complete\s*set|wrapper|artwork|deck)\b/i.test(t)) return null;
  if (/\b(raw|ungraded)\b/i.test(t)) return null;
  if (/shadowless|1st\s*edition|first\s*edition|1st\s*ed\b/i.test(t)) return null;
  if (/base\s*set\s*2|base\s*ii|base\s*2\b|celebrations|classic\s*collection|legendary\s*collection|evolutions|reprint|world\s*championship/i.test(t)) return null;
  if (/\b(japanese|japan|jpn|korean|chinese|french|german|italian|spanish|portuguese)\b/i.test(t)) return null;
  // Reject custom / fan-made / proxy
  if (/\b(custom|fan\s*made|proxy|replica|hand\s*made)\b/i.test(t)) return null;
  // Reject other set Pokemon EX cards (e.g. SV Charizard EX) — base set has no EX cards
  if (/\b(ex|gx|vmax|v-max|vstar|tag\s*team|prime|sv\d|swsh|xy)\b/i.test(t) && !/\b(beedrill|hitmon|magneto|exegg|exec)/i.test(t)) return null;

  const numMatch = t.match(/(?:#|no\.?\s*)?(\d{1,3})\s*\/\s*102/) || (t.includes('base set') && t.match(/(?:#|no\.?\s*)(\d{1,3})\b/));
  if (numMatch) {
    const num = parseInt(numMatch[1]);
    if (num >= 1 && num <= 102) {
      const card = BASE_SET_CARDS.find((c) => c.number === num);
      if (card) return card.name;
    }
  }
  // Fallback: match by name within "base set" context
  if (t.includes('base set') || t.includes('1999')) {
    const sorted = [...BASE_SET_CARDS].sort((a, b) => b.name.length - a.name.length);
    for (const card of sorted) {
      if (t.includes(card.name.toLowerCase())) return card.name;
    }
  }
  return null;
}

function buildItemFromListing(rawListing, sourceName) {
  const cardName = identifyBaseSetCard(rawListing.title);
  if (!cardName) return null;
  const marketEntry = (cachedMarketPrices || []).find(m => m.name === cardName);
  const marketPrice = marketEntry ? marketEntry.psa10Price : (FALLBACK_PSA10[cardName] || null);
  const pricechartingUrl = marketEntry ? marketEntry.pricechartingUrl : null;
  const difference = marketPrice != null && rawListing.price != null ? rawListing.price - marketPrice : null;
  const pctOverMarket = marketPrice != null && marketPrice > 0 && rawListing.price != null
    ? ((rawListing.price - marketPrice) / marketPrice) * 100 : null;
  return {
    source: sourceName,
    name: cardName,
    title: rawListing.title,
    price: rawListing.price,
    marketPrice,
    difference,
    pctOverMarket,
    listingUrl: rawListing.url,
    pricechartingUrl,
    isAuction: !!rawListing.isAuction,
    auctionEndsAt: rawListing.endsAt || null,
    bidCount: rawListing.bidCount,
    location: rawListing.location || '',
    listedAt: rawListing.listedAt || null,
    verified: !!marketPrice,
  };
}

function sortListings(items) {
  items.sort((a, b) => {
    if (a.pctOverMarket == null && b.pctOverMarket == null) return 0;
    if (a.pctOverMarket == null) return 1;
    if (b.pctOverMarket == null) return -1;
    return a.pctOverMarket - b.pctOverMarket;
  });
  return items;
}

// ===== FANATICS COLLECT (GraphQL) =====
async function fanaticsGraphQL(query, vars) {
  const resp = await fetch("https://app.fanaticscollect.com/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Origin": "https://www.fanaticscollect.com",
      "Referer": "https://www.fanaticscollect.com/",
      "User-Agent": PC_UA,
    },
    body: JSON.stringify({ operationName: "q", query, variables: vars || {} }),
  });
  if (!resp.ok) throw new Error(`Fanatics GraphQL ${resp.status}`);
  const json = await resp.json();
  if (json.errors) throw new Error(`Fanatics GraphQL: ${JSON.stringify(json.errors).substring(0, 200)}`);
  return json.data;
}

async function fetchFanaticsListings() {
  console.log("[Fanatics] Fetching PSA 10 1999 base set listings...");

  // Step 1: search Algolia for matching listing UUIDs
  const searchQueries = [
    "psa 10 1999 base set",
    "psa 10 base set unlimited",
    "psa 10 pokemon base set",
  ];

  const seenIds = new Set();
  const allUuids = [];
  for (const q of searchQueries) {
    try {
      const data = await fanaticsGraphQL(
        `query q { collectAlgoliaSearch(requests: [{indexName: LISTING_LOWEST_PRICE, query: "${q.replace(/"/g, '\\"')}"}]) { hits { listingUuid } } }`
      );
      const hits = data?.collectAlgoliaSearch?.[0]?.hits || [];
      for (const h of hits) {
        if (!seenIds.has(h.listingUuid)) {
          seenIds.add(h.listingUuid);
          allUuids.push(h.listingUuid);
        }
      }
    } catch (e) {
      console.log(`[Fanatics] Search "${q}" error: ${e.message}`);
    }
    await delay(500, 1000);
  }
  console.log(`[Fanatics] Found ${allUuids.length} unique listing UUIDs`);

  // Step 2: fetch each listing (try each type until one works)
  const results = [];
  const types = ['WEEKLY', 'PREMIER', 'BO', 'FIXED_PRICE'];
  const detailQuery = `query q($id: UUID!, $type: CollectListingType!) {
    collectListing(id: $id, type: $type) {
      id title slug listingType status listedAt insertedAt updatedAt bidCount
      currentBid { amountInCents currency }
      buyNowPrice { amountInCents currency }
      askingPrice { amountInCents currency }
      startingPrice { amountInCents currency }
      auction { name endsAt status }
      images
    }
  }`;

  for (const uuid of allUuids.slice(0, 60)) {
    let listing = null;
    let foundType = null;
    for (const type of types) {
      try {
        const data = await fanaticsGraphQL(detailQuery, { id: uuid, type });
        if (data?.collectListing) {
          listing = data.collectListing;
          foundType = type;
          break;
        }
      } catch {}
    }
    if (!listing) continue;

    const title = listing.title || '';

    // Determine price: auction = currentBid (or startingPrice if no bids), otherwise buyNowPrice/askingPrice
    let priceCents = null;
    let isAuction = false;
    if (foundType === 'WEEKLY' || foundType === 'PREMIER') {
      isAuction = true;
      priceCents = (listing.currentBid?.amountInCents > 0 ? listing.currentBid.amountInCents : null)
        ?? listing.startingPrice?.amountInCents
        ?? null;
    } else {
      priceCents = listing.buyNowPrice?.amountInCents ?? listing.askingPrice?.amountInCents ?? null;
    }

    const price = priceCents != null ? priceCents / 100 : null;
    if (price == null || price < 5) continue;

    const cardName = identifyBaseSetCard(title);
    if (!cardName) continue;

    const url = `https://www.fanaticscollect.com/weekly-auction?listing=${listing.id}`;

    const item = buildItemFromListing({
      title,
      price,
      url,
      isAuction,
      endsAt: listing.auction?.endsAt || null,
      bidCount: listing.bidCount || 0,
      listedAt: listing.listedAt || listing.insertedAt || null,
      location: 'United States', // Fanatics is US-based marketplace
    }, 'Fanatics Collect');
    if (item) results.push(item);
    await delay(250, 500);
  }

  console.log(`[Fanatics] ${results.length} valid base set PSA 10 listings`);
  cachedFanaticsListings = sortListings(results);
  fanaticsLastUpdate = new Date().toISOString();
  saveCache();
  return cachedFanaticsListings;
}

// ===== MERCARI (via Jina reader proxy to bypass Cloudflare) =====
async function jinaFetch(url) {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const resp = await fetch(jinaUrl, { headers: { 'User-Agent': PC_UA } });
  if (!resp.ok) throw new Error(`Jina ${resp.status}`);
  return resp.text();
}

async function fetchMercariListings() {
  console.log("[Mercari] Fetching PSA 10 1999 base set listings via Jina...");

  // Sort by newest so we get recent posts; "last 2 months" filter applied later.
  // Use multiple queries to broaden coverage.
  const searchUrls = [
    'https://www.mercari.com/search/?keyword=psa+10+1999+base+set+pokemon&sortBy=2&orderBy=1', // sortBy=2 = listed_time
    'https://www.mercari.com/search/?keyword=psa+10+pokemon+base+set+unlimited&sortBy=2&orderBy=1',
    'https://www.mercari.com/search/?keyword=1999+base+set+psa+10&sortBy=2&orderBy=1',
  ];

  const seenItemIds = new Set();
  const allRaw = [];
  for (const url of searchUrls) {
    try {
      const text = await jinaFetch(url);
      // Match links of the form: [![Image N: title](image_url?_=TIMESTAMP) optional discount label title $price[$origPrice]](https://www.mercari.com/us/item/<id>/...)
      // The full listing markdown is on a single line in jina output, so
      // restrict the "middle" group to non-newline characters and require the
      // image URL to be the Mercari image CDN with a timestamp parameter.
      const linkRe = /\[!\[Image\s*\d+:\s*([^\]]*?)\]\((https:\/\/u-mercari-images\.mercdn\.net\/[^)]+_=\d+)\)([^\n]*?)\]\(https:\/\/www\.mercari\.com\/us\/item\/(m\d+)\/[^)]*\)/g;
      let m;
      while ((m = linkRe.exec(text)) !== null) {
        const altTitle = m[1].trim();
        const imageUrl = m[2];
        const middle = m[3].trim();
        const itemId = m[4];
        if (seenItemIds.has(itemId)) continue;

        // Extract price from middle (the part between image and item URL)
        // Format examples:
        //   "1999 Pokémon TCG Base Set Charmeleon #24 PSA 10 $259.00"
        //   "25% [discount-icon] Vintage 1999-2000 pokemon base set $75.00$100.00"
        const priceMatches = middle.match(/\$([0-9][\d,]*\.\d{2})/g) || [];
        if (!priceMatches.length) continue;
        const prices = priceMatches.map(p => parseFloat(p.replace(/[$,]/g, '')));
        // Lowest is the asking/sale price; sometimes second is original price
        const price = prices[0];

        // Title: try to extract from middle by stripping the price and discount %
        let title = middle.replace(/\d+%/g, '').replace(/\$[0-9][\d,]*\.\d{2}/g, '').trim();
        if (!title || title.length < 6) title = altTitle;
        title = title.replace(/\s+/g, ' ').trim();

        // Updated timestamp from image URL: ?_=NNNNNNNNNN
        let updatedAtMs = null;
        const tsMatch = imageUrl.match(/[?&]_=(\d{10})/);
        if (tsMatch) updatedAtMs = parseInt(tsMatch[1], 10) * 1000;

        seenItemIds.add(itemId);
        allRaw.push({
          itemId, title, price,
          imageUrl, updatedAtMs,
          url: `https://www.mercari.com/us/item/${itemId}/`,
        });
      }
    } catch (e) {
      console.log(`[Mercari] Fetch error for ${url}: ${e.message}`);
    }
    await delay(500, 1000);
  }
  console.log(`[Mercari] Got ${allRaw.length} raw listings`);

  // Filter to last 2 months
  const twoMonthsAgo = Date.now() - 60 * 24 * 60 * 60 * 1000;
  const recent = allRaw.filter(r => !r.updatedAtMs || r.updatedAtMs >= twoMonthsAgo);
  console.log(`[Mercari] ${recent.length} within last 2 months`);

  const results = [];
  for (const r of recent) {
    const item = buildItemFromListing({
      title: r.title,
      price: r.price,
      url: r.url,
      isAuction: false, // Mercari is fixed-price
      listedAt: r.updatedAtMs ? new Date(r.updatedAtMs).toISOString() : null,
      location: 'United States',
    }, 'Mercari');
    if (item) results.push(item);
  }

  console.log(`[Mercari] ${results.length} valid base set PSA 10 listings`);
  cachedMercariListings = sortListings(results);
  mercariLastUpdate = new Date().toISOString();
  saveCache();
  return cachedMercariListings;
}

// ===== TCGPLAYER (via mp-search-api - Marketplace listings) =====
// TCGplayer Marketplace lets sellers list graded slabs alongside raw cards. We
// search for products in "Pokémon - Base Set" then fetch listings for each
// product, keeping only ones whose title or condition indicates PSA 10.
async function fetchTcgPlayerListings() {
  console.log("[TCGplayer] Fetching PSA 10 base set listings...");
  const apiBase = "https://mp-search-api.tcgplayer.com/v1/search";

  // Step 1: Get all products in "Base Set" (Pokemon)
  const searchBody = {
    algorithm: "",
    from: 0,
    size: 50, // TCGplayer caps at 50 per page
    filters: { term: { productLineName: ["pokemon"], setName: ["base-set"] }, range: {}, match: {} },
    context: { shippingCountry: "US" },
    sort: { field: "product-name", order: "asc" },
  };
  let products = [];
  for (let page = 0; page < 4; page++) {
    const body = { ...searchBody, from: page * 50 };
    try {
      const resp = await fetch(`${apiBase}/request?q=&isList=false`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://www.tcgplayer.com",
          "Referer": "https://www.tcgplayer.com/",
          "User-Agent": PC_UA,
        },
        body: JSON.stringify(body),
      });
      const text = await resp.text();
      if (!resp.ok) {
        console.log(`[TCGplayer] page ${page} HTTP ${resp.status}: ${text.substring(0, 150)}`);
        break;
      }
      const data = JSON.parse(text);
      const pageResults = data?.results?.[0]?.results || [];
      const total = data?.results?.[0]?.totalResults || 0;
      products = products.concat(pageResults);
      if (pageResults.length === 0 || products.length >= total) break;
    } catch (e) {
      console.log(`[TCGplayer] page ${page} error: ${e.message}`);
      break;
    }
    await delay(300, 600);
  }
  console.log(`[TCGplayer] Found ${products.length} base set products`);

  // Step 2: For each product fetch listings, filter for PSA 10
  const results = [];
  for (const product of products.slice(0, 110)) {
    try {
      const lresp = await fetch(`${apiBase}/product/${product.productId}/listings`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Origin": "https://www.tcgplayer.com",
          "Referer": "https://www.tcgplayer.com/",
          "User-Agent": PC_UA,
        },
        body: JSON.stringify({
          filters: { term: {}, range: {}, exclude: { channelExclusion: 0 } },
          from: 0, size: 30,
          context: { shippingCountry: "US" },
          aggregations: ["listingType"],
          sort: { field: "price+shipping", order: "asc" },
        }),
      });
      if (!lresp.ok) continue;
      const ldata = await lresp.json();
      const listings = ldata?.results?.[0]?.results || [];

      for (const l of listings) {
        const condName = (l.conditionName || '').toLowerCase();
        const customAttrs = JSON.stringify(l.customAttributes || {}).toLowerCase();
        const sellerNote = (l.customListingId || '') + ' ' + (l.customListingDescription || '');
        const allText = `${condName} ${customAttrs} ${sellerNote}`.toLowerCase();
        if (!/psa\s*10/.test(allText)) continue;

        const productTitle = `${product.productName} [${product.setName}]`;
        const fullTitle = `1999 Pokemon Base Set ${product.productName} PSA 10 ${l.conditionName || ''}`;
        const cardName = identifyBaseSetCard(fullTitle);
        if (!cardName) continue;

        const price = (l.price || 0) + (l.shippingPrice || 0);
        if (price < 10) continue;

        const url = `https://www.tcgplayer.com/product/${product.productId}/${product.productUrlName || ''}?Language=English&Condition=${encodeURIComponent(l.conditionName || '')}`;

        const item = buildItemFromListing({
          title: fullTitle,
          price,
          url,
          isAuction: false,
          listedAt: l.listingDate || null,
          location: 'United States',
        }, 'TCGplayer');
        if (item) results.push(item);
      }
    } catch (e) {
      // skip
    }
    await delay(300, 600);
  }

  console.log(`[TCGplayer] ${results.length} valid PSA 10 base set listings`);
  cachedTcgListings = sortListings(results);
  tcgLastUpdate = new Date().toISOString();
  saveCache();
  return cachedTcgListings;
}

// ===== Multi-source endpoints =====
app.get("/api/fanatics-listings", (req, res) => {
  res.json({ listings: cachedFanaticsListings || [], lastUpdate: fanaticsLastUpdate, inProgress: fanaticsInProgress });
});
app.post("/api/trigger-fanatics", (req, res) => {
  if (fanaticsInProgress) return res.json({ status: "already_running" });
  fanaticsInProgress = true;
  fetchFanaticsListings().catch(e => console.error("[Fanatics]", e.message)).finally(() => { fanaticsInProgress = false; });
  res.json({ status: "started" });
});

app.get("/api/mercari-listings", (req, res) => {
  res.json({ listings: cachedMercariListings || [], lastUpdate: mercariLastUpdate, inProgress: mercariInProgress });
});
app.post("/api/trigger-mercari", (req, res) => {
  if (mercariInProgress) return res.json({ status: "already_running" });
  mercariInProgress = true;
  fetchMercariListings().catch(e => console.error("[Mercari]", e.message)).finally(() => { mercariInProgress = false; });
  res.json({ status: "started" });
});

app.get("/api/tcgplayer-listings", (req, res) => {
  res.json({ listings: cachedTcgListings || [], lastUpdate: tcgLastUpdate, inProgress: tcgInProgress });
});
app.post("/api/trigger-tcgplayer", (req, res) => {
  if (tcgInProgress) return res.json({ status: "already_running" });
  tcgInProgress = true;
  fetchTcgPlayerListings().catch(e => console.error("[TCGplayer]", e.message)).finally(() => { tcgInProgress = false; });
  res.json({ status: "started" });
});

// ===== Combined trigger: kicks off all three in parallel =====
app.post("/api/trigger-all-sources", (req, res) => {
  const started = [];
  if (!fanaticsInProgress) { fanaticsInProgress = true; started.push("fanatics"); fetchFanaticsListings().catch(e => console.error(e)).finally(() => { fanaticsInProgress = false; }); }
  if (!mercariInProgress) { mercariInProgress = true; started.push("mercari"); fetchMercariListings().catch(e => console.error(e)).finally(() => { mercariInProgress = false; }); }
  if (!tcgInProgress) { tcgInProgress = true; started.push("tcgplayer"); fetchTcgPlayerListings().catch(e => console.error(e)).finally(() => { tcgInProgress = false; }); }
  res.json({ status: "started", started });
});

// ============================================================================
// EVENING CRON: full scan + email
// ============================================================================
async function runEveningScan(opts = {}) {
  console.log("[Evening] Starting full evening scan...");
  const start = Date.now();

  // Run all scans (eBay, Fanatics, Mercari, TCGplayer) in parallel-ish.
  // eBay scan depends on market prices; do a market refresh first.
  try {
    if (!marketPricesInProgress) {
      marketPricesInProgress = true;
      await fetchAllMarketPrices().catch(e => console.error("[Evening] market refresh:", e.message));
      marketPricesInProgress = false;
    }
  } catch {}

  const results = await Promise.allSettled([
    runAutoScan({ force: true }),
    fanaticsInProgress ? Promise.resolve() : (async () => {
      fanaticsInProgress = true;
      try { await fetchFanaticsListings(); } finally { fanaticsInProgress = false; }
    })(),
    mercariInProgress ? Promise.resolve() : (async () => {
      mercariInProgress = true;
      try { await fetchMercariListings(); } finally { mercariInProgress = false; }
    })(),
    tcgInProgress ? Promise.resolve() : (async () => {
      tcgInProgress = true;
      try { await fetchTcgPlayerListings(); } finally { tcgInProgress = false; }
    })(),
  ]);

  const dur = Math.round((Date.now() - start) / 1000);
  console.log(`[Evening] Scan finished in ${dur}s. Statuses:`, results.map(r => r.status));

  // Email
  if (!opts.skipEmail) {
    try { await sendEveningEmail(); } catch (e) { console.error("[Evening] Email error:", e.message); }
  }
  return { duration: dur, statuses: results.map(r => r.status) };
}

function fmtMoney(n) {
  if (n == null) return 'N/A';
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtPct(p) {
  if (p == null) return 'N/A';
  const sign = p < 0 ? '' : '+';
  return `${sign}${p.toFixed(1)}%`;
}

function buildEveningEmailHtml() {
  const ebayBin = (cachedResults?.buyItNow || []).slice(0, 25);
  const ebayAuc = (cachedResults?.auctions || []).slice(0, 15);
  const fan = (cachedFanaticsListings || []).slice(0, 25);
  const merc = (cachedMercariListings || []).slice(0, 25);
  const tcg = (cachedTcgListings || []).slice(0, 25);

  const totalListings = (cachedResults?.buyItNow?.length || 0) + (cachedResults?.auctions?.length || 0)
    + (cachedFanaticsListings?.length || 0) + (cachedMercariListings?.length || 0) + (cachedTcgListings?.length || 0);

  const renderRow = (it) => `
    <tr>
      <td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;">${it.name || ''}</td>
      <td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#16a34a;font-weight:600;">${fmtMoney(it.price)}</td>
      <td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;">${fmtMoney(it.marketPrice)}</td>
      <td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;color:${it.pctOverMarket != null && it.pctOverMarket < 0 ? '#16a34a' : '#dc2626'};">${fmtPct(it.pctOverMarket)}</td>
      <td style="padding:6px;border-bottom:1px solid #e5e7eb;font-size:13px;"><a href="${it.listingUrl || it.ebayUrl || ''}" style="color:#2563eb;">View</a></td>
    </tr>`;

  const renderTable = (rows, title) => {
    if (!rows.length) return `<h3 style="margin:24px 0 8px;color:#111;">${title}</h3><p style="color:#6b7280;font-size:13px;">No listings.</p>`;
    return `<h3 style="margin:24px 0 8px;color:#111;">${title} (${rows.length})</h3>
      <table style="width:100%;border-collapse:collapse;font-family:-apple-system,sans-serif;">
      <thead><tr>
        <th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Card</th>
        <th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Price</th>
        <th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Market</th>
        <th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">% Over</th>
        <th style="text-align:left;padding:6px;background:#f3f4f6;font-size:12px;text-transform:uppercase;color:#6b7280;">Link</th>
      </tr></thead><tbody>${rows.map(renderRow).join('')}</tbody></table>`;
  };

  const ebayBinNorm = ebayBin.map(i => ({ ...i, listingUrl: i.ebayUrl }));
  const ebayAucNorm = ebayAuc.map(i => ({ ...i, listingUrl: i.ebayUrl }));

  return `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#f9fafb;padding:20px;">
    <div style="max-width:900px;margin:0 auto;background:white;padding:24px;border-radius:8px;">
      <h1 style="color:#111;margin:0 0 8px;">Pokémon PSA 10 Base Set — Evening Scan</h1>
      <p style="color:#6b7280;margin:0 0 24px;">${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' })} PT &middot; ${totalListings} listings across all sources</p>
      ${renderTable(ebayBinNorm, '🛒 eBay - Buy It Now')}
      ${renderTable(ebayAucNorm, '🔨 eBay - Auctions')}
      ${renderTable(fan, '🎴 Fanatics Collect')}
      ${renderTable(merc, '🛍 Mercari (last 60d)')}
      ${renderTable(tcg, '🎯 TCGplayer')}
      <p style="margin-top:32px;color:#6b7280;font-size:12px;">Scan ran at 9pm PT &middot; <a href="https://pokemon-scanner.onrender.com" style="color:#2563eb;">View live dashboard</a></p>
    </div>
  </body></html>`;
}

async function sendEveningEmail() {
  // Extract the first valid email address from the env var. Defends against
  // whole-sentence pastes ("kris@cometary.io (since ...)") and stray
  // smart quotes / NBSPs.
  const rawRecipient = process.env.EVENING_EMAIL_TO || "slikqaz@gmail.com";
  const emailMatch = String(rawRecipient).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  const recipient = emailMatch ? emailMatch[0] : "slikqaz@gmail.com";
  const html = buildEveningEmailHtml();
  const subject = `🎴 PSA 10 Base Set Scan — ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Los_Angeles', month: 'short', day: 'numeric' })}`;

  const resendKey = process.env.RESEND_API_KEY;
  if (resendKey) {
    const fromAddr = process.env.RESEND_FROM || "Pokemon Scanner <onboarding@resend.dev>";
    const resp = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: fromAddr, to: [recipient], subject, html }),
    });
    if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    console.log(`[Email] Sent via Resend to ${recipient}, id=${data.id}`);
    return { provider: "resend", id: data.id };
  }

  const brevoKey = process.env.BREVO_API_KEY;
  if (brevoKey) {
    const fromEmail = process.env.BREVO_FROM_EMAIL || "noreply@cometary.io";
    const resp = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "api-key": brevoKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        sender: { email: fromEmail, name: "Pokemon Scanner" },
        to: [{ email: recipient }],
        subject, htmlContent: html,
      }),
    });
    if (!resp.ok) throw new Error(`Brevo ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    console.log(`[Email] Sent via Brevo to ${recipient}, id=${data.messageId}`);
    return { provider: "brevo", id: data.messageId };
  }

  console.warn("[Email] No RESEND_API_KEY or BREVO_API_KEY set — skipping email send. Set one in env.");
  return { provider: "none", skipped: true };
}

// Cron endpoint — protected by token to prevent abuse
app.post("/api/cron-evening-scan", async (req, res) => {
  const expectedToken = process.env.CRON_TOKEN;
  const givenToken = req.headers['x-cron-token'] || (req.body && req.body.token);
  if (expectedToken && givenToken !== expectedToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  // Run async; respond immediately so caller doesn't time out
  res.json({ status: "started", at: new Date().toISOString() });
  runEveningScan().catch(e => console.error("[Evening]", e));
});

// Debug: show the resolved recipient (no secrets leaked)
app.get("/api/debug-email-recipient", (req, res) => {
  const raw = process.env.EVENING_EMAIL_TO || "slikqaz@gmail.com";
  const m = String(raw).match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  res.json({
    raw,
    rawLength: String(raw).length,
    extractedEmail: m ? m[0] : null,
    hasResendKey: !!process.env.RESEND_API_KEY,
  });
});

// Test-only email endpoint (no scan, just send current cache)
app.post("/api/cron-send-email-only", async (req, res) => {
  const expectedToken = process.env.CRON_TOKEN;
  const givenToken = req.headers['x-cron-token'] || (req.body && req.body.token);
  if (expectedToken && givenToken !== expectedToken) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    const result = await sendEveningEmail();
    res.json({ status: "sent", result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ===== Pokémon Center stock monitor =====
const POKECENTER_STATE_FILE = path.join(CACHE_DIR, "pokemoncenter-monitor.json");
const POKECENTER_URL = "https://www.pokemoncenter.com/category/trading-card-game?category=tcg-cards&sort=launch_date%2Bdesc";
let _pcMonitor = null;
function pcMonitor() {
  if (!_pcMonitor) _pcMonitor = require("./scripts/pokemoncenter_monitor.js");
  return _pcMonitor;
}
let pokecenterState = (function () {
  try {
    if (fs.existsSync(POKECENTER_STATE_FILE)) return JSON.parse(fs.readFileSync(POKECENTER_STATE_FILE, "utf8"));
  } catch {}
  return { lastCheckAt: null, products: [], lastAlertByUrl: {}, consecutiveErrors: 0 };
})();
function savePokecenterState() {
  try { fs.writeFileSync(POKECENTER_STATE_FILE, JSON.stringify(pokecenterState, null, 2)); } catch (e) { console.error("[PokeCenter] save state:", e.message); }
}

async function sendSmsToKris(message) {
  const to = process.env.POKECENTER_SMS_TO || "+16506650579";
  const trimmed = message.slice(0, 1500);

  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (sid && token && from) {
    const auth = Buffer.from(`${sid}:${token}`).toString("base64");
    const body = new URLSearchParams({ From: from, To: to, Body: trimmed });
    const resp = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!resp.ok) throw new Error(`Twilio ${resp.status}: ${await resp.text()}`);
    const data = await resp.json();
    console.log(`[SMS] Twilio sent to ${to}, sid=${data.sid}`);
    return { provider: "twilio", id: data.sid };
  }

  // TextBelt fallback. Free key "textbelt" gives 1 SMS/day per IP — enough
  // when restocks are rare. A paid TEXTBELT_KEY env var lifts the limit.
  const tbKey = process.env.TEXTBELT_KEY || "textbelt";
  const tbResp = await fetch("https://textbelt.com/text", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ phone: to.replace(/^\+/, ""), message: trimmed, key: tbKey }),
  });
  const tbData = await tbResp.json().catch(() => ({}));
  if (tbData.success) {
    console.log(`[SMS] TextBelt sent to ${to}, id=${tbData.textId}, quotaRemaining=${tbData.quotaRemaining}`);
    return { provider: "textbelt", id: tbData.textId, quotaRemaining: tbData.quotaRemaining };
  }
  console.warn(`[SMS] TextBelt failed: ${JSON.stringify(tbData)}`);
  return { provider: "textbelt", error: tbData.error || "unknown", quotaRemaining: tbData.quotaRemaining };
}

async function sendPokecenterEmail(subject, html) {
  const recipient = process.env.POKECENTER_EMAIL_TO || "slikqaz@gmail.com";
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) {
    console.warn("[Email] RESEND_API_KEY missing — skipping pokemoncenter alert email");
    return { provider: "none", skipped: true };
  }
  const fromAddr = process.env.RESEND_FROM || "Pokemon Scanner <onboarding@resend.dev>";
  const resp = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: fromAddr, to: [recipient], subject, html }),
  });
  if (!resp.ok) throw new Error(`Resend ${resp.status}: ${await resp.text()}`);
  const data = await resp.json();
  console.log(`[Email] PokeCenter alert sent to ${recipient}, id=${data.id}`);
  return { provider: "resend", id: data.id };
}

function diffPokecenterProducts(prevList, currList) {
  const prevByUrl = new Map((prevList || []).map(p => [p.url, p]));
  const newlyAvailable = [];
  for (const p of currList) {
    if (p.soldOut) continue;
    const prev = prevByUrl.get(p.url);
    // Alert when: never seen before AND in stock, OR was sold out AND now in stock
    if (!prev || prev.soldOut) newlyAvailable.push(p);
  }
  return newlyAvailable;
}

let pokecenterCheckInProgress = false;
async function runPokecenterCheck({ force = false } = {}) {
  if (pokecenterCheckInProgress && !force) return { skipped: "in-progress" };
  pokecenterCheckInProgress = true;
  try {
    const monitor = pcMonitor();
    let result;
    try {
      result = await monitor.checkPokemonCenterTcg({ timeoutMs: 60000 });
      pokecenterState.consecutiveErrors = 0;
    } catch (e) {
      pokecenterState.consecutiveErrors = (pokecenterState.consecutiveErrors || 0) + 1;
      pokecenterState.lastError = { message: e.message, at: new Date().toISOString() };
      // After several consecutive errors, force-close the browser so next check relaunches.
      if (pokecenterState.consecutiveErrors >= 3) {
        try { await monitor.closeBrowser(); } catch {}
      }
      savePokecenterState();
      throw e;
    }

    const newlyAvailable = diffPokecenterProducts(pokecenterState.products, result.products);

    // Debounce: only alert if we haven't alerted on this URL in the last 30 min.
    const now = Date.now();
    const DEBOUNCE_MS = 30 * 60 * 1000;
    pokecenterState.lastAlertByUrl = pokecenterState.lastAlertByUrl || {};
    const toAlert = newlyAvailable.filter(p => {
      const last = pokecenterState.lastAlertByUrl[p.url];
      return !last || (now - last) > DEBOUNCE_MS;
    });

    if (toAlert.length > 0) {
      const subject = `🎴 Pokémon Center: ${toAlert.length} item${toAlert.length === 1 ? "" : "s"} available!`;
      const lines = toAlert.map(p => `• ${p.title} — ${p.price || "?"}\n${p.url}`).join("\n\n");
      const html = `<!DOCTYPE html><html><body style="font-family:-apple-system,sans-serif;background:#f9fafb;padding:20px;">
        <div style="max-width:680px;margin:0 auto;background:white;padding:24px;border-radius:8px;">
          <h1 style="color:#111;margin:0 0 8px;">🎴 Pokémon Center — ${toAlert.length} new item${toAlert.length === 1 ? "" : "s"} available</h1>
          <p style="color:#6b7280;margin:0 0 24px;">${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" })} PT &middot; <a href="${POKECENTER_URL}" style="color:#2563eb;">View category</a></p>
          ${toAlert.map(p => `
            <div style="border:1px solid #e5e7eb;border-radius:6px;padding:12px;margin:12px 0;">
              <div style="font-weight:600;font-size:16px;color:#111;">${p.title}</div>
              <div style="color:#16a34a;font-weight:600;margin-top:4px;">${p.price || "Available"}</div>
              <div style="margin-top:8px;"><a href="${p.url}" style="color:#2563eb;">${p.url}</a></div>
            </div>`).join("")}
        </div>
      </body></html>`;
      const smsBody = `🎴 PokeCenter ${toAlert.length} avail:\n` +
        toAlert.slice(0, 3).map(p => `${p.title.slice(0, 60)} ${p.price || ""}`).join("\n") +
        `\n${POKECENTER_URL}`;
      console.log(`[PokeCenter] ALERT — ${toAlert.length} newly available`);
      const emailResult = await sendPokecenterEmail(subject, html).catch(e => ({ error: e.message }));
      const smsResult = await sendSmsToKris(smsBody).catch(e => ({ error: e.message }));
      for (const p of toAlert) pokecenterState.lastAlertByUrl[p.url] = now;
      pokecenterState.lastAlert = { at: new Date().toISOString(), count: toAlert.length, items: toAlert.map(p => ({ url: p.url, title: p.title, price: p.price })), emailResult, smsResult };
    }

    pokecenterState.lastCheckAt = result.fetchedAt;
    pokecenterState.lastNavMs = result.navMs;
    pokecenterState.products = result.products;
    savePokecenterState();
    return {
      ok: true,
      total: result.products.length,
      soldOut: result.products.filter(p => p.soldOut).length,
      available: result.products.filter(p => !p.soldOut).length,
      newlyAvailable: toAlert,
      navMs: result.navMs,
    };
  } finally {
    pokecenterCheckInProgress = false;
  }
}

// Token-protected manual / cron trigger
app.post("/api/pokemoncenter-check", async (req, res) => {
  const expectedToken = process.env.CRON_TOKEN;
  const givenToken = req.headers["x-cron-token"] || (req.body && req.body.token);
  if (expectedToken && givenToken !== expectedToken) return res.status(401).json({ error: "Unauthorized" });
  try {
    const r = await runPokecenterCheck({ force: req.query.force === "1" });
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Public read-only status (debugging + dashboard hookup)
app.get("/api/pokemoncenter-status", (req, res) => {
  const products = pokecenterState.products || [];
  res.json({
    lastCheckAt: pokecenterState.lastCheckAt,
    lastNavMs: pokecenterState.lastNavMs,
    consecutiveErrors: pokecenterState.consecutiveErrors || 0,
    lastError: pokecenterState.lastError || null,
    lastAlert: pokecenterState.lastAlert || null,
    total: products.length,
    soldOut: products.filter(p => p.soldOut).length,
    available: products.filter(p => !p.soldOut).length,
    availableItems: products.filter(p => !p.soldOut),
    sourceUrl: POKECENTER_URL,
  });
});

// Manual test of the alert path without waiting for an actual restock.
app.post("/api/pokemoncenter-test-alert", async (req, res) => {
  const expectedToken = process.env.CRON_TOKEN;
  const givenToken = req.headers["x-cron-token"] || (req.body && req.body.token);
  if (expectedToken && givenToken !== expectedToken) return res.status(401).json({ error: "Unauthorized" });
  const fake = { url: POKECENTER_URL, title: "TEST: alert path verification", price: "$0.00" };
  try {
    const email = await sendPokecenterEmail(
      "🎴 PokeCenter monitor test alert",
      `<p>This is a test of the Pokémon Center monitor alert path.</p><p>Time: ${new Date().toISOString()}</p>`
    ).catch(e => ({ error: e.message }));
    const sms = await sendSmsToKris(`🎴 PokeCenter monitor test ${new Date().toLocaleTimeString()}`).catch(e => ({ error: e.message }));
    res.json({ ok: true, email, sms, fake });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

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

  // Pokémon Center stock monitor: every minute.
  // Enabled by default; set POKECENTER_MONITOR=off to disable.
  if (process.env.POKECENTER_MONITOR !== "off") {
    const intervalMs = Number(process.env.POKECENTER_INTERVAL_MS) || 60_000;
    let warmedUp = false;
    const tick = async () => {
      try {
        const r = await runPokecenterCheck();
        if (r.skipped) return;
        if (!warmedUp) { warmedUp = true; console.log("[PokeCenter] First check OK:", { total: r.total, soldOut: r.soldOut, available: r.available, navMs: r.navMs }); }
        if (r.newlyAvailable && r.newlyAvailable.length > 0) {
          console.log(`[PokeCenter] ${r.newlyAvailable.length} newly available`);
        }
      } catch (e) {
        console.error("[PokeCenter] check error:", e.message);
      }
    };
    // First run after a short delay so server is ready
    setTimeout(() => { tick(); setInterval(tick, intervalMs); }, 10_000);
    console.log(`[PokeCenter] Monitor enabled, interval=${intervalMs}ms`);
  }
})();
process.stdin.resume();
