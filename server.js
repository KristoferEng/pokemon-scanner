const express = require("express");
const path = require("path");
const cheerio = require("cheerio");

// got-scraping is ESM-only, use dynamic import (only needed for PriceCharting)
let gotScraping;
const gotReady = import("got-scraping").then(m => { gotScraping = m.gotScraping; });

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

        const pcResp = await gotScraping({
          url: directUrl,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
          responseType: 'text',
          timeout: { request: 15000 },
          retry: { limit: 1 },
        });
        const $pc = cheerio.load(pcResp.body);

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
        const pcResp = await gotScraping({
          url: searchUrl,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
          responseType: 'text',
          timeout: { request: 15000 },
          retry: { limit: 1 },
        });
        const $pc = cheerio.load(pcResp.body);
        const firstResult = $pc('table#games_table a[href*="game/"]').first();
        if (firstResult.length) {
          const href = firstResult.attr('href');
          const pcUrl = href.startsWith('http') ? href : 'https://www.pricecharting.com' + href;
          const detailResp = await gotScraping({
            url: pcUrl,
            headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
            responseType: 'text',
            timeout: { request: 15000 },
            retry: { limit: 1 },
          });
          const $d = cheerio.load(detailResp.body);
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

// ===== AUTO-SCAN: runs every hour, caches results =====
let cachedResults = null;
let lastScanTime = null;
let scanInProgress = false;

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

    console.log(`[AutoScan] Found ${allListings.length} listings, looking up prices...`);

    // PriceCharting lookup
    const priceCache = {};
    const uniqueCards = [...new Set(allListings.map(l => l.cardName))];

    for (const cardName of uniqueCards) {
      try {
        const cardInfo = BASE_SET_CARDS.find(c => c.name === cardName);
        const slug = cardName.toLowerCase().replace(/'/g, "%27").replace(/[^a-z0-9%]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const directUrl = `https://www.pricecharting.com/game/pokemon-base-set/${slug}-${cardInfo ? cardInfo.number : ''}`;

        const pcResp = await gotScraping({
          url: directUrl,
          headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
          responseType: 'text',
          timeout: { request: 15000 },
          retry: { limit: 1 },
        });
        const $pc = cheerio.load(pcResp.body);
        let marketPrice = null;
        const priceEl = $pc('#manual_only_price');
        if (priceEl.length) {
          const match = priceEl.text().match(/\$([\d,]+\.?\d*)/);
          if (match) marketPrice = parseFloat(match[1].replace(/,/g, ''));
        }
        priceCache[cardName] = { marketPrice, pricechartingUrl: directUrl };
      } catch {
        priceCache[cardName] = { marketPrice: null, pricechartingUrl: null };
      }
      await delay(1500, 3000);
    }

    // Build results
    const buyItNow = [];
    const auctions = [];

    for (const listing of allListings) {
      const pc = priceCache[listing.cardName] || {};
      const marketPrice = pc.marketPrice;
      const difference = marketPrice != null ? listing.price - marketPrice : null;
      const pctOverMarket = marketPrice != null && marketPrice > 0
        ? ((listing.price - marketPrice) / marketPrice) * 100 : null;

      const item = {
        name: listing.cardName, title: listing.title, price: listing.price,
        marketPrice, difference, pctOverMarket, ebayUrl: listing.link,
        pricechartingUrl: pc.pricechartingUrl, verified: true, location: listing.location,
      };
      if (listing.isAuction) auctions.push(item); else buyItNow.push(item);
    }

    function countryOrder(loc) {
      const l = (loc || '').toLowerCase();
      if (l.includes('united states')) return 0;
      if (l.includes('canada')) return 1;
      if (l.includes('united kingdom')) return 2;
      return 3;
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
    console.log(`[AutoScan] Done! ${buyItNow.length} BIN, ${auctions.length} auctions. Cached at ${lastScanTime}`);
  } catch (e) {
    console.error("[AutoScan] Error:", e);
  } finally {
    scanInProgress = false;
  }
}

// Serve cached results
app.get("/api/cached-results", (req, res) => {
  res.json({
    results: cachedResults,
    lastScanTime,
    scanInProgress,
  });
});

// ===== MARKET PRICES: all 102 base set cards =====
let cachedMarketPrices = null;
let marketPricesLastUpdate = null;

async function fetchAllMarketPrices() {
  console.log("[MarketPrices] Fetching all 102 base set card prices...");
  const prices = [];

  for (const card of BASE_SET_CARDS) {
    const slug = card.name.toLowerCase().replace(/'/g, "%27").replace(/[^a-z0-9%]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    const directUrl = `https://www.pricecharting.com/game/pokemon-base-set/${slug}-${card.number}`;

    try {
      const pcResp = await gotScraping({
        url: directUrl,
        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36' },
        responseType: 'text',
        timeout: { request: 15000 },
        retry: { limit: 1 },
      });
      const $pc = cheerio.load(pcResp.body);

      let psa10Price = null;
      const priceEl = $pc('#manual_only_price');
      if (priceEl.length) {
        const match = priceEl.text().match(/\$([\d,]+\.?\d*)/);
        if (match) psa10Price = parseFloat(match[1].replace(/,/g, ''));
      }

      // Also try to get ungraded price
      let ungradedPrice = null;
      const ungradedEl = $pc('#used-price');
      if (ungradedEl.length) {
        const match = ungradedEl.text().match(/\$([\d,]+\.?\d*)/);
        if (match) ungradedPrice = parseFloat(match[1].replace(/,/g, ''));
      }

      const type = card.number <= 16 ? 'Holo Rare' : card.number <= 42 ? 'Rare' : card.number <= 69 ? 'Common/Uncommon' : card.number <= 95 ? 'Trainer' : 'Energy';

      prices.push({
        number: card.number,
        name: card.name,
        type,
        psa10Price,
        ungradedPrice,
        pricechartingUrl: directUrl,
      });

      console.log(`[MarketPrices] #${card.number} ${card.name}: PSA 10 = ${psa10Price ? '$' + psa10Price : 'N/A'}`);
    } catch (err) {
      prices.push({
        number: card.number, name: card.name,
        type: card.number <= 16 ? 'Holo Rare' : card.number <= 42 ? 'Rare' : card.number <= 69 ? 'Common/Uncommon' : card.number <= 95 ? 'Trainer' : 'Energy',
        psa10Price: null, ungradedPrice: null, pricechartingUrl: directUrl,
      });
    }
    await delay(1000, 2000);
  }

  cachedMarketPrices = prices;
  marketPricesLastUpdate = new Date().toISOString();
  console.log(`[MarketPrices] Done. Cached ${prices.length} cards.`);
}

app.get("/api/market-prices", (req, res) => {
  res.json({
    prices: cachedMarketPrices,
    lastUpdate: marketPricesLastUpdate,
  });
});

// ===== ENDING AUCTIONS: any PSA 10 Pokemon auction ending within 60 min =====
app.get("/api/ending-auctions", async (req, res) => {
  try {
    const allAuctions = [];
    const seenIds = new Set();

    // Broad search: any PSA 10 Pokemon card auction
    const query = '"psa 10" pokemon -bgs -cgc -sgc -pack -booster -lot -bundle -raw -ungraded -japanese -japan -jpn -korean -chinese -spanish -french -german';
    const filters = "price:[25..5000],priceCurrency:USD,buyingOptions:{AUCTION}";
    const pageSize = 200;
    const maxPages = 5;

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      try {
        const result = await ebaySearch(query, "183454", pageSize, offset, filters, "endingSoonest");
        const items = result.itemSummaries || [];
        if (items.length === 0) break;

        let pastWindow = false;
        for (const item of items) {
          // Check end time first — since sorted by endingSoonest, once past 60m we're done
          const endDate = item.itemEndDate ? new Date(item.itemEndDate) : null;
          if (!endDate) continue;
          const minutesLeft = (endDate - Date.now()) / 60000;
          if (minutesLeft < 0) continue;
          if (minutesLeft > 60) { pastWindow = true; break; }

          const itemId = item.itemId;
          if (!itemId || seenIds.has(itemId)) continue;
          const numericId = itemId.replace(/v1\|/g, '').replace(/\|.*/g, '');
          if (BLOCKED_ITEMS.has(itemId) || BLOCKED_ITEMS.has(numericId)) continue;

          const title = item.title || "";
          const tl = title.toLowerCase();
          // Must actually say "PSA 10" in the title
          if (!/psa\s*10/i.test(title)) continue;
          // Exclude other graders
          if (/\b(bgs|cgc|sgc|ace|ags|beckett)\b/i.test(title)) continue;
          // Exclude Japanese, Chinese, Korean, Spanish, French, German, etc.
          if (/\b(jpn|jap|japanese|japan|chinese|korean|spanish|french|german|italian|portuguese|simplified|chi|kor|svk)\b/i.test(tl)) continue;
          if (/\bjp\b/i.test(tl)) continue;
          // Exclude non-slab / non-card items
          if (/\b(pack|booster|box|sealed|lot|bundle|case|etb|collection|raw|ungraded)\b/i.test(tl)) continue;

          const price = extractPrice(item);
          if (price === null || price < 25 || price > 5000) continue;

          const location = countryFromLocation(extractLocation(item));
          const ebayUrl = item.itemWebUrl || `https://www.ebay.com/itm/${numericId}`;

          // Extract a card name from title for display
          let displayName = title
            .replace(/psa\s*10/i, '').replace(/gem\s*mint/i, '')
            .replace(/\d{4}\s*pokemon/i, 'Pokemon')
            .replace(/\b(holo|holographic|rare|promo)\b/gi, '')
            .replace(/[#\d]+\/\d+/g, '')
            .replace(/\s+/g, ' ').trim();
          if (displayName.length > 60) displayName = displayName.substring(0, 57) + '...';

          // Try to match to base set for market price lookup
          let marketPrice = null;
          let pricechartingUrl = null;
          const baseCard = identifyCard(title);
          if (baseCard && cachedMarketPrices) {
            const mp = cachedMarketPrices.find(c => c.name === baseCard);
            if (mp) {
              marketPrice = mp.psa10Price;
              pricechartingUrl = mp.pricechartingUrl;
            }
          }

          const difference = marketPrice != null ? price - marketPrice : null;
          const pctOverMarket = marketPrice != null && marketPrice > 0
            ? ((price - marketPrice) / marketPrice) * 100 : null;

          seenIds.add(itemId);
          allAuctions.push({
            name: baseCard || displayName, title, price, marketPrice, difference, pctOverMarket,
            ebayUrl, pricechartingUrl, location, verified: !!marketPrice,
            endTime: endDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true }),
            minutesLeft: Math.round(minutesLeft),
          });
        }

        if (pastWindow) break;
        const total = result.total || 0;
        if (offset + items.length >= total) break;
      } catch (err) {
        console.error("[EndingAuctions] Error:", err.message);
        break;
      }
    }

    // Sort: verified (has market price) first by biggest discount, then unverified by price
    allAuctions.sort((a, b) => {
      if (a.difference != null && b.difference == null) return -1;
      if (a.difference == null && b.difference != null) return 1;
      if (a.difference != null && b.difference != null) return a.difference - b.difference;
      return a.price - b.price;
    });

    res.json({ auctions: allAuctions });
  } catch (e) {
    console.error("[EndingAuctions] Error:", e);
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3456;
gotReady.then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  server.keepAliveTimeout = 600000;
  server.headersTimeout = 600000;

  // Run deals scan immediately (fast via API), then market prices in background
  setTimeout(async () => {
    await runAutoScan();
    await fetchAllMarketPrices();
  }, 3000);

  // Schedule on clock hours (1:00, 2:00, etc.)
  function scheduleNextHour() {
    const now = new Date();
    const next = new Date(now);
    next.setHours(next.getHours() + 1, 0, 0, 0); // next :00
    const msUntil = next - now;
    console.log(`[Scheduler] Next scan at ${next.toISOString()} (in ${Math.round(msUntil/60000)}m)`);
    setTimeout(async () => {
      await runAutoScan();
      await fetchAllMarketPrices();
      scheduleNextHour();
    }, msUntil);
  }
  scheduleNextHour();
});
process.stdin.resume();
