const express = require("express");
const path = require("path");
const cheerio = require("cheerio");

// got-scraping is ESM-only, use dynamic import
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

// ===== HUMAN-LIKE REQUEST ENGINE =====

// Rotate through realistic browser profiles
const BROWSER_PROFILES = [
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    platform: "Win32",
    lang: "en-US,en;q=0.9",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    platform: "MacIntel",
    lang: "en-US,en;q=0.9",
  },
  {
    ua: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0",
    platform: "Win32",
    lang: "en-US,en;q=0.5",
  },
  {
    ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
    platform: "MacIntel",
    lang: "en-US,en;q=0.9",
  },
  {
    ua: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    platform: "Linux x86_64",
    lang: "en-US,en;q=0.9",
  },
];

// Session state to maintain cookies across requests like a real browser
let sessionCookies = "";
let currentProfile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
let requestCount = 0;

function rotateProfile() {
  currentProfile = BROWSER_PROFILES[Math.floor(Math.random() * BROWSER_PROFILES.length)];
  sessionCookies = "";
  requestCount = 0;
}

function buildHeaders(referer) {
  const profile = currentProfile;
  const headers = {
    "User-Agent": profile.ua,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": profile.lang,
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Sec-Ch-Ua-Platform": `"${profile.platform.includes("Mac") ? "macOS" : profile.platform.includes("Win") ? "Windows" : "Linux"}"`,
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": referer ? "same-origin" : "none",
    "Sec-Fetch-User": "?1",
    "Upgrade-Insecure-Requests": "1",
    "DNT": "1",
  };
  if (referer) headers["Referer"] = referer;
  if (sessionCookies) headers["Cookie"] = sessionCookies;
  return headers;
}

function extractCookies(response) {
  const setCookies = response.headers["set-cookie"];
  if (!setCookies) return;
  const cookies = Array.isArray(setCookies) ? setCookies : [setCookies];
  const pairs = cookies.map(c => c.split(";")[0]);
  // Merge with existing cookies
  const existing = sessionCookies ? sessionCookies.split("; ").reduce((m, p) => {
    const [k, v] = p.split("=");
    if (k) m[k] = v;
    return m;
  }, {}) : {};
  for (const p of pairs) {
    const [k, v] = p.split("=");
    if (k) existing[k] = v;
  }
  sessionCookies = Object.entries(existing).map(([k, v]) => `${k}=${v}`).join("; ");
}

// Proxy support: set PROXY_URL env var (e.g., http://user:pass@proxy:port)
function getProxyUrl() {
  return process.env.PROXY_URL || null;
}

async function fetchEbayPage(url, send, maxRetries = 3) {
  const proxyUrl = getProxyUrl();

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Human-like: first request in session hits the homepage to get cookies
      if (requestCount === 0) {
        try {
          const homeOpts = {
            url: "https://www.ebay.com/",
            headers: buildHeaders(null),
            headerGeneratorOptions: {
              browsers: [{ name: "chrome", minVersion: 120, maxVersion: 126 }],
              devices: ["desktop"],
              locales: ["en-US"],
              operatingSystems: ["windows", "macos"],
            },
            followRedirect: true,
            timeout: { request: 30000 },
            retry: { limit: 0 },
            responseType: "text",
            https: { rejectUnauthorized: true },
          };
          if (proxyUrl) homeOpts.proxyUrl = proxyUrl;
          const homeResp = await gotScraping(homeOpts);
          extractCookies(homeResp);
          await delay(1500, 3000);
        } catch (e) {
          // Non-fatal, continue anyway
        }
        requestCount++;
      }

      const opts = {
        url,
        headers: buildHeaders("https://www.ebay.com/sch/i.html"),
        headerGeneratorOptions: {
          browsers: [{ name: "chrome", minVersion: 120, maxVersion: 126 }],
          devices: ["desktop"],
          locales: ["en-US"],
          operatingSystems: ["windows", "macos"],
        },
        followRedirect: true,
        timeout: { request: 30000 },
        retry: { limit: 0 },
        responseType: "text",
        https: { rejectUnauthorized: true },
      };
      if (proxyUrl) opts.proxyUrl = proxyUrl;

      const response = await gotScraping(opts);
      extractCookies(response);
      requestCount++;

      const html = response.body;
      const $ = cheerio.load(html);
      const title = $("title").text();

      if (title.includes("Pardon") || title.includes("Security") || title.includes("Robot")) {
        if (attempt < maxRetries) {
          // Exponential backoff + rotate browser profile
          const backoff = Math.pow(2, attempt + 1) * 10000 + Math.random() * 10000;
          send({ type: "log", message: `  Bot challenge detected. Rotating profile, waiting ${Math.round(backoff/1000)}s (attempt ${attempt + 1}/${maxRetries})...` });
          rotateProfile();
          await delay(backoff, backoff + 5000);
          continue;
        }
        return { html: "", blocked: true };
      }

      return { html, blocked: false };
    } catch (err) {
      if (attempt < maxRetries) {
        const backoff = (attempt + 1) * 5000;
        send({ type: "log", message: `  Request error: ${err.message}. Retrying in ${backoff/1000}s...` });
        await delay(backoff, backoff + 3000);
        continue;
      }
      throw err;
    }
  }
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
  if (!/psa\s*10/i.test(title)) return null;
  if (/\b(bgs|cgc|sgc|ace|ags|beckett)\b/i.test(title)) return null;
  if (/\b(pack|booster|box|sealed|lot|bundle|case|etb|collection|wrapper|artwork|thick\s*font|thin\s*font|foil|additional\s*game\s*cards)\b/i.test(t)) return null;
  if (/\b(raw|ungraded|comp|comparable|quality|worthy|potential|candidate|like\s+psa|nm|near\s*mint|excellent|lp|played)\b/i.test(t)) return null;
  if (t.includes("shadowless") || t.includes("1st edition") || t.includes("first edition")) return null;
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

