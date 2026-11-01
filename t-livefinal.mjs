import puppeteer from "puppeteer-core";
const b = await puppeteer.launch({headless:"new",executablePath:"/usr/bin/chromium",args:["--no-sandbox"]});
const p = await b.newPage();
await p.setViewport({width:390,height:844,deviceScaleFactor:2});
const errs=[]; p.on("pageerror",e=>errs.push(String(e).slice(0,150)));
await p.goto("https://wyqaimusic.wuaze.com/?f="+Date.now(),{waitUntil:"networkidle2",timeout:60000});
await new Promise(r=>setTimeout(r,2500));
const man = await p.evaluate(async ()=>{
  const r = await fetch("version.json?t="+Date.now());
  const j = await r.json();
  return {status:r.status, version:j.version, apk:j.apk.version, url:j.apk.url.slice(-24)};
});
console.log("manifest:", JSON.stringify(man));
await p.evaluate(()=>{ App.Router.navigate("/settings"); });
await new Promise(r=>setTimeout(r,1500));
console.log("关于:", JSON.stringify(await p.evaluate(()=>({
  apkDesc:document.querySelector("#stApkDesc")?.textContent,
  ver:[...document.querySelectorAll(".set-ctrl span")].map(x=>x.textContent).find(t=>/^v\d/.test(t)),
  sb:!!document.getElementById("sbDownload")
}))));
await p.evaluate(()=>document.querySelector("#stCheckUpd").click());
await new Promise(r=>setTimeout(r,1200));
console.log("检查:", JSON.stringify(await p.evaluate(()=>document.querySelector(".toast")?.textContent.trim())));
console.log("公告应弹（模拟旧版本）:");
await p.evaluate(()=>{ localStorage.setItem("mp_v1_version_seen","2.7.1"); });
await p.reload({waitUntil:"networkidle2"});
await new Promise(r=>setTimeout(r,2200));
console.log(JSON.stringify(await p.evaluate(()=>{
  const m=document.querySelector(".modal-mask");
  return {modal:!!m, ver:document.querySelector(".wn-ver")?.textContent, items:document.querySelectorAll(".wn-item").length};
})));
console.log("错误:", errs);
await b.close();
