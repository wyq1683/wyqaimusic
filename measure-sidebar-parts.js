/* measure-sidebar-parts.js — 量化侧栏各部分高度（移动端 390px） */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 390, height: 812, isMobile: true, hasTouch: true });
  await p.goto(BASE, { waitUntil: 'load' });
  await p.evaluate(() => {
    localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
    localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 800));
  const m = await p.evaluate(() => {
    const side = document.querySelector('.sidebar');
    const parts = {};
    const sel = ['.rail-toggle', '.brand', '.nav', '.download-app', '.sidebar-foot', '.powered-by', '.legal-links'];
    for (const s of sel) {
      const el = side.querySelector(s);
      if (el) parts[s] = Math.round(el.getBoundingClientRect().height);
    }
    const cs = getComputedStyle(side);
    return {
      parts,
      padT: cs.paddingTop, padB: cs.paddingBottom,
      sideScrollH: side.scrollHeight,
      spaceVars: {
        lg: getComputedStyle(document.documentElement).getPropertyValue('--space-lg').trim(),
        md: getComputedStyle(document.documentElement).getPropertyValue('--space-md').trim(),
        sm: getComputedStyle(document.documentElement).getPropertyValue('--space-sm').trim(),
      },
    };
  });
  console.log(JSON.stringify(m, null, 2));
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
