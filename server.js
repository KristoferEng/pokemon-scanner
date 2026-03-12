const express = require("express");
const path = require("path");
const cheerio = require("cheerio");
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

  try {
    // Rotate User-Agents to look more human
    const USER_AGENTS = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.2 Safari/605.1.15',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    ];
    const pickedUA = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];

    // Seed cookies by visiting eBay homepage first
    send({ type: "log", message: "Visiting eBay to establish session..." });
    let ebayCookies = '';
    try {
      const homeResp = await fetch('https://www.ebay.com/', {
        headers: {
          'User-Agent': pickedUA,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(15000),
      });
      const setCookies = homeResp.headers.getSetCookie?.() || [];
      ebayCookies = setCookies.map(c => c.split(';')[0]).join('; ');
      send({ type: "log", message: `  Session established (${setCookies.length} cookies)` });
    } catch (e) {
      send({ type: "log", message: `  Could not seed cookies: ${e.message}` });
    }

    const getHeaders = (referer) => ({
      'User-Agent': pickedUA,
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Referer': referer || 'https://www.ebay.com/',
      'DNT': '1',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      ...(ebayCookies ? { 'Cookie': ebayCookies } : {}),
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
          const referer = pageNum === 1 ? 'https://www.ebay.com/' : `https://www.ebay.com/sch/i.html?_nkw=${encoded}&_pgn=${pageNum - 1}`;
          const resp = await fetch(url, { headers: getHeaders(referer), redirect: 'follow', signal: AbortSignal.timeout(30000) });
          const html = await resp.text();
          const $ = cheerio.load(html);

          const pageTitle = $('title').text();
          send({ type: "log", message: `  Page: "${pageTitle}" (${html.length} bytes)` });

          // Check if we got blocked
          if (pageTitle.includes('Pardon') || pageTitle.includes('Security')) {
            send({ type: "log", message: `  Bot detection triggered. Waiting 15s...` });
            await delay(15000, 20000);
            continue;
          }

          let listings = [];

          // Try multiple eBay listing selectors
          const selectors = ['.s-card.s-card--vertical', '.srp-results .s-item', '[data-viewport]'];
          let sel = selectors.find(s => $(s).length > 0) || selectors[0];

          $(sel).each((_, el) => {
            const $el = $(el);
            const title = ($el.find('.s-card__title').text() || $el.find('.s-item__title').text() || '').trim().replace(/Opens in a new window or tab$/i, '').replace(/^New Listing/i, '').trim();
            const priceText = ($el.find('.s-card__price').text() || $el.find('.s-item__price').text() || '').trim();
            const link = $el.find('a[href*="/itm/"]').attr('href') || '';
            const imgUrl = $el.find('img[src*="ebayimg"]').attr('src') || $el.find('img').attr('src') || '';
            const fullText = $el.text().toLowerCase();

            if (!title || title === 'Shop on eBay' || !link.includes('/itm/')) return;

            const auctionSignals = [];
            if (/\bbid\b/.test(fullText) && !/buy it now/i.test(fullText)) auctionSignals.push('bid-in-text');
            if (/time left/i.test(fullText)) auctionSignals.push('time-left');

            listings.push({ title, priceText, link, auctionSignals, imgUrl });
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
              imgUrl: l.imgUrl ? l.imgUrl.replace(/s-l\d+/, 's-l1600') : '',
            });

            send({ type: "found", count: allListings.length, latest: cardName, price });

            if (allListings.length >= MAX_FOUND) {
              hitCap = true;
              break;
            }
          }

          send({ type: "log", message: `  Total matched so far: ${allListings.length}` });
        } catch (err) {
          send({ type: "error", message: `Search error on "${search.q}" page ${pageNum}: ${err.message}` });
        }

        await delay(2000, 4000);
      }
      await delay(3000, 5000);
    }

    send({ type: "log", message: `Phase 1 complete: ${allListings.length} listings found.` });

    // ===== PHASE 2: VERIFY PSA GRADING VIA IMAGE OCR =====
    send({ type: "log", message: "Phase 2: Verifying PSA grading via image OCR..." });

    const verified = [];
    let worker = null;

    try {
      worker = await Tesseract.createWorker('eng');

      for (let i = 0; i < allListings.length; i++) {
        const listing = allListings[i];
        if (!listing.imgUrl) {
          // No image: include as unverified
          listing.verified = false;
          verified.push(listing);
          send({ type: "log", message: `No image for ${listing.cardName} - including as unverified` });
          continue;
        }

        send({ type: "log", message: `Verifying ${i + 1}/${allListings.length}: ${listing.cardName} ($${listing.price})...` });

        try {
          const { data: { text } } = await worker.recognize(listing.imgUrl);
          const hasPSA = /\bpsa\b/i.test(text);
          const hasGemMT = /gem\s*m[ti]/i.test(text);
          const hasCertNum = /\b\d{7,9}\b/.test(text);
          const has10 = /\b10\b/.test(text);
          const hasOtherGrader = /\b(gma|bgs|cgc|sgc|ace)\b/i.test(text);

          if (!hasOtherGrader && ((hasPSA && has10) || (hasGemMT && hasCertNum && has10))) {
            listing.verified = true;
            verified.push(listing);
            send({ type: "verified", count: verified.length, card: listing.cardName });
            send({ type: "log", message: `  ✓ PSA 10 confirmed in image` });
          } else {
            // OCR couldn't confirm — include as unverified so user still sees it
            listing.verified = false;
            verified.push(listing);
            send({ type: "log", message: `  ? Unverified (PSA:${hasPSA} 10:${has10} other:${hasOtherGrader}) - including anyway` });
          }
        } catch (err) {
          // OCR failed — include as unverified fallback
          listing.verified = false;
          verified.push(listing);
          send({ type: "error", message: `OCR error for ${listing.cardName}: ${err.message} - including as unverified` });
        }
      }
    } catch (workerErr) {
      send({ type: "error", message: `Tesseract worker init failed: ${workerErr.message} - including all listings as unverified` });
      for (const listing of allListings) {
        if (!verified.includes(listing)) {
          listing.verified = false;
          verified.push(listing);
        }
      }
    } finally {
      if (worker) {
        try { await worker.terminate(); } catch(e) {}
      }
    }

    send({ type: "log", message: `Phase 2 complete: ${verified.filter(l => l.verified).length} verified, ${verified.filter(l => !l.verified).length} unverified out of ${allListings.length}.` });

    // ===== PHASE 3: PRICECHARTING LOOKUP =====
    send({ type: "log", message: "Phase 3: Looking up market prices on PriceCharting..." });

    const priceCache = {};
    const uniqueCards = [...new Set(verified.map((l) => l.cardName))];

    for (let i = 0; i < uniqueCards.length; i++) {
      const cardName = uniqueCards[i];
      send({ type: "log", message: `PriceCharting ${i + 1}/${uniqueCards.length}: ${cardName}...` });

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
    clearInterval(keepAlive);
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
