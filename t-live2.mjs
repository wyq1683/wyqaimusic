import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
const p = await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
p.on("pageerror",e=>console.log("ERR",String(e).slice(0,160)));
await p.goto("https://wyqaimusic.wuaze.com/?v2="+Date.now(),{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2500));
await p.evaluate(()=>{ location.hash="#/search"; });
await new Promise(r=>setTimeout(r,800));
await p.evaluate(()=>{
  const i=document.querySelector("#searchInput");
  i.value="晴天"; i.dispatchEvent(new Event("input",{bubbles:true}));
  i.dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}));
});
await new Promise(r=>setTimeout(r,5000));
console.log("队列:", JSON.stringify(await p.evaluate(()=>{
  const q=App.Player.state.queue||[]; return {n:q.length, first:q[0]&&{t:q[0].title,id:q[0].id}};
})));
await p.evaluate(()=>{ App.Player.playAt(0); });
await new Promise(r=>setTimeout(r,7000));
console.log("状态:", JSON.stringify(await p.evaluate(()=>{
  const s=App.Player.currentSong(); const a=App.Player.audio;
  return {song:s&&s.title, id:s&&s.id, playing:App.Player.state.playing, err:a&&a.error&&a.error.code,
    ready:a&&a.readyState, dur:a&&a.duration,
    island:{show:document.querySelector(".island")?.classList.contains("show"), title:document.querySelector(".isl-title")?.textContent},
    hasIslandClass: document.body.classList.contains("has-island")};
})));
await b.close();
