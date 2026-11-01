const puppeteer = require('puppeteer-core');
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/chromium', headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  for (const wait of [700, 2600]) {
    const p = await b.newPage();
    await p.setViewport({ width: 1400, height: 900 });
    await p.goto('http://localhost:8899/', { waitUntil: 'load' });
    await p.waitForFunction(() => window.App && App.Player && App.UI, { timeout: 15000 });
    await new Promise(r => setTimeout(r, wait));
    const m = await p.evaluate(async () => {
      const t = document.getElementById('wbToggle');
      const before = { exists: !!t, aria: t && t.getAttribute('aria-expanded') };
      t.click();
      await new Promise(r => setTimeout(r, 300));
      const after = { wbOpen: document.body.classList.contains('wb-open'), aria: t.getAttribute('aria-expanded'), panelHidden: document.getElementById('workbench').hidden };
      return { before, after };
    });
    console.log(`wait=${wait}:`, JSON.stringify(m));
    await p.close();
  }
  await b.close();
})().catch(e => { console.error(e); process.exit(2); });
