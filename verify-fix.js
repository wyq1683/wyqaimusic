const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 430, height: 932 });
  await p.goto('http://localhost:8899/', { waitUntil: 'load' });
  await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
  await p.evaluate(() => {
    App.Player.playSong('s01', ['s01', 's02']);
    App.UI.navigate('/nowplaying');
    document.body.classList.add('immersive');
  });
  await new Promise(r => setTimeout(r, 1500));
  await p.evaluate(() => { document.querySelector('[data-action="np-queue-toggle"]').click(); });
  await new Promise(r => setTimeout(r, 800));
  const info = await p.evaluate(() => {
    const sc = document.getElementById('queueScrim');
    const dr = document.getElementById('queueDrawer');
    return {
      scrimLeft: getComputedStyle(sc).left,
      scrimBottom: getComputedStyle(sc).bottom,
      scrimW: sc.getBoundingClientRect().width,
      drawerBottom: getComputedStyle(dr).bottom,
      drawerBottomGap: window.innerHeight - dr.getBoundingClientRect().bottom,
      vw: window.innerWidth,
    };
  });
  console.log('修复后:', JSON.stringify(info));
  console.log(info.scrimLeft === '0px' && info.scrimW === info.vw ? '✅ 遮罩已全宽覆盖，割裂消除' : '❌ 仍未修复');
  console.log(info.drawerBottomGap <= 1 ? '✅ 抽屉已贴底' : '❌ 抽屉仍悬空 ' + info.drawerBottomGap + 'px');
  await p.screenshot({ path: '/workspace/fix-after.png' });
  await b.close();
})();
