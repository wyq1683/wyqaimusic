import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
const p = await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,180)));
await p.goto("https://wyqaimusic.wuaze.com/?v="+Date.now(),{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>{ location.hash="#/search"; });
await new Promise(r=>setTimeout(r,900));
await p.evaluate(()=>{
  const i=document.querySelector("#searchInput");
  i.value="晴天"; i.dispatchEvent(new Event("input",{bubbles:true}));
  i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
});
await new Promise(r=>setTimeout(r,5000));
await p.evaluate(()=>{ const r=document.querySelector('.song-row[data-action="play-song"]'); if(r) r.click(); });
await new Promise(r=>setTimeout(r,6000));
const st = await p.evaluate(()=>{
  const el=document.querySelector(".island"); if(!el) return {err:"no island"};
  const r=el.getBoundingClientRect();
  return {show:el.classList.contains("show"), title:el.querySelector(".isl-title").textContent,
    artist:el.querySelector(".isl-artist").textContent,
    cover:el.querySelector(".isl-img").getAttribute("src")?.slice(0,60),
    accent:getComputedStyle(el).getPropertyValue("--isl-accent").trim(),
    w:+r.width.toFixed(0), h:+r.height.toFixed(0), top:+r.top.toFixed(0)};
});
console.log("线上播放:", JSON.stringify(st));
await p.evaluate(()=>document.querySelector(".island").click());
await new Promise(r=>setTimeout(r,700));
await p.screenshot({path:"/workspace/island-live.png"});
console.log("展开后:", JSON.stringify(await p.evaluate(()=>{
  const el=document.querySelector(".island"); const r=el.getBoundingClientRect();
  return {w:+r.width.toFixed(0),h:+r.height.toFixed(0),time:el.querySelector(".isl-time").textContent};
})));
// 搜索页也看一眼：不应遮挡输入框
console.log("输入框顶边:", JSON.stringify(await p.evaluate(()=>{
  const i=document.querySelector("#searchInput")?.getBoundingClientRect();
  const isl=document.querySelector(".island").getBoundingClientRect();
  return {inputTop:i?+i.top.toFixed(0):null, islandBottom:+isl.bottom.toFixed(0)};
})));
console.log("错误:", errs);
await b.close();
