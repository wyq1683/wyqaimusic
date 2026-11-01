const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox','--disable-dev-shm-usage'] });
  // 桌面：首页 + 工作台打开
  const p = await b.newPage();
  await p.setViewport({ width: 1400, height: 900 });
  await p.goto('http://localhost:8899/', { waitUntil: 'load' });
  await p.evaluate(() => {
    const now = Date.now();
    const his = [
      { id: 's02', weight: 3, last: now - 5 * 60000 },
      { id: 's05', weight: 2, last: now - 2 * 3600000 },
      { id: 's08', weight: 1, last: now - 26 * 3600000 },
    ];
    localStorage.setItem('mp_v1_session', JSON.stringify('demouser'));
    localStorage.setItem('mp_v1_ud_demouser', JSON.stringify({ history: his, favorites: [], playlists: [], profile: {} }));
  });
  await p.reload({ waitUntil: 'load' });
  await p.waitForFunction(() => window.App && App.Player && App.Store, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2600));
  await p.evaluate(() => { App.Player.playSong('s01', ['s01','s02','s03']); document.getElementById('wbToggle').click(); });
  await new Promise(r => setTimeout(r, 1500));
  await p.screenshot({ path: '/workspace/shot-revamp-desktop.png' });
  // 侧栏折叠态
  await p.evaluate(() => { document.getElementById('railToggle').click(); });
  await new Promise(r => setTimeout(r, 500));
  await p.screenshot({ path: '/workspace/shot-revamp-railmini.png' });
  await p.close();
  // 移动端
  const m = await b.newPage();
  await m.setViewport({ width: 375, height: 812 });
  await m.goto('http://localhost:8899/', { waitUntil: 'load' });
  await m.waitForFunction(() => window.App && App.Player, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 2000));
  await m.screenshot({ path: '/workspace/shot-revamp-mobile.png' });
  await b.close();
  console.log('screenshots done');
})();
