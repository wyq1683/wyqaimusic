/* verify-fit.js — 验证各手机尺寸下抽屉内容是否完整可见（无滚动） */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const cases = [
    [390, 812], [390, 780], [390, 750], [390, 720], [390, 700], [390, 660], [390, 620],
    [412, 750], [360, 750], [360, 700], [430, 750], [375, 667], [393, 852],
  ];
  for (const [width, vh] of cases) {
    const p = await b.newPage();
    await p.setViewport({ width, height: vh, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(() => {
      localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
      localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await p.evaluate(() => document.querySelector('.menu-btn').click());
    await new Promise(r => setTimeout(r, 300));
    const m = await p.evaluate(() => {
      const nav = document.querySelector('.nav');
      const card = document.querySelector('.sidebar-user').getBoundingClientRect();
      const legal = document.querySelector('.legal-links').getBoundingClientRect();
      const bar = document.querySelector('.player-bar').getBoundingClientRect();
      const lastNav = [...document.querySelectorAll('.nav-item')].pop().getBoundingClientRect();
      return {
        navScroll: nav.scrollHeight - nav.clientHeight,       // >0 表示有内容在折叠线下
        lastNavBottom: Math.round(lastNav.bottom),
        cardBottom: Math.round(card.bottom),
        legalBottom: Math.round(legal.bottom),
        barTop: Math.round(bar.top),
      };
    });
    const navOk = m.navScroll <= 0;
    const tailOk = m.cardBottom <= m.barTop && m.legalBottom <= m.barTop;
    console.log(`${width}x${vh}: 导航溢出=${m.navScroll}px 末项底=${m.lastNavBottom} 卡底=${m.cardBottom} 法链底=${m.legalBottom} 条顶=${m.barTop} → 导航${navOk ? '完整可见' : '有折叠'} 尾部${tailOk ? '✅未被挡' : '❌被挡'}`);
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
