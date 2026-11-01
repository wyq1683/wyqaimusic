import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
const p = await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
p.on("pageerror",e=>console.log("ERR",String(e).slice(0,160)));
await p.goto("https://wyqaimusic.wuaze.com/?v3="+Date.now(),{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2000));
await p.evaluate(()=>{ location.hash="#/search"; });
await new Promise(r=>setTimeout(r,800));
console.log("行数前:", await p.evaluate(()=>document.querySelectorAll('.song-row').length));
await p.evaluate(()=>{
  const i=document.querySelector("#searchInput");
  i.value="晴天"; i.dispatchEvent(new Event("input",{bubbles:true}));
  i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
});
for (let k=0;k<8;k++){
  await new Promise(r=>setTimeout(r,1500));
  const n = await p.evaluate(()=>document.querySelectorAll('.song-row').length);
  if (n) { console.log("行数:", n); break; }
}
console.log("点击行");
await p.evaluate(()=>{ document.querySelector('.song-row').click(); });
await new Promise(r=>setTimeout(r,7000));
console.log("结果:", JSON.stringify(await p.evaluate(()=>{
  const s=App.Player.currentSong();
  return {queue:(App.Player.state.queue||[]).length, song:s&&s.title, playing:App.Player.state.playing,
    src:App.Player.audio&&App.Player.audio.currentSrc&&App.Player.audio.currentSrc.slice(0,60),
    island:document.querySelector(".island")?.classList.contains("show"),
    title:document.querySelector(".isl-title")?.textContent};
})));
await b.close();
