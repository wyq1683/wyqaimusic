/* ============================================================
 * store.js — 持久化层（localStorage 本地缓存 + PHP/MySQL 云端同步）
 *
 * 双模式：
 *   USE_API = "auto"  → 自动探测后端；有后端则登录/同步走 API，
 *                       否则回退到纯本地 localStorage（静态预览可用）。
 *   USE_API = true    → 强制走后端（部署到 InfinityFree 后使用）。
 *   USE_API = false   → 强制纯本地。
 *
 * 策略：本地 localStorage 始终是「工作副本」，操作立即生效；
 *       登录后从云端拉取（pull），每次变更后自动推送（push，防抖）。
 * ============================================================ */
(function (global) {
  "use strict";

  const PREFIX = "mp_v1_";
  const K_USERS = PREFIX + "users";
  const K_SESSION = PREFIX + "session";
  const K_PLAYS = PREFIX + "plays";
  const K_TOKEN = PREFIX + "token";

  // ===== 后端配置（部署时按需修改） =====
  const API_BASE = "";        // 同源部署留空即可；跨域则填 https://你的域名
  const USE_API = "auto";     // "auto" | true | false

  let apiReady = false;       // 探测结果缓存
  let apiDetected = false;    // 是否已探测

  // 简易同步哈希（FNV-1a + 混淆），仅用于纯本地模式的演示，后端用 bcrypt
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    let out = (h >>> 0).toString(16);
    let h2 = 0x9e3779b9;
    for (let i = 0; i < out.length; i++) {
      h2 ^= out.charCodeAt(i);
      h2 = Math.imul(h2, 0x85ebca6b);
    }
    return (h2 >>> 0).toString(16) + out;
  }

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

  // ---- token 管理 ----
  function getToken() { return read(K_TOKEN, null); }
  function setToken(t) { t ? write(K_TOKEN, t) : localStorage.removeItem(K_TOKEN); }

  // ---- 后端探测 / API 调用 ----
  async function detectApi() {
    if (USE_API === false) { apiReady = false; apiDetected = true; return; }
    if (USE_API === true) { apiReady = true; apiDetected = true; return; }
    try {
      const res = await fetch(API_BASE + "api/auth.php", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "me" }),
      });
      const data = await res.json();
      apiReady = typeof data.ok === "boolean"; // 能返回 JSON 即后端存在
    } catch (e) {
      apiReady = false;
    }
    apiDetected = true;
  }
  async function useApi() {
    if (!apiDetected) await detectApi();
    return apiReady;
  }
  async function apiCall(endpoint, data) {
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

  // ---- 本地用户表（仅纯本地模式使用） ----
  function users() { return read(K_USERS, {}); }

  // ---- 每用户数据命名空间 ----
  function udKey(u) { return PREFIX + "ud_" + u; }
  function defaultUD() { return { history: [], favorites: [], playlists: [], profile: {} }; }
  function getUserData(u) {
    u = u || currentUser();
    if (!u) return null;
    const all = read(udKey(u), null);
    if (!all) {
      const d = defaultUD();
      write(udKey(u), d);
      return d;
    }
    if (!Array.isArray(all.history)) all.history = [];
    if (!Array.isArray(all.favorites)) all.favorites = [];
    if (!Array.isArray(all.playlists)) all.playlists = [];
    if (!all.profile || typeof all.profile !== "object") all.profile = {};
    return all;
  }
  function saveUserData(u, data) { write(udKey(u), data); }

  // ---- 会话 ----
  function currentUser() { return read(K_SESSION, null); }
  function isLoggedIn() { return !!currentUser(); }

  // ---- 云端同步：拉取 ----
  async function pullFromServer() {
    const r = await apiCall("sync.php", { action: "load" });
    if (!r.ok) return;
    const u = currentUser();
    if (!u) return;
    const d = getUserData(u);
    const localPls = d.playlists || [];
    const localFavs = d.favorites || [];
    const localHis = d.history || [];
    const serverPls = r.playlists || [];
    const serverFavs = r.favorites || [];
    const serverHis = r.history || [];

    const serverHasData = serverPls.length > 0 || serverFavs.length > 0 || serverHis.length > 0;
    const localHasData = localPls.length > 0 || localFavs.length > 0 || localHis.length > 0;

    // 服务器为空但本地有数据：说明此前 push 未成功，保留本地并重新推送，避免刷新丢数据
    if (!serverHasData && localHasData) {
      queueSync();
      return;
    }

    // 以服务器为准（跨设备同步）；单个字段为空时保留本地，防止误清空
    d.favorites = serverFavs.length > 0 ? serverFavs : localFavs;
    d.playlists = serverPls.length > 0 ? serverPls : localPls;
    d.history = serverHis.length > 0 ? serverHis : localHis;
    saveUserData(u, d);

    // 同步外部歌曲元数据（网易云/Audius/QQ 在线歌曲），刷新后不丢失
    if (r.externals && global.App.DATA && typeof global.App.DATA.setExternalMap === "function") {
      global.App.DATA.setExternalMap(r.externals);
    }
  }
  // ---- 云端同步：推送（防抖） ----
  let syncTimer = null;
  let retryTimer = null;
  let retryCount = 0;
  function queueSync() {
    if (!getToken()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushToServer, 300);
  }
  function syncNow() {
    if (!getToken()) return;
    clearTimeout(syncTimer);
    pushToServer(); // 关键操作立即推送，不等防抖
  }
  async function pushToServer() {
    const u = currentUser();
    if (!u || !getToken()) return;
    const d = getUserData(u);
    const externals = (global.App.DATA && typeof global.App.DATA.getExternalMap === "function")
      ? global.App.DATA.getExternalMap()
      : {};
    const r = await apiCall("sync.php", {
      action: "save",
      favorites: d.favorites,
      playlists: d.playlists,
      history: d.history,
      externals: externals,
    });
    if (r && r.ok === false) {
      // 失败重试：独立 timer（不与 queueSync 互杀）+ 指数退避 + 最多 3 次，避免重试风暴
      if (retryCount < 3) {
        retryCount++;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(pushToServer, 3000 * Math.pow(2, retryCount - 1));
      }
    } else {
      retryCount = 0;
      clearTimeout(retryTimer);
    }
  }

  // ================= 注册 / 登录（异步，支持二次验证） =================
  async function register(username, password, email) {
    username = (username || "").trim();
    if (username.length < 3) return { ok: false, error: "用户名至少 3 个字符" };
    if (password.length < 4) return { ok: false, error: "密码至少 4 个字符" };

    if (await useApi()) {
      const r = await apiCall("auth.php", { action: "register", username, password, email });
      if (r.ok) {
        setToken(r.token);
        write(K_SESSION, r.username || username);
        getUserData(username);
        await pullFromServer();
        return { ok: true };
      }
      return { ok: false, error: r.error || "注册失败" };
    }

    // ---- 纯本地回退 ----
    const u = users();
    if (u[username]) return { ok: false, error: "该用户名已被注册" };
    u[username] = { username, passHash: hash(password), email, createdAt: Date.now() };
    write(K_USERS, u);
    write(K_SESSION, username);
    getUserData(username);
    return { ok: true };
  }

  async function login(username, password) {
    username = (username || "").trim();

    if (await useApi()) {
      const r = await apiCall("auth.php", { action: "login", username, password });
      if (r.ok && r.needVerify) {
        // 需要二次验证，返回 userId 让前端进入验证码步骤
        return { ok: false, needVerify: true, userId: r.userId, maskedEmail: r.maskedEmail };
      }
      if (r.ok) {
        setToken(r.token);
        write(K_SESSION, r.username || username);
        await pullFromServer();
        return { ok: true };
      }
      return { ok: false, error: r.error || "登录失败" };
    }

    // ---- 纯本地回退 ----
    const u = users();
    const rec = u[username];
    if (!rec) return { ok: false, error: "用户不存在" };
    if (rec.passHash !== hash(password)) return { ok: false, error: "密码错误" };
    write(K_SESSION, username);
    return { ok: true };
  }

  // 二次验证：验证邮箱验证码，成功即登录
  async function verifyLogin(userId, code) {
    if (await useApi()) {
      const r = await apiCall("auth.php", { action: "verify", userId, code });
      if (r.ok) {
        setToken(r.token);
        write(K_SESSION, r.username || "");
        await pullFromServer();
        return { ok: true };
      }
      return { ok: false, error: r.error || "验证码错误" };
    }
    // 本地模式不涉及二次验证
    return { ok: false, error: "当前环境不支持二次验证" };
  }

  function logout() {
    // 异步通知服务器清除 token（fire-and-forget）
    if (getToken()) apiCall("auth.php", { action: "logout" });
    localStorage.removeItem(K_SESSION);
    setToken(null);
    profileCache = null;
  }

  // ================= 个人资料 =================
  let profileCache = null;
  async function getProfile(force) {
    const u = currentUser();
    if (!u) return null;
    if (profileCache && !force) return profileCache;

    if (await useApi()) {
      const r = await apiCall("auth.php", { action: "me" });
      if (r.ok && r.profile) {
        profileCache = r.profile;
        return profileCache;
      }
    }

    // 本地回退 / API 失败：用本地缓存数据
    const d = getUserData(u);
    const p = d.profile || {};
    profileCache = {
      uid: p.uid || "",
      username: u,
      email: p.email || "",
      nickname: p.nickname || "",
      avatar: p.avatar || "",
      gender: p.gender || "",
      age: p.age || null,
      hobby: p.hobby || "",
      signature: p.signature || "",
      region: p.region || "",
      privacy: p.privacy || 0,
      interests: p.interests || "",
      vip: p.vip || 0,
    };
    return profileCache;
  }
  // 我的兴趣（流派标签数组，最多 8 个）
  function getInterests() {
    const u = currentUser();
    const d = u ? getUserData(u) : null;
    const raw = (profileCache && profileCache.interests) || (d && d.profile && d.profile.interests) || "";
    return raw ? String(raw).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [];
  }
  async function setInterests(list) {
    return updateProfile({ interests: (list || []).slice(0, 8).join(",") });
  }
  function getPrivacy() {
    const u = currentUser();
    const d = u ? getUserData(u) : null;
    return (profileCache && profileCache.privacy) || (d && d.profile && d.profile.privacy) || 0;
  }
  async function setPrivacy(level) { return updateProfile({ privacy: level }); }
  async function updateProfile(fields) {
    const u = currentUser();
    if (!u) return { ok: false, error: "未登录" };
    if (!fields || typeof fields !== "object") return { ok: false, error: "数据格式错误" };

    if (await useApi()) {
      const r = await apiCall("auth.php", Object.assign({ action: "updateProfile" }, fields));
      if (r.ok) {
        if (profileCache) Object.assign(profileCache, fields);
        // 同步更新本地工作副本
        const d = getUserData(u);
        Object.assign(d.profile, fields);
        saveUserData(u, d);
        return { ok: true };
      }
      return { ok: false, error: r.error || "保存失败" };
    }

    // 本地回退
    const d = getUserData(u);
    Object.assign(d.profile, fields);
    saveUserData(u, d);
    if (profileCache) Object.assign(profileCache, fields);
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

  // ================= 好友 / 分享 =================
  async function searchUsers(q) {
    if (!(await useApi())) return { ok: false, error: "当前环境不支持好友功能" };
    return await apiCall("social.php", { action: "search", q });
  }
  async function addFriend(idOrUid, isInternalId) {
    if (!(await useApi())) return { ok: false, error: "当前环境不支持好友功能" };
    const p = isInternalId ? { id: parseInt(idOrUid, 10) } : { uid: String(idOrUid) };
    return await apiCall("social.php", Object.assign({ action: "addFriend" }, p));
  }
  async function removeFriend(id) {
    if (!(await useApi())) return { ok: false, error: "当前环境不支持好友功能" };
    return await apiCall("social.php", { action: "removeFriend", id: parseInt(id, 10) });
  }
  async function listFriends() {
    if (!(await useApi())) return { ok: false, data: [], error: "当前环境不支持好友功能" };
    return await apiCall("social.php", { action: "listFriends" });
  }
  async function listOnline() {
    if (!(await useApi())) return { ok: false, data: [], error: "当前环境不支持在线列表" };
    return await apiCall("social.php", { action: "listOnline" });
  }
  async function shareSong(toId, song, message) {
    if (!(await useApi())) return { ok: false, error: "当前环境不支持分享功能" };
    return await apiCall("social.php", { action: "share", toId: parseInt(toId, 10), song: song, message: message || "" });
  }
  async function listShares() {
    if (!(await useApi())) return { ok: false, data: [], error: "当前环境不支持分享功能" };
    return await apiCall("social.php", { action: "listShares" });
  }
  async function heartbeat() {
    if (!getToken()) return;
    try { await apiCall("social.php", { action: "heartbeat" }); } catch (e) { /* 忽略 */ }
  }

  // ================= 收听历史 =================
  function addHistory(songId, weight) {
    const u = currentUser();
    if (!u) return;
    const d = getUserData(u);
    const now = Date.now();
    const existing = d.history.find((h) => h.id === songId);
    if (existing) {
      existing.weight = (existing.weight || 0) + (weight || 1);
      existing.last = now;
    } else {
      d.history.push({ id: songId, weight: weight || 1, last: now });
    }
    if (d.history.length > 200) d.history.sort((a, b) => b.last - a.last), (d.history.length = 200);
    saveUserData(u, d);
    queueSync();
  }

  // ================= 收藏 =================
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

  // ================= 播放列表 =================
  function createPlaylist(name) {
    const u = currentUser();
    if (!u) return null;
    const d = getUserData(u);
    const pl = { id: "pl_" + Date.now().toString(36), name: (name || "我的歌单").trim() || "我的歌单", songIds: [] };
    d.playlists.push(pl);
    saveUserData(u, d);
    syncNow();
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
    return pl;
  }
  function renamePlaylist(plId, name) {
    const u = currentUser(); if (!u) return;
    const d = getUserData(u);
    const pl = d.playlists.find((p) => p.id === plId);
    if (pl) { pl.name = (name || "").trim() || pl.name; saveUserData(u, d); queueSync(); }
  }
  function deletePlaylist(plId) {
    const u = currentUser(); if (!u) return;
    const d = getUserData(u);
    d.playlists = d.playlists.filter((p) => p.id !== plId);
    saveUserData(u, d);
    queueSync();
  }
  function addToPlaylist(plId, songId) {
    const u = currentUser(); if (!u) return false;
    const d = getUserData(u);
    const pl = d.playlists.find((p) => p.id === plId);
    if (!pl) return false;
    if (pl.songIds.indexOf(songId) < 0) pl.songIds.unshift(songId);
    saveUserData(u, d);
    syncNow();
    return true;
  }
  function removeFromPlaylist(plId, songId) {
    const u = currentUser(); if (!u) return;
    const d = getUserData(u);
    const pl = d.playlists.find((p) => p.id === plId);
    if (pl) { pl.songIds = pl.songIds.filter((id) => id !== songId); saveUserData(u, d); queueSync(); }
  }
  function getPlaylists() {
    const u = currentUser();
    if (!u) return [];
    return getUserData(u).playlists.slice();
  }

  // ================= 全局播放计数 =================
  function getPlays() {
    let p = read(K_PLAYS, null);
    if (!p) {
      p = {};
      global.App.DATA.SONGS.forEach((s) => (p[s.id] = s.plays));
      write(K_PLAYS, p);
    }
    return p;
  }
  function bumpPlays(songId) {
    const p = getPlays();
    p[songId] = (p[songId] || 0) + 1;
    write(K_PLAYS, p);
  }

  function resetAll() {
    Object.keys(localStorage)
      .filter((k) => k.startsWith(PREFIX))
      .forEach((k) => localStorage.removeItem(k));
  }

  // 暴露配置供外部查看
  global.App.Store = {
    register, login, verifyLogin, logout, currentUser, isLoggedIn, getUserData,
    getProfile, updateProfile, uploadAvatar,
    getInterests, setInterests, getPrivacy, setPrivacy,
    searchUsers, addFriend, removeFriend, listFriends, listOnline, shareSong, listShares, heartbeat,
    addHistory,
    toggleFavorite, isFavorite, getFavorites,
    createPlaylist, renamePlaylist, deletePlaylist, addToPlaylist, removeFromPlaylist, getPlaylists, importPlaylist,
    getPlays, bumpPlays, resetAll,
    useApi, pullFromServer, pushToServer,
    // 用 getter 返回实时探测结果（直接导出布尔值是模块加载时的 false 快照）
    get apiReady() { return apiReady; },
  };
})(window);
