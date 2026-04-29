// Pokemon Center stock monitor.
//
// Fetches https://www.pokemoncenter.com/category/trading-card-game?category=tcg-cards&sort=launch_date+desc
// using patchright (CDP-undetected Playwright fork) since Pokemon Center is
// behind Imperva and blocks every plain HTTP/headless approach we tested.
//
// Exposes: { checkPokemonCenterTcg(): Promise<Product[]> }
// Each product: { url, title, price, soldOut }
//
// Uses a singleton browser kept alive between checks — relaunching Chrome
// every minute is wasteful and would re-trigger the Imperva challenge.

const { chromium } = require('patchright');
const path = require('path');
const fs = require('fs');

const URL = 'https://www.pokemoncenter.com/category/trading-card-game?category=tcg-cards&sort=launch_date%2Bdesc';

// Persistent profile dir keeps the Imperva cookies across restarts.
const PROFILE_DIR = process.env.RENDER
  ? '/tmp/patchright-profile'
  : path.join(require('os').tmpdir(), 'pokemon-patchright-profile');

let _ctx = null;
let _page = null;
let _launching = null;

async function ensureBrowser() {
  if (_page && !_page.isClosed()) return _page;
  if (_launching) return _launching;
  _launching = (async () => {
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
    // Per patchright docs the most stealth combo is:
    //   channel: 'chrome', headless: false, viewport: null, no userAgent override
    // On Linux/Render with no display we run inside xvfb-run so headless: false works.
    _ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      channel: 'chrome',
      headless: false,
      viewport: null,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
    });
    _ctx.on('close', () => { _ctx = null; _page = null; });
    _page = await _ctx.newPage();
    return _page;
  })();
  try { return await _launching; } finally { _launching = null; }
}

async function closeBrowser() {
  try { if (_ctx) await _ctx.close(); } catch {}
  _ctx = null; _page = null;
}

async function checkPokemonCenterTcg({ timeoutMs = 60000 } = {}) {
  let page;
  try {
    page = await ensureBrowser();
  } catch (e) {
    // Retry once with a fresh profile if launch fails (chrome may have crashed).
    await closeBrowser();
    page = await ensureBrowser();
  }

  const navStart = Date.now();
  // Always goto: page.reload occasionally races with the background tracking
  // scripts the page injects and throws ERR_ABORTED. goto is idempotent.
  // Append a cachebuster so the request actually hits origin each time.
  const navUrl = URL + (URL.includes('?') ? '&' : '?') + '_t=' + Date.now();
  try {
    await page.goto(navUrl, { waitUntil: 'load', timeout: timeoutMs });
  } catch (e) {
    if (/frame was detached|ERR_ABORTED|Navigation/.test(e.message)) {
      // Retry once: bg scripts sometimes redirect mid-load
      await page.waitForTimeout(1000);
      await page.goto(navUrl, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    } else throw e;
  }

  // Wait for the product grid to render. The page is server-side rendered
  // but the Imperva challenge can briefly leave the body empty.
  await page.waitForFunction(
    () => /SOLD OUT|Quick View/.test(document.body?.innerText || ''),
    { timeout: timeoutMs }
  );
  await page.waitForTimeout(500);

  const products = await page.evaluate(() => {
    // CSS-modules suffixes change between deploys — match on prefix.
    const cards = document.querySelectorAll(
      '[class*="category-products--"] [class*="product-box--"], [class*="category-products-grid--"] [class*="product-box--"]'
    );
    const seen = new Set();
    const out = [];
    for (const card of cards) {
      const a = card.querySelector('a[href^="/product/"]');
      if (!a) continue;
      const url = new URL(a.getAttribute('href'), location.origin).toString().split('?')[0];
      if (seen.has(url)) continue;
      seen.add(url);
      const img = card.querySelector('img[alt]');
      const title = img ? img.getAttribute('alt') : (a.textContent || '').trim();
      const text = card.innerText || '';
      const priceMatch = text.match(/\$[\d,]+\.\d{2}/);
      const soldOut =
        !!card.querySelector('[class*="product-image-oos--"]') ||
        /\bSOLD OUT\b/.test(text);
      out.push({ url, title, price: priceMatch ? priceMatch[0] : null, soldOut });
    }
    return out;
  });

  if (!products.length) {
    throw new Error('No products extracted — likely blocked or selectors changed');
  }
  return { products, fetchedAt: new Date().toISOString(), navMs: Date.now() - navStart };
}

module.exports = { checkPokemonCenterTcg, closeBrowser, URL };
