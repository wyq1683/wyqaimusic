import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
const p = await b.newPage();
await p.setViewport({width:1280,height:820});
await p.goto("http://localhost:8099/index.html",{waitUntil:"networkidle2",timeout:30000});
await new Promise(r=>setTimeout(r,800));
await p.evaluate(async ()=>{ App.Player.setQueue(["s02"],0); App.Player.playAt(0); await new Promise(r=>setTimeout(r,2000)); });
await p.evaluate(()=>document.querySelector(".island").click());
await new Promise(r=>setTimeout(r,600));
console.log(JSON.stringify(await p.evaluate(()=>{
  const isl=document.querySelector(".island").getBoundingClientRect();
  const ctl=document.querySelector(".isl-ctl").getBoundingClientRect();
  const play=document.querySelector(".isl-play");
  const body=document.querySelector(".isl-body").getBoundingClientRect();
  return {isl:{l:+isl.left.toFixed(0),r:+isl.right.toFixed(0),t:+isl.top.toFixed(0),b:+isl.bottom.toFixed(0)},
    ctl:{l:+ctl.left.toFixed(0),r:+ctl.right.toFixed(0),t:+ctl.top.toFixed(0),b:+ctl.bottom.toFixed(0)},
    body:{l:+body.left.toFixed(0),r:+body.right.toFixed(0)},
    gapRight:+(isl.right-ctl.right).toFixed(0), playing:App.Player.state.playing,
    playSvg:play.innerHTML.length, path:play.querySelector("path").getAttribute("d").slice(0,12)};
}),null,1));
await b.close();
