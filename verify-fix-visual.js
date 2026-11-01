/* verify-fix-visual.js — 修复后视觉验证：手机抽屉 + 桌面矮窗 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });

  // 场景 1：手机 390x750（URL 栏可见的等效高度，修复前卡被裁 38px）
  {
    const p = await b.newPage();
    await p.setViewport({ width: 390, height: 750, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.evaluate(() => {
      localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
      localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 800));
    await p.evaluate(() => App.Player.playSong('s01', ['s01', 's02']));
    await new Promise(r => setTimeout(r, 400));
    await p.evaluate(() => document.querySelector('.menu-btn').click());
    await new Promise(r => setTimeout(r, 500));
    await p.screenshot({ path: '/workspace/fix-mobile-750.png' });
    const m = await p.evaluate(() => {
      const card = document.querySelector('.sidebar-user').getBoundingClientRect();
      const legal = document.querySelector('.legal-links').getBoundingClientRect();
      const bar = document.querySelector('.player-bar').getBoundingClientRect();
      return { cardBottom: Math.round(card.bottom), legalBottom: Math.round(legal.bottom), barTop: Math.round(bar.top) };
    });
    console.log('手机 390x750：', JSON.stringify(m), m.cardBottom <= m.barTop && m.legalBottom <= m.barTop ? '✅ 全部在播放条上方' : '❌ 仍被遮挡');
    await p.close();
  }

  // 场景 2：桌面矮窗 1280x720（修复前法链被压在播放条下）
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
    await new Promise(r => setTimeout(r, 800));
    await p.evaluate(() => App.Player.playSong('s01', ['s01', 's02']));
    await new Promise(r => setTimeout(r, 400));
    await p.screenshot({ path: '/workspace/fix-desktop-720.png' });
    const m = await p.evaluate(() => {
      const card = document.querySelector('.sidebar-user').getBoundingClientRect();
      const legal = document.querySelector('.legal-links').getBoundingClientRect();
      const bar = document.querySelector('.player-bar').getBoundingClientRect();
      const nav = document.querySelector('.nav');
      return {
        cardBottom: Math.round(card.bottom), legalBottom: Math.round(legal.bottom), barTop: Math.round(bar.top),
        navScrollable: nav.scrollHeight > nav.clientHeight,
      };
    });
    console.log('桌面 1280x720：', JSON.stringify(m), m.cardBottom <= m.barTop && m.legalBottom <= m.barTop ? '✅ 全部在播放条上方' : '❌ 仍被遮挡');
    await p.close();
  }

  // 场景 3：桌面常规 1400x900 回归（确认没有把布局搞坏）
  {
    const p = await b.newPage();
    await p.setViewport({ width: 1400, height: 900 });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1200));
    const m = await p.evaluate(() => {
      const card = document.querySelector('.sidebar-user');
      const legal = document.querySelector('.legal-links').getBoundingClientRect();
      const bar = document.querySelector('.player-bar').getBoundingClientRect();
      return {
        loggedOut: !card,
        legalBottom: Math.round(legal.bottom), barTop: Math.round(bar.top),
        navScroll: document.querySelector('.nav').scrollHeight <= document.querySelector('.nav').clientHeight,
      };
    });
    console.log('桌面 1400x900：', JSON.stringify(m));
    await p.screenshot({ path: '/workspace/fix-desktop-900.png' });
    await p.close();
  }

  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
