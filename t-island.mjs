import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
const p = await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,200)));
await p.goto("http://localhost:8099/index.html",{waitUntil:"networkidle2",timeout:30000});
await new Promise(r=>setTimeout(r,1200));

// 没有歌时：不应显示
const before = await p.evaluate(()=>{
  const el=document.querySelector(".island");
  return {exists:!!el, show: el?el.classList.contains("show"):null};
});
console.log("空队列:", JSON.stringify(before));

// 播一首本地曲
const play = await p.evaluate(async ()=>{
  try { App.Player.setQueue(["s01"],0); App.Player.playAt(0); } catch(e){ return "ERR "+e; }
  await new Promise(r=>setTimeout(r,2500));
  const s=App.Player.currentSong();
  const el=document.querySelector(".island");
  return {song:s&&s.title, show:el.classList.contains("show"), title:el.querySelector(".isl-title").textContent,
    rect:(()=>{const r=el.getBoundingClientRect();return {w:+r.width.toFixed(0),h:+r.height.toFixed(0),top:+r.top.toFixed(0),left:+r.left.toFixed(0)}})(),
    playing: el.classList.contains("is-playing")};
});
console.log("播放后:", JSON.stringify(play));
await p.screenshot({path:"/workspace/island-collapsed.png"});

// 展开
await p.click(".island");
await new Promise(r=>setTimeout(r,700));
const exp = await p.evaluate(()=>{
  const el=document.querySelector(".island");
  const r=el.getBoundingClientRect();
  const vis=(sel)=>{const n=el.querySelector(sel);return n?getComputedStyle(n).display!=="none":null;};
  return {expanded:el.classList.contains("is-expanded"), w:+r.width.toFixed(0), h:+r.height.toFixed(0),
    meta:vis(".isl-meta"), prog:vis(".isl-prog"), prev:vis(".isl-prev"), open:vis(".isl-open"),
    time:el.querySelector(".isl-time").textContent, fill:el.querySelector(".isl-prog i").style.width};
});
console.log("展开:", JSON.stringify(exp));
await p.screenshot({path:"/workspace/island-expanded.png"});

// 换到正在播放页应隐藏
await p.evaluate(()=>{ App.Router.navigate("/now-playing"); });
await new Promise(r=>setTimeout(r,1200));
const onNp = await p.evaluate(()=>({show:document.querySelector(".island").classList.contains("show"), route:document.body.dataset.route}));
console.log("在播放页:", JSON.stringify(onNp));

// 回去应恢复
await p.evaluate(()=>{ App.Router.navigate("/home"); });
await new Promise(r=>setTimeout(r,1200));
console.log("回首页:", JSON.stringify(await p.evaluate(()=>({show:document.querySelector(".island").classList.contains("show")}))));

// 设置页开关
await p.evaluate(()=>{ App.Router.navigate("/settings"); });
await new Promise(r=>setTimeout(r,900));
const sw = await p.evaluate(()=>{ const b=document.querySelector("#stIsland"); return b?{on:b.classList.contains("on")}:null; });
console.log("设置开关:", JSON.stringify(sw));
const off = await p.evaluate(async ()=>{
  document.querySelector("#stIsland").click();
  await new Promise(r=>setTimeout(r,400));
  return {setting:App.Core.getSettings().island, show:document.querySelector(".island").classList.contains("show")};
});
console.log("关闭后:", JSON.stringify(off));
console.log("错误:", errs);
await b.close();
