import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox"]});
const p = await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
await p.goto("https://wyqaimusic.wuaze.com/?dv="+Date.now(),{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2000));
// 清单里的安装包地址是否可下（走 GitHub HEAD）
const r = await p.evaluate(async ()=>{
  const m = await (await fetch("version.json?t="+Date.now())).json();
  let st=null;
  try { const res = await fetch(m.apk.url, {method:"HEAD"}); st = res.status + " " + (res.headers.get("content-length")||"?"); } catch(e){ st="ERR "+e; }
  return {url:m.apk.url, version:m.version, apk:m.apk.version, head:st};
});
console.log(JSON.stringify(r,null,1));
await p.screenshot({path:"/workspace/dl-live.png"});
await b.close();
