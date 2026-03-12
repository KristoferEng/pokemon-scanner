const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');

  // Search for a specific card
  await page.goto('https://www.pricecharting.com/search-products?q=pokemon+base+set+bulbasaur+44%2F102&type=prices', { waitUntil: 'domcontentloaded', timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));

  // Get the first product link
  const productUrl = await page.evaluate(() => {
    const links = document.querySelectorAll('a');
    for (const a of links) {
      if ((a.getAttribute('href') || '').includes('/game/')) {
        const href = a.getAttribute('href');
        return href.startsWith('http') ? href : 'https://www.pricecharting.com' + href;
      }
    }
    return null;
  });
  console.log('Product URL:', productUrl);

  if (productUrl) {
    await page.goto(productUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await new Promise(r => setTimeout(r, 2000));

    // Dump all price-related content
    const info = await page.evaluate(() => {
      const result = { rows: [], ids: [] };

      // Get all table rows with prices
      document.querySelectorAll('tr').forEach(row => {
        const text = row.textContent.trim().replace(/\s+/g, ' ');
        if (text.includes('$')) {
          result.rows.push(text.substring(0, 150));
        }
      });

      // Get elements with id containing "price"
      document.querySelectorAll('[id*="price"], [id*="Price"], [class*="price"]').forEach(el => {
        result.ids.push({ id: el.id, class: el.className, text: el.textContent.trim().substring(0, 100) });
      });

      // Look specifically for the price table/attribute section
      const priceSection = document.querySelector('#attribute, #price-table, .price-table, #used-price, #complete-price');
      if (priceSection) {
        result.priceSection = priceSection.innerHTML.substring(0, 500);
      }

      // Get dt/dd pairs
      document.querySelectorAll('dt').forEach(dt => {
        const dd = dt.nextElementSibling;
        if (dd) {
          result.rows.push('DT/DD: ' + dt.textContent.trim() + ' => ' + dd.textContent.trim());
        }
      });

      return result;
    });
    console.log(JSON.stringify(info, null, 2));
  }
  await browser.close();
})();
