/* ============================================================
 * island.js — 顶部「灵动岛」播放胶囊
 * ------------------------------------------------------------
 * 位置：顶栏下方居中悬浮（top = 安全区 + 顶栏高 + 10px），
 *       不抢顶栏的搜索位，也不和底部播放条重复发声 ——
 *       它只做「一眼看到在放什么 + 顺手切歌」这件事。
 * 收起：48px 高的小胶囊（封面 + 频谱 + 歌名 + 播放键）
 * 展开：点一下变成卡片（封面 + 歌名歌手 + 进度 + 上/下一首 + 打开播放页）
 *
 * 隐藏条件：没有歌 / 在正在播放页 / 沉浸或横屏播放 / 设置里关掉。
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const P = () => global.App.Player;
  const R = () => global.App.Router;

  const PATHS = {
    play: "M8 5v14l11-7z",
    pause: "M7 5h4v14H7zM13 5h4v14h-4z",
    prev: "M7 5h2v14H7zm12 0v14l-9-7z",
    next: "M15 5h2v14h-2zM5 5l9 7-9 7z",
    open: "M9 6l6 6-6 6-1.4-1.4L18.2 12 13.6 7.4z",
  };
  function svg(d, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="' + d + '"/></svg>';
  }

  // 封面主色常常又暗又闷（深蓝 #1b375d 之类），直接当按钮色会糊在深色玻璃上；
  // 单纯混白又会发灰。所以按 HSL 只抬亮度、并给饱和度一个下限，保住原来的色相。
  function brighten(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "";
    const n = parseInt(m[1], 16);
    let r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60; if (h < 0) h += 360;
    }
    const L = Math.max(l, 0.62);           // 亮度下限：再暗的封面色也看得清
    const S = Math.max(s, 0.42);           // 饱和度下限：防止抬亮后发灰
    const c = (1 - Math.abs(2 * L - 1)) * S;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m2 = L - c / 2;
    let rr = 0, gg = 0, bb = 0;
    if (h < 60) [rr, gg, bb] = [c, x, 0];
    else if (h < 120) [rr, gg, bb] = [x, c, 0];
    else if (h < 180) [rr, gg, bb] = [0, c, x];
    else if (h < 240) [rr, gg, bb] = [0, x, c];
    else if (h < 300) [rr, gg, bb] = [x, 0, c];
    else [rr, gg, bb] = [c, 0, x];
    const to = (v) => Math.round((v + m2) * 255);
    return "rgb(" + to(rr) + "," + to(gg) + "," + to(bb) + ")";
  }

  let root = null, imgEl = null, phEl = null, titleEl = null, artistEl = null;
  let timeEl = null, fillEl = null, playBtn = null, eqBars = [];
  let expanded = false, raf = 0, phase = 0, shownSongId = null;

  /* ---------------- 构建 ---------------- */
  function build() {
    root = document.createElement("div");
    root.className = "island";
    root.setAttribute("role", "button");
    root.setAttribute("tabindex", "0");
    root.setAttribute("aria-label", "正在播放");
    root.innerHTML =
      '<div class="isl-art">' +
        '<img class="isl-img" alt="" />' +
        '<span class="isl-ph">♪</span>' +
        '<span class="isl-eq" aria-hidden="true"><i></i><i></i><i></i><i></i></span>' +
      "</div>" +
      '<div class="isl-body">' +
        '<div class="isl-line"><span class="isl-title"></span></div>' +
        '<div class="isl-meta"><span class="isl-artist"></span><span class="isl-time">0:00</span></div>' +
        '<div class="isl-prog"><i></i></div>' +
      "</div>" +
      '<div class="isl-ctl">' +
        '<button class="isl-btn isl-prev" type="button" aria-label="上一首">' + svg(PATHS.prev, 15) + "</button>" +
        '<button class="isl-btn isl-play" type="button" aria-label="播放 / 暂停">' + svg(PATHS.play, 17) + "</button>" +
        '<button class="isl-btn isl-next" type="button" aria-label="下一首">' + svg(PATHS.next, 15) + "</button>" +
      "</div>";
    document.body.appendChild(root);

    imgEl = root.querySelector(".isl-img");
    phEl = root.querySelector(".isl-ph");
    titleEl = root.querySelector(".isl-title");
    artistEl = root.querySelector(".isl-artist");
    timeEl = root.querySelector(".isl-time");
    fillEl = root.querySelector(".isl-prog i");
    playBtn = root.querySelector(".isl-play");
    eqBars = Array.prototype.slice.call(root.querySelectorAll(".isl-eq i"));

    /* ---- 交互 ---- */
    root.addEventListener("click", (e) => {
      if (e.target.closest(".isl-btn")) return;
      setExpanded(!expanded);
    });
    root.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); }
      else if (e.key === "Escape") setExpanded(false);
    });
    root.querySelector(".isl-play").addEventListener("click", (e) => { e.stopPropagation(); P().toggle(); });
    root.querySelector(".isl-prev").addEventListener("click", (e) => { e.stopPropagation(); P().prev(); });
    root.querySelector(".isl-next").addEventListener("click", (e) => { e.stopPropagation(); P().next(); });
    // 展开态点封面 = 进播放页；收起态点封面仍然是「展开」
    root.querySelector(".isl-art").addEventListener("click", (e) => {
      if (!expanded) return;
      e.stopPropagation();
      setExpanded(false);
      if (R()) R().navigate("/now-playing");
    });

    // 点外面收起
    document.addEventListener("click", (e) => {
      if (expanded && root && !root.contains(e.target)) setExpanded(false);
    }, true);
  }

  function setExpanded(on) {
    expanded = !!on;
    if (root) root.classList.toggle("is-expanded", expanded);
  }

  /* ---------------- 渲染 ---------------- */
  function render(song) {
    if (!song) return;
    const cover = song.coverUrl || "";
    if (cover) {
      imgEl.src = cover;
      imgEl.hidden = false;
      phEl.hidden = true;
    } else {
      imgEl.removeAttribute("src");
      imgEl.hidden = true;
      phEl.hidden = false;
      const g = song.c && song.c.from
        ? "linear-gradient(135deg," + song.c.from + "," + (song.c.to || song.c.from) + ")"
        : (C.gradientFor ? C.gradientFor(song.title) : "");
      phEl.style.background = g;
    }
    // 强调色参与胶囊的光晕，跟封面取色联动
    const acc = (song.themeColor && !/^#?7c5cff$/i.test(song.themeColor)) ? brighten(song.themeColor) : "";
    if (acc && root) root.style.setProperty("--isl-accent", acc);
    else if (root) root.style.removeProperty("--isl-accent");

    titleEl.textContent = song.title || "未知曲目";
    artistEl.textContent = song.artist || "";
    root.setAttribute("aria-label", "正在播放：" + (song.title || ""));
    shownSongId = song.id;
    syncState();
  }

  function syncState() {
    const p = P();
    if (!p) return;
    const playing = !!(p.state && p.state.playing);
    playBtn.innerHTML = svg(playing ? PATHS.pause : PATHS.play, 17);
    root.classList.toggle("is-playing", playing);
    const a = p.audio;
    if (a && a.duration) {
      const cur = a.currentTime || 0, dur = a.duration || 0;
      fillEl.style.width = Math.min(100, (cur / dur) * 100).toFixed(2) + "%";
      timeEl.textContent = C.fmtDur(cur) + " / " + C.fmtDur(dur);
    }
  }

  /* ---------------- 频谱 ---------------- */
  function tick() {
    raf = requestAnimationFrame(tick);
    const p = P();
    const playing = !!(p && p.state && p.state.playing);
    let data = null;
    if (playing && p.getSpectrum) {
      try { data = p.getSpectrum(); } catch (e) { data = null; }
    }
    phase += 0.16;
    for (let i = 0; i < eqBars.length; i++) {
      let h;
      if (data && data.length > 26) {
        const v = data[2 + i * 4] / 255;
        h = 3 + v * 13;
      } else {
        h = 4 + Math.abs(Math.sin(phase + i * 0.85)) * (playing ? 7 : 1.5);
      }
      eqBars[i].style.height = h.toFixed(1) + "px";
    }
  }
  function startLoop() { if (!raf) raf = requestAnimationFrame(tick); }
  function stopLoop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } }

  /* ---------------- 显示条件 ---------------- */
  function routeAllows() {
    const route = document.body.dataset.route || "";
    if (route === "/now-playing") return false;
    if (document.body.classList.contains("immersive")) return false;
    if (document.body.classList.contains("np-landscape")) return false;
    return true;
  }
  function update() {
    if (!root) return;
    const s = P() && P().currentSong ? P().currentSong() : null;
    const on = !!(s && C.getSettings().island !== false && routeAllows());
    root.classList.toggle("show", on);
    document.body.classList.toggle("has-island", on);
    if (!on) { setExpanded(false); stopLoop(); return; }
    if (s.id !== shownSongId) render(s);
    else syncState();
    startLoop();
  }

  /* ---------------- 启动 ---------------- */
  function init() {
    if (!global.App || !global.App.Player || root) return;
    build();

    C.bus.on("player:changed", (song) => { if (song) render(song); update(); });
    // 封面取色比 player:changed 晚到（要走代理 + canvas 采样），
    // render 时 themeColor 往往还没写进 song —— 这里补一次，胶囊才会跟封面同色。
    C.bus.on("player:covercolor", (info) => {
      if (!info || !info.accent || !root) return;
      root.style.setProperty("--isl-accent", brighten(info.accent) || info.accent);
    });
    C.bus.on("player:state", () => { syncState(); update(); });
    C.bus.on("player:time", () => syncState());
    C.bus.on("settings:changed", () => update());

    // 路由切换（router 只写 body[data-route]，没有事件）
    new MutationObserver(update).observe(document.body, {
      attributes: true,
      attributeFilter: ["data-route", "class"],
    });

    update();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  global.App = global.App || {};
  global.App.Island = { refresh: update, expand: () => setExpanded(true), collapse: () => setExpanded(false) };
})(window);