function parseListings($) {
  const listings = [];

  const selectorSets = [
    { container: 'li.s-card', title: '.s-card__title', price: '.s-card__price' },
    { container: 'li.s-item', title: '.s-item__title', price: '.s-item__price' },
  ];

  for (const { container, title: titleSel, price: priceSel } of selectorSets) {
    if ($(container).length === 0) continue;

    $(container).each((_, el) => {
      const $el = $(el);
      const title = ($el.find(titleSel).text() || '').trim()
        .replace(/Opens in a new window or tab$/i, '')
        .replace(/^New Listing/i, '').trim();
      const priceText = ($el.find(priceSel).text() || '').trim();
      const link = $el.find('a[href*="/itm/"]').attr('href') || '';
      const fullText = $el.text().toLowerCase();

      if (!title || title === 'Shop on eBay' || !link.includes('/itm/')) return;

      const auctionSignals = [];
      if (/\bbid\b/.test(fullText) && !/buy it now/i.test(fullText)) auctionSignals.push('bid');
      if (/time left/i.test(fullText)) auctionSignals.push('time-left');

      let location = '';
      const locMatch = fullText.match(/located\s+in\s+(united states|canada|united kingdom|great britain|france|germany|australia|japan|italy|spain|china|mexico|brazil|india|netherlands|south korea|taiwan|hong kong|singapore|thailand|philippines|ireland|new zealand|sweden|switzerland|belgium|austria|poland|denmark|norway|finland|portugal|czech republic|greece|israel|turkey|south africa|romania|hungary|malaysia|indonesia|vietnam|colombia|chile|argentina|peru|ukraine|croatia|bulgaria|slovakia|slovenia|estonia|latvia|lithuania|luxembourg|malta|cyprus|iceland)/i);
      if (locMatch) location = locMatch[1].trim();

      let timeLeft = '';
      const timeMatch = fullText.match(/(\d+[hd]\s*\d+[ms]?\s*left|\d+m\s*\d*s?\s*left|\d+s\s*left)/i);
      if (timeMatch) timeLeft = timeMatch[1].replace(/\s*left/i, '').trim();

      const condition = ($el.find('.SECONDARY_INFO, [class*="subtitle"], [class*="condition"], [class*="Condition"]').text() || '').trim().toLowerCase();

      listings.push({ title, priceText, link, auctionSignals, location, timeLeft, fullText, condition });
    });

    if (listings.length > 0) return listings;
  }

  $('a[href*="/itm/"]').each((_, el) => {
    const $a = $(el);
    const link = $a.attr('href') || '';
    if (!link.includes('/itm/')) return;

    const $container = $a.closest('[class*="card"], [class*="item"], li').first();
    if (!$container.length) return;

    const text = $container.text().replace(/\s+/g, ' ').trim();
    const title = ($container.find('[class*="title"], [class*="Title"]').first().text() || '').trim()
      .replace(/Opens in a new window or tab$/i, '')
      .replace(/^New Listing/i, '').trim();
    if (!title) return;

    const priceText = ($container.find('[class*="price"], [class*="Price"]').first().text() || '').trim();
    const fullText = text.toLowerCase();

    const auctionSignals = [];
    if (/\bbid\b/.test(fullText) && !/buy it now/i.test(fullText)) auctionSignals.push('bid');
    if (/time left/i.test(fullText)) auctionSignals.push('time-left');

    let location = '';
    const locMatch2 = fullText.match(/located\s+in\s+(united states|canada|united kingdom|great britain|france|germany|australia|japan|italy|spain|china|mexico|brazil|india|netherlands|south korea|taiwan|hong kong|singapore|thailand|philippines|ireland|new zealand|sweden|switzerland|belgium|austria|poland|denmark|norway|finland|portugal|czech republic|greece|israel|turkey|south africa|romania|hungary|malaysia|indonesia|vietnam|colombia|chile|argentina|peru|ukraine|croatia|bulgaria|slovakia|slovenia|estonia|latvia|lithuania|luxembourg|malta|cyprus|iceland)/i);
    if (locMatch2) location = locMatch2[1].trim();

    let timeLeft = '';
    const timeMatch2 = fullText.match(/(\d+[hd]\s*\d+[ms]?\s*left|\d+m\s*\d*s?\s*left|\d+s\s*left)/i);
    if (timeMatch2) timeLeft = timeMatch2[1].replace(/\s*left/i, '').trim();

    listings.push({ title, priceText, link, auctionSignals, location, timeLeft });
  });

  return listings;
}

