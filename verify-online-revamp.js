const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  const p = await b.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/i.test(m.text())) errs.push('console.error: ' + m.text()); });
  await p.setViewport({ width: 1400, height: 900 });
  await p.goto('https://wyqaimusic.wuaze.com/?r=1023', { waitUntil: 'load', timeout: 60000 });
  await p.waitForFunction(() => window.App && App.Player && App.Store && App.DATA, { timeout: 30000 });
  await new Promise(r => setTimeout(r, 3000));
  const info = await p.evaluate(() => {
    const out = {};
    out.title = document.title;
    out.verCss = (document.querySelector('link[href*="style.css"]') || {}).href || '';
    out.verPlus = (document.querySelector('link[href*="style-plus"]') || {}).href || '';
    out.verUiPlus = (document.querySelector('script[src*="ui-plus"]') || {}).src || '';
    out.railToggle = !!document.getElementById('railToggle');
    out.globalSearch = !!document.getElementById('globalSearch');
    out.wbToggle = !!document.getElementById('wbToggle');
    out.workbench = !!document.getElementById('workbench');
    out.resumeBar = !!document.getElementById('resumeBar');
    out.resumeBarHidden = document.getElementById('resumeBar').hidden;
    out.navGroups = document.querySelectorAll('.nav-group-label').length;
    out.uiPlusRan = !!document.getElementById('railToggle') && !!document.getElementById('railToggle').getAttribute('title');
    // 打开工作台 + 播放内置歌测队列
    document.getElementById('wbToggle').click();
    App.Player.playSong('s01', ['s01', 's02', 's03']);
    return out;
  });
  await new Promise(r => setTimeout(r, 2500));
  const info2 = await p.evaluate(() => {
    const out = {};
    out.wbOpen = document.body.classList.contains('wb-open');
    out.queueItems = document.querySelectorAll('#wbQueue .wb-q-item').length;
    out.queueCurrent = document.querySelectorAll('#wbQueue .wb-q-item.current').length;
    out.pbTitle = document.getElementById('pbTitle').textContent;
    return out;
  });
  console.log(JSON.stringify({ ...info, ...info2 }, null, 1));
  await p.screenshot({ path: '/workspace/shot-online-revamp.png' });
  console.log('JS errors:', errs.length ? errs : 'none');
  await b.close();
})();
