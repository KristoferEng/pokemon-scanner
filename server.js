const express = require("express");
const puppeteer = require("puppeteer");
const path = require("path");
const Tesseract = require("tesseract.js");

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
  // Must mention PSA 10
  if (!/psa\s*10|gem\s*mint\s*10/i.test(t)) return null;

  // Must be unlimited - exclude shadowless and 1st edition
  if (t.includes("shadowless") || t.includes("1st edition") || t.includes("first edition")) return null;

  // Must reference base set
  if (!t.includes("base") && !t.includes("/102")) return null;

  // Try card number match first (e.g. "4/102", "#4", "no. 4")
  const numMatch = t.match(/(?:#|no\.?\s*)?(\d{1,3})\s*\/\s*102/);
  if (numMatch) {
    const num = parseInt(numMatch[1]);
    const card = BASE_SET_CARDS.find((c) => c.number === num);
    if (card) return card.name;
  }

  // Name match - longest first to avoid partial matches
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

  let browser;
  try {
    send({ type: "log", message: "Launching headless browser..." });

    browser = await puppeteer.launch({
      headless: "new",
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox",
        "--disable-blink-features=AutomationControlled",
        "--disable-dev-shm-usage",
        "--window-size=1920,1080",
      ],
    });

    const page = await browser.newPage();

    // Anti-detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => false });
      Object.defineProperty(navigator, "plugins", { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    );
    await page.setViewport({ width: 1920, height: 1080 });
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-US,en;q=0.9" });

    // ===== PHASE 1: COLLECT ALL LISTINGS =====
    send({ type: "log", message: "Phase 1: Collecting all eBay listings..." });

    const allListings = [];
    const seenIds = new Set();

    const MAX_FOUND = 1000;
    const searchStartTime = Date.now();
    const SEARCH_TIME_LIMIT = 3 * 60 * 1000; // 3 minutes

    // Focus on unlimited base set only
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
          send({ type: "log", message: `1 minute search limit reached. Found ${allListings.length} listings. Moving on.` });
          hitCap = true;
          break;
        }
        const encoded = encodeURIComponent(search.q);
        // _sop=15 = Price + Shipping: lowest first
        const url = `https://www.ebay.com/sch/i.html?_nkw=${encoded}&_sacat=0&LH_TitleDesc=1&_ipg=240&_sop=15&_pgn=${pageNum}`;

        send({ type: "log", message: `Searching: "${search.q}" (page ${pageNum})...` });

        try {
          await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });
          await delay(2000, 4000);

          // Scroll like a human
          for (let i = 0; i < 8; i++) {
            await page.evaluate(() => window.scrollBy(0, Math.random() * 800 + 400));
            await delay(500, 1200);
          }

          // Extract listings - eBay uses .s-card selectors
          const pageTitle = await page.title();
          send({ type: "log", message: `  Page loaded: "${pageTitle}"` });

          const listings = await page.evaluate(() => {
            const items = [];
            const elements = document.querySelectorAll('.s-card.s-card--vertical');

            elements.forEach((el) => {
              const titleEl = el.querySelector('.s-card__title');
              const priceEl = el.querySelector('.s-card__price');
              const linkEl = el.querySelector('a[href*="/itm/"]');
              const timeEl = el.querySelector('.s-card__time-left, .s-card__time');

              if (!titleEl || !linkEl) return;

              const title = titleEl.textContent.trim().replace(/Opens in a new window or tab$/i, '');
              const priceText = priceEl ? priceEl.textContent.trim() : '';
              const link = linkEl.href || '';
              const timeText = timeEl ? timeEl.textContent.trim() : '';

              if (title === 'Shop on eBay' || !link.includes('/itm/')) return;

              // Detect auctions: time left, bids, or "or Best Offer" absent with countdown
              const auctionSignals = [];
              if (/\d+[dhms]\s*(left|\d)/i.test(timeText)) auctionSignals.push(timeText);
              if (/\d+\s*bid/i.test(timeText)) auctionSignals.push(timeText);

              // Check for bid count elsewhere in the card
              const bidEl = el.querySelector('.s-card__bid-count, .s-card__bids, [class*="bid"]');
              if (bidEl) auctionSignals.push(bidEl.textContent.trim());

              // Check if price says "current" or has "bid" language
              const fullText = el.textContent.toLowerCase();
              if (/\bbid\b/.test(fullText) && !/buy it now/i.test(fullText)) auctionSignals.push('bid-in-text');
              if (/time left/i.test(fullText)) auctionSignals.push('time-left');

              items.push({ title, priceText, link, auctionSignals });
            });
            return items;
          });

          send({ type: "log", message: `  Found ${listings.length} raw listings on this page (${listings.filter(l=>l.title!=='Shop on eBay').length} real)` });

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
              send({ type: "log", message: `Hit ${MAX_FOUND} cap! Moving to verification phase.` });
              hitCap = true;
              break;
            }
          }

          send({ type: "log", message: `  Total matched so far: ${allListings.length}` });
        } catch (err) {
          send({ type: "error", message: `Search error on "${search.q}" page ${pageNum}: ${err.message}` });
        }

        // Human-like delay between pages
        await delay(3000, 7000);
      }

      // Longer delay between different searches
      await delay(5000, 10000);
    }

    send({ type: "log", message: `Phase 1 complete: ${allListings.length} listings found.` });

    // ===== PHASE 2: VERIFY PSA GRADING =====
    send({ type: "log", message: "Phase 2: Verifying PSA grading on listing pages..." });

    const verified = [];
    const maxVerify = Math.min(allListings.length, 80);

    for (let i = 0; i < maxVerify; i++) {
      const listing = allListings[i];
      send({ type: "log", message: `Verifying ${i + 1}/${maxVerify}: ${listing.cardName} ($${listing.price})...` });

      try {
        await page.goto(listing.link, { waitUntil: "domcontentloaded", timeout: 20000 });
        await delay(1500, 3500);

        // Always OCR the listing images - PSA and 10 MUST be visible in the picture to count
        let ocrResult = false;
        const imgUrls = await page.evaluate(() => {
          const imgs = new Set();
          const matches = document.body.innerHTML.match(/https:\/\/i\.ebayimg\.com\/images\/g\/[A-Za-z0-9~_-]+\/s-l\d+\.\w+/g) || [];
          for (const url of matches) {
            imgs.add(url.replace(/s-l\d+\.\w+/, 's-l1600.jpg'));
          }
          return [...imgs].slice(0, 5);
        });

        for (const imgUrl of imgUrls) {
          try {
            const { data: { text } } = await Tesseract.recognize(imgUrl, 'eng', { logger: () => {} });
            const hasPSA = /\bpsa\b/i.test(text);
            const hasGemMT = /gem\s*m[ti]/i.test(text);
            const hasCertNum = /\b\d{7,9}\b/.test(text);
            const has10 = /\b10\b/.test(text);
            const hasOtherGrader = /\b(gma|bgs|cgc|sgc|ace)\b/i.test(text);

            if (hasOtherGrader) continue;
            if ((hasPSA && has10) || (hasGemMT && hasCertNum && has10)) {
              ocrResult = true;
              send({ type: "log", message: `  ✓ PSA 10 confirmed in image` });
              break;
            }
          } catch (e) {}
        }

        const isPSA = ocrResult;

        if (isPSA) {
          listing.verified = true;
          verified.push(listing);
          send({ type: "verified", count: verified.length, card: listing.cardName });
        } else {
          send({ type: "log", message: `  Removed ${listing.cardName} ($${listing.price}) - no PSA slab confirmed in images` });
        }
      } catch (err) {
        send({ type: "error", message: `Verify error for ${listing.cardName}: ${err.message}` });
      }

      await delay(2500, 5500);
    }

    send({ type: "log", message: `Phase 2 complete: ${verified.length} verified listings.` });

    // ===== PHASE 3: PRICECHARTING LOOKUP =====
    send({ type: "log", message: "Phase 3: Looking up market prices on PriceCharting..." });

    const priceCache = {};
    const uniqueCards = [...new Set(verified.map((l) => l.cardName))];

    for (let i = 0; i < uniqueCards.length; i++) {
      const cardName = uniqueCards[i];
      send({ type: "log", message: `PriceCharting ${i + 1}/${uniqueCards.length}: ${cardName}...` });

      try {
        const cardInfo = BASE_SET_CARDS.find((c) => c.name === cardName);
        // Build direct URL to the Base Set Unlimited card page
        const slug = cardName.toLowerCase().replace(/'/g, "%27").replace(/[^a-z0-9%]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        const directUrl = `https://www.pricecharting.com/game/pokemon-base-set/${slug}-${cardInfo ? cardInfo.number : ''}`;

        await page.goto(directUrl, { waitUntil: "networkidle2", timeout: 20000 });
        await delay(1500, 3000);

        // PSA 10 price is stored in the element with id "manual_only_price"
        const marketPrice = await page.evaluate(() => {
          const el = document.getElementById('manual_only_price');
          if (!el) return null;
          const match = el.textContent.match(/\$([\d,]+\.?\d*)/);
          return match ? parseFloat(match[1].replace(/,/g, '')) : null;
        });

        send({ type: "log", message: `  ${cardName}: PSA 10 market price = ${marketPrice ? '$' + marketPrice : 'N/A'}` });
        priceCache[cardName] = { marketPrice, pricechartingUrl: directUrl };
      } catch (err) {
        send({ type: "error", message: `PriceCharting error for ${cardName}: ${err.message}` });
        priceCache[cardName] = { marketPrice: null, pricechartingUrl: null };
      }

      await delay(2000, 4000);
    }

    // ===== BUILD RESULTS =====
    send({ type: "log", message: "Building final results..." });

    const buyItNow = [];
    const auctions = [];

    for (const listing of verified) {
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
        verified: listing.verified,
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
    if (browser) await browser.close();
    res.end();
  }
});

const PORT = process.env.PORT || 3456;
const server = app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
  console.log("Press Ctrl+C to stop.");
});
server.keepAliveTimeout = 600000;
server.headersTimeout = 600000;
process.stdin.resume();
