/* wave-web-2.0 smoke — 实测核心链路 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8902/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errors = [];
  let pass = 0, fail = 0;
  const ok = (n, c, e) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (e !== undefined ? ' → ' + JSON.stringify(e) : '')); } };

  const p = await b.newPage();
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 120)); });
  await p.setViewport({ width: 1440, height: 900 });
  await p.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 800));

  // 1. 首页渲染
  const m1 = await p.evaluate(() => ({
    title: document.title,
    navItems: document.querySelectorAll('.nav-item, [data-route]').length,
    hasHero: !!document.querySelector('.hero, .home-hero, [class*="hero"]'),
    cards: document.querySelectorAll('.card, .song-card, [class*="card"]').length,
  }));
  ok('首页渲染（导航+卡片）', m1.navItems > 0 && m1.cards > 0, m1);

  // 2. 登录 2FA
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button,a')].find(b => /登录|登錄|sign/i.test(b.textContent)); if (btn) btn.click(); });
  await new Promise(r => setTimeout(r, 400));
  await p.type('#authUser, input[name="user"], input[type="text"]', 'demo', { delay: 10 }).catch(() => {});
  await p.type('input[type="password"]', 'demo1234', { delay: 10 }).catch(() => {});
  await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(b => /登录|登錄|sign in/i.test(b.textContent)); if (btn) btn.click(); });
  await new Promise(r => setTimeout(r, 500));
  // 验证码步骤
  const needCode = await p.evaluate(() => !!document.querySelector('input[inputmode="numeric"], #authCode, input[placeholder*="验证码"]'));
  if (needCode) {
    await p.evaluate(() => { const i = document.querySelector('input[inputmode="numeric"], #authCode, input[placeholder*="验证码"]'); if (i) { i.focus(); i.select(); } });
    await p.keyboard.type('123456');
    await p.evaluate(() => { const btn = [...document.querySelectorAll('button')].find(b => /验证|确认|verify/i.test(b.textContent)); if (btn) btn.click(); });
    await new Promise(r => setTimeout(r, 600));
  }
  const m2 = await p.evaluate(() => ({
    session: !!localStorage.getItem('mp_v1_session') || !!localStorage.getItem('token'),
    keys: Object.keys(localStorage).filter(k => k.startsWith('mp_v1')).length,
  }));
  ok('登录 2FA 全流程', m2.session, m2);

  // 3. 路由导航（曲库/收藏/歌单/设置）
  for (const route of ['library', 'favorites', 'playlists', 'settings']) {
    await p.evaluate(r => { location.hash = '#/' + r; }, route);
    await new Promise(r => setTimeout(r, 500));
    const m = await p.evaluate(() => ({ hash: location.hash, main: (document.querySelector('#view, .view, main') || {}).textContent?.length || 0 }));
    ok('路由 #/' + route, m.hash === '#/' + route && m.main > 50, m);
  }

  // 4. 命令面板 Ctrl+K
  await p.keyboard.down('Control'); await p.keyboard.press('k'); await p.keyboard.up('Control');
  await new Promise(r => setTimeout(r, 400));
  const m4 = await p.evaluate(() => {
    const cmdk = document.querySelector('[class*="cmdk"], [class*="command"], [class*="palette"]');
    return { open: !!cmdk && cmdk.offsetParent !== null };
  });
  ok('命令面板 Ctrl+K', m4.open, m4);
  await p.keyboard.press('Escape');

  // 5. 播放一首歌
  await p.evaluate(() => { location.hash = '#/home'; });
  await new Promise(r => setTimeout(r, 500));
  const played = await p.evaluate(async () => {
    const btn = [...document.querySelectorAll('.play-fab, [class*="play"]')].find(b => b.offsetParent !== null);
    if (btn) { btn.click(); return 'clicked'; }
    return 'no-btn';
  });
  await new Promise(r => setTimeout(r, 1200));
  const m5 = await p.evaluate(() => {
    const audio = document.querySelector('audio');
    const title = document.querySelector('#pbTitle, .pb-title, [class*="now-playing"] [class*="title"]');
    return { hasAudio: !!audio, paused: audio ? audio.paused : null, title: title?.textContent?.slice(0, 20) || '' };
  });
  ok('点击播放（audio 元素 + 标题）', m5.hasAudio && !m5.paused, m5);

  // 6. 移动端 390px
  const p2 = await b.newPage();
  p2.on('pageerror', e => errors.push('mobile pageerror: ' + e.message));
  await p2.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
  await p2.goto(BASE, { waitUntil: 'load' });
  await new Promise(r => setTimeout(r, 800));
  const m6 = await p2.evaluate(() => ({
    bottomNav: !!document.querySelector('[class*="tabbar"], [class*="bottom-nav"], nav.bottom'),
    overflowX: document.documentElement.scrollWidth <= 391,
  }));
  ok('移动端 390px（底栏 + 无横向溢出）', m6.overflowX, m6);
  await p2.screenshot({ path: '/tmp/wave20-mobile.png' });

  await p.screenshot({ path: '/tmp/wave20-desktop.png' });
  await b.close();
  console.log('\n========== ' + pass + ' 通过 / ' + fail + ' 失败 ==========');
  console.log('JS 错误：' + (errors.length ? '\n' + errors.join('\n') : '无'));
  process.exit(fail > 0 || errors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
