const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 430, height: 932 }); // 手机逻辑宽度
  await p.goto('http://localhost:8899/', { waitUntil: 'load' });
  await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
  await p.evaluate(() => {
    App.Player.playSong('s01', ['s01', 's02']);
    App.UI.navigate('/nowplaying');
    document.body.classList.add('immersive');
  });
  await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: '/workspace/repro-before.png' });   // 打开队列前
  await p.evaluate(() => { document.querySelector('[data-action="np-queue-toggle"]').click(); });
  await new Promise(r => setTimeout(r, 800));
  const info = await p.evaluate(() => {
    const sc = document.getElementById('queueScrim');
    const cs = getComputedStyle(sc);
    const bar = document.querySelector('.player-bar');
    return { scrimLeft: cs.left, scrimBottom: cs.bottom, scrimW: sc.getBoundingClientRect().width, scrimVisible: cs.opacity, sidebarW: getComputedStyle(document.documentElement).getPropertyValue('--sidebar-w').trim(), playerBarDisplay: bar ? getComputedStyle(bar).display : null, vw: window.innerWidth };
  });
  console.log('遮罩状态:', JSON.stringify(info));
  await p.screenshot({ path: '/workspace/repro-after.png' });    // 打开队列后
  await b.close();
})();