// SSE endpoint
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

  // Fresh session for each scan
  rotateProfile();

  try {
    send({ type: "log", message: "Phase 1: Collecting eBay listings..." });

    const allListings = [];
    const seenIds = new Set();
    const MAX_FOUND = 1000;
    const searchStartTime = Date.now();
    const SEARCH_TIME_LIMIT = 8 * 60 * 1000;

    const searches = [
      { q: '"psa 10" unlimited base set pokemon -shadowless -"1st edition" -1st -bgs -cgc -pack -booster -"base set 2" -"base ii"', pages: 8 },
    ];

    let consecutiveBlocks = 0;
    let hitCap = false;

    for (const search of searches) {
      if (hitCap) break;
      for (let pageNum = 1; pageNum <= search.pages; pageNum++) {
        if (hitCap) break;
        if (consecutiveBlocks >= 3) {
          send({ type: "log", message: `Too many consecutive blocks. Stopping search with ${allListings.length} listings.` });
          hitCap = true;
          break;
        }
        if (Date.now() - searchStartTime >= SEARCH_TIME_LIMIT) {
          send({ type: "log", message: `Time limit reached. Found ${allListings.length} listings.` });
          hitCap = true;
          break;
        }

        const encoded = encodeURIComponent(search.q);
        const url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}&_sacat=183454&LH_TitleDesc=1&_ipg=240&_sop=15&_pgn=${pageNum}`;

        send({ type: "log", message: `Searching: page ${pageNum}/${search.pages}...` });

        try {
          const result = await fetchEbayPage(url, send);
          if (result.blocked) {
            consecutiveBlocks++;
            send({ type: "log", message: `  Still blocked after retries. (${consecutiveBlocks}/3 consecutive blocks)` });
            continue;
          }

          consecutiveBlocks = 0;
          const $ = cheerio.load(result.html);

          const pageTitle = $('title').text();
          send({ type: "log", message: `  Page title: "${pageTitle.substring(0, 60)}..."` });

          const listings = parseListings($);
          send({ type: "log", message: `  Found ${listings.length} listings on this page` });

          for (const l of listings) {
            const idMatch = l.link.match(/\/itm\/(\d+)/);
            const itemId = idMatch ? idMatch[1] : null;
            if (!itemId || seenIds.has(itemId)) continue;
            if (itemId === '157236327643') continue;

            const cardName = identifyCard(l.title);
            if (!cardName) continue;

            const ft = (l.fullText || '').toLowerCase();
            const cond = (l.condition || '').toLowerCase();
            if (/\b(ungraded|lightly played|heavily played|excellent|pre-owned|cgc\s*\d|bgs\s*\d|sgc\s*\d|ags\s*\d)\b/i.test(ft)) continue;
            if (/\b(ungraded|pre-owned|lightly played|heavily played|excellent|used|open box)\b/i.test(cond)) continue;

            seenIds.add(itemId);

            const priceMatch = l.priceText.match(/\$([\d,]+\.?\d*)/);
            const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null;
            if (price === null) continue;
            if (price <= 25 || price >= 25000) continue;

            const isAuction = l.auctionSignals.length > 0;

            allListings.push({
              title: l.title,
              cardName,
              price,
              link: l.link.split("?")[0],
              isAuction,
              itemId,
              location: l.location || '',
            });

            send({ type: "found", count: allListings.length, latest: cardName, price });

            if (allListings.length >= MAX_FOUND) {
              hitCap = true;
              break;
            }
          }

          send({ type: "log", message: `  Total matched so far: ${allListings.length}` });

          if (listings.length === 0) {
            send({ type: "log", message: `  No listings on page, moving on.` });
            break;
          }

        } catch (err) {
          send({ type: "error", message: `Search error: ${err.message}` });
        }

        // Human-like variable delay between pages (10-25 seconds)
        const pageDelay = 10000 + Math.random() * 15000;
        send({ type: "log", message: `  Waiting ${Math.round(pageDelay/1000)}s before next page...` });
        await delay(pageDelay, pageDelay + 2000);
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
          headers: { 'User-Agent': currentProfile.ua },
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

  // Fresh session for each scan
  rotateProfile();

  try {
    send({ type: "log", message: `Searching eBay for ${cardName} PSA 10 (max $${maxPrice})...` });

    const allListings = [];
    const seenIds = new Set();

    const searchQuery = `"psa 10" ${cardName} -bgs -cgc -sgc -ags -lot -bundle -reprint -japanese -japan -jpn -korean -chinese -svk`;
    const pages = 4;

    for (let pageNum = 1; pageNum <= pages; pageNum++) {
      const encoded = encodeURIComponent(searchQuery);
      const url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}&_sacat=0&LH_TitleDesc=0&_ipg=240&_sop=15&_pgn=${pageNum}`;

      send({ type: "log", message: `Page ${pageNum}/${pages}...` });

      try {
        const result = await fetchEbayPage(url, send);
        if (result.blocked) {
          send({ type: "log", message: `  Blocked on page ${pageNum}, skipping.` });
          continue;
        }

        const $ = cheerio.load(result.html);
        const listings = parseListings($);
        send({ type: "log", message: `  ${listings.length} listings on page` });

        for (const l of listings) {
          const idMatch = l.link.match(/\/itm\/(\d+)/);
          const itemId = idMatch ? idMatch[1] : null;
          if (!itemId || seenIds.has(itemId)) continue;

          const t = l.title.toLowerCase();
          if (!/psa\s*10/i.test(l.title)) continue;
          if (!t.includes(cardName.toLowerCase())) continue;
          if (/\b(bgs|cgc|sgc|ace|ags|beckett)\b/i.test(l.title)) continue;
          if (/\b(japanese|japan|jpn|jp|korean|chinese|french\s+card|german\s+card|svk|chi|kor)\b/i.test(t)) continue;
          const ft = (l.fullText || '').toLowerCase();
          if (/\b(ungraded|lightly played|heavily played|cgc\s*\d|bgs\s*\d|sgc\s*\d|ags\s*\d)\b/i.test(ft)) continue;
          if (/\b(japanese|japan|jpn|jp\b|svk)\b/i.test(ft)) continue;

          seenIds.add(itemId);

          const priceMatch = l.priceText.match(/\$([\d,]+\.?\d*)/);
          const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null;
          if (price === null || price > maxPrice) continue;

          const isAuction = l.auctionSignals.length > 0;

          allListings.push({
            title: l.title,
            cardName,
            price,
            link: l.link.split("?")[0],
            isAuction,
            itemId,
            location: l.location || '',
            timeLeft: l.timeLeft || '',
          });

          send({ type: "found", count: allListings.length, latest: l.title.substring(0, 50), price });
        }

        send({ type: "log", message: `  Total matched: ${allListings.length}` });
        if (listings.length === 0) break;
      } catch (err) {
        send({ type: "error", message: `Search error: ${err.message}` });
      }

      // Human-like variable delay
      const pageDelay = 10000 + Math.random() * 15000;
      await delay(pageDelay, pageDelay + 2000);
    }

    send({ type: "log", message: `Looking up market prices on PriceCharting...` });
    const pcCache = {};

    async function lookupPC(searchTerm) {
      if (pcCache[searchTerm] !== undefined) return pcCache[searchTerm];
      try {
        const searchUrl = `https://www.pricecharting.com/search-products?q=${encodeURIComponent(searchTerm)}&type=prices`;
        const pcResp = await gotScraping({
          url: searchUrl,
          headers: { 'User-Agent': currentProfile.ua },
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
            headers: { 'User-Agent': currentProfile.ua },
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
      let endTime = '';
      let totalMinutes = 0;
      if (listing.timeLeft) {
        const ts = listing.timeLeft.toLowerCase();
        const dM = ts.match(/(\d+)\s*d/);
        const hM = ts.match(/(\d+)\s*h/);
        const mM = ts.match(/(\d+)\s*m/);
        if (dM) totalMinutes += parseInt(dM[1]) * 1440;
        if (hM) totalMinutes += parseInt(hM[1]) * 60;
        if (mM) totalMinutes += parseInt(mM[1]);
        const end = new Date(Date.now() + totalMinutes * 60000);
        endTime = end.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      }

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
        timeLeft: listing.timeLeft,
        endTime,
        totalMinutes,
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
    auctions.sort((a, b) => a.totalMinutes - b.totalMinutes);

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

const PORT = process.env.PORT || 3456;
gotReady.then(() => {
  const server = app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
  });
  server.keepAliveTimeout = 600000;
  server.headersTimeout = 600000;
});
process.stdin.resume();
