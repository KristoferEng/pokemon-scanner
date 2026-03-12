const express = require("express");
const puppeteer = require("puppeteer-extra");
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const path = require("path");
const cheerio = require("cheerio");

puppeteer.use(StealthPlugin());

process.on("uncaughtException", (err) => console.error("Uncaught:", err));
process.on("unhandledRejection", (err) => console.error("Unhandled:", err));

const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

function delay(min, max) {
  return new Promise((r) => setTimeout(r, Math.floor(Math.random() * (max - min + 1)) + min));
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
  if (!/psa\s*10|gem\s*mint\s*10/i.test(t)) return null;
  if (t.includes("shadowless") || t.includes("1st edition") || t.includes("first edition")) return null;
  if (!t.includes("base") && !t.includes("/102")) return null;

  const numMatch = t.match(/(?:#|no\.?\s*)?(\d{1,3})\s*\/\s*102/);
  if (numMatch) {
    const num = parseInt(numMatch[1]);
    const card = BASE_SET_CARDS.find((c) => c.number === num);
    if (card) return card.name;
  }

  const sorted = [...BASE_SET_CARDS].sort((a, b) => b.name.length - a.name.length);
  for (const card of sorted) {
    if (t.includes(card.name.toLowerCase())) return card.name;
  }
  return null;
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

  // SSE keep-alive ping every 15 seconds
  const keepAlive = setInterval(() => {
    try { res.write(': ping\n\n'); } catch(e) {}
  }, 15000);

  let browser;
  try {
    send({ type: "log", message: "Launching stealth browser..." });

    browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--disable-extensions",
        "--disable-background-networking",
        "--disable-default-apps",
        "--disable-sync",
        "--disable-translate",
        "--no-first-run",
        "--js-flags=--max-old-space-size=192",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    // Block images, CSS, fonts, media to save memory
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'stylesheet', 'font', 'media', 'texttrack', 'websocket'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // ===== PHASE 1: COLLECT ALL LISTINGS =====
    send({ type: "log", message: "Phase 1: Collecting eBay listings..." });

    const allListings = [];
    const seenIds = new Set();
    const MAX_FOUND = 1000;
    const searchStartTime = Date.now();
    const SEARCH_TIME_LIMIT = 4 * 60 * 1000;

    const searches = [
      { q: "psa 10 pokemon base set unlimited", pages: 8 },
      { q: '"psa 10" "base set" unlimited pokemon /102', pages: 6 },
      { q: "psa 10 gem mint pokemon base set unlimited trainer", pages: 4 },
      { q: "psa 10 gem mint pokemon base set unlimited energy common", pages: 4 },
    ];

    let hitCap = false;
    for (const search of searches) {
      if (hitCap) break;
      for (let pageNum = 1; pageNum <= search.pages; pageNum++) {
        if (hitCap) break;
        if (Date.now() - searchStartTime >= SEARCH_TIME_LIMIT) {
          send({ type: "log", message: `Time limit reached. Found ${allListings.length} listings.` });
          hitCap = true;
          break;
        }
        const encoded = encodeURIComponent(search.q);
        const url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}&_sacat=0&LH_TitleDesc=1&_ipg=240&_sop=15&_pgn=${pageNum}`;

        send({ type: "log", message: `Searching: "${search.q}" (page ${pageNum})...` });

        try {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 45000 });
          await delay(2000, 4000);

          // Light scrolling to trigger lazy-loaded content
          await page.evaluate(() => window.scrollBy(0, 800));
          await delay(500, 1000);
          await page.evaluate(() => window.scrollBy(0, 800));
          await delay(500, 1000);

          // Get page HTML and parse with cheerio
          const html = await page.content();
          const $ = cheerio.load(html);

          const pageTitle = $('title').text();
          send({ type: "log", message: `  Page title: "${pageTitle.substring(0, 60)}..."` });

          // Check if we got blocked
          if (pageTitle.includes('Pardon') || pageTitle.includes('Security')) {
            send({ type: "log", message: `  Bot detection triggered. Waiting 30s...` });
            await delay(30000, 40000);
            continue;
          }

          let listings = [];

          // Try multiple eBay listing selectors
          const selectors = ['.s-card.s-card--vertical', '.srp-results .s-item'];
          const sel = selectors.find(s => $(s).length > 0) || selectors[0];

          $(sel).each((_, el) => {
            const $el = $(el);
            const title = ($el.find('.s-card__title').text() || $el.find('.s-item__title').text() || '').trim().replace(/Opens in a new window or tab$/i, '').replace(/^New Listing/i, '').trim();
            const priceText = ($el.find('.s-card__price').text() || $el.find('.s-item__price').text() || '').trim();
            const link = $el.find('a[href*="/itm/"]').attr('href') || '';
            const fullText = $el.text().toLowerCase();

            if (!title || title === 'Shop on eBay' || !link.includes('/itm/')) return;

            const auctionSignals = [];
            if (/\bbid\b/.test(fullText) && !/buy it now/i.test(fullText)) auctionSignals.push('bid-in-text');
            if (/time left/i.test(fullText)) auctionSignals.push('time-left');

            listings.push({ title, priceText, link, auctionSignals });
          });

          send({ type: "log", message: `  Found ${listings.length} listings on this page` });

          for (const l of listings) {
            const idMatch = l.link.match(/\/itm\/(\d+)/);
            const itemId = idMatch ? idMatch[1] : null;
            if (!itemId || seenIds.has(itemId)) continue;

            const cardName = identifyCard(l.title);
            if (!cardName) continue;

            seenIds.add(itemId);

            const priceMatch = l.priceText.match(/\$([\d,]+\.?\d*)/);
            const price = priceMatch ? parseFloat(priceMatch[1].replace(/,/g, "")) : null;
            if (price === null) continue;

            const isAuction = l.auctionSignals.length > 0;

            allListings.push({
              title: l.title,
              cardName,
              price,
              link: l.link.split("?")[0],
              isAuction,
              itemId,
            });

            send({ type: "found", count: allListings.length, latest: cardName, price });

            if (allListings.length >= MAX_FOUND) {
              hitCap = true;
              break;
            }
          }

          send({ type: "log", message: `  Total matched so far: ${allListings.length}` });

          // Clear page memory between searches
          await page.evaluate(() => { document.body.innerHTML = ''; });

        } catch (err) {
          send({ type: "error", message: `Search error on "${search.q}" page ${pageNum}: ${err.message}` });
        }

        await delay(3000, 6000);
      }
      await delay(4000, 8000);
    }

    send({ type: "log", message: `Phase 1 complete: ${allListings.length} listings found.` });

    // Close browser to free memory before Phase 2
    if (browser) {
      await browser.close();
      browser = null;
      send({ type: "log", message: "Browser closed to free memory." });
    }

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

        const pcResp = await fetch(directUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
        });
        const pcHtml = await pcResp.text();
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

      const item = {
        name: listing.cardName,
        title: listing.title,
        price: listing.price,
        marketPrice,
        difference,
        ebayUrl: listing.link,
        pricechartingUrl: pc.pricechartingUrl,
        verified: true,
      };

      if (listing.isAuction) {
        auctions.push(item);
      } else {
        buyItNow.push(item);
      }
    }

    buyItNow.sort((a, b) => {
      if (a.difference == null) return 1;
      if (b.difference == null) return -1;
      return a.difference - b.difference;
    });
    auctions.sort((a, b) => {
      if (a.difference == null) return 1;
      if (b.difference == null) return -1;
      return a.difference - b.difference;
    });

    send({ type: "log", message: `Done! ${buyItNow.length} Buy It Now, ${auctions.length} Auctions.` });
    send({ type: "result", buyItNow, auctions });
    send({ type: "done" });
  } catch (e) {
    console.error("Scan error:", e);
    send({ type: "error", message: e.message });
    send({ type: "done" });
  } finally {
    clearInterval(keepAlive);
    if (browser) await browser.close().catch(() => {});
    res.end();
  }
});

const PORT = process.env.PORT || 3456;
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
server.keepAliveTimeout = 600000;
server.headersTimeout = 600000;
process.stdin.resume();
