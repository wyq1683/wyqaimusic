const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const p = await b.newPage();
  await p.setViewport({ width: 430, height: 932 });
  await p.goto('https://wyqaimusic.wuaze.com/?fix=1', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 2000));
  const ver = await p.evaluate(() => (document.querySelector('link[href*="style-plus"]') || {}).href || '');
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
    return { scrimLeft: getComputedStyle(sc).left, scrimW: sc.getBoundingClientRect().width, vw: window.innerWidth, drawerGap: window.innerHeight - dr.getBoundingClientRect().bottom };
  });
  console.log('style-plus 版本:', ver);
  console.log('线上遮罩状态:', JSON.stringify(info));
  console.log(info.scrimLeft === '0px' && info.scrimW === info.vw && info.drawerGap <= 1 ? '✅ 线上修复生效' : '❌ 线上未生效');
  await p.screenshot({ path: '/workspace/fix-online.png' });
  await b.close();
})();
