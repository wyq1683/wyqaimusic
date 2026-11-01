import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
const p = await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
await p.goto("https://wyqaimusic.wuaze.com/?v4="+Date.now(),{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2000));
await p.evaluate(()=>{ location.hash="#/search"; });
await new Promise(r=>setTimeout(r,700));
await p.evaluate(()=>{
  const i=document.querySelector("#searchInput");
  i.value="夜曲"; i.dispatchEvent(new Event("input",{bubbles:true}));
  i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
});
for (let k=0;k<10;k++){ await new Promise(r=>setTimeout(r,1200)); if (await p.evaluate(()=>document.querySelectorAll('.song-row').length)) break; }
await p.evaluate(()=>document.querySelector('.song-row').click());
await new Promise(r=>setTimeout(r,8000));
// 回到首页看观感
await p.evaluate(()=>{ location.hash="#/home"; });
await new Promise(r=>setTimeout(r,2000));
await p.screenshot({path:"/workspace/island-live-home.png"});
await p.evaluate(()=>document.querySelector(".island").click());
await new Promise(r=>setTimeout(r,800));
await p.screenshot({path:"/workspace/island-live-exp.png"});
console.log(JSON.stringify(await p.evaluate(()=>{
  const el=document.querySelector(".island"); const r=el.getBoundingClientRect();
  return {title:el.querySelector(".isl-title").textContent, artist:el.querySelector(".isl-artist").textContent,
    accent:getComputedStyle(el).getPropertyValue("--isl-accent").trim(),
    w:+r.width.toFixed(0), h:+r.height.toFixed(0), time:el.querySelector(".isl-time").textContent};
})));
await b.close();
