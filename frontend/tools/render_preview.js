/* Draws frontend/public/preview.jpg, the picture shown under a pasted link (og:image in index.html): the
   closed envelope in whatever Letter style is live on the running site, 1200x630 as Facebook asks.

     npm i --no-save puppeteer-core            (once, anywhere outside the repo is fine)
     node frontend/tools/render_preview.js [http://localhost:8080]

   Then put the printed ?v= in index.html's og:image, so Messenger and the like stop showing the old one. */
const path = require('path');
const crypto = require('crypto');
const fs = require('fs');
const puppeteer = require('puppeteer-core');

const SITE = process.argv[2] || 'http://localhost:8080';
const OUT = path.join(__dirname, '..', 'public', 'preview.jpg');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DPR = 1.25;   // 960x504 of page, scaled to exactly 1200x630

(async () => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
  const page = await browser.newPage();
  // square and large enough that the envelope reaches its full 500px (layout() in index.html)
  await page.setViewport({ width: 1000, height: 1000, deviceScaleFactor: DPR });
  await page.goto(`${SITE}/?to=Guest`, { waitUntil: 'networkidle0' });
  await page.click('button[data-lang="en"]');
  await new Promise((r) => setTimeout(r, 6000));   // let the envelope land
  const box = await page.$eval('#env', (el) => {
    const b = el.getBoundingClientRect();
    return { cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
  });
  const w = 1200 / DPR, h = 630 / DPR;
  await page.screenshot({
    path: OUT, type: 'jpeg', quality: 88,
    clip: { x: box.cx - w / 2, y: box.cy + 4 - h / 2, width: w, height: h },   // +4: room for the shadow
  });
  await browser.close();
  const v = crypto.createHash('sha1').update(fs.readFileSync(OUT)).digest('hex').slice(0, 8);
  console.log(`Wrote ${OUT}\nIn index.html: og:image ... /preview.jpg?v=${v}`);
})();
