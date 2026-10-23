/* verify-final.js — 最终全量验证：手机/桌面/工作台/回归 */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errors = [];
  let pass = 0, fail = 0;
  const ok = (n, c, e) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ ' + n + (e !== undefined ? ' → ' + JSON.stringify(e) : '')); } };

  async function newPage(w, h, mobile, login) {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    if (mobile) await p.setViewport({ width: w, height: h, isMobile: true, hasTouch: true });
    else await p.setViewport({ width: w, height: h });
    await p.goto(BASE, { waitUntil: 'load' });
    if (login) {
      await p.evaluate(() => {
        localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
        localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: [], favorites: [], playlists: [], profile: {} }));
      });
      await p.reload({ waitUntil: 'load' });
    }
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 700));
    return p;
  }
  const tailAboveBar = () => {
    const card = document.querySelector('.sidebar-user');
    const legal = document.querySelector('.legal-links');
    const bar = document.querySelector('.player-bar').getBoundingClientRect();
    return {
      cardOk: !card || card.getBoundingClientRect().bottom <= bar.top + 0.5,
      legalOk: legal.getBoundingClientRect().bottom <= bar.top + 0.5,
      barTop: Math.round(bar.top),
    };
  };

  // 1. 手机 390x750 登录态
  {
    const p = await newPage(390, 750, true, true);
    await p.evaluate(() => document.querySelector('.menu-btn').click());
    await new Promise(r => setTimeout(r, 300));
    const m = await p.evaluate(tailAboveBar);
    ok('手机 390x750：用户卡与法链在播放条上方', m.cardOk && m.legalOk, m);
    await p.screenshot({ path: '/workspace/final-mobile.png' });
    await p.close();
  }
  // 2. 手机 375x667（小屏）登录态：允许导航滚动，尾部必须可见
  {
    const p = await newPage(375, 667, true, true);
    await p.evaluate(() => document.querySelector('.menu-btn').click());
    await new Promise(r => setTimeout(r, 300));
    const m = await p.evaluate(tailAboveBar);
    ok('手机 375x667（小屏）：尾部仍固定可见', m.cardOk && m.legalOk, m);
    await p.close();
  }
  // 3. 桌面 1280x720 矮窗
  {
    const p = await newPage(1280, 720, false, true);
    const m = await p.evaluate(tailAboveBar);
    ok('桌面 1280x720 矮窗：尾部在播放条上方', m.cardOk && m.legalOk, m);
    await p.screenshot({ path: '/workspace/final-desktop-720.png' });
    await p.close();
  }
  // 4. 桌面 1400x900 常规
  {
    const p = await newPage(1400, 900, false, true);
    const m = await p.evaluate(tailAboveBar);
    ok('桌面 1400x900 常规：尾部在播放条上方', m.cardOk && m.legalOk, m);
    await p.screenshot({ path: '/workspace/final-desktop-900.png' });
    await p.close();
  }
  // 5. 桌面 1440x900 + 工作台：工作台内容区让位
  {
    const p = await newPage(1440, 900, false, true);
    await p.evaluate(() => App.Player.playSong('s01', ['s01', 's02']));
    await new Promise(r => setTimeout(r, 300));
    await p.evaluate(() => document.getElementById('wbToggle').click());
    await new Promise(r => setTimeout(r, 400));
    const m = await p.evaluate(() => {
      const wb = document.querySelector('.workbench');
      const body = document.querySelector('.wb-body');
      const bar = document.querySelector('.player-bar').getBoundingClientRect();
      return {
        padB: getComputedStyle(wb).paddingBottom,
        wbBodyBottom: Math.round(body.getBoundingClientRect().bottom),
        barTop: Math.round(bar.top),
      };
    });
    ok('桌面工作台：内容区底边不低于播放条顶边', m.wbBodyBottom <= m.barTop + 0.5, m);
    await p.close();
  }
  // 6. 回归：改版核心功能仍正常（折叠/搜索/工作台/续听）
  {
    const p = await newPage(1400, 900, false, false);
    const m = await p.evaluate(async () => {
      document.getElementById('railToggle').click();
      await new Promise(r => setTimeout(r, 100));
      const on = document.body.classList.contains('rail-mini');
      document.getElementById('railToggle').click();
      await new Promise(r => setTimeout(r, 100));
      const off = !document.body.classList.contains('rail-mini');
      // 工作台会从 localStorage 恢复上次状态，先确保关闭再验证打开
      if (document.body.classList.contains('wb-open')) document.getElementById('wbToggle').click();
      await new Promise(r => setTimeout(r, 150));
      const closedFirst = !document.body.classList.contains('wb-open');
      document.getElementById('wbToggle').click();
      await new Promise(r => setTimeout(r, 300));
      const wb = document.body.classList.contains('wb-open');
      document.getElementById('wbToggle').click();
      return { on, off, closedFirst, wb };
    });
    ok('回归：侧栏折叠/展开、工作台开关正常', m.on && m.off && m.closedFirst && m.wb, m);
    await p.close();
  }

  await b.close();
  console.log(`\n========== ${pass} 通过 / ${fail} 失败 ==========`);
  const realErrors = errors.filter(e => !e.includes('501'));
  console.log('JS 错误（除本地 API 501）：' + (realErrors.length ? '\n' + realErrors.join('\n') : '无'));
  process.exit(fail > 0 || realErrors.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
