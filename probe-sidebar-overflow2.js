/* probe-sidebar-overflow2.js — 登录态下探测侧栏内容溢出与用户卡被裁 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const cases = [
    [390, 812], [390, 750], [390, 700], [390, 660], [390, 620], [390, 580],
    [412, 700], [360, 700], [430, 660], [375, 640],
  ];
  for (const [width, vh] of cases) {
    const p = await b.newPage();
    await p.setViewport({ width, height: vh, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await p.goto(BASE, { waitUntil: 'load' });
    // 登录态注入
    await p.evaluate(() => {
      localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
      localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 800));
    await p.evaluate(() => { const mb = document.querySelector('.menu-btn'); if (mb) mb.click(); });
    await new Promise(r => setTimeout(r, 300));
    const m = await p.evaluate(() => {
      const side = document.querySelector('.sidebar');
      const bar = document.querySelector('.player-bar');
      const card = document.querySelector('.sidebar-user');
      const nav = document.querySelector('.nav');
      const legal = document.querySelector('.legal-links');
      const sr = side.getBoundingClientRect();
      const br = bar.getBoundingClientRect();
      const cr = card ? card.getBoundingClientRect() : null;
      const lr = legal ? legal.getBoundingClientRect() : null;
      return {
        sideH: Math.round(sr.height),
        sideBottom: Math.round(sr.bottom),
        barTop: Math.round(br.top),
        cardTop: cr ? Math.round(cr.top) : null,
        cardBottom: cr ? Math.round(cr.bottom) : null,
        cardCut: cr ? Math.max(0, Math.round(cr.bottom - br.top)) : null,
        legalBottom: lr ? Math.round(lr.bottom) : null,
        navContent: nav ? Math.round(nav.scrollHeight) : null,
        navBox: nav ? Math.round(nav.getBoundingClientRect().height) : null,
        sideScrollH: side.scrollHeight,
      };
    });
    const flag = m.cardCut > 0 ? `❌ 卡被裁 ${m.cardCut}px` : '✅';
    console.log(`w=${width} vh=${vh}: 侧栏H=${m.sideH} 底=${m.sideBottom} 条顶=${m.barTop} 卡[${m.cardTop},${m.cardBottom}] 法链底=${m.legalBottom} nav=${m.navContent}/${m.navBox} sideScroll=${m.sideScrollH} ${flag}`);
    if (m.cardCut > 0) {
      await p.screenshot({ path: `/workspace/repro-overflow-${width}x${vh}.png` });
    }
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
