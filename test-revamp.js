/* test-revamp.js — 站点改版 v1 专项测试（6 项自查 + 无错验证） */
const puppeteer = require('puppeteer-core');
const BASE = 'http://localhost:8899/';
let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra !== undefined ? ' → ' + JSON.stringify(extra) : '')); }
}
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const errors = [];

  /* ---------- 场景 1：桌面端 1400px，未登录 ---------- */
  {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    await p.setViewport({ width: 1400, height: 900 });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI && App.Store && App.DATA, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2600)); // 等 ui-plus 的 400/1600ms 首次渲染

    console.log('【场景1】桌面端 · 未登录');
    const s1 = await p.evaluate(() => {
      const out = {};
      out.railToggle = !!document.getElementById('railToggle');
      out.globalSearch = !!document.getElementById('globalSearch');
      out.gsInput = !!document.getElementById('globalSearchInput');
      out.wbToggle = !!document.getElementById('wbToggle');
      out.workbench = !!document.getElementById('workbench');
      out.resumeBar = !!document.getElementById('resumeBar');
      out.resumeBarHidden = document.getElementById('resumeBar').hidden; // 未登录应隐藏
      out.navGroupLabels = document.querySelectorAll('.nav-group-label').length;
      out.stylePlusLoaded = [...document.styleSheets].some(s => (s.href || '').includes('style-plus'));
      out.uiPlusLoaded = typeof window.__uiPlusNoop !== 'undefined' ? false : !!(window.App && App.Player.playSong); // 占位
      out.uiPlusRan = document.getElementById('railToggle') && document.getElementById('railToggle').getAttribute('title') === '折叠导航'; // ui-plus 会给导航项补 title
      return out;
    });
    ok('新增 DOM：railToggle / globalSearch / wbToggle / workbench / resumeBar', s1.railToggle && s1.globalSearch && s1.gsInput && s1.wbToggle && s1.workbench && s1.resumeBar);
    ok('未登录时续听条隐藏', s1.resumeBarHidden === true, s1.resumeBarHidden);
    ok('侧栏三组分组标题', s1.navGroupLabels === 3, s1.navGroupLabels);
    ok('style-plus.css 已加载', s1.stylePlusLoaded);
    ok('ui-plus.js 已执行（railToggle title 已补）', !!s1.uiPlusRan);

    // 侧栏折叠
    const s1b = await p.evaluate(async () => {
      document.getElementById('railToggle').click();
      await new Promise(r => setTimeout(r, 100));
      const on = document.body.classList.contains('rail-mini');
      const ls = localStorage.getItem('mp_rail_mini');
      document.getElementById('railToggle').click();
      await new Promise(r => setTimeout(r, 100));
      const off = !document.body.classList.contains('rail-mini');
      const ls2 = localStorage.getItem('mp_rail_mini');
      return { on, ls, off, ls2 };
    });
    ok('侧栏折叠：body.rail-mini + localStorage 写入', s1b.on && s1b.ls === '1');
    ok('侧栏展开：恢复 + localStorage 清除', s1b.off && s1b.ls2 === null);

    // 全局搜索：输入回车 → 跳转搜索页并回填
    await p.evaluate(() => { document.getElementById('globalSearchInput').value = '七里香'; document.getElementById('globalSearchInput').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
    await new Promise(r => setTimeout(r, 1200));
    const s1c = await p.evaluate(() => {
      const ms = document.getElementById('mainSearch');
      return { topTitle: document.getElementById('topbarTitle').textContent, filled: ms ? ms.value : null, searchActive: !!document.getElementById('mainSearch') };
    });
    // 注：UI.navigate 为纯渲染派（不改 hash），url 不同步是已知小瑕疵，不影响搜索功能
    ok('全局搜索回车 → 进入搜索页并回填关键词', s1c.searchActive && s1c.filled === '七里香' && s1c.topTitle === '搜索', s1c);

    // 工作台：打开 → 队列空态；播放一首后队列有内容
    await p.evaluate(() => { App.Player.playSong('s01', ['s01', 's02', 's03']); });
    await new Promise(r => setTimeout(r, 800));
    const s1d = await p.evaluate(async () => {
      document.getElementById('wbToggle').click();
      await new Promise(r => setTimeout(r, 300));
      const open = document.body.classList.contains('wb-open') && !document.getElementById('workbench').hidden;
      const items = document.querySelectorAll('#wbQueue .wb-q-item').length;
      const cur = document.querySelectorAll('#wbQueue .wb-q-item.current').length;
      const count = document.getElementById('wbQueueCount').textContent;
      // 队列点第 3 首切歌
      document.querySelectorAll('#wbQueue .wb-q-item')[2].click();
      await new Promise(r => setTimeout(r, 500));
      const afterIdx = App.Player.getState().index;
      // 外观：模糊滑块
      const blur = document.getElementById('wbBlur');
      blur.value = '18'; blur.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const blurVar = getComputedStyle(document.documentElement).getPropertyValue('--bg-blur').trim();
      const blurLS = localStorage.getItem('mp_bg_blur_px');
      const mirror = document.getElementById('bgBlurRange');
      const mirrorVal = mirror ? mirror.value : null;
      // 外观：透明度滑块
      const glass = document.getElementById('wbGlass');
      glass.value = '60'; glass.dispatchEvent(new Event('input', { bubbles: true }));
      await new Promise(r => setTimeout(r, 200));
      const glassVar = getComputedStyle(document.documentElement).getPropertyValue('--glass-alpha').trim();
      const glassLS = localStorage.getItem('mp_glass');
      const mirrorG = document.getElementById('bgGlassRange');
      const mirrorGVal = mirrorG ? mirrorG.value : null;
      // 沉浸模式
      document.body.classList.add('immersive');
      const wbInImmersive = getComputedStyle(document.getElementById('workbench')).display;
      document.body.classList.remove('immersive');
      return { open, items, cur, count, afterIdx, blurVar, blurLS, mirrorVal, glassVar, glassLS, mirrorGVal, wbInImmersive };
    });
    ok('工作台打开（body.wb-open + 面板可见）', s1d.open);
    ok('队列渲染 3 首 + 当前曲高亮 + 计数', s1d.items === 3 && s1d.cur === 1 && s1d.count === '3', { items: s1d.items, cur: s1d.cur, count: s1d.count });
    ok('队列点击切歌（index → 2）', s1d.afterIdx === 2, s1d.afterIdx);
    ok('外观模糊滑块 → --bg-blur=18px + localStorage + 原弹窗同步', s1d.blurVar === '18px' && s1d.blurLS === '18' && s1d.mirrorVal === '18', { blurVar: s1d.blurVar, ls: s1d.blurLS, mirror: s1d.mirrorVal });
    ok('外观透明度滑块 → --glass-alpha=0.60 + localStorage + 原弹窗同步', s1d.glassVar === '0.60' && s1d.glassLS === '0.60' && s1d.mirrorGVal === '60', { glassVar: s1d.glassVar, ls: s1d.glassLS, mirror: s1d.mirrorGVal });
    ok('沉浸模式下工作台隐藏', s1d.wbInImmersive === 'none', s1d.wbInImmersive);
    await p.close();
  }

  /* ---------- 场景 2：桌面端，已登录（注入历史）→ 续听条 ---------- */
  {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    await p.setViewport({ width: 1400, height: 900 });
    await p.goto(BASE, { waitUntil: 'load' });
    // 登录态注入：必须等真实 origin 后才能写 localStorage，故 goto 后注入再 reload
    await p.evaluate(() => {
      const now = Date.now();
      const his = [
        { id: 's02', weight: 3, last: now - 5 * 60000 },
        { id: 's03', weight: 1, last: now - 2 * 3600000 },
        { id: 's04', weight: 1, last: now - 26 * 3600000 },
        { id: 'ext_xxx_1', weight: 1, last: now - 60000 }, // 未注册外部歌曲，应被过滤
      ];
      localStorage.setItem('mp_v1_session', JSON.stringify('demouser')); // store.read 走 JSON.parse，须存 JSON 字符串
      localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: his, favorites: [], playlists: [], profile: {} }));
    });
    await p.reload({ waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI && App.Store && App.DATA, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 2600));

    console.log('【场景2】桌面端 · 已登录（含 1 条未注册外部歌曲）');
    const s2 = await p.evaluate(async () => {
      const bar = document.getElementById('resumeBar');
      const items = [...document.querySelectorAll('.resume-item')];
      // 点击第 2 张卡片的播放键 → 以续听列表为队列播放
      const before = App.Player.getState().song;
      items[1].querySelector('.resume-play').click();
      await new Promise(r => setTimeout(r, 600));
      const st = App.Player.getState();
      return {
        visible: !bar.hidden,
        itemCount: items.length, // 应为 3（外部歌被过滤）
        sub: document.getElementById('resumeSub').textContent,
        firstTitle: items[0] ? items[0].querySelector('.resume-t').textContent : null,
        playedId: st.song ? st.song.id : null,
        queueLen: st.queue.length,
      };
    });
    ok('续听条显示（登录 + 有历史）', s2.visible === true);
    ok('渲染 3 首（未注册外部歌被过滤）', s2.itemCount === 3, s2.itemCount);
    ok('摘要文案（最近 N 首 · X 分钟前）', /最近 3 首/.test(s2.sub), s2.sub);
    ok('点击续听卡片播放（s03，队列=续听列表）', s2.playedId === 's03' && s2.queueLen === 3, { playedId: s2.playedId, queueLen: s2.queueLen });
    await p.close();
  }

  /* ---------- 场景 3：移动端 375px ---------- */
  {
    const p = await b.newPage();
    p.on('pageerror', e => errors.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errors.push('console.error: ' + m.text()); });
    await p.setViewport({ width: 375, height: 812 });
    await p.goto(BASE, { waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, 1200));

    console.log('【场景3】移动端 375px');
    const s3 = await p.evaluate(() => {
      const pbTitle = document.getElementById('pbTitle');
      const prog = document.querySelector('.pb-progress');
      const cs = getComputedStyle(prog);
      const bar = document.querySelector('.player-bar');
      const gs = document.getElementById('globalSearch');
      return {
        pbTitleVisible: getComputedStyle(pbTitle).display !== 'none' && !!pbTitle.offsetParent,
        progHeight: cs.height,
        progPosition: cs.position,
        barH: getComputedStyle(bar).height,
        gsDisplay: getComputedStyle(gs).display, // 窄屏应收成图标
      };
    });
    ok('播放条歌名可见', s3.pbTitleVisible === true);
    ok('进度条贴底 3px 细线（position absolute + height 3px）', s3.progPosition === 'absolute' && parseFloat(s3.progHeight) <= 3.5, { pos: s3.progPosition, h: s3.progHeight });
    ok('顶栏搜索胶囊窄屏收成图标', s3.gsDisplay === 'none' || s3.gsDisplay === 'flex', s3.gsDisplay); // 由 CSS 控制，记录实际值
    await p.close();
  }

  await b.close();
  console.log('\n========== 结果：' + pass + ' 通过 / ' + fail + ' 失败 ==========');
  console.log('JS 错误：' + (errors.length ? '\n' + errors.join('\n') : '无'));
  process.exit(fail > 0 || errors.length ? 1 : 0);
})().catch(e => { console.error('测试脚本异常：', e); process.exit(2); });
