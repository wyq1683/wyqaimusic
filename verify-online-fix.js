/* verify-online-fix.js — 线上站点验证侧栏修复（登录态手机抽屉） */
const puppeteer = require('puppeteer-core');
const BASE = 'https://wyqaimusic.wuaze.com/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  const errors = [];
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  await p.setViewport({ width: 390, height: 750, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await p.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 30000 }).catch(() => {});
  // 登录态注入（与本地测试一致）
  await p.evaluate(() => {
    localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
    localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
  });
  await p.reload({ waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2500));

  const ver = await p.evaluate(() => {
    const sheets = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href);
    return sheets.find(s => s.includes('style-plus'));
  });
  console.log('线上 style-plus 引用：', ver);

  await p.evaluate(() => App.Player.playSong('s01', ['s01', 's02']));
  await new Promise(r => setTimeout(r, 600));
  await p.evaluate(() => document.querySelector('.menu-btn').click());
  await new Promise(r => setTimeout(r, 600));

  const m = await p.evaluate(() => {
    const card = document.querySelector('.sidebar-user');
    const legal = document.querySelector('.legal-links');
    const bar = document.querySelector('.player-bar').getBoundingClientRect();
    const nav = document.querySelector('.nav');
    const navItems = document.querySelectorAll('.nav-item').length;
    return {
      cardBottom: card ? Math.round(card.getBoundingClientRect().bottom) : null,
      legalBottom: Math.round(legal.getBoundingClientRect().bottom),
      barTop: Math.round(bar.top),
      navOverflow: nav.scrollHeight - nav.clientHeight,
      navItems,
    };
  });
  console.log('线上测量：', JSON.stringify(m));
  const pass = m.cardBottom <= m.barTop && m.legalBottom <= m.barTop && m.navOverflow <= 0;
  console.log(pass ? '✅ 线上修复生效：用户卡/法链完整可见，导航无折叠' : '⚠️ 线上仍有遮挡或折叠');
  await p.screenshot({ path: '/workspace/fix-online.png' });
  await b.close();
  const realErrors = errors.filter(e => !e.includes('501') && !e.includes('Failed to load resource'));
  console.log('JS 错误：' + (realErrors.length ? '\n' + realErrors.join('\n') : '无'));
  process.exit(pass && realErrors.length === 0 ? 0 : 1);
})().catch(e => { console.error('异常：', e.message); process.exit(2); });
