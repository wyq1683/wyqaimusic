/* repro-mobile-sidebar.js — 复现：手机版左侧栏目底部是否被播放条挡住 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true });
  await p.goto(BASE, { waitUntil: 'load' });
  await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 1200));

  // 播放一首歌，让播放条出现（未播放时播放条可能不显示）
  await p.evaluate(() => App.Player.playSong('s01', ['s01', 's02']));
  await new Promise(r => setTimeout(r, 600));

  // 打开手机抽屉侧栏
  await p.evaluate(() => document.querySelector('.menu-btn').click());
  await new Promise(r => setTimeout(r, 500));

  const m = await p.evaluate(() => {
    const side = document.querySelector('.sidebar');
    const bar = document.querySelector('.player-bar');
    const sr = side.getBoundingClientRect();
    const br = bar.getBoundingClientRect();
    const foot = document.querySelector('.sidebar-foot');
    const fr = foot ? foot.getBoundingClientRect() : null;
    return {
      viewH: window.innerHeight,
      sideRect: { top: Math.round(sr.top), bottom: Math.round(sr.bottom), h: Math.round(sr.height), w: Math.round(sr.width) },
      barRect: { top: Math.round(br.top), bottom: Math.round(br.bottom), h: Math.round(br.height) },
      footBottom: fr ? Math.round(fr.bottom) : null,
      footVisible: fr ? (fr.bottom <= br.top) : null,
      barOnTop: bar.getBoundingClientRect().top,
    };
  });
  console.log(JSON.stringify(m, null, 2));

  await p.screenshot({ path: '/workspace/repro-mobile-sidebar.png' });
  await b.close();

  // 判定：侧栏底边应 <= 播放条顶边（或至少侧栏内容不被挡）
  const ok = m.sideRect.bottom <= m.barRect.top + 1;
  console.log(ok ? '✅ 侧栏底边在播放条上方，未被挡住' : '❌ 侧栏底边被播放条挡住：side.bottom=' + m.sideRect.bottom + ' > bar.top=' + m.barRect.top);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
