import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox","--autoplay-policy=no-user-gesture-required"]});
for (const [w,h,name] of [[1280,820,"desktop"],[390,844,"mobile"]]) {
  const p = await b.newPage();
  await p.setViewport({width:w,height:h,deviceScaleFactor:1});
  const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,150)));
  await p.goto("http://localhost:8099/index.html",{waitUntil:"networkidle2",timeout:30000});
  await new Promise(r=>setTimeout(r,1000));
  const empty = await p.evaluate(()=>({hasIsland:document.body.classList.contains("has-island"),
    padTop:getComputedStyle(document.querySelector("#view")).paddingTop}));
  await p.evaluate(async ()=>{
    App.Player.setQueue(["s02"],0); App.Player.playAt(0);
    await new Promise(r=>setTimeout(r,2200));
  });
  const on = await p.evaluate(()=>{
    const el=document.querySelector(".island"); const r=el.getBoundingClientRect();
    const v=getComputedStyle(document.querySelector("#view")).paddingTop;
    const first=document.querySelector(".view > .page").getBoundingClientRect();
    return {show:el.classList.contains("show"), w:+r.width.toFixed(0), h:+r.height.toFixed(0),
      top:+r.top.toFixed(0), hasIsland:document.body.classList.contains("has-island"),
      viewPadTop:v, contentTop:+first.top.toFixed(0), gap:+(first.top-r.bottom).toFixed(0)};
  });
  await p.evaluate(()=>document.querySelector(".island").click());
  await new Promise(r=>setTimeout(r,600));
  const exp = await p.evaluate(()=>{
    const el=document.querySelector(".island"); const r=el.getBoundingClientRect();
    const t=el.querySelector(".isl-title").getBoundingClientRect();
    const o=el.querySelector(".isl-open").getBoundingClientRect();
    return {w:+r.width.toFixed(0), h:+r.height.toFixed(0), arrowRight:+(r.right-o.right).toFixed(0), titleW:+t.width.toFixed(0)};
  });
  await p.screenshot({path:`/workspace/island-${name}-exp.png`});
  console.log(name, "空态", JSON.stringify(empty), "| 显示", JSON.stringify(on), "| 展开", JSON.stringify(exp), "| err", errs.length);
  await p.close();
}
await b.close();
