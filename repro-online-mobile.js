/* repro-online-mobile.js — 对线上站点复现手机版侧栏遮挡 */
const puppeteer = require('puppeteer-core');
const BASE = 'https://wyqaimusic.wuaze.com/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await p.goto(BASE, { waitUntil: 'load', timeout: 60000 });
  await new Promise(r => setTimeout(r, 3000));
  // 通过 InfinityFree 的 JS 挑战后 reload 拿真实页面
  // 通过 InfinityFree 的 JS 挑战后等待应用就绪
  await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 30000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1500));

  const ver = await p.evaluate(() => {
    const sheets = [...document.querySelectorAll('link[rel=stylesheet]')].map(l => l.href);
    return { title: document.title, sheets };
  });
  console.log('线上页面：', JSON.stringify(ver, null, 2));

  // 播放一首歌让播放条出现
  await p.evaluate(() => { if (window.App && App.Player && App.DATA) App.Player.playSong('s01', ['s01', 's02']); });
  await new Promise(r => setTimeout(r, 800));

  // 打开抽屉侧栏
  await p.evaluate(() => { const mb = document.querySelector('.menu-btn'); if (mb) mb.click(); });
  await new Promise(r => setTimeout(r, 600));

  const m = await p.evaluate(() => {
    const side = document.querySelector('.sidebar');
    const bar = document.querySelector('.player-bar');
    if (!side || !bar) return { missing: true };
    const sr = side.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const cs = getComputedStyle(side);
    return {
      viewH: window.innerHeight,
      sideRect: { top: Math.round(sr.top), bottom: Math.round(sr.bottom), h: Math.round(sr.height), w: Math.round(sr.width) },
      barRect: { top: Math.round(br.top), bottom: Math.round(br.bottom), h: Math.round(br.height) },
      sidePos: cs.position, sideBottomCss: cs.bottom,
      playerHVar: getComputedStyle(document.documentElement).getPropertyValue('--player-h').trim(),
    };
  });
  console.log(JSON.stringify(m, null, 2));
  await p.screenshot({ path: '/workspace/repro-online-mobile.png' });
  await b.close();
  const ok = !m.missing && m.sideRect.bottom <= m.barRect.top + 1;
  console.log(ok ? '✅ 线上侧栏底边未被播放条挡住' : '❌ 线上侧栏底边被播放条挡住');
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error('异常：', e.message); process.exit(2); });
