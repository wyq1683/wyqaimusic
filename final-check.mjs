import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox"]});
const p = await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
p.on("pageerror",e=>console.log("PAGEERR",String(e).slice(0,150)));
await p.goto("https://wyqaimusic.wuaze.com/?f="+Date.now(),{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2500));
// 模拟原生注入
await p.evaluate(()=>{
  const r=document.documentElement.style;
  r.setProperty("--safe-t","24px"); r.setProperty("--safe-b","24px");
});
await new Promise(r=>setTimeout(r,400));
const m = await p.evaluate(()=>{
  const t=document.querySelector(".topbar").getBoundingClientRect();
  const s=document.querySelector("#searchTrigger").getBoundingClientRect();
  const pb=document.querySelector(".player-bar").getBoundingClientRect();
  return {topbarH:+(t.height).toFixed(0), searchTop:+(s.top).toFixed(1), searchBottom:+(s.bottom).toFixed(1), playerGap:+(844-pb.bottom).toFixed(0)};
});
console.log(JSON.stringify(m));
await p.screenshot({path:"/workspace/safe-final.png"});
await b.close();
