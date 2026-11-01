/* debug-desktop-sidebar.js — 桌面端侧栏布局结构诊断 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const [w, h] of [[1280, 720], [1400, 900]]) {
    const p = await b.newPage();
    await p.setViewport({ width: w, height: h });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(() => {
      localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
      localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 600));
    const m = await p.evaluate(() => {
      const body = document.body;
      const side = document.querySelector('.sidebar');
      const nav = document.querySelector('.nav');
      const cs = getComputedStyle(side);
      const navCs = getComputedStyle(nav);
      const out = {
        bodyH: Math.round(body.getBoundingClientRect().height),
        bodyGridRows: getComputedStyle(body).gridTemplateRows,
        sideRect: (r => ({ top: Math.round(r.top), h: Math.round(r.height), bottom: Math.round(r.bottom) }))(side.getBoundingClientRect()),
        sidePadB: cs.paddingBottom,
        sideMinH: cs.minHeight,
        sideOverflow: cs.overflow,
        navRect: (r => ({ top: Math.round(r.top), h: Math.round(r.height), bottom: Math.round(r.bottom) }))(nav.getBoundingClientRect()),
        navScrollH: nav.scrollHeight, navClientH: nav.clientHeight,
        navFlex: navCs.flex, navMinH: navCs.minHeight, navOverflow: navCs.overflowY,
        footMarginT: getComputedStyle(document.querySelector('.sidebar-foot')).marginTop,
        children: [...side.children].map(el => {
          const r = el.getBoundingClientRect();
          return el.className.split(' ')[0] + ':' + Math.round(r.top) + '-' + Math.round(r.bottom);
        }),
      };
      return out;
    });
    console.log(`=== ${w}x${h} ===`);
    console.log(JSON.stringify(m, null, 2));
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
