/* ============================================================
 * wallpaper.js — 本地壁纸目录（Wallpaper Engine 风格背景）
 *
 * 能力边界（重要）：
 *   - 视频壁纸（mp4 / webm / ogv）：完整支持，随窗口/标签页状态暂停
 *   - 网页壁纸（WEB 类型）：不支持（需要 Service Worker 挂载目录 + WE API shim）
 *   - 场景壁纸（scene.pkg）：无法支持，那是 Wallpaper Engine 私有的
 *     DirectX 渲染器格式，浏览器里没有解析器
 *
 * 目录授权：优先 File System Access API（Chrome / Edge 86+，
 * 句柄存 IndexedDB 可跨次保持）；不支持时降级为 webkitdirectory
 * 一次性选择（刷新后需重选）。
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const K = "mp_v1_wallpaper";
  const VIDEO_EXT = /\.(mp4|webm|ogv|m4v)$/i;
  const MAX_DEPTH = 3; // Steam/steamapps/workshop/content/431960/<id>/ 需要 2 层

  const DEFAULTS = {
    mode: "off",        // off | dynamic | static
    fit: "cover",       // cover | contain | fill
    dim: 25,            // 壁纸暗化 %
    opacity: 100,       // 壁纸不透明度 %
    blur: 0,            // 壁纸模糊 px
    pauseHidden: true,  // 窗口隐藏时暂停
    sound: false,       // 壁纸声音
  };

  let cfg = Object.assign({}, DEFAULTS);
  let dirs = [];            // [{ handle, name }]，handle 可能为 null（降级模式）
  let sessionFiles = [];    // 降级模式下的 File 列表
  let playList = [];        // [{ name, title, getFile }]
  let idx = -1;
  let curUrl = null;
  let els = null;
  let scanning = false;
  let lastError = "";

  /* ---------------- 存储 ---------------- */
  function loadCfg() {
    try {
      const raw = localStorage.getItem(K);
      if (raw) cfg = Object.assign({}, DEFAULTS, JSON.parse(raw) || {});
    } catch (e) { /* 忽略坏数据 */ }
    return cfg;
  }
  function saveCfg(patch) {
    cfg = Object.assign({}, cfg, patch);
    try { localStorage.setItem(K, JSON.stringify(cfg)); } catch (e) { /* 忽略 */ }
    applyCfg();
    emit();
    return cfg;
  }

  /* ---------------- IndexedDB：持久化目录句柄 ---------------- */
  function openDB() {
    return new Promise((res, rej) => {
      if (!global.indexedDB) return rej(new Error("no idb"));
      const r = global.indexedDB.open("wave_wallpaper", 1);
      r.onupgradeneeded = () => {
        const db = r.result;
        if (!db.objectStoreNames.contains("dirs")) db.createObjectStore("dirs");
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function idbGet(key) {
    try {
      const db = await openDB();
      return await new Promise((res, rej) => {
        const tx = db.transaction("dirs", "readonly");
        const q = tx.objectStore("dirs").get(key);
        q.onsuccess = () => res(q.result);
        q.onerror = () => rej(q.error);
      });
    } catch (e) { return null; }
  }
  async function idbSet(key, val) {
    try {
      const db = await openDB();
      await new Promise((res, rej) => {
        const tx = db.transaction("dirs", "readwrite");
        tx.objectStore("dirs").put(val, key);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      });
      return true;
    } catch (e) { return false; }
  }

  /* ---------------- DOM ---------------- */
  function ensureEls() {
    if (els) return els;
    const wrap = document.getElementById("bgWall");
    const video = document.getElementById("bgWallVideo");
    if (!wrap || !video) return null;
    els = { wrap, video };
    video.addEventListener("ended", () => next(true));
    video.addEventListener("error", () => {
      // 单个文件坏了不要卡死，跳下一个
      lastError = "无法解码：" + (currentName() || "未知文件");
      if (playList.length > 1) next(true);
    });
    video.addEventListener("loadedmetadata", () => {
      if (cfg.mode === "static") {
        try { video.currentTime = Math.min(2, (video.duration || 4) * 0.15); } catch (e) { /* ignore */ }
        video.pause();
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (!els) return;
      if (document.hidden) {
        if (cfg.pauseHidden) { try { els.video.pause(); } catch (e) { /* ignore */ } }
      } else if (cfg.mode === "dynamic" && cfg.pauseHidden) {
        try { const p = els.video.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
      }
    });
    return els;
  }

  function applyCfg() {
    const el = ensureEls();
    if (!el) return;
    const { wrap, video } = el;
    const active = cfg.mode !== "off" && playList.length > 0;
    wrap.hidden = !active;
    // 首次启用（或刚扫完）时还没有 src：主动加载第一条，否则只有黑屏
    if (active && !video.src) { next(true); }
    wrap.style.setProperty("--wp-dim", (Math.max(0, Math.min(100, cfg.dim)) / 100).toFixed(2));
    wrap.style.setProperty("--wp-blur", Math.max(0, Math.min(30, cfg.blur)) + "px");
    video.style.opacity = (Math.max(10, Math.min(100, cfg.opacity)) / 100).toFixed(2);
    video.style.objectFit = cfg.fit === "contain" ? "contain" : cfg.fit === "fill" ? "fill" : "cover";
    video.muted = !cfg.sound;
    if (cfg.mode === "static") {
      try { video.pause(); } catch (e) { /* ignore */ }
    } else if (cfg.mode === "dynamic" && active && !document.hidden) {
      try { const p = video.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
    }
    document.body.classList.toggle("has-wallpaper", active);
  }

  /* ---------------- 扫描目录 ---------------- */
  async function readProjectTitle(dirHandle) {
    try {
      const fh = await dirHandle.getFileHandle("project.json");
      const file = await fh.getFile();
      const txt = await file.text();
      const j = JSON.parse(txt);
      return j && (j.title || j.name) ? String(j.title || j.name) : "";
    } catch (e) { return ""; }
  }

  async function scanHandle(dirHandle, depth, out) {
    try {
      for await (const [name, handle] of dirHandle.entries()) {
        if (handle.kind === "file") {
          if (VIDEO_EXT.test(name)) {
            out.push({
              name,
              dirName: dirHandle.name,
              title: "",
              getFile: () => handle.getFile(),
              _dir: dirHandle,
            });
          }
        } else if (depth < MAX_DEPTH) {
          await scanHandle(handle, depth + 1, out);
        }
      }
    } catch (e) {
      // 权限被收回 / 目录被删
      lastError = "目录无法读取：" + (dirHandle.name || "");
    }
  }

  // 按目录批量读取 Wallpaper Engine 的 project.json，给视频补上可读标题
  async function fillTitles(list) {
    const byDir = new Map();
    list.forEach((it) => {
      if (!it._dir) return;
      if (!byDir.has(it._dir)) byDir.set(it._dir, []);
      byDir.get(it._dir).push(it);
    });
    for (const [dir, items] of byDir) {
      const t = await readProjectTitle(dir);
      if (t) items.forEach((it) => { it.title = t; });
    }
  }

  async function rescan() {
    if (scanning) return;
    scanning = true;
    lastError = "";
    emit();
    const out = [];
    try {
      for (const d of dirs) {
        if (d.handle) await scanHandle(d.handle, 0, out);
      }
      // 降级模式：sessionFile
      sessionFiles.forEach((f) => {
        if (VIDEO_EXT.test(f.name)) out.push({ name: f.name, dirName: "本次选择", title: "", getFile: () => Promise.resolve(f) });
      });
    } catch (e) {
      lastError = "扫描失败：" + (e && e.message ? e.message : e);
    }
    await fillTitles(out); // 先补 WE 项目标题，再固化播放列表
    playList = out.map((x) => ({ name: x.name, title: x.title || x.name, getFile: x.getFile }));
    scanning = false;
    if (!playList.length && cfg.mode !== "off") {
      lastError = lastError || "目录里没有视频文件（支持 mp4 / webm / ogv）";
      cfg.mode = "off";
      try { localStorage.setItem(K, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
    }
    if (cfg.mode !== "off" && playList.length) { idx = -1; next(true); }
    applyCfg();
    emit();
    return playList.length;
  }

  function currentName() {
    const it = playList[idx];
    return it ? it.title : "";
  }

  let loading = false;
  async function next(auto) {
    if (!playList.length || loading) return;
    loading = true;
    idx = (idx + 1) % playList.length;
    const it = playList[idx];
    try {
      const file = await it.getFile();
      if (curUrl) { try { URL.revokeObjectURL(curUrl); } catch (e) { /* ignore */ } }
      curUrl = URL.createObjectURL(file);
      const el = ensureEls();
      if (!el) return;
      el.video.src = curUrl;
      if (cfg.mode === "dynamic" && !(cfg.pauseHidden && document.hidden)) {
        try { const p = el.video.play(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ }
      }
    } catch (e) {
      lastError = "读取失败：" + it.title;
      loading = false;
      if (auto && playList.length > 1) setTimeout(() => next(true), 400);
      emit();
      return;
    }
    loading = false;
    emit();
  }

  /* ---------------- 权限 ---------------- */
  async function hasPerm(handle) {
    try {
      if (!handle.queryPermission) return true;
      const st = await handle.queryPermission({ mode: "read" });
      return st === "granted";
    } catch (e) { return false; }
  }
  async function askPerm(handle) {
    try {
      if (!handle.requestPermission) return true;
      const st = await handle.requestPermission({ mode: "read" });
      return st === "granted";
    } catch (e) { return false; }
  }

  /* ---------------- 对外：选择/移除目录 ---------------- */
  async function pickDir() {
    if (global.showDirectoryPicker) {
      try {
        const handle = await global.showDirectoryPicker({ mode: "read", id: "wave-wallpaper" });
        if (!handle) return { ok: false, canceled: true };
        if (!(await hasPerm(handle))) {
          const ok = await askPerm(handle);
          if (!ok) return { ok: false, error: "没有拿到目录读取权限" };
        }
        // 去重
        dirs = dirs.filter((d) => !(d.handle && d.handle.name === handle.name));
        dirs.push({ handle, name: handle.name });
        await idbSet("dirs", dirs.map((d) => d.handle).filter(Boolean));
        const n = await rescan();
        return { ok: true, count: n, name: handle.name };
      } catch (e) {
        if (e && e.name === "AbortError") return { ok: false, canceled: true };
        return { ok: false, error: "打开目录失败：" + (e && e.message ? e.message : e) };
      }
    }
    return { ok: false, error: "NO_API" };
  }

  // 降级：<input webkitdirectory>
  function pickDirFallback() {
    return new Promise((res) => {
      const input = document.createElement("input");
      input.type = "file";
      input.webkitdirectory = true;
      input.multiple = true;
      input.style.display = "none";
      document.body.appendChild(input);
      input.addEventListener("change", () => {
        const files = Array.from(input.files || []);
        input.remove();
        if (!files.length) return res({ ok: false, canceled: true });
        sessionFiles = files.filter((f) => VIDEO_EXT.test(f.name));
        dirs = [{ handle: null, name: files[0].webkitRelativePath.split("/")[0] || "已选目录" }];
        rescan().then((n) => res({ ok: true, count: n, name: dirs[0].name, session: true }));
      });
      input.click();
    });
  }

  async function clearDirs() {
    dirs = [];
    sessionFiles = [];
    playList = [];
    idx = -1;
    if (curUrl) { try { URL.revokeObjectURL(curUrl); } catch (e) { /* ignore */ } }
    curUrl = null;
    const el = ensureEls();
    if (el) { try { el.video.removeAttribute("src"); el.video.load(); } catch (e) { /* ignore */ } }
    await idbSet("dirs", []);
    cfg.mode = "off";
    try { localStorage.setItem(K, JSON.stringify(cfg)); } catch (e) { /* ignore */ }
    applyCfg();
    emit();
  }

  async function restore() {
    const saved = await idbGet("dirs");
    if (!Array.isArray(saved) || !saved.length) { applyCfg(); return; }
    const usable = [];
    for (const h of saved) {
      if (!h) continue;
      if (await hasPerm(h)) usable.push({ handle: h, name: h.name });
      else usable.push({ handle: h, name: h.name, needPerm: true });
    }
    dirs = usable;
    const ready = usable.filter((d) => !d.needPerm);
    if (ready.length) await rescan();
    else {
      // 有句柄但没权限：等用户点「恢复」
      playList = [];
      applyCfg();
      emit();
    }
  }

  async function reauthorize() {
    let ok = false;
    for (const d of dirs) {
      if (d.handle && d.needPerm) {
        if (await askPerm(d.handle)) { d.needPerm = false; ok = true; }
      }
    }
    if (ok) await rescan();
    return ok;
  }

  /* ---------------- 事件 ---------------- */
  const listeners = [];
  function on(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
  function emit() { listeners.forEach((f) => { try { f(getState()); } catch (e) { /* ignore */ } }); }

  function getState() {
    const needPerm = dirs.some((d) => d.needPerm);
    return {
      cfg: Object.assign({}, cfg),
      dirs: dirs.map((d) => ({ name: d.name, needPerm: !!d.needPerm, session: !d.handle })),
      count: playList.length,
      current: currentName(),
      scanning,
      needPerm,
      error: lastError,
      supported: !!global.showDirectoryPicker,
      playing: !!(els && !els.video.paused),
    };
  }

  /* ---------------- 初始化 ---------------- */
  function init() {
    loadCfg();
    ensureEls();
    applyCfg();
    restore();
  }

  global.App.Wallpaper = {
    init, on, getState, saveCfg, loadCfg,
    pickDir, pickDirFallback, clearDirs, rescan, reauthorize,
    next: () => next(false),
    get cfg() { return Object.assign({}, cfg); },
    DEFAULTS,
  };
})(window);
