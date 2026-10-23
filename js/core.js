/* ============================================================
 * core.js — 工具函数 / 事件总线 / API 客户端 / 持久化存储
 * 存储键沿用 mp_v1_ 前缀，与旧版数据完全兼容
 * ============================================================ */
(function (global) {
  "use strict";

  /* ==================== 工具函数 ==================== */
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function fmtDur(sec) {
    sec = Math.floor(sec || 0);
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return m + ":" + String(s).padStart(2, "0");
  }

  function fmtTime(ts) {
    if (!ts) return "";
    const d = new Date(ts);
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    if (sameDay) {
      return "今天 " + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
    }
    const yest = new Date(now.getTime() - 86400000);
    if (d.toDateString() === yest.toDateString()) return "昨天";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  function fmtNum(n) {
    if (n >= 100000000) return (n / 100000000).toFixed(1) + " 亿";
    if (n >= 10000) return (n / 10000).toFixed(1) + " 万";
    return String(n || 0);
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function debounce(fn, ms) {
    let t = null;
    return function () {
      const args = arguments, ctx = this;
      clearTimeout(t);
      t = setTimeout(() => fn.apply(ctx, args), ms);
    };
  }

  function icon(name, size) {
    return '<svg width="' + (size || 18) + '" height="' + (size || 18) +
      '" aria-hidden="true"><use href="#i-' + name + '"/></svg>';
  }

  function hashCode(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }

  // 名字 → 稳定渐变（头像/封面兜底）
  function gradientFor(name) {
    const h = hashCode(name || "wave");
    const a = h % 360;
    const b = (a + 40 + (h % 60)) % 360;
    return "linear-gradient(135deg, hsl(" + a + ",72%,58%), hsl(" + b + ",68%,44%))";
  }

  /* ==================== 事件总线 ==================== */
  const listeners = {};
  const bus = {
    on(evt, fn) {
      (listeners[evt] = listeners[evt] || []).push(fn);
      return () => bus.off(evt, fn);
    },
    off(evt, fn) {
      if (listeners[evt]) listeners[evt] = listeners[evt].filter((f) => f !== fn);
    },
    emit(evt, data) {
      (listeners[evt] || []).slice().forEach((fn) => {
        try { fn(data); } catch (e) { console.warn("事件处理失败:", evt, e); }
      });
    },
  };

  /* ==================== 本地存储 ==================== */
  const PREFIX = "mp_v1_";
  const K = {
    USERS: PREFIX + "users",
    SESSION: PREFIX + "session",
    PLAYS: PREFIX + "plays",
    TOKEN: PREFIX + "token",
    UD: PREFIX + "ud_",          // 每用户数据（收藏/歌单/历史/资料）
    EXTERNAL: PREFIX + "external_songs",
    SETTINGS: PREFIX + "settings", // 主题/背景/音量增强等
    SEARCH_HISTORY: PREFIX + "search_history",
  };

  function read(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { console.warn("存储写入失败", e); return false; }
  }

  /* ==================== API 客户端 ==================== */
  const API_BASE = "";
  let apiReady = false;
  let apiDetected = false;

  function getToken() { return read(K.TOKEN, null); }
  function setToken(t) { t ? write(K.TOKEN, t) : localStorage.removeItem(K.TOKEN); }

  async function detectApi() {
    if (apiDetected) return apiReady;
    try {
      // 无副作用探测：未知 action，PHP 返回 400 JSON 即证明 API 可用
      const res = await fetch(API_BASE + "api/auth.php?action=ping", { method: "GET" });
      const data = await res.json();
      apiReady = typeof data.ok === "boolean";
    } catch (e) { apiReady = false; }
    apiDetected = true;
    return apiReady;
  }

  async function useApi() {
    if (!apiDetected) await detectApi();
    return apiReady;
  }

  async function api(endpoint, data) {
    try {
      const headers = { "Content-Type": "application/json" };
      const t = getToken();
      if (t) headers["X-Auth-Token"] = t;
      const res = await fetch(API_BASE + "api/" + endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(data || {}),
      });
      return await res.json();
    } catch (e) {
      return { ok: false, error: "网络错误：无法连接服务器" };
    }
  }

  // GET 型接口（音源代理）
  async function apiGet(endpoint, params) {
    const qs = new URLSearchParams(params || {}).toString();
    const res = await fetch(API_BASE + "api/" + endpoint + (qs ? "?" + qs : ""));
    return res.json();
  }

  /* ==================== 用户与数据 ==================== */
  function currentUser() { return read(K.SESSION, null); }
  function isLoggedIn() { return !!currentUser(); }

  function defaultUD() { return { history: [], favorites: [], playlists: [], profile: {} }; }
  function udKey(u) { return K.UD + u; }

  function getUserData(u) {
    u = u || currentUser();
    if (!u) return null;
    let d = read(udKey(u), null);
    if (!d) { d = defaultUD(); write(udKey(u), d); return d; }
    if (!Array.isArray(d.history)) d.history = [];
    if (!Array.isArray(d.favorites)) d.favorites = [];
    if (!Array.isArray(d.playlists)) d.playlists = [];
    if (!d.profile || typeof d.profile !== "object") d.profile = {};
    return d;
  }
  function saveUserData(u, data) { write(udKey(u), data); }

  /* ==================== 云端同步 ==================== */
  let syncTimer = null;
  let retryTimer = null;
  let retryCount = 0;

  function queueSync() {
    if (!getToken()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushToServer, 350);
  }
  function syncNow() {
    if (!getToken()) return;
    clearTimeout(syncTimer);
    pushToServer();
  }

  async function pullFromServer() {
    const r = await api("sync.php", { action: "load" });
    if (!r || !r.ok) return;
    const u = currentUser();
    if (!u) return;
    const d = getUserData(u);
    const sHas = (r.playlists || []).length + (r.favorites || []).length + (r.history || []).length;
    const lHas = d.playlists.length + d.favorites.length + d.history.length;
    if (!sHas && lHas) { queueSync(); return; } // 云端空本地有 → 重推
    if ((r.favorites || []).length) d.favorites = r.favorites;
    if ((r.playlists || []).length) d.playlists = r.playlists;
    if ((r.history || []).length) d.history = r.history;
    saveUserData(u, d);
    if (r.externals && global.App.DATA && global.App.DATA.setExternalMap) {
      global.App.DATA.setExternalMap(r.externals);
    }
    bus.emit("data:changed");
  }

  async function pushToServer() {
    const u = currentUser();
    if (!u || !getToken()) return;
    const d = getUserData(u);
    const externals = (global.App.DATA && global.App.DATA.getExternalMap) ? global.App.DATA.getExternalMap() : {};
    const r = await api("sync.php", {
      action: "save",
      favorites: d.favorites,
      playlists: d.playlists,
      history: d.history,
      externals: externals,
    });
    if (r && r.ok === false && retryCount < 3) {
      retryCount++;
      clearTimeout(retryTimer);
      retryTimer = setTimeout(pushToServer, 3000 * Math.pow(2, retryCount - 1));
    } else if (r && r.ok !== false) {
      retryCount = 0;
      clearTimeout(retryTimer);
    }
  }

  /* ==================== 注册 / 登录 / 二次验证 ==================== */
  function hashLocal(str) {
    // 纯本地演示模式的弱哈希（后端用 bcrypt）
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16);
  }

  async function register(username, password, email) {
    username = (username || "").trim();
    if (username.length < 3) return { ok: false, error: "用户名至少 3 个字符" };
    if (password.length < 4) return { ok: false, error: "密码至少 4 个字符" };

    if (await useApi()) {
      const r = await api("auth.php", { action: "register", username, password, email });
      if (r.ok) {
        setToken(r.token);
        write(K.SESSION, r.username || username);
        getUserData(username);
        await pullFromServer();
        bus.emit("auth:changed");
        return { ok: true };
      }
      return { ok: false, error: r.error || "注册失败" };
    }
    // 纯本地回退
    const u = read(K.USERS, {});
    if (u[username]) return { ok: false, error: "该用户名已被注册" };
    u[username] = { username, passHash: hashLocal(password), email, createdAt: Date.now() };
    write(K.USERS, u);
    write(K.SESSION, username);
    getUserData(username);
    bus.emit("auth:changed");
    return { ok: true };
  }

  async function login(username, password) {
    username = (username || "").trim();
    if (await useApi()) {
      const r = await api("auth.php", { action: "login", username, password });
      if (r.needVerify) {
        return { ok: false, needVerify: true, userId: r.userId, maskedEmail: r.maskedEmail };
      }
      if (r.ok) {
        setToken(r.token);
        write(K.SESSION, r.username || username);
        await pullFromServer();
        bus.emit("auth:changed");
        return { ok: true };
      }
      return { ok: false, error: r.error || "登录失败" };
    }
    const u = read(K.USERS, {});
    const rec = u[username];
    if (!rec) return { ok: false, error: "用户不存在" };
    if (rec.passHash !== hashLocal(password)) return { ok: false, error: "密码错误" };
    write(K.SESSION, username);
    bus.emit("auth:changed");
    return { ok: true };
  }

  async function verifyLogin(userId, code) {
    const r = await api("auth.php", { action: "verify", userId, code });
    if (r.ok) {
      setToken(r.token);
      write(K.SESSION, r.username || "");
      await pullFromServer();
      bus.emit("auth:changed");
      return { ok: true };
    }
    return { ok: false, error: r.error || "验证码错误" };
  }

  function logout() {
    if (getToken()) api("auth.php", { action: "logout" });
    localStorage.removeItem(K.SESSION);
    setToken(null);
    profileCache = null;
    bus.emit("auth:changed");
  }

  /* ==================== 个人资料 ==================== */
  let profileCache = null;

  async function getProfile(force) {
    const u = currentUser();
    if (!u) return null;
    if (profileCache && !force) return profileCache;
    if (await useApi()) {
      const r = await api("auth.php", { action: "me" });
      if (r.ok && r.profile) { profileCache = r.profile; return profileCache; }
    }
    const d = getUserData(u);
    const p = d.profile || {};
    profileCache = {
      uid: p.uid || "", username: u, email: p.email || "",
      nickname: p.nickname || "", avatar: p.avatar || "",
      gender: p.gender || "", age: p.age || null,
      hobby: p.hobby || "", signature: p.signature || "",
      region: p.region || "", privacy: p.privacy || 0,
      interests: p.interests || "", vip: p.vip || 0,
    };
    return profileCache;
  }

  function getInterests() {
    const u = currentUser();
    const d = u ? getUserData(u) : null;
    const raw = (profileCache && profileCache.interests) || (d && d.profile && d.profile.interests) || "";
    return raw ? String(raw).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [];
  }

  async function updateProfile(fields) {
    const u = currentUser();
    if (!u) return { ok: false, error: "未登录" };
    if (await useApi()) {
      const r = await api("auth.php", Object.assign({ action: "updateProfile" }, fields));
      if (r.ok) {
        if (profileCache) Object.assign(profileCache, fields);
        const d = getUserData(u);
        Object.assign(d.profile, fields);
        saveUserData(u, d);
        bus.emit("data:changed");
        return { ok: true };
      }
      return { ok: false, error: r.error || "保存失败" };
    }
    const d = getUserData(u);
    Object.assign(d.profile, fields);
    saveUserData(u, d);
    if (profileCache) Object.assign(profileCache, fields);
    bus.emit("data:changed");
    return { ok: true };
  }

  async function uploadAvatar(file) {
    if (!file) return { ok: false, error: "未选择文件" };
    try {
      const headers = {};
      const t = getToken();
      if (t) headers["X-Auth-Token"] = t;
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(API_BASE + "api/upload.php", { method: "POST", headers, body: fd });
      return await res.json();
    } catch (e) {
      return { ok: false, error: "上传失败，请检查网络" };
    }
  }

  /* ==================== 收藏 / 歌单 / 历史 ==================== */
  function addHistory(songId, weight) {
    const u = currentUser();
    if (!u) return;
    const d = getUserData(u);
    const now = Date.now();
    const ex = d.history.find((h) => h.id === songId);
    if (ex) { ex.weight = (ex.weight || 0) + (weight || 1); ex.last = now; }
    else d.history.push({ id: songId, weight: weight || 1, last: now });
    if (d.history.length > 200) {
      d.history.sort((a, b) => b.last - a);
      d.history.length = 200;
    }
    saveUserData(u, d);
    queueSync();
    bus.emit("data:changed");
  }

  function toggleFavorite(songId) {
    const u = currentUser();
    if (!u) return false;
    const d = getUserData(u);
    const i = d.favorites.indexOf(songId);
    let fav;
    if (i >= 0) { d.favorites.splice(i, 1); fav = false; }
    else { d.favorites.unshift(songId); fav = true; }
    saveUserData(u, d);
    queueSync();
    bus.emit("data:changed");
    return fav;
  }
  function isFavorite(songId) {
    const u = currentUser();
    if (!u) return false;
    return getUserData(u).favorites.indexOf(songId) >= 0;
  }
  function getFavorites() {
    const u = currentUser();
    if (!u) return [];
    return getUserData(u).favorites.slice();
  }

  function createPlaylist(name) {
    const u = currentUser();
    if (!u) return null;
    const d = getUserData(u);
    const pl = { id: "pl_" + Date.now().toString(36), name: (name || "我的歌单").trim() || "我的歌单", songIds: [] };
    d.playlists.push(pl);
    saveUserData(u, d);
    syncNow();
    bus.emit("data:changed");
    return pl;
  }
  // 导入歌单：一次性创建含多首歌曲的歌单（单次写入，避免逐首 addToPlaylist 的多次写盘）
  function importPlaylist(name, songIds) {
    const u = currentUser();
    if (!u) return null;
    const d = getUserData(u);
    const pl = { id: "pl_" + Date.now().toString(36), name: (name || "导入的歌单").trim() || "导入的歌单", songIds: (songIds || []).slice() };
    d.playlists.push(pl);
    saveUserData(u, d);
    syncNow();
    bus.emit("data:changed");
    return pl;
  }
  function renamePlaylist(plId, name) {
    const u = currentUser(); if (!u) return;
    const d = getUserData(u);
    const pl = d.playlists.find((p) => p.id === plId);
    if (pl) { pl.name = (name || "").trim() || pl.name; saveUserData(u, d); queueSync(); bus.emit("data:changed"); }
  }
  function deletePlaylist(plId) {
    const u = currentUser(); if (!u) return;
    const d = getUserData(u);
    d.playlists = d.playlists.filter((p) => p.id !== plId);
    saveUserData(u, d);
    queueSync();
    bus.emit("data:changed");
  }
  function addToPlaylist(plId, songId) {
    const u = currentUser(); if (!u) return false;
    const d = getUserData(u);
    const pl = d.playlists.find((p) => p.id === plId);
    if (!pl) return false;
    if (pl.songIds.indexOf(songId) < 0) pl.songIds.unshift(songId);
    saveUserData(u, d);
    syncNow();
    bus.emit("data:changed");
    return true;
  }
  function removeFromPlaylist(plId, songId) {
    const u = currentUser(); if (!u) return;
    const d = getUserData(u);
    const pl = d.playlists.find((p) => p.id === plId);
    if (pl) { pl.songIds = pl.songIds.filter((id) => id !== songId); saveUserData(u, d); queueSync(); bus.emit("data:changed"); }
  }
  function getPlaylists() {
    const u = currentUser();
    if (!u) return [];
    return getUserData(u).playlists.slice();
  }
  function getPlaylist(plId) {
    return getPlaylists().find((p) => p.id === plId) || null;
  }

  /* ==================== 全局播放计数 ==================== */
  function getPlays() {
    let p = read(K.PLAYS, null);
    if (!p) {
      p = {};
      global.App.DATA.SONGS.forEach((s) => (p[s.id] = s.plays));
      write(K.PLAYS, p);
    }
    return p;
  }
  function bumpPlays(songId) {
    const p = getPlays();
    p[songId] = (p[songId] || 0) + 1;
    write(K.PLAYS, p);
  }

  /* ==================== 社交 ==================== */
  const social = {
    async searchUsers(q) { return api("social.php", { action: "search", q }); },
    async addFriend(idOrUid, isInternalId) {
      const p = isInternalId ? { id: parseInt(idOrUid, 10) } : { uid: String(idOrUid) };
      return api("social.php", Object.assign({ action: "addFriend" }, p));
    },
    async removeFriend(id) { return api("social.php", { action: "removeFriend", id: parseInt(id, 10) }); },
    async listFriends() { return api("social.php", { action: "listFriends" }); },
    async listOnline() { return api("social.php", { action: "listOnline" }); },
    async shareSong(toId, song, message) {
      return api("social.php", { action: "share", toId: parseInt(toId, 10), song: song, message: message || "" });
    },
    async listShares() { return api("social.php", { action: "listShares" }); },
    async viewProfile(id) { return api("social.php", { action: "viewProfile", id: parseInt(id, 10) }); },
    async heartbeat() { return api("social.php", { action: "heartbeat" }); },
  };

  /* ==================== 搜索历史 ==================== */
  function getSearchHistory() { return read(K.SEARCH_HISTORY, []); }
  function addSearchHistory(q) {
    q = (q || "").trim();
    if (!q) return;
    let h = getSearchHistory().filter((x) => x !== q);
    h.unshift(q);
    if (h.length > 10) h.length = 10;
    write(K.SEARCH_HISTORY, h);
  }
  function clearSearchHistory() { write(K.SEARCH_HISTORY, []); }

  /* ==================== 设置 ==================== */
  const defaultSettings = {
    theme: "dark",
    accent: "",            // 空 = 跟随歌曲封面
    bgBlur: 6,
    glass: 30,
    boost: 1,
    haptics: true,
    bgPreset: "aurora",
    bgImage: "",           // 自定义背景（压缩后的 dataURL）
    sidebarMini: false,
  };
  function getSettings() {
    return Object.assign({}, defaultSettings, read(K.SETTINGS, {}));
  }
  function saveSettings(patch) {
    const s = Object.assign(getSettings(), patch);
    write(K.SETTINGS, s);
    applySettings(s);
    bus.emit("settings:changed", s);
  }
  function applySettings(s) {
    document.body.dataset.theme = s.theme;
    document.body.classList.toggle("sb-mini", !!s.sidebarMini);
    if (s.accent) setAccent(s.accent);
    else if (global.App.Player && global.App.Player.current) applySongAccent(global.App.Player.current.song);
    document.querySelector(".bg-veil").style.background =
      "linear-gradient(180deg, rgba(5,6,12," + (s.bgBlur / 90).toFixed(3) + "), rgba(5,6,12," + (0.3 + s.glass / 160).toFixed(3) + "))";
    if (s.theme === "light") {
      document.querySelector(".bg-veil").style.background =
        "linear-gradient(180deg, rgba(238,240,247," + (s.bgBlur / 120).toFixed(3) + "), rgba(238,240,247," + (0.35 + s.glass / 200).toFixed(3) + "))";
    }
    // 主题切换后按新主题重算派生强调色（inline 变量优先级高于 body[data-theme] 静态规则）
    if (s.accent) setAccent(s.accent);
    else {
      const cur = global.App.Player && global.App.Player.current && global.App.Player.current.song;
      setAccent((cur && cur.themeColor) || "#7c5cff");
    }
    applyBgPreset(s.bgPreset);
  }

  /* ---- 背景预设：极光 / 桌面 / 移动 / 纯色 / 8 组渐变 / 自定义图片 ---- */
  const BG_GRADIENTS = [
    { name: "深蓝默认", value: "linear-gradient(135deg, #0a0a12 0%, #1a1a2e 100%)" },
    { name: "紫蓝渐变", value: "linear-gradient(135deg, #1a1a3e 0%, #4d6bfe 100%)" },
    { name: "青蓝深海", value: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
    { name: "暗夜紫", value: "linear-gradient(135deg, #2b1055 0%, #7597de 100%)" },
    { name: "森林", value: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)" },
    { name: "落日", value: "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)" },
    { name: "极光", value: "linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%)" },
    { name: "星空", value: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" },
  ];

  function applyBgPreset(v) {
    const aurora = document.querySelector(".bg-aurora");
    const stars = document.querySelector("#stars");
    const layer = document.querySelector("#bgImage");
    if (!aurora || !stars || !layer) return;
    const s = getSettings();
    const blur = Math.max(0, Math.min(30, Number(s.bgBlur) || 0));
    const showImage = (src) => {
      layer.hidden = false;
      layer.style.backgroundImage = 'url("' + src + '")';
      layer.style.filter = blur ? "blur(" + blur + "px)" : "none";
    };
    const hideImage = () => {
      layer.hidden = true;
      layer.style.backgroundImage = "";
      layer.style.filter = "none";
    };
    if (v === "none") {
      aurora.style.display = "none";
      stars.style.display = "none";
      hideImage();
      document.body.style.background = "var(--bg-0)";
    } else if (!v || v === "aurora") {
      aurora.style.display = "";
      stars.style.display = "";
      hideImage();
      document.body.style.background = "";
    } else if (v === "desktop" || v === "mobile") {
      aurora.style.display = "none";
      stars.style.display = "none";
      document.body.style.background = "var(--bg-0)";
      showImage("assets/" + v + ".jpg");
    } else if (v === "custom" && s.bgImage) {
      aurora.style.display = "none";
      stars.style.display = "none";
      document.body.style.background = "var(--bg-0)";
      showImage(s.bgImage);
    } else if (v.indexOf("grad:") === 0) {
      const g = BG_GRADIENTS[parseInt(v.slice(5), 10)];
      aurora.style.display = "none";
      stars.style.display = "none";
      hideImage();
      document.body.style.background = g ? g.value : "var(--bg-0)";
    } else {
      aurora.style.display = "";
      stars.style.display = "";
      hideImage();
      document.body.style.background = "";
    }
  }

  // 图片压缩：长边 ≤1600，JPEG 0.82，避免 localStorage 超限
  function compressImage(file, maxW) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = function () {
        const limit = maxW || 1600;
        const w = Math.min(img.width, limit);
        const h = Math.round((img.height * w) / img.width);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        let dataUrl;
        try { dataUrl = canvas.toDataURL("image/jpeg", 0.82); }
        catch (e) { dataUrl = canvas.toDataURL("image/png"); }
        URL.revokeObjectURL(url);
        resolve(dataUrl);
      };
      img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }

  /* ---- 主题强调色 ---- */
  function setAccent(color, soft) {
    const root = document.documentElement;
    const light = document.body.dataset.theme === "light";
    root.style.setProperty("--accent", color);
    root.style.setProperty("--accent-soft", soft || hexToRgba(color, light ? 0.12 : 0.16));
    root.style.setProperty("--accent-glow", hexToRgba(color, light ? 0.22 : 0.45));
    root.style.setProperty("--accent-text", light ? mixDarken(color, 0.4) : mixLighten(color, 0.35));
  }
  function mixDarken(hex, t) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#5b47c8";
    const n = parseInt(m[1], 16);
    const r = Math.round(((n >> 16) & 255) * (1 - t));
    const g = Math.round(((n >> 8) & 255) * (1 - t));
    const b = Math.round((n & 255) * (1 - t));
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function hexToRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "rgba(124,92,255," + a + ")";
    const n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + a + ")";
  }
  function mixLighten(hex, t) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
    if (!m) return "#b7a6ff";
    const n = parseInt(m[1], 16);
    const r = Math.round(((n >> 16) & 255) * (1 - t) + 255 * t);
    const g = Math.round(((n >> 8) & 255) * (1 - t) + 255 * t);
    const b = Math.round((n & 255) * (1 - t) + 255 * t);
    return "rgb(" + r + "," + g + "," + b + ")";
  }
  function applySongAccent(song) {
    if (getSettings().accent) return; // 用户锁定主题色时不跟随
    if (song && song.themeColor) setAccent(song.themeColor);
  }

  /* ==================== 导出 ==================== */
  global.App = global.App || {};
  global.App.Core = {
    $, $$, el, fmtDur, fmtTime, fmtNum, esc, debounce, icon, gradientFor, applyBgPreset, BG_GRADIENTS, compressImage,
    bus, read, write,
    K, PREFIX,
    getToken, setToken, useApi, api, apiGet,
    currentUser, isLoggedIn, getUserData, saveUserData,
    register, login, verifyLogin, logout,
    getProfile, updateProfile, uploadAvatar, getInterests,
    addHistory, toggleFavorite, isFavorite, getFavorites,
    createPlaylist, importPlaylist, renamePlaylist, deletePlaylist, addToPlaylist,
    removeFromPlaylist, getPlaylists, getPlaylist,
    getPlays, bumpPlays,
    social,
    getSearchHistory, addSearchHistory, clearSearchHistory,
    getSettings, saveSettings, applySettings, setAccent, applySongAccent,
    pullFromServer, pushToServer, queueSync, syncNow,
  };
})(window);
