/* probe-sidebar-overflow.js — 探测侧栏内容在何种视口高度下溢出并被播放条裁切 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const heights = [812, 750, 700, 660, 620, 580, 540];
  const widths = [390, 412, 360, 430];
  for (const width of widths) {
    for (const vh of heights) {
      const p = await b.newPage();
      await p.setViewport({ width, height: vh, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      await p.goto(BASE, { waitUntil: 'load' });
      await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
      await new Promise(r => setTimeout(r, 600));
      await p.evaluate(() => { const mb = document.querySelector('.menu-btn'); if (mb) mb.click(); });
      await new Promise(r => setTimeout(r, 300));
      const m = await p.evaluate(() => {
        const side = document.querySelector('.sidebar');
        const bar = document.querySelector('.player-bar');
        const foot = document.querySelector('.sidebar-foot');
        const card = document.querySelector('.sidebar-user');
        const nav = document.querySelector('.nav');
        const sr = side.getBoundingClientRect();
        const br = bar.getBoundingClientRect();
        const fr = foot ? foot.getBoundingClientRect() : null;
        const cr = card ? card.getBoundingClientRect() : null;
        return {
          vh: window.innerHeight,
          sideH: Math.round(sr.height),
          sideBottom: Math.round(sr.bottom),
          barTop: Math.round(br.top),
          footBottom: fr ? Math.round(fr.bottom) : null,
          cardBottom: cr ? Math.round(cr.bottom) : null,
          cardCutPx: cr ? Math.max(0, Math.round(cr.bottom - br.top)) : null,
          navContentH: nav ? Math.round(nav.scrollHeight) : null,
          navBoxH: nav ? Math.round(nav.getBoundingClientRect().height) : null,
        };
      });
      const flag = m.cardCutPx > 0 ? '❌ 卡片被裁 ' + m.cardCutPx + 'px' : '✅';
      console.log(`w=${width} vh=${vh}: 侧栏高=${m.sideH} 底=${m.sideBottom} 播放条顶=${m.barTop} 卡底=${m.cardBottom} nav内容=${m.navContentH}/nav盒=${m.navBoxH} ${flag}`);
      await p.close();
    }
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
