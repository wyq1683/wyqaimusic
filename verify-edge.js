/* verify-edge.js — 边界场景：未登录手机 / 桌面折叠栏 / 桌面工作台同开 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // 1. 未登录 + 手机抽屉（foot 是登录按钮）
  {
    const p = await b.newPage();
    await p.setViewport({ width: 390, height: 750, isMobile: true, hasTouch: true });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await p.evaluate(() => document.querySelector('.menu-btn').click());
    await new Promise(r => setTimeout(r, 300));
    const m = await p.evaluate(() => {
      const btn = document.querySelector('#sidebarLogin');
      const legal = document.querySelector('.legal-links').getBoundingClientRect();
      const bar = document.querySelector('.player-bar').getBoundingClientRect();
      return { loginBtnBottom: btn ? Math.round(btn.getBoundingClientRect().bottom) : null, legalBottom: Math.round(legal.bottom), barTop: Math.round(bar.top) };
    });
    console.log('未登录手机抽屉：', JSON.stringify(m), m.loginBtnBottom <= m.barTop && m.legalBottom <= m.barTop ? '✅' : '❌');
    await p.close();
  }

  // 2. 桌面 1280x720 + 折叠栏（rail-mini）
  {
    const p = await b.newPage();
    await p.setViewport({ width: 1280, height: 720 });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(() => {
      localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
      localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await p.evaluate(() => document.getElementById('railToggle').click());
    await new Promise(r => setTimeout(r, 300));
    const m = await p.evaluate(() => {
      const side = document.querySelector('.sidebar');
      const legal = document.querySelector('.legal-links');
      const bar = document.querySelector('.player-bar').getBoundingClientRect();
      return {
        railMini: document.body.classList.contains('rail-mini'),
        sideW: Math.round(side.getBoundingClientRect().width),
        legalDisplay: getComputedStyle(legal).display,
        padB: getComputedStyle(side).paddingBottom,
        barTop: Math.round(bar.top),
      };
    });
    console.log('桌面折叠栏：', JSON.stringify(m));
    await p.close();
  }

  // 3. 桌面 1280x800 + 工作台同开（三列）
  {
    const p = await b.newPage();
    await p.setViewport({ width: 1280, height: 800 });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(() => {
      localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
      localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    await p.evaluate(() => App.Player.playSong('s01', ['s01', 's02']));
    await new Promise(r => setTimeout(r, 400));
    await p.evaluate(() => document.getElementById('wbToggle').click());
    await new Promise(r => setTimeout(r, 400));
    const m = await p.evaluate(() => {
      const side = document.querySelector('.sidebar').getBoundingClientRect();
      const wb = document.querySelector('.workbench');
      const wbRect = wb.getBoundingClientRect();
      const bar = document.querySelector('.player-bar').getBoundingClientRect();
      const legal = document.querySelector('.legal-links').getBoundingClientRect();
      return {
        wbOpen: document.body.classList.contains('wb-open'),
        sideW: Math.round(side.width), wbW: Math.round(wbRect.width),
        legalBottom: Math.round(legal.bottom), barTop: Math.round(bar.top),
        wbBottom: Math.round(wbRect.bottom),
      };
    });
    console.log('桌面工作台同开：', JSON.stringify(m), m.legalBottom <= m.barTop ? '✅ 侧栏尾部未被挡' : '❌');
    await p.close();
  }

  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
