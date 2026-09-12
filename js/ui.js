/* ============================================================
 * ui.js — 路由、渲染、交互
 * 实现：封面取色氛围光、情感化推荐卡片、明暗主题切换、
 *       完整播放控制、收藏、播放列表管理、Toast 等。
 * ============================================================ */
(function (global) {
  "use strict";
  const D = global.App.DATA;
  const S = global.App.Store;
  const P = global.App.Player;
  const R = global.App.Recommend;

  /* ---- DOM 缓存 ---- */
  const $ = (sel, p) => (p || document).querySelector(sel);
  const $$ = (sel, p) => [...(p || document).querySelectorAll(sel)];
  const dom = {
    view: $("#view"),
    topbarTitle: $("#topbarTitle"),
    topbarUser: $("#topbarUser"),
    sidebarFoot: $("#sidebarFoot"),
    sidebar: $("#sidebar"),
    nav: $("#nav"),
    authMask: $("#authMask"),
    authUser: $("#authUser"),
    authPass: $("#authPass"),
    authEmail: $("#authEmail"),
    authCode: $("#authCode"),
    emailField: $("#emailField"),
    codeField: $("#codeField"),
    codeHint: $("#codeHint"),
    authError: $("#authError"),
    authSubmit: $("#authSubmit"),
    authTabs: $$(".auth-tab"),
    authForm: $("#authForm"),
    plMask: $("#plMask"),
    plList: $("#plList"),
    plNewName: $("#plNewName"),
    toastWrap: $("#toastWrap"),
    pbCover: $("#pbCover"),
    pbTitle: $("#pbTitle"),
    pbArtist: $("#pbArtist"),
    pbFav: $("#pbFav"),
    btnPlay: $("#btnPlay"),
    seek: $("#seek"),
    timeCur: $("#timeCur"),
    timeDur: $("#timeDur"),
    menuBtn: $("#menuBtn"),
    scrim: $("#scrim"),
    pbMenu: $("#pbMenu"),
  };

  // 当前页面状态
  let currentRoute = "/home";
  let prevRoute = "/home";   // 上一个非播放页路由（用于封面点击 toggle）
  let currentSongs = [];   // 当前视图显示的歌曲 ID 列表（用于播放队列）
  let searchQuery = "";
  let plTargetSongId = null; // 播放列表弹窗目标曲目
  let authMode = "login";    // login | register
  let verifyUserId = null;   // 二次验证：待验证的用户 ID
  let audiusCache = {};      // Audius 在线歌曲缓存 {原始id: track}
  let currentAudius = [];    // 当前显示的 Audius 结果（原始id列表）
  let neteaseCache = {};     // 网易云在线歌曲缓存 {原始id: track}
  let currentNetease = [];   // 当前显示的网易云结果（原始id列表）
  let qqCache = {};          // QQ音乐在线歌曲缓存 {songmid: track}
  let currentQQ = [];        // 当前显示的 QQ 音乐结果（songmid列表）
  let seekDrag = false;
  let theme = "dark";

  // 在线缓存写入（带 LRU 上限：超出时按插入序淘汰最旧条目，防无限增长）
  const ONLINE_CACHE_CAP = 500;
  function cachePut(cache, id, track) {
    if (!(id in cache) && Object.keys(cache).length >= ONLINE_CACHE_CAP) {
      const keys = Object.keys(cache);
      for (let i = 0; i < keys.length - ONLINE_CACHE_CAP + 1; i++) delete cache[keys[i]];
    }
    cache[id] = track;
  }

  /* ---- 工具函数 ---- */
  function fmt(sec) {
    if (!sec || !isFinite(sec)) return "0:00";
    const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
    return m + ":" + String(s).padStart(2, "0");
  }
  const svgIcon = (id, w, h) => `<svg width="${w || 18}" height="${h || 18}" aria-hidden="true"><use href="#${id}"></use></svg>`;
  // HTML 转义（全转义 &<>"'）：所有插入 innerHTML 的动态内容必须过它
  const escAttr = (v) => String(v == null ? "" : v)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

  function toast(msg, type) {
    const el = document.createElement("div");
    el.className = "toast " + (type || "");
    el.textContent = msg;
    dom.toastWrap.appendChild(el);
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .3s"; setTimeout(() => el.remove(), 300); }, 2500);
  }

  /* ---- 背景管理（自定义背景 + 持久化） ---- */
  const BG_PRESETS = [
    { name: "深蓝默认", value: "linear-gradient(135deg, #0a0a12 0%, #1a1a2e 100%)" },
    { name: "紫蓝渐变", value: "linear-gradient(135deg, #1a1a3e 0%, #4D6BFE 100%)" },
    { name: "青蓝深海", value: "linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)" },
    { name: "暗夜紫", value: "linear-gradient(135deg, #2b1055 0%, #7597de 100%)" },
    { name: "森林", value: "linear-gradient(135deg, #134e5e 0%, #71b280 100%)" },
    { name: "落日", value: "linear-gradient(135deg, #ee0979 0%, #ff6a00 100%)" },
    { name: "极光", value: "linear-gradient(135deg, #00c9ff 0%, #92fe9d 100%)" },
    { name: "星空", value: "linear-gradient(135deg, #0f0c29 0%, #302b63 50%, #24243e 100%)" },
  ];
  let currentBgBlurPx = 6;

  function applyBg(value) {
    const bgEl = document.getElementById("appBg");
    if (bgEl) {
      if (value && (value.indexOf("data:image") === 0 || value.indexOf("url(") === 0)) {
        bgEl.style.backgroundImage = value.indexOf("url(") === 0 ? value : 'url("' + value + '")';
      } else {
        bgEl.style.backgroundImage = value || BG_PRESETS[0].value;
      }
    }
    try {
      localStorage.setItem("mp_bg", value || BG_PRESETS[0].value);
    } catch (e) { /* 存储可能超限，忽略 */ }
  }
  function defaultBgValue() {
    const isMobile = window.innerWidth < 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent || "");
    return isMobile ? 'url("images/bg-mobile.jpg")' : 'url("images/bg-desktop.jpg")';
  }
  function loadBg() {
    let value = null;
    try {
      value = localStorage.getItem("mp_bg");
    } catch (e) { /* 忽略 */ }
    applyBg(value || defaultBgValue());
  }

  /* ---- 背景模糊强度（0~30px，0=不模糊） ---- */
  function applyBgBlur(px) {
    currentBgBlurPx = Math.max(0, Math.min(30, Number(px) || 0));
    document.documentElement.style.setProperty("--bg-blur", currentBgBlurPx + "px");
    try { localStorage.setItem("mp_bg_blur_px", String(currentBgBlurPx)); } catch (e) {}
  }
  function loadBgBlur() {
    let v = 6; // 默认 6px
    try {
      const raw = localStorage.getItem("mp_bg_blur_px");
      const n = raw === null ? NaN : parseFloat(raw);
      if (!isNaN(n) && n >= 0 && n <= 30) v = n;
      // 兼容旧版布尔值 mp_bg_blur：0=关 -> 0px，1=开 -> 6px
      else {
        const old = localStorage.getItem("mp_bg_blur");
        if (old === "0") v = 0;
        else if (old === "1") v = 6;
      }
    } catch (e) { /* 忽略 */ }
    applyBgBlur(v);
  }

  /* ---- 界面玻璃透明度（0~1，越小越透出背景，0=完全透明） ---- */
  let currentGlass = 0.30;
  function applyGlass(v) {
    currentGlass = Math.max(0, Math.min(1, v));
    document.documentElement.style.setProperty("--glass-alpha", currentGlass.toFixed(2));
    try { localStorage.setItem("mp_glass", currentGlass.toFixed(2)); } catch (e) {}
  }
  function loadGlass() {
    let v = 0.30; // 默认 UI 透明度 30%
    try { v = parseFloat(localStorage.getItem("mp_glass")); if (isNaN(v) || v < 0 || v > 1) v = 0.30; } catch (e) {}
    applyGlass(v);
  }
  // 压缩图片到合适尺寸后转 base64（避免 localStorage 超限）
  function compressImage(file, callback) {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = function () {
      const maxW = 1600;
      const w = Math.min(img.width, maxW);
      const h = Math.round(img.height * (w / img.width));
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      let dataUrl;
      try { dataUrl = canvas.toDataURL("image/jpeg", 0.82); }
      catch (e) { dataUrl = canvas.toDataURL("image/png"); }
      URL.revokeObjectURL(url);
      callback(dataUrl);
    };
    img.onerror = function () { URL.revokeObjectURL(url); callback(null); };
    img.src = url;
  }
  // 打开背景设置弹窗
  function openBgSettings() {
    const mask = document.getElementById("bgMask");
    if (!mask) return;
    // 渲染预设
    const presetsEl = document.getElementById("bgPresets");
    if (presetsEl) {
      const current = localStorage.getItem("mp_bg") || BG_PRESETS[0].value;
      presetsEl.innerHTML = BG_PRESETS.map(function (p) {
        const active = current === p.value ? " active" : "";
        return `<button class="bg-preset${active}" data-bg="${encodeURIComponent(p.value)}" title="${p.name}" aria-label="${p.name}" style="background:${p.value}"></button>`;
      }).join("");
    }
    // 背景模糊滑块状态
    const blurRange = document.getElementById("bgBlurRange");
    const blurVal = document.getElementById("bgBlurValue");
    if (blurRange) {
      blurRange.value = currentBgBlurPx;
      if (blurVal) blurVal.textContent = blurRange.value + "px";
    }
    // 透明度滑块状态
    const glassRange = document.getElementById("bgGlassRange");
    const glassVal = document.getElementById("bgGlassValue");
    if (glassRange) {
      glassRange.value = Math.round(currentGlass * 100);
      if (glassVal) glassVal.textContent = glassRange.value + "%";
    }
    openModal(mask, "#bgClose");
  }

  function timeGreeting() {
    const h = new Date().getHours();
    if (h < 6) return { hi: "夜深了", msg: "让旋律陪你度过安静的夜晚。" };
    if (h < 9) return { hi: "早上好", msg: "新的一天，从一首好歌开始。" };
    if (h < 12) return { hi: "上午好", msg: "来点轻松的旋律，提提神。" };
    if (h < 14) return { hi: "中午好", msg: "午后阳光和音乐更配。" };
    if (h < 18) return { hi: "下午好", msg: "工作学习辛苦了，休息一会。" };
    if (h < 21) return { hi: "晚上好", msg: "夜晚是音乐最好的舞台。" };
    return { hi: "夜深了", msg: "让旋律陪你度过安静的夜晚。" };
  }

  function setAmbient(color) {
    const c = color || "#4D6BFE";
    document.documentElement.style.setProperty("--ambient-light", c.replace(/[\d.]+\)$/, "0.15)") || `rgba(${hexToRgb(c)}, 0.15)`);
    try {
      const r = hexToRgb(c);
      document.documentElement.style.setProperty("--ambient-light", `rgba(${r.r},${r.g},${r.b}, 0.15)`);
    } catch(e) {}
  }
  function hexToRgb(h) {
    h = h.replace("#","");
    if (h.length === 3) h = h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }

  /* ---- 模态焦点陷阱 + Esc 关闭 + 焦点还原 ---- */
  let lastFocusedEl = null;
  function trapFocus(modal) {
    // 先移除上一次残留的监听器（避免 openModal 多次调用导致监听器累积泄漏）
    if (modal._focusTrapHandler) {
      modal.removeEventListener("keydown", modal._focusTrapHandler);
      modal._focusTrapHandler = null;
    }
    const focusable = modal.querySelectorAll(
      'button, input, a[href], [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first.focus();
    function handler(e) {
      if (e.key === "Escape") { closeModal(modal); return; }
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) { e.preventDefault(); last.focus(); }
      } else {
        if (document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    modal._focusTrapHandler = handler;
    modal.addEventListener("keydown", handler);
  }
  function closeModal(modal) {
    modal.hidden = true;
    // 统一移除焦点陷阱监听器（点按钮/遮罩/Esc 关闭都会走这里）
    if (modal._focusTrapHandler) {
      modal.removeEventListener("keydown", modal._focusTrapHandler);
      modal._focusTrapHandler = null;
    }
    if (lastFocusedEl) lastFocusedEl.focus();
  }
  function openModal(modal, focusSelector) {
    lastFocusedEl = document.activeElement;
    modal.hidden = false;
    const el = focusSelector ? modal.querySelector(focusSelector) : null;
    if (el) el.focus();
    trapFocus(modal);
  }

  /* ---- 自定义确认 / 输入弹窗（替代原生 prompt/confirm） ---- */
  function showConfirm(opts) {
    return new Promise((resolve) => {
      const m = $("#confirmMask");
      const title = $("#confirmTitle");
      const msg = $("#confirmMessage");
      const inputWrap = $("#confirmInputWrap");
      const input = $("#confirmInput");
      const okBtn = $("#confirmOk");
      const cancelBtn = $("#confirmCancel");
      title.textContent = opts.title || "确认操作";
      msg.textContent = opts.message || "";
      if (opts.placeholder) {
        inputWrap.hidden = false;
        input.value = opts.defaultValue || "";
        input.placeholder = opts.placeholder;
      } else {
        inputWrap.hidden = true;
      }
      okBtn.textContent = opts.okText || "确定";
      cancelBtn.textContent = opts.cancelText || "取消";
      function cleanup(result) {
        closeModal(m);
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        resolve(result);
      }
      function onOk() { cleanup(opts.placeholder ? input.value : true); }
      function onCancel() { cleanup(null); }
      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      openModal(m, opts.placeholder ? "#confirmInput" : "#confirmOk");
    });
  }

  /* ---- 曲目卡片 ---- */
  // 模块级收藏心形图标（songCard 初始渲染与委托实时更新共用，避免图标不一致）
  const heartSvg = (filled) => `<svg width="16" height="16" aria-hidden="true"><use href="#${filled?'ic-heart-fill':'ic-heart'}"></use></svg>`;
  function songCard(s, opts) {
    opts = opts || {};
    const isFav = S.isFavorite(s.id);
    const isPlaying = P.currentSong() && P.currentSong().id === s.id;
    const cls = ["card", isPlaying ? "now-playing" : ""].join(" ");
    return `<div class="${cls}" data-action="play" data-id="${escAttr(s.id)}" data-list="${opts.list || ""}" tabindex="0" role="button" aria-label="播放 ${escAttr(s.title)}">
      ${S.isLoggedIn() ? `<button class="fav-badge ${isFav?'on':''}" data-action="fav" data-id="${escAttr(s.id)}" aria-label="${isFav?'取消收藏':'收藏'} ${escAttr(s.title)}" aria-pressed="${isFav}" title="${isFav?'取消收藏':'收藏'}">${heartSvg(isFav)}</button>` : ''}
      <button class="card-menu" data-action="menu" data-id="${escAttr(s.id)}" aria-label="更多操作" title="添加到歌单"><svg width="16" height="16" aria-hidden="true"><use href="#ic-more"></use></svg></button>
      <div class="card-cover" style="background:linear-gradient(135deg, ${s.c.from}, ${s.c.to})">
        ${s.coverUrl ? `<img class="card-cover-img" src="${s.coverUrl}" alt="" loading="lazy" decoding="async" onerror="this.remove()" />` : ""}
        ${s.vip ? `<span class="tag" style="position:absolute;top:8px;left:8px;z-index:2;background:rgba(0,0,0,.65);color:#ffd54f;">VIP</span>` : ""}
        <span class="cv-emoji" aria-hidden="true">${s.emoji}</span>
        <button class="play-fab" data-action="play" data-id="${escAttr(s.id)}" aria-label="播放 ${escAttr(s.title)}"><svg width="16" height="16" aria-hidden="true"><use href="#ic-play"></use></svg></button>
      </div>
      <div class="card-title" title="${escAttr(s.title)}">${escAttr(s.title)}</div>
      <div class="card-artist"><span class="artist-link" data-action="goto-artist" data-name="${escAttr(s.artist)}" title="查看歌手">${escAttr(s.artist)}</span></div>
      <div class="card-tags">
        ${s.album ? `<span class="tag album-link" data-action="goto-album" data-name="${escAttr(s.album)}" title="查看专辑">💿 ${escAttr(s.album)}</span>` : ""}
        <span class="tag genre">${escAttr(s.genre)}</span>
        <span class="tag mood">${escAttr(s.mood)}</span>
      </div>
    </div>`;
  }

  function songCards(songs, opts) {
    return songs.map((s) => songCard(s, opts)).join("");
  }

  function sectionGrid(heading, songs, cls) {
    if (!songs || songs.length === 0) return "";
    return `<div class="section ${cls||''}">
      <div class="section-head"><span class="section-title">${heading}</span><span class="section-sub">${songs.length} 首</span></div>
      <div class="grid">${songCards(songs)}</div>
    </div>`;
  }

  /* ---- 路由 ---- */
  function navigate(route) {
    if (route !== "/nowplaying") prevRoute = route;
    currentRoute = route;
    if (route === "/search" || route === "/library") searchQuery = "";
    renderView();
    // 高亮导航（含 aria-current，辅助技术可识别当前页）
    $$(".nav-item", dom.nav).forEach((a) => {
      const active = a.dataset.route === route;
      a.classList.toggle("active", active);
      if (active) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    const titles = {
      "/home": "首页", "/library": "曲库", "/search": "搜索",
      "/favorites": "收藏夹", "/playlists": "播放列表", "/friends": "好友",
      "/history": "播放历史", "/online-users": "在线用户", "/profile": "我的", "/nowplaying": "正在播放"
    };
    dom.topbarTitle.textContent = titles[route] || "Wave";
    // 进入好友页时清除未读红点
    if (route === "/friends") { lastReadShareId = null; updateFriendsDot(0); }
  }

  function renderView() {
    dom.view.scrollTop = 0;
    if (currentRoute === "/home") renderHome();
    else if (currentRoute === "/library") renderLibrary();
    else if (currentRoute === "/search") renderSearch();
    else if (currentRoute === "/favorites") renderFavorites();
    else if (currentRoute === "/playlists") renderPlaylists();
    else if (currentRoute.startsWith("/playlist/")) renderPlaylistDetail(currentRoute.split("/playlist/")[1]);
    else if (currentRoute === "/friends") renderFriends();
    else if (currentRoute === "/profile") renderProfile();
    else if (currentRoute === "/history") renderHistory();
    else if (currentRoute === "/online-users") renderOnlineUsers();
    else if (currentRoute.startsWith("/artist/")) renderArtist(currentRoute.split("/artist/")[1]);
    else if (currentRoute.startsWith("/album/")) renderAlbum(currentRoute.split("/album/")[1]);
    else if (currentRoute === "/nowplaying") renderNowPlaying();
    else renderHome();
  }

  /* ---- 在线曲库加载（网易云 + Audius） ---- */
  let onlineTracksCache = null;
  async function loadOnlineTracks(force) {
    // 空缓存（如首次加载失败）不视为有效，下次仍会重试
    if (onlineTracksCache && !force && (onlineTracksCache.netease.length || onlineTracksCache.audius.length)) {
      return onlineTracksCache;
    }
    const result = { netease: [], audius: [] };
    await Promise.all([
      fetch("api/netease.php?action=hot&limit=18").then((r) => r.json()).then((d) => {
        if (d.ok && d.data) {
          result.netease = d.data;
          d.data.forEach((t) => cachePut(neteaseCache, t.id, t));
          currentNetease = d.data.map((t) => t.id);
        }
      }).catch(() => {}),
      fetch("api/audius.php?action=trending&limit=18").then((r) => r.json()).then((d) => {
        if (d.ok && d.data) {
          result.audius = d.data;
          d.data.forEach((t) => cachePut(audiusCache, t.id, t));
          currentAudius = d.data.map((t) => t.id);
        }
      }).catch(() => {}),
    ]);
    // 强制刷新失败时保留旧缓存，避免污染
    if (!result.netease.length && !result.audius.length && onlineTracksCache) {
      return onlineTracksCache;
    }
    onlineTracksCache = result;
    return result;
  }

  function onlineSection(heading, tracks, cardFn) {
    if (!tracks || tracks.length === 0) return "";
    return `<div class="section">
      <div class="section-head"><span class="section-title">${heading}</span><span class="section-sub">${tracks.length} 首</span></div>
      <div class="grid">${tracks.map(cardFn).join("")}</div>
    </div>`;
  }

  // 横向滚动卡片区块（打破竖条布局）
  function hscrollSection(heading, sub, tracks, cardFn) {
    if (!tracks || tracks.length === 0) return "";
    return `<section class="panel">
      <div class="panel-head">
        <span class="panel-title">${heading}</span>
        <span class="panel-sub">${sub} · 左右滑动 →</span>
      </div>
      <div class="hscroll">${tracks.map(cardFn).join("")}</div>
    </section>`;
  }

  // 网格区块（容器化）
  function gridSection(heading, sub, tracks, cardFn) {
    if (!tracks || tracks.length === 0) return "";
    return `<section class="panel">
      <div class="panel-head">
        <span class="panel-title">${heading}</span>
        <span class="panel-sub">${sub}</span>
      </div>
      <div class="grid">${tracks.map(cardFn).join("")}</div>
    </section>`;
  }

  /* ---- 首页 ---- */
  function renderHome() {
    const g = timeGreeting();
    const userName = S.currentUser() || "朋友";
    const favs = S.getFavorites();
    currentSongs = []; // 首页区块点击播放时回退全库队列

    // 情感化问候卡片
    let topGenres = [];
    if (S.isLoggedIn()) {
      const p = R.buildProfile();
      topGenres = Object.entries(p.genres)
        .sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
    }

    // Hero 焦点区（大块渐变，不再是窄横条）
    const hero = `<div class="home-hero">
      <div class="home-hero-inner">
        <div class="home-hero-kicker">WAVE · 在线音乐</div>
        <h1 class="home-hero-title">${g.hi}，${userName}</h1>
        <p class="home-hero-sub">${g.msg}${topGenres.length ? ' 你最近偏爱 <strong>' + topGenres.join('、') + '</strong>。' : ' 发现网易云中文热歌与 Audius 全球好音乐。'}</p>
        <div class="home-hero-tags">
          ${topGenres.map((gn) => `<span class="chip chip-hero">🎶 ${gn}</span>`).join("")}
          ${favs.length ? `<span class="chip chip-hero">❤ ${favs.length} 首收藏</span>` : ""}
          <span class="chip chip-hero">🎶 网易云中文</span>
          <span class="chip chip-hero">🌐 Audius 全球</span>
        </div>
        <div class="home-hero-actions">
          <button class="btn-primary hero-cta" data-action="goto-library">🎵 立即探索</button>
          <button class="btn-ghost hero-cta-ghost" data-action="goto-search">搜索歌曲</button>
          <a class="btn-ghost hero-cta-ghost" href="wave-music-v1.0.apk" download>📱 下载 App</a>
        </div>
      </div>
      <div class="home-hero-orb" aria-hidden="true"></div>
    </div>`;

    dom.view.innerHTML = hero + `<div id="homeSections"><div class="empty-state"><p>正在加载在线曲库...</p></div></div>`;

    loadOnlineTracks().then(({ netease, audius }) => {
      const container = document.getElementById("homeSections");
      if (!container) return;
      let html = "";
      // 本地个性化推荐（登录后基于历史 + 收藏）
      if (S.isLoggedIn()) {
        const rec = R.personalized(8);
        const guess = R.fromFavorites(6);
        if (rec.length) html += gridSection("✨ 为你推荐", rec.length + " 首", rec, songCard);
        if (guess.length) html += gridSection("🎯 猜你想听", guess.length + " 首", guess, songCard);
      }
      if (netease.length) html += hscrollSection("🎶 网易云热歌榜", netease.length + " 首", netease, neteaseCard);
      if (audius.length) html += gridSection("🌐 Audius 热门", audius.length + " 首", audius, audiusCard);
      container.innerHTML = html || `<div class="empty-state"><p>在线曲库暂时加载失败，请稍后刷新重试</p></div>`;
    });
  }

  /* ---- 在线曲库（音库页） ---- */
  function renderLibrary() {
    dom.view.innerHTML = `
      <div class="library-hero">
        <div class="library-hero-title">📚 在线曲库</div>
        <div class="library-hero-sub">网易云中文热歌 + Audius 全球热门，点开即播</div>
        <button class="btn-ghost library-refresh" id="libRefreshBtn" title="重新拉取在线曲库">🔄 刷新</button>
      </div>
      <div id="librarySections"><div class="empty-state"><p>正在加载在线曲库...</p></div></div>
    `;
    // 默认走缓存（切页回来不重复请求）；点刷新按钮才强制拉取
    loadOnlineTracks(false).then(({ netease, audius }) => {
      const container = document.getElementById("librarySections");
      if (!container) return;
      let html = "";
      if (netease.length) html += gridSection("🎶 网易云热歌榜", netease.length + " 首", netease, neteaseCard);
      if (audius.length) html += gridSection("🌐 Audius 热门", audius.length + " 首", audius, audiusCard);
      container.innerHTML = html || `<div class="empty-state"><p>在线曲库暂时加载失败，请稍后点上方「刷新」重试</p></div>`;
    });
  }

  function renderSearch() {
    // 结构只创建一次，后续只更新内容（避免输入法中断）
    if (!document.getElementById("searchToolbar")) {
      dom.view.innerHTML = `
        <div class="toolbar" id="searchToolbar">
          <div class="search-box" style="max-width:100%"><span aria-hidden="true">🔍</span><input type="text" id="mainSearch" placeholder="搜索歌曲、艺人、专辑（网易云 + Audius + QQ 音乐）..." value="${searchQuery.replace(/"/g,'&quot;')}" aria-label="搜索歌曲、艺人或专辑" /></div>
        </div>
        <div id="searchHint"></div>
        <div id="neteaseSection" style="${searchQuery ? '' : 'display:none'}">
          <div class="section"><div class="section-head"><span class="section-title">🎶 网易云中文曲库</span><span class="section-sub" id="neteaseCount"></span></div><div id="neteaseResults"><div class="empty-state"><p>输入关键词后自动搜索网易云...</p></div></div></div>
        </div>
        <div id="qqSection" style="${searchQuery ? '' : 'display:none'}">
          <div class="section"><div class="section-head"><span class="section-title">🎧 QQ 音乐曲库</span><span class="section-sub" id="qqCount"></span></div><div id="qqResults"><div class="empty-state"><p>输入关键词后自动搜索 QQ 音乐...</p></div></div></div>
        </div>
        <div id="audiusSection" style="${searchQuery ? '' : 'display:none'}">
          <div class="section"><div class="section-head"><span class="section-title">🌐 Audius 在线曲库</span><span class="section-sub" id="audiusCount"></span></div><div id="audiusResults"><div class="empty-state"><p>输入关键词后自动搜索 Audius...</p></div></div></div>
        </div>
      `;
      const hint = document.getElementById("searchHint");
      if (hint) {
        hint.innerHTML = searchQuery
          ? `<div class="empty-state"><p>搜索中...</p></div>`
          : `<div class="empty-state"><span class="ic">🔍</span><h3>输入关键词开始搜索</h3><p>同时搜索网易云、QQ 音乐和 Audius 全球曲库</p></div>`;
      }
      return;
    }

    // 后续：更新提示文案 + 区块显隐
    const hint = document.getElementById("searchHint");
    if (hint) {
      hint.innerHTML = searchQuery
        ? `<div class="empty-state"><p>搜索中...</p></div>`
        : `<div class="empty-state"><span class="ic">🔍</span><h3>输入关键词开始搜索</h3><p>同时搜索网易云、QQ 音乐和 Audius 全球曲库</p></div>`;
    }

    const neteaseSection = document.getElementById("neteaseSection");
    if (neteaseSection) neteaseSection.style.display = searchQuery ? "" : "none";
    const qqSection = document.getElementById("qqSection");
    if (qqSection) qqSection.style.display = searchQuery ? "" : "none";
    const audiusSection = document.getElementById("audiusSection");
    if (audiusSection) audiusSection.style.display = searchQuery ? "" : "none";

    if (searchQuery) {
      fetchNetease(searchQuery);
      fetchQQ(searchQuery);
      fetchAudius(searchQuery);
    }
  }

  // ---- Audius 在线音源 ----
  function audiusCard(track) {
    const cover = track.cover
      ? `<img src="${track.cover}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;" onerror="this.outerHTML='<span class=&quot;cv-emoji&quot; aria-hidden=&quot;true&quot;>🎵</span>'" />`
      : `<span class="cv-emoji" aria-hidden="true">🎵</span>`;
    return `<div class="card" data-action="audius-play" data-id="${track.id}" tabindex="0" role="button" aria-label="播放 ${track.title.replace(/"/g,'&quot;')}">
      <div class="card-cover" style="background:linear-gradient(135deg,#7c5cff,#ff5c9d);position:relative;">
        ${cover}
        <span class="tag" style="position:absolute;top:8px;left:8px;z-index:2;background:rgba(0,0,0,.6);color:#fff;">Audius</span>
        <button class="play-fab" data-action="audius-play" data-id="${track.id}" aria-label="播放 ${track.title.replace(/"/g,'&quot;')}"><svg width="16" height="16" aria-hidden="true"><use href="#ic-play"></use></svg></button>
      </div>
      <div class="card-title" title="${track.title.replace(/"/g,'&quot;')}">${track.title.replace(/"/g,'&quot;')}</div>
      <div class="card-artist">${track.artist.replace(/"/g,'&quot;')}</div>
      <div class="card-tags">
        ${track.genre ? `<span class="tag genre">${track.genre.replace(/"/g,'&quot;')}</span>` : ''}
        ${track.duration ? `<span class="tag">${fmt(track.duration)}</span>` : ''}
      </div>
    </div>`;
  }

  let audiusReqId = 0; // 请求序号，防止旧请求覆盖新结果
  async function fetchAudius(query) {
    const reqId = ++audiusReqId;
    try {
      const res = await fetch("api/audius.php?action=search&q=" + encodeURIComponent(query) + "&limit=24");
      const data = await res.json();
      if (reqId !== audiusReqId) return; // 已发起新请求，丢弃过期结果
      const resultsEl = document.getElementById("audiusResults");
      const countEl = document.getElementById("audiusCount");
      if (!resultsEl) return; // 页面已切换
      if (data.ok && data.data && data.data.length > 0) {
        currentAudius = data.data.map((t) => t.id);
        data.data.forEach((t) => cachePut(audiusCache, t.id, t));
        resultsEl.innerHTML = `<div class="grid">${data.data.map(audiusCard).join("")}</div>`;
        if (countEl) countEl.textContent = data.data.length + " 首在线歌曲";
      } else {
        currentAudius = [];
        resultsEl.innerHTML = `<div class="empty-state"><p>Audius 在线曲库无匹配结果（或服务不可用）</p></div>`;
        if (countEl) countEl.textContent = "";
      }
    } catch (e) {
      const resultsEl = document.getElementById("audiusResults");
      if (resultsEl) resultsEl.innerHTML = `<div class="empty-state"><p>在线搜索失败，请检查网络</p></div>`;
    }
  }

  /* ---- 网易云中文曲库 ---- */
  function neteaseCard(track) {
    const cover = track.cover
      ? `<img src="${track.cover}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;" onerror="this.outerHTML='<span class=&quot;cv-emoji&quot; aria-hidden=&quot;true&quot;>🎵</span>'" />`
      : `<span class="cv-emoji" aria-hidden="true">🎵</span>`;
    const vipTag = track.free === false
      ? `<span class="tag" style="position:absolute;top:8px;right:8px;z-index:2;background:rgba(0,0,0,.65);color:#ffd54f;">VIP</span>`
      : '';
    return `<div class="card" data-action="netease-play" data-id="${escAttr(track.id)}" tabindex="0" role="button" aria-label="播放 ${escAttr(track.title)}">
      <div class="card-cover" style="background:linear-gradient(135deg,#c33764,#1d2671);position:relative;">
        ${cover}
        <span class="tag" style="position:absolute;top:8px;left:8px;z-index:2;background:rgba(0,0,0,.6);color:#fff;">网易云</span>
        ${vipTag}
        <button class="play-fab" data-action="netease-play" data-id="${escAttr(track.id)}" aria-label="播放 ${escAttr(track.title)}"><svg width="16" height="16" aria-hidden="true"><use href="#ic-play"></use></svg></button>
      </div>
      <div class="card-title" title="${escAttr(track.title)}">${escAttr(track.title)}</div>
      <div class="card-artist">${escAttr(track.artist)}</div>
      <div class="card-tags">
        ${track.album ? `<span class="tag">${escAttr(track.album)}</span>` : ''}
        ${track.duration ? `<span class="tag">${fmt(track.duration)}</span>` : ''}
      </div>
    </div>`;
  }

  let neteaseReqId = 0; // 请求序号，防止旧请求覆盖新结果
  async function fetchNetease(query) {
    const reqId = ++neteaseReqId;
    try {
      const res = await fetch("api/netease.php?action=search&keywords=" + encodeURIComponent(query) + "&limit=24");
      const data = await res.json();
      if (reqId !== neteaseReqId) return; // 已发起新请求，丢弃过期结果
      const resultsEl = document.getElementById("neteaseResults");
      const countEl = document.getElementById("neteaseCount");
      if (!resultsEl) return; // 页面已切换
      if (data.ok && data.data && data.data.length > 0) {
        currentNetease = data.data.map((t) => t.id);
        data.data.forEach((t) => cachePut(neteaseCache, t.id, t));
        resultsEl.innerHTML = `<div class="grid">${data.data.map(neteaseCard).join("")}</div>`;
        if (countEl) countEl.textContent = data.data.length + " 首中文歌曲";
      } else {
        currentNetease = [];
        resultsEl.innerHTML = `<div class="empty-state"><p>网易云无匹配结果（或服务不可用）</p></div>`;
        if (countEl) countEl.textContent = "";
      }
    } catch (e) {
      const resultsEl = document.getElementById("neteaseResults");
      if (resultsEl) resultsEl.innerHTML = `<div class="empty-state"><p>网易云搜索失败，请检查网络</p></div>`;
    }
  }

  // 播放网易云歌曲：用户手机在国内，直接播放网易云公开接口
  // （该接口对免费歌曲直接 302 到 mp3 地址，无需服务器中转）
  function neteaseAudioUrl(id) {
    return "api/netease.php?action=url&id=" + id;
  }
  function playNetease(track) {
    if (track.free === false) {
      toast("该歌曲需要 VIP 或版权受限，无法免费播放", "error");
      return;
    }
    const full = D.registerExternal({ ...track, streamUrl: neteaseAudioUrl(track.id) });
    const queueIds = currentNetease.map((nid) => {
      const t = neteaseCache[nid];
      if (!t || t.free === false) return null;
      return D.registerExternal({ ...t, streamUrl: neteaseAudioUrl(t.id) }).id;
    }).filter(Boolean);
    P.playSong(full.id, queueIds.length ? queueIds : [full.id]);
    updatePlayerBar();
  }

  /* ---- QQ 音乐曲库 ---- */
  function qqCard(track) {
    const cover = track.cover
      ? `<img src="${track.cover}" alt="" loading="lazy" decoding="async" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;" onerror="this.outerHTML='<span class=&quot;cv-emoji&quot; aria-hidden=&quot;true&quot;>🎵</span>'" />`
      : `<span class="cv-emoji" aria-hidden="true">🎵</span>`;
    const vipTag = track.free === false
      ? `<span class="tag" style="position:absolute;top:8px;right:8px;z-index:2;background:rgba(0,0,0,.65);color:#ffd54f;">VIP</span>`
      : '';
    return `<div class="card" data-action="qq-play" data-id="${escAttr(track.id)}" tabindex="0" role="button" aria-label="播放 ${escAttr(track.title)}">
      <div class="card-cover" style="background:linear-gradient(135deg,#0ba360,#3cba92);position:relative;">
        ${cover}
        <span class="tag" style="position:absolute;top:8px;left:8px;z-index:2;background:rgba(0,0,0,.6);color:#fff;">QQ音乐</span>
        ${vipTag}
        <button class="play-fab" data-action="qq-play" data-id="${escAttr(track.id)}" aria-label="播放 ${escAttr(track.title)}"><svg width="16" height="16" aria-hidden="true"><use href="#ic-play"></use></svg></button>
      </div>
      <div class="card-title" title="${escAttr(track.title)}">${escAttr(track.title)}</div>
      <div class="card-artist">${escAttr(track.artist)}</div>
      <div class="card-tags">
        ${track.album ? `<span class="tag">${escAttr(track.album)}</span>` : ''}
        ${track.duration ? `<span class="tag">${fmt(track.duration)}</span>` : ''}
      </div>
    </div>`;
  }

  let qqReqId = 0; // 请求序号，防止旧请求覆盖新结果
  async function fetchQQ(query) {
    const reqId = ++qqReqId;
    try {
      const res = await fetch("api/qq.php?action=search&keywords=" + encodeURIComponent(query) + "&limit=24");
      const data = await res.json();
      if (reqId !== qqReqId) return; // 已发起新请求，丢弃过期结果
      const resultsEl = document.getElementById("qqResults");
      const countEl = document.getElementById("qqCount");
      if (!resultsEl) return; // 页面已切换
      if (data.ok && data.data && data.data.length > 0) {
        currentQQ = data.data.map((t) => t.id);
        data.data.forEach((t) => cachePut(qqCache, t.id, t));
        resultsEl.innerHTML = `<div class="grid">${data.data.map(qqCard).join("")}</div>`;
        if (countEl) countEl.textContent = data.data.length + " 首歌曲";
      } else {
        currentQQ = [];
        resultsEl.innerHTML = `<div class="empty-state"><p>QQ 音乐无匹配结果（或服务不可用）</p></div>`;
        if (countEl) countEl.textContent = "";
      }
    } catch (e) {
      const resultsEl = document.getElementById("qqResults");
      if (resultsEl) resultsEl.innerHTML = `<div class="empty-state"><p>QQ 音乐搜索失败，请检查网络</p></div>`;
    }
  }

  // 播放 QQ 音乐歌曲（streamUrl 已指向 qq.php 代理，自动 vkey 取流）
  function playQQ(track) {
    if (track.free === false) {
      toast("该歌曲需要 VIP 或版权受限，无法免费播放", "error");
      return;
    }
    const queueIds = currentQQ.map((qid) => {
      const t = qqCache[qid];
      if (!t || t.free === false) return null;
      return D.registerExternal(t).id;
    }).filter(Boolean);
    const full = D.registerExternal(track);
    P.playSong(full.id, queueIds.length ? queueIds : [full.id]);
    updatePlayerBar();
  }

  /* ---- 歌单导入（网易云 + QQ 音乐） ---- */
  function parsePlaylistUrl(url) {
    url = String(url || "").trim();
    if (!url) return null;
    let m;
    // 网易云：music.163.com/playlist?id=XXX 或 music.163.com/#/playlist?id=XXX 或 music.163.com/playlist/XXX/YYY/
    m = url.match(/music\.163\.com[^\s]*[?&#]id=(\d+)/i);
    if (m) return { source: "netease", id: m[1] };
    m = url.match(/music\.163\.com\/playlist\/(\d+)/i);
    if (m) return { source: "netease", id: m[1] };
    // QQ 音乐：y.qq.com/n/ryqq/playlist/XXX
    m = url.match(/y\.qq\.com[^\s]*playlist\/(\d+)/i);
    if (m) return { source: "qq", id: m[1] };
    // 纯数字 id：默认按网易云处理
    if (/^\d+$/.test(url)) return { source: "netease", id: url };
    return null;
  }

  async function importPlaylist(url) {
    const parsed = parsePlaylistUrl(url);
    if (!parsed) { toast("无法识别的歌单链接，请粘贴网易云或 QQ 音乐的歌单链接", "error"); return; }

    const isQQ = parsed.source === "qq";
    const endpoint = isQQ
      ? "api/qq.php?action=playlist&id=" + encodeURIComponent(parsed.id)
      : "api/netease.php?action=playlist&id=" + encodeURIComponent(parsed.id);

    toast("正在导入歌单...");
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!data.ok || !data.data || !data.data.length) {
        toast(data.error || "歌单导入失败（可能为私密歌单）", "error");
        return;
      }
      // 统一注册为外部歌曲（补上播放地址，否则导入后无法播放）
      const songIds = data.data.map((t) => {
        // 网易云歌曲需要手动拼 streamUrl（API 不返回该字段）
        if (t.source === "netease" && !t.streamUrl) {
          t.streamUrl = "api/netease.php?action=url&id=" + t.id;
        }
        const full = D.registerExternal(t);
        return full ? full.id : null;
      }).filter(Boolean);
      if (!songIds.length) { toast("歌单中没有可导入的歌曲", "error"); return; }

      const name = (data.name || (isQQ ? "QQ音乐歌单" : "网易云歌单")).trim() || "导入的歌单";
      S.importPlaylist(name, songIds);
      toast("已导入 " + songIds.length + " 首歌曲到「" + name + "」✅");
      renderPlaylists();
    } catch (e) {
      toast("导入失败，请检查网络或链接", "error");
    }
  }

  /* ---- 收藏夹 ---- */
  function renderFavorites() {
    if (!S.isLoggedIn()) { dom.view.innerHTML = `<div class="empty-state"><span class="ic">🔒</span><h3>请先登录</h3><p>登录后即可查看和管理收藏夹</p><button class="btn-primary" style="width:auto" id="goLogin">立即登录</button></div>`; return; }
    const ids = S.getFavorites();
    const songs = ids.map((id) => D.get(id)).filter(Boolean);
    currentSongs = ids;
    dom.view.innerHTML = `<div class="section"><div class="section-head"><span class="section-title">❤️ 我的收藏</span><span class="section-sub">${songs.length} 首</span></div>
    ${songs.length === 0 ? `<div class="empty-state"><span class="ic">💔</span><h3>还没有收藏</h3><p>在歌曲卡片上点击 ❤ 按钮即可收藏</p></div>` : `<div class="grid">${songCards(songs, {list:'fav'})}</div>`}</div>`;
  }

  /* ---- 播放列表 ---- */
  function renderPlaylists() {
    if (!S.isLoggedIn()) { dom.view.innerHTML = `<div class="empty-state"><span class="ic">🔒</span><h3>请先登录</h3><p>登录后即可管理播放列表</p></div>`; return; }
    const pls = S.getPlaylists();
    dom.view.innerHTML = `<div class="section"><div class="section-head"><span class="section-title">📝 我的歌单</span><span class="section-sub">${pls.length} 个</span></div>
    ${pls.length===0?`<div class="empty-state"><span class="ic">📭</span><h3>还没有歌单</h3><p>点击歌曲卡片的 ⋮ 按钮即可新建歌单</p></div>`:''}
    <div class="grid">${pls.map((pl) => `<div class="card" data-action="open-playlist" data-id="${pl.id}">
      <div class="card-cover" style="background:linear-gradient(135deg, var(--color-primary), #7cb8ff);display:grid;place-items:center"><span class="cv-emoji">📝</span></div>
      <div class="card-title">${pl.name.replace(/"/g,'&quot;')}</div>
      <div class="card-artist">${pl.songIds.length} 首歌曲</div>
    </div>`).join("")}</div>
    <div style="margin-top:var(--space-md);display:flex;gap:10px;flex-wrap:wrap"><button class="btn-primary" style="width:auto" id="btnNewPlaylist">+ 新建歌单</button><button class="btn-ghost" style="width:auto" id="btnImportPlaylist">⬇ 导入歌单</button></div></div>`;
  }

  function renderPlaylistDetail(plId) {
    if (!S.isLoggedIn()) return;
    const pl = S.getPlaylists().find((p) => p.id === plId);
    if (!pl) { dom.view.innerHTML = `<div class="empty-state"><h3>歌单不存在</h3></div>`; return; }
    const songs = pl.songIds.map((id) => D.get(id)).filter(Boolean);
    currentSongs = pl.songIds;
    dom.topbarTitle.textContent = pl.name;
    dom.view.innerHTML = `<div class="section"><div class="section-head">
      <span class="section-title">📝 ${pl.name.replace(/"/g,'&quot;')}</span><span class="section-sub">${songs.length} 首</span>
      <button class="btn-ghost" id="btnDelPlaylist" data-id="${pl.id}" style="color:var(--color-danger)">删除歌单</button>
    </div>
    ${songs.length===0?`<div class="empty-state"><span class="ic">📭</span><h3>歌单是空的</h3><p>点击歌曲卡片的 ⋮ 按钮添加歌曲</p></div>`:
    `<div class="list-view"><div class="grid">${songCards(songs,{list:pl.id})}</div></div>`}</div>`;
  }

  /* ---- 个人页 ---- */
  /* ---- 个人资料 ---- */
  const AVATAR_PRESETS = (function () {
    const pairs = [
      ["#6366f1", "#a855f7", "🎧"], ["#ec4899", "#f43f5e", "🌟"],
      ["#10b981", "#14b8a6", "🎵"], ["#f59e0b", "#ef4444", "🔥"],
      ["#0ea5e9", "#6366f1", "🎤"], ["#8b5cf6", "#d946ef", "💜"],
      ["#22c55e", "#0ea5e9", "🍀"], ["#f97316", "#eab308", "☀️"],
    ];
    return pairs.map(([a, b, emoji]) => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + a + '"/><stop offset="1" stop-color="' + b + '"/>' +
        '</linearGradient></defs>' +
        '<rect width="120" height="120" fill="url(#g)"/>' +
        '<text x="60" y="74" font-size="52" text-anchor="middle">' + emoji + '</text></svg>';
      return "data:image/svg+xml," + encodeURIComponent(svg);
    });
  })();

  function avatarHtml(profile) {
    const p = profile || {};
    const name = (p.nickname || p.username || "乐").trim();
    if (p.avatar) {
      return `<img class="avatar-img" src="${escAttr(p.avatar)}" alt="${escAttr(name)}" onerror="this.outerHTML='<span class=&quot;avatar-fallback&quot;>${escAttr(name[0] || "乐").toUpperCase()}</span>'" />`;
    }
    return `<span class="avatar-fallback">${escAttr((name[0] || "乐").toUpperCase())}</span>`;
  }
  function renderInterestChips(selected) {
    const el = document.getElementById("interestChips");
    if (!el) return;
    const sel = selected || [];
    el.innerHTML = (D.GENRES || []).map((g) =>
      `<button type="button" class="chip${sel.indexOf(g) >= 0 ? " active" : ""}" data-genre="${escAttr(g)}">${escAttr(g)}</button>`
    ).join("");
  }
  function openProfileEditor(profile) {
    const mask = document.getElementById("profileMask");
    if (!mask) return;
    const p = profile || {};
    // 渲染预设头像
    const picker = document.getElementById("avatarPicker");
    if (picker) {
      picker.innerHTML = AVATAR_PRESETS.map((av, i) =>
        `<button type="button" class="avatar-option${p.avatar === av ? " active" : ""}" data-avatar="${escAttr(av)}" aria-label="预设头像 ${i + 1}"><img src="${av}" alt="" /></button>`
      ).join("");
    }
    document.getElementById("pfAvatar").value = (p.avatar && p.avatar.indexOf("data:image") !== 0) ? p.avatar : "";
    document.getElementById("pfNickname").value = p.nickname || "";
    document.getElementById("pfAge").value = p.age || "";
    document.getElementById("pfRegion").value = p.region || "";
    document.getElementById("pfHobby").value = p.hobby || "";
    document.getElementById("pfSignature").value = p.signature || "";
    // 性别高亮
    const gender = p.gender || "secret";
    document.querySelectorAll("#genderPicker button").forEach((b) => {
      b.classList.toggle("active", b.dataset.gender === gender);
    });
    // 隐私档位高亮
    const privacy = p.privacy || 0;
    document.querySelectorAll("#privacyPicker button").forEach((b) => {
      b.classList.toggle("active", Number(b.dataset.privacy) === Number(privacy));
    });
    // 兴趣 chips
    renderInterestChips(p.interests ? String(p.interests).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : []);
    openModal(mask, "#pfNickname");
  }

  /* ============================================================
   * 好友 / 分享
   * ============================================================ */
  let friendsCache = [];      // 好友列表缓存
  let sharesCache = [];       // 收到的分享缓存
  let lastReadShareId = null; // 已读的最大分享 id

  function friendAvatar(u, size) {
    const name = (u && (u.nickname || u.username)) || "乐";
    if (u && u.avatar) {
      return `<img class="fr-av-img" src="${escAttr(u.avatar)}" alt="" style="${size ? "width:" + size + "px;height:" + size + "px" : ""}" onerror="this.outerHTML='<span class=&quot;fr-av&quot;>${escAttr((name[0] || "乐").toUpperCase())}</span>'" />`;
    }
    return `<span class="fr-av"${size ? ' style="width:' + size + 'px;height:' + size + 'px;line-height:' + size + 'px"' : ""}>${escAttr((name[0] || "乐").toUpperCase())}</span>`;
  }

  function onlineBadge(u) {
    return u.online
      ? `<span class="fr-online"><span class="dot on"></span>在线</span>`
      : `<span class="fr-online"><span class="dot"></span>离线</span>`;
  }

  function renderFriends() {
    if (!S.isLoggedIn()) {
      dom.view.innerHTML = `<div class="empty-state"><span class="ic">👥</span><h3>好友功能需要登录</h3><p>登录后可以添加好友、分享歌曲</p><button class="btn-primary" style="width:auto" id="goLogin">立即登录</button></div>`;
      return; // goLogin 点击由全局委托处理
    }
    dom.view.innerHTML = `
      <div class="friends-search-card">
        <div class="friends-search-title">🔍 添加好友</div>
        <div class="friends-search-row">
          <input type="text" id="friendSearchInput" placeholder="输入用户名或 UID 搜索 / 直接输入 UID 添加" maxlength="40" />
          <button class="btn-primary" id="friendSearchBtn" style="width:auto;white-space:nowrap">搜索</button>
          <button class="btn-ghost" id="friendAddUidBtn" style="width:auto;white-space:nowrap">直接添加</button>
        </div>
        <div class="friends-search-result" id="friendSearchResult"></div>
      </div>
      <div id="friendsMain"><div class="friends-loading">加载中…</div></div>`;

    const input = document.getElementById("friendSearchInput");
    const doSearch = () => doFriendSearch(input.value);
    document.getElementById("friendSearchBtn").addEventListener("click", doSearch);
    document.getElementById("friendAddUidBtn").addEventListener("click", () => addFriendByUid(input.value));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

    refreshFriends(true);
  }

  async function doFriendSearch(q) {
    q = String(q || "").trim();
    const box = document.getElementById("friendSearchResult");
    if (!q) { if (box) box.innerHTML = ""; return; }
    if (box) box.innerHTML = `<div class="fr-searching">搜索中…</div>`;
    try {
      const res = await S.searchUsers(q);
      if (!res.ok || !res.data) {
        if (box) box.innerHTML = `<div class="fr-search-empty">${escAttr(res.error || "搜索失败")}</div>`;
        return;
      }
      if (!res.data.length) {
        if (box) box.innerHTML = `<div class="fr-search-empty">没有找到「${escAttr(q)}」相关的用户</div>`;
        return;
      }
      if (box) box.innerHTML = res.data.map((u) => `
        <div class="fr-user-row">
          ${friendAvatar(u, 38)}
          <div class="fr-user-main">
            <div class="fr-user-name">${escAttr(u.nickname || u.username)}<span class="fr-user-at">@${escAttr(u.username)}</span></div>
            <div class="fr-user-sub">${u.uid ? "UID " + escAttr(u.uid) + " · " : ""}${u.online ? "🟢 在线" : "⚪ 离线"}</div>
          </div>
          ${u.isFriend
            ? `<span class="fr-added-tag">✓ 已是好友</span>`
            : `<button class="fr-add-btn" data-action="friend-add" data-id="${u.id}">+ 添加</button>`}
        </div>`).join("");
    } catch (e) {
      if (box) box.innerHTML = `<div class="fr-search-empty">搜索失败，请检查网络</div>`;
    }
  }

  async function addFriendByUid(v) {
    v = String(v || "").trim();
    if (!v) { toast("请输入 UID", "error"); return; }
    toast("添加中…");
    const res = await S.addFriend(v, false);
    if (res.ok) {
      toast("好友添加成功 🎉");
      const input = document.getElementById("friendSearchInput");
      if (input) input.value = "";
      const box = document.getElementById("friendSearchResult");
      if (box) box.innerHTML = "";
      refreshFriends();
    } else {
      toast(res.error || "添加失败", "error");
    }
  }

  async function refreshFriends(showLoading) {
    const main = document.getElementById("friendsMain");
    if (!main) return;
    if (showLoading) main.innerHTML = `<div class="friends-loading">加载中…</div>`;
    try {
      const [fr, sh] = await Promise.all([S.listFriends(), S.listShares()]);
      friendsCache = (fr.ok && fr.data) ? fr.data : [];
      sharesCache = (sh.ok && sh.data) ? sh.data : [];
    } catch (e) {
      friendsCache = []; sharesCache = [];
    }
    if (!document.getElementById("friendsMain")) return; // 页面已切走
    renderFriendsMain();
    // 更新已读
    if (sharesCache.length && currentRoute === "/friends") {
      lastReadShareId = sharesCache[0].id;
      localStorage.setItem("mp_last_share_seen", String(sharesCache[0].id));
      updateFriendsDot(0);
    }
  }

  function renderFriendsMain() {
    const main = document.getElementById("friendsMain");
    if (!main) return;
    const friendsHtml = friendsCache.length ? friendsCache.map((u) => `
      <div class="fr-user-row">
        ${friendAvatar(u, 42)}
        <div class="fr-user-main">
          <div class="fr-user-name">${escAttr(u.nickname || u.username)}<span class="fr-user-at">@${escAttr(u.username)}</span></div>
          <div class="fr-user-sub">${u.uid ? "UID " + escAttr(u.uid) + " · " : ""}${onlineBadge(u)}</div>
        </div>
        <button class="fr-share-btn" data-action="friend-share" data-id="${u.id}" data-name="${escAttr(u.nickname || u.username)}" title="分享歌曲">🎁 分享</button>
        <button class="fr-del-btn" data-action="friend-remove" data-id="${u.id}" data-name="${escAttr(u.nickname || u.username)}" title="删除好友">✕</button>
      </div>`).join("")
      : `<div class="fr-empty">还没有好友，用上方搜索添加吧</div>`;

    const sharesHtml = sharesCache.length ? sharesCache.map((s) => `
      <div class="share-row">
        <div class="share-cover" data-action="share-play" data-sid="${escAttr(String(s.id))}" title="点击播放">
          ${s.song.coverUrl ? `<img src="${escAttr(s.song.coverUrl)}" alt="" onerror="this.remove()" />` : `<span>${escAttr((s.song.title || "♪")[0])}</span>`}
          <span class="share-play-ic">▶</span>
        </div>
        <div class="share-main">
          <div class="share-title">${escAttr(s.song.title || "未知歌曲")}</div>
          <div class="share-sub">${escAttr(s.song.artist || "")} · 来自 <strong>${escAttr(s.from.nickname || s.from.username)}</strong></div>
          ${s.message ? `<div class="share-msg">「${escAttr(s.message)}」</div>` : ""}
          <div class="share-time">${escAttr(fmtShareTime(s.time))}</div>
        </div>
        <button class="fr-share-btn" data-action="share-play" data-sid="${escAttr(String(s.id))}">▶ 播放</button>
      </div>`).join("")
      : `<div class="fr-empty">还没有收到分享，让好友给你分享一首歌吧 🎵</div>`;

    main.innerHTML = `
      <div class="section">
        <div class="section-head"><span class="section-title">👥 我的好友</span><span class="section-sub">${friendsCache.length} 位 · 绿点为在线</span></div>
        ${friendsHtml}
      </div>
      <div class="section">
        <div class="section-head"><span class="section-title">🎁 收到的分享</span><span class="section-sub">${sharesCache.length} 条</span></div>
        ${sharesHtml}
      </div>`;
  }

  function fmtShareTime(t) {
    if (!t) return "";
    const d = new Date(String(t).replace(" ", "T"));
    if (isNaN(d.getTime())) return t;
    const diff = (Date.now() - d.getTime()) / 1000;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return Math.floor(diff / 60) + " 分钟前";
    if (diff < 86400) return Math.floor(diff / 3600) + " 小时前";
    if (diff < 86400 * 7) return Math.floor(diff / 86400) + " 天前";
    return (d.getMonth() + 1) + "月" + d.getDate() + "日";
  }

  // 播放收到的分享歌曲
  function playSharedSong(sid) {
    const item = sharesCache.find((x) => String(x.id) === String(sid));
    if (!item) return;
    const song = item.song || {};
    let target = D.get(song.id);
    if (!target && song.id && /^(ne_|qq_|au_)/.test(song.id)) {
      const rawId = song.id.replace(/^(ne_|qq_|au_)/, "");
      const source = song.id.indexOf("ne_") === 0 ? "netease" : (song.id.indexOf("qq_") === 0 ? "qq" : "audius");
      target = D.registerExternal({
        id: rawId, source: source,
        title: song.title, artist: song.artist,
        cover: song.coverUrl || undefined,
        duration: song.dur || 0,
        albummid: song.albummid || undefined,
        streamUrl: song.streamUrl || undefined,
      });
    }
    if (!target) { toast("这首歌暂时无法播放", "error"); return; }
    P.playSong(target.id, [target.id]);
    updatePlayerBar();
    toast("正在播放 " + target.title + " 🎵");
  }

  // ---- 分享弹窗 ----
  let shareSongTarget = null;
  function sharePayload(s) {
    return {
      id: s.id, title: s.title, artist: s.artist, album: s.album || "",
      coverUrl: s.coverUrl || "", audio: s.audio || "", streamUrl: s.streamUrl || "",
      dur: s.dur || 0, c: s.c || null, albummid: s.albummid || "",
    };
  }

  function openShareModal(song) {
    if (!S.isLoggedIn()) { showAuth(); return; }
    if (!friendsCache.length) {
      // 尝试拉一次好友
      S.listFriends().then((r) => {
        friendsCache = (r.ok && r.data) ? r.data : [];
        if (friendsCache.length) openShareModal(song);
        else toast("你还没有好友，先去好友页添加吧", "error");
      });
      return;
    }
    shareSongTarget = song;
    const card = document.getElementById("shareSongCard");
    if (card) {
      card.innerHTML = `
        ${song.coverUrl ? `<img class="share-sc-cover" src="${escAttr(song.coverUrl)}" alt="" onerror="this.remove()" />` : `<span class="share-sc-emoji">🎵</span>`}
        <div class="share-sc-meta">
          <div class="share-sc-title">${escAttr(song.title)}</div>
          <div class="share-sc-artist">${escAttr(song.artist)}</div>
        </div>`;
    }
    const list = document.getElementById("shareFriendList");
    if (list) {
      list.innerHTML = friendsCache.map((u) => `
        <div class="fr-user-row share-pick" data-action="share-send" data-id="${u.id}" data-name="${escAttr(u.nickname || u.username)}" role="button" tabindex="0">
          ${friendAvatar(u, 36)}
          <div class="fr-user-main">
            <div class="fr-user-name">${escAttr(u.nickname || u.username)}</div>
            <div class="fr-user-sub">${onlineBadge(u)}</div>
          </div>
          <span class="fr-send-tag">发送 ➤</span>
        </div>`).join("");
    }
    const msgInput = document.getElementById("shareMsg");
    if (msgInput) msgInput.value = "";
    openModal(document.getElementById("shareMask"), "#shareMsg");
  }

  async function sendShareTo(friendId, friendName) {
    if (!shareSongTarget) return;
    const msgInput = document.getElementById("shareMsg");
    const message = msgInput ? msgInput.value.trim() : "";
    toast("发送中…");
    const res = await S.shareSong(friendId, sharePayload(shareSongTarget), message);
    if (res.ok) {
      toast("已分享给 " + (friendName || "好友") + " 🎁");
      closeModal(document.getElementById("shareMask"));
    } else {
      toast(res.error || "分享失败", "error");
    }
  }

  // ---- 未读红点 ----
  function updateFriendsDot(count) {
    const dot = document.getElementById("friendsDot");
    if (!dot) return;
    dot.hidden = !(count > 0);
    dot.textContent = count > 99 ? "99+" : String(count);
  }

  async function checkNewShares() {
    if (!S.isLoggedIn()) return;
    try {
      const sh = await S.listShares();
      if (!sh.ok || !sh.data || !sh.data.length) return;
      const seen = parseInt(localStorage.getItem("mp_last_share_seen") || "0", 10);
      const newest = sh.data[0].id;
      const unread = sh.data.filter((x) => x.id > seen).length;
      updateFriendsDot(unread);
      if (unread > 0 && currentRoute !== "/friends") {
        toast("收到 " + unread + " 首好友分享的歌曲 🎁");
      }
      // 静默更新缓存（好友页打开时）
      sharesCache = sh.data;
      if (currentRoute === "/friends" && document.getElementById("friendsMain")) {
        renderFriendsMain();
        localStorage.setItem("mp_last_share_seen", String(newest));
        updateFriendsDot(0);
      }
    } catch (e) { /* 忽略 */ }
  }

  // 社交定时器（心跳 + 未读检查）：login 启动 / logout 停止，避免叠加与泄漏
  let hbTimer = null, shareCheckTimer = null, shareCheckDelay = null;
  function startSocialTimers() {
    stopSocialTimers();
    if (!S.isLoggedIn()) return;
    S.heartbeat();
    hbTimer = setInterval(function () {
      if (!S.isLoggedIn()) return;
      S.heartbeat();
      if (currentRoute === "/friends") refreshFriends();
    }, 120000);
    shareCheckDelay = setTimeout(checkNewShares, 3000);
    shareCheckTimer = setInterval(checkNewShares, 60000);
  }
  function stopSocialTimers() {
    if (hbTimer) { clearInterval(hbTimer); hbTimer = null; }
    if (shareCheckTimer) { clearInterval(shareCheckTimer); shareCheckTimer = null; }
    if (shareCheckDelay) { clearTimeout(shareCheckDelay); shareCheckDelay = null; }
  }

  function renderProfile() {
    if (!S.isLoggedIn()) {
      dom.view.innerHTML = `<div class="empty-state"><span class="ic">🔒</span><h3>请先登录</h3><p>登录后可查看个人资料</p><button class="btn-primary" style="width:auto" id="goLogin">立即登录</button></div>`; return;
    }
    const u = S.currentUser();
    const data = S.getUserData();
    const rec = R.buildProfile();
    const topGenres = Object.entries(rec.genres).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const genderMap = { male: "男", female: "女", secret: "保密" };

    // 先渲染骨架，再异步填充资料
    dom.view.innerHTML = `<div class="profile-loading">加载中...</div>`;
    S.getProfile(true).then((p) => {
      p = p || {};
      const name = p.nickname || u;
      const gender = p.gender ? (genderMap[p.gender] || "保密") : "";
      const age = p.age ? p.age + " 岁" : "";
      const region = p.region || "";
      const metaBits = [gender, age, region].filter(Boolean).join(" · ");
      const hobbies = p.hobby ? String(p.hobby).split(/[,，、\s]+/).filter(Boolean) : [];
      const interests = p.interests ? String(p.interests).split(/[,，]/).map((s) => s.trim()).filter(Boolean) : [];
      const privacyMap = { 0: "公开", 1: "仅好友可见", 2: "私密" };
      const privacyText = privacyMap[p.privacy] || "";
      const signature = p.signature || "这个人很懒，还没写签名。";

      dom.view.innerHTML = `
      <div class="profile-hero">
        <div class="profile-avatar">${avatarHtml(p)}</div>
        <div class="profile-meta">
          <div class="profile-name-row">
            <span class="profile-name">${escAttr(name)}</span>
            ${p.uid ? `<span class="profile-uid">UID ${escAttr(p.uid)}</span>` : ""}
            ${privacyText ? `<span class="profile-privacy">${escAttr(privacyText)}</span>` : ""}
          </div>
          ${metaBits ? `<div class="profile-meta-line">${escAttr(metaBits)}</div>` : ""}
          <div class="profile-signature">${escAttr(signature)}</div>
          ${hobbies.length ? `<div class="greeting-tags">${hobbies.map((h) => `<span class="greeting-tag">${escAttr(h)}</span>`).join("")}</div>` : ""}
          ${interests.length ? `<div class="greeting-tags">${interests.map((g) => `<span class="greeting-tag">🎵 ${escAttr(g)}</span>`).join("")}</div>` : ""}
        </div>
      </div>
      <div class="profile-stats">
        <div class="stat-card"><div class="s-val">${data.history.length}</div><div class="s-label">累计播放</div></div>
        <div class="stat-card"><div class="s-val">${data.favorites.length}</div><div class="s-label">收藏歌曲</div></div>
        <div class="stat-card"><div class="s-val">${data.playlists.length}</div><div class="s-label">歌单</div></div>
        <div class="stat-card"><div class="s-val">${Object.keys(rec.genres).length}</div><div class="s-label">偏好流派</div></div>
      </div>
      ${topGenres.length ? `<div class="section"><div class="section-head"><span class="section-title">🎧 你的音乐偏好</span></div><div class="greeting-tags">${topGenres.map((e) => `<span class="greeting-tag">${e[0]} · ${Math.round(e[1])}次</span>`).join("")}</div></div>` : ""}
      <div style="display:flex;gap:var(--space-md);margin-top:var(--space-lg);flex-wrap:wrap">
        <button class="btn-primary" style="width:auto" id="btnEditProfile">✏️ 编辑资料</button>
        <button class="btn-ghost" style="width:auto" id="btnReset">重置演示数据</button>
        <button class="btn-ghost" style="color:var(--color-danger)" id="btnLogout">退出登录</button>
      </div>`;

      const editBtn = document.getElementById("btnEditProfile");
      if (editBtn) editBtn.addEventListener("click", () => openProfileEditor(p));
      // btnReset / btnLogout / goLogin 由全局 document 委托统一处理（带确认框），此处不再直接绑定
    });
  }

  /* ---- 个人资料编辑弹窗 ---- */
  function bindProfileEditor() {
    const mask = document.getElementById("profileMask");
    if (!mask) return;

    const picker = document.getElementById("avatarPicker");
    if (picker) {
      picker.addEventListener("click", function (e) {
        const opt = e.target.closest(".avatar-option");
        if (!opt) return;
        picker.querySelectorAll(".avatar-option").forEach((b) => b.classList.remove("active"));
        opt.classList.add("active");
        const urlInput = document.getElementById("pfAvatar");
        if (urlInput) urlInput.value = "";
      });
    }
    // 头像本地上传
    const avatarFile = document.getElementById("pfAvatarFile");
    if (avatarFile) {
      avatarFile.addEventListener("change", async function () {
        const file = avatarFile.files && avatarFile.files[0];
        if (!file) return;
        toast("正在上传头像...");
        const r = await S.uploadAvatar(file);
        if (r.ok && r.url) {
          // 清空预设高亮，填入上传后的 URL
          picker.querySelectorAll(".avatar-option").forEach((b) => b.classList.remove("active"));
          const urlInput = document.getElementById("pfAvatar");
          if (urlInput) urlInput.value = r.url;
          toast("头像已上传 ✅");
        } else {
          toast(r.error || "上传失败", "error");
        }
        avatarFile.value = "";
      });
    }
    document.querySelectorAll("#genderPicker button").forEach((b) => {
      b.addEventListener("click", function () {
        document.querySelectorAll("#genderPicker button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      });
    });
    // 隐私档位选择
    document.querySelectorAll("#privacyPicker button").forEach((b) => {
      b.addEventListener("click", function () {
        document.querySelectorAll("#privacyPicker button").forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
      });
    });
    // 兴趣 chips（事件委托，动态渲染后仍生效）
    const chipsBox = document.getElementById("interestChips");
    if (chipsBox) {
      chipsBox.addEventListener("click", function (e) {
        const btn = e.target.closest(".chip");
        if (!btn) return;
        const active = chipsBox.querySelectorAll(".chip.active");
        if (!btn.classList.contains("active") && active.length >= 8) { toast("最多选择 8 个兴趣"); return; }
        btn.classList.toggle("active");
      });
    }

    const saveBtn = document.getElementById("pfSave");
    if (saveBtn) {
      saveBtn.addEventListener("click", async function () {
        const urlInput = document.getElementById("pfAvatar");
        let avatar = urlInput && urlInput.value.trim() ? urlInput.value.trim() : "";
        if (!avatar && picker) {
          const activeOpt = picker.querySelector(".avatar-option.active");
          if (activeOpt) avatar = activeOpt.dataset.avatar || "";
        }
        const genderBtn = document.querySelector("#genderPicker button.active");
        const privacyBtn = document.querySelector("#privacyPicker button.active");
        const selInterests = Array.from(document.querySelectorAll("#interestChips .chip.active")).map((c) => c.dataset.genre);
        const fields = {
          avatar,
          nickname: document.getElementById("pfNickname").value.trim(),
          gender: genderBtn ? genderBtn.dataset.gender : "secret",
          age: parseInt(document.getElementById("pfAge").value, 10) || null,
          region: document.getElementById("pfRegion").value.trim(),
          hobby: document.getElementById("pfHobby").value.trim(),
          signature: document.getElementById("pfSignature").value.trim(),
          privacy: privacyBtn ? Number(privacyBtn.dataset.privacy) : 0,
          interests: selInterests.join(","),
        };
        const r = await S.updateProfile(fields);
        if (r.ok) {
          toast("资料已保存 ✅");
          closeModal(mask);
          updateSidebar();
          updateTopbar();
          renderProfile();
        } else {
          toast(r.error || "保存失败", "error");
        }
      });
    }

    const cancelBtn = document.getElementById("pfCancel");
    if (cancelBtn) cancelBtn.addEventListener("click", function () { closeModal(mask); });
    mask.addEventListener("click", function (e) { if (e.target === mask) closeModal(mask); });
  }

  /* ---- 歌词解析与获取 ---- */
  let currentLyrics = [];   // [{time, text}]
  let lyricIndex = -1;      // 当前高亮歌词行索引
  function parseLrc(lrcText) {
    if (!lrcText) return [];
    const lines = [];
    const timeRe = /\[(\d{2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
    lrcText.split('\n').forEach(function (line) {
      const times = [];
      let m;
      timeRe.lastIndex = 0;
      while ((m = timeRe.exec(line)) !== null) {
        const min = parseInt(m[1], 10), sec = parseInt(m[2], 10);
        const ms = m[3] ? parseInt(String(m[3]).padEnd(3, '0'), 10) : 0;
        times.push(min * 60 + sec + ms / 1000);
      }
      const text = line.replace(timeRe, '').trim();
      times.forEach(function (t) { lines.push({ time: t, text: text }); });
    });
    return lines.sort(function (a, b) { return a.time - b.time; });
  }
  async function fetchLyrics(song) {
    if (song && song.id) {
      if (song.id.indexOf('ne_') === 0) {
        const rawId = song.id.slice(3);
        try {
          const res = await fetch('api/netease.php?action=lyric&id=' + encodeURIComponent(rawId));
          const data = await res.json();
          if (data.ok && data.lyric) {
            const orig = parseLrc(data.lyric);
            const trans = parseLrc(data.tlyric || "");
            const tmap = {};
            trans.forEach((t) => { tmap[Math.round(t.time * 10)] = t.text; });
            return orig.map((l) => ({ time: l.time, text: l.text, translation: tmap[Math.round(l.time * 10)] || "" }));
          }
        } catch (e) { /* 忽略 */ }
      } else if (song.id.indexOf('qq_') === 0) {
        const rawId = song.id.slice(3);
        try {
          const res = await fetch('api/qq.php?action=lyric&id=' + encodeURIComponent(rawId));
          const data = await res.json();
          if (data.ok && data.lyric) {
            const orig = parseLrc(data.lyric);
            const trans = parseLrc(data.tlyric || "");
            const tmap = {};
            trans.forEach((t) => { tmap[Math.round(t.time * 10)] = t.text; });
            return orig.map((l) => ({ time: l.time, text: l.text, translation: tmap[Math.round(l.time * 10)] || "" }));
          }
        } catch (e) { /* 忽略 */ }
      }
    }
    return [];
  }

  /* ---- 正在播放（黑胶唱片 + 歌词） ---- */
  /* ---- 歌手页 ---- */
  function renderArtist(name) {
    const info = D.getArtist(decodeURIComponent(name || ""));
    if (!info) { dom.view.innerHTML = `<div class="empty-state"><span class="ic">🎤</span><h3>歌手不存在</h3></div>`; return; }
    const genres = Object.keys(info.genres);
    currentSongs = info.songs.map((s) => s.id);
    dom.view.innerHTML = `<div class="artist-hero">
      <div class="artist-avatar">${escAttr((info.name || "?").charAt(0).toUpperCase())}</div>
      <div class="artist-meta">
        <div class="artist-name">${escAttr(info.name)}</div>
        <div class="artist-sub">${info.count} 首歌曲 · ${info.totalPlays} 次播放</div>
        ${genres.length ? `<div class="greeting-tags">${genres.map((g) => `<span class="greeting-tag">${escAttr(g)}</span>`).join("")}</div>` : ""}
      </div>
    </div>
    <div class="section"><div class="section-head"><span class="section-title">全部歌曲</span><span class="section-sub">${info.count} 首</span></div>
    <div class="grid">${songCards(info.songs, { list: "artist" })}</div></div>`;
  }

  /* ---- 专辑页 ---- */
  function renderAlbum(name) {
    const info = D.getAlbum(decodeURIComponent(name || ""));
    if (!info) { dom.view.innerHTML = `<div class="empty-state"><span class="ic">💿</span><h3>专辑不存在</h3></div>`; return; }
    const genres = Object.keys(info.genres);
    currentSongs = info.songs.map((s) => s.id);
    dom.view.innerHTML = `<div class="album-hero">
      <div class="album-cover" style="background:linear-gradient(135deg, ${info.songs[0].c.from}, ${info.songs[0].c.to})">${escAttr((info.name || "?").charAt(0).toUpperCase())}</div>
      <div class="artist-meta">
        <div class="artist-name">${escAttr(info.name)}</div>
        <div class="artist-sub">${escAttr(info.artist)} · ${info.count} 首歌曲</div>
        ${genres.length ? `<div class="greeting-tags">${genres.map((g) => `<span class="greeting-tag">${escAttr(g)}</span>`).join("")}</div>` : ""}
      </div>
    </div>
    <div class="section"><div class="section-head"><span class="section-title">曲目</span><span class="section-sub">${info.count} 首</span></div>
    <div class="grid">${songCards(info.songs, { list: "album" })}</div></div>`;
  }

  /* ---- 播放历史统计页 ---- */
  function renderHistory() {
    if (!S.isLoggedIn()) { dom.view.innerHTML = `<div class="empty-state"><span class="ic">🔒</span><h3>请先登录</h3><p>登录后查看播放历史</p><button class="btn-primary" style="width:auto" id="goLogin">立即登录</button></div>`; return; }
    const data = S.getUserData();
    const history = (data.history || []).slice().sort((a, b) => (b.last || 0) - (a.last || 0));
    // 按日期分组
    const groups = {};
    const now = new Date();
    history.forEach((h) => {
      const d = new Date(h.last || Date.now());
      const key = d.toLocaleDateString("zh-CN");
      (groups[key] = groups[key] || []).push(h);
    });
    const days = Object.entries(groups);
    const weekCount = history.filter((h) => (Date.now() - (h.last || 0)) < 7 * 86400000).length;
    const rec = R.buildProfile();
    const topGenre = Object.entries(rec.genres).sort((a, b) => b[1] - a[1])[0];
    const ids = Array.from(new Set(history.map((h) => h.id)));
    currentSongs = ids;

    dom.view.innerHTML = `<div class="history-hero">
      <div class="library-hero-title">📅 播放历史</div>
      <div class="profile-stats" style="margin-top:var(--space-md)">
        <div class="stat-card"><div class="s-val">${history.length}</div><div class="s-label">累计播放</div></div>
        <div class="stat-card"><div class="s-val">${weekCount}</div><div class="s-label">本周播放</div></div>
        <div class="stat-card"><div class="s-val">${topGenre ? escAttr(topGenre[0]) : "—"}</div><div class="s-label">最爱流派</div></div>
      </div>
    </div>
    ${days.length === 0 ? `<div class="empty-state"><span class="ic">🎧</span><h3>暂无播放记录</h3><p>去首页听几首歌吧</p></div>` : days.map(([day, items]) => `<div class="history-day">
      <div class="history-day-title">${escAttr(day)}</div>
      <div class="history-list">${items.map((h) => { const s = D.get(h.id); return s ? `<div class="history-item" data-action="play" data-id="${escAttr(s.id)}" tabindex="0" role="button">
        <span class="cv-emoji" aria-hidden="true">${s.emoji}</span>
        <span class="hi-title">${escAttr(s.title)}</span>
        <span class="hi-artist">${escAttr(s.artist)}</span>
        ${h.weight > 1 ? `<span class="hi-weight">×${h.weight}</span>` : ""}
      </div>` : ""; }).join("")}</div>
    </div>`).join("")}`;
  }

  /* ---- 在线用户列表 ---- */
  let onlineTimer = null;
  function renderOnlineUsers() {
    if (!S.isLoggedIn()) { dom.view.innerHTML = `<div class="empty-state"><span class="ic">🔒</span><h3>请先登录</h3><p>登录后查看在线用户</p><button class="btn-primary" style="width:auto" id="goLogin">立即登录</button></div>`; return; }
    dom.view.innerHTML = `<div class="library-hero">
      <div class="library-hero-title">🟢 在线用户</div>
      <div class="library-hero-sub">最近 5 分钟活跃的用户</div>
      <div class="library-hero-sub" id="onlineMeta"></div>
    </div>
    <div class="grid" id="onlineGrid"><div class="empty-state"><p>正在加载...</p></div></div>`;
    if (onlineTimer) clearTimeout(onlineTimer);
    const loadOnlineUsers = async function () {
      const grid = document.getElementById("onlineGrid");
      const meta = document.getElementById("onlineMeta");
      if (!grid) return; // 已离开页面，停止轮询
      const r = await S.listOnline();
      if (r && r.ok && r.data) {
        grid.innerHTML = r.data.length ? r.data.map((u) => `<div class="card online-card">
          <div class="card-cover" style="background:linear-gradient(135deg,var(--color-primary),#7c5cff);display:grid;place-items:center;position:relative;">
            ${u.avatar ? `<img src="${escAttr(u.avatar)}" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0;"/>` : `<span class="cv-emoji">👤</span>`}
            <span class="online-dot" aria-label="在线"></span>
          </div>
          <div class="card-title">${escAttr(u.nickname || u.username)}</div>
          <div class="card-artist">${u.uid ? "UID " + escAttr(u.uid) : "在线用户"}</div>
        </div>`).join("") : `<div class="empty-state"><p>暂无其他在线用户</p></div>`;
        if (meta) meta.textContent = "更新于 " + new Date().toLocaleTimeString("zh-CN");
      } else {
        grid.innerHTML = `<div class="empty-state"><p>加载失败，稍后重试</p></div>`;
      }
      onlineTimer = setTimeout(loadOnlineUsers, 60000); // 60s 轮询
    };
    loadOnlineUsers();
  }

  function renderNowPlaying() {
    const st = P.getState();
    const song = st.song;
    if (!song) {
      dom.view.innerHTML = `<div class="empty-state"><span class="ic">🎵</span><h3>当前没有播放中的歌曲</h3><p>去曲库挑一首喜欢的歌吧</p><button class="btn-primary" style="width:auto" data-action="goto-library">浏览曲库</button></div>`;
      return;
    }
    const isFav = S.isFavorite(song.id);
    const dur = st.duration || song.dur || 1;
    const playSvg = svgIcon(st.playing ? "ic-pause" : "ic-play", 26, 26);

    // 播放模式：顺序 / 随机 / 单曲循环
    let modeIcon = "ic-nav-playlist", modeLabel = "顺序播放";
    if (st.mode.shuffle) { modeIcon = "ic-shuffle"; modeLabel = "随机播放"; }
    else if (st.mode.repeat === "one") { modeIcon = "ic-repeat-one"; modeLabel = "单曲循环"; }

    // 黑胶唱片封面
    const vinylCover = song.coverUrl
      ? `<img src="${song.coverUrl}" alt="" loading="lazy" decoding="async" onerror="this.remove();this.parentElement.innerHTML='<span class=&quot;vinyl-emoji&quot;>${song.emoji}</span>'" /><span class="vinyl-emoji" aria-hidden="true">${song.emoji}</span>`
      : `<span class="vinyl-emoji" aria-hidden="true">${song.emoji}</span>`;

    dom.view.innerHTML = `<div class="now-playing-page">
      <div class="np-main">
        <div class="np-vinyl">
          <div class="vinyl-disc${st.playing ? ' playing' : ''}" id="vinylDisc">
            <div class="vinyl-cover">${vinylCover}</div>
            <div class="vinyl-hole"></div>
          </div>
        </div>
        <div class="np-lyrics" id="npLyrics">
          <div class="lyrics-list" id="lyricsList">
            <div class="lyric-empty" id="lyricEmpty">正在加载歌词...</div>
          </div>
        </div>
      </div>
      <div class="np-info">
        <h1 class="np-title">${song.title}</h1>
        <div class="np-artist">${song.artist}${song.album ? ' · ' + song.album : ''}</div>
      </div>
      <div class="np-progress">
        <span class="time" id="npCur">${fmt(st.current)}</span>
        <input type="range" id="npSeek" class="seek" min="0" max="${dur}" value="${st.current}" step="1" aria-label="播放进度" />
        <span class="time" id="npDur">${fmt(dur)}</span>
      </div>
      <div class="np-controls">
        <button class="icon-btn np-ctrl${st.mode.shuffle || st.mode.repeat === 'one' ? ' active' : ''}" data-action="np-mode" aria-label="播放模式：${modeLabel}" title="${modeLabel}">${svgIcon(modeIcon, 18, 18)}</button>
        <button class="icon-btn np-ctrl" data-action="np-prev" aria-label="上一首" title="上一首">${svgIcon("ic-prev", 22, 22)}</button>
        <button class="icon-btn play-btn np-play" data-action="np-play" aria-label="播放或暂停" aria-pressed="${st.playing}" title="播放/暂停">${playSvg}</button>
        <button class="icon-btn np-ctrl" data-action="np-next" aria-label="下一首" title="下一首">${svgIcon("ic-next", 22, 22)}</button>
        <button class="icon-btn np-ctrl" data-action="np-queue-toggle" aria-label="歌曲列表" title="歌曲列表">${svgIcon("ic-nav-playlist", 18, 18)}</button>
      </div>
      <div class="np-secondary">
        <button class="icon-btn np-ctrl" data-action="np-vol" aria-label="静音切换" title="音量">${svgIcon(st.volume > 0 ? "ic-vol-high" : "ic-vol-mute", 18, 18)}</button>
        <input type="range" id="npVol" class="vol" min="0" max="100" value="${Math.round(st.volume * 100)}" aria-label="音量" />
        <button class="icon-btn np-ctrl${isFav ? ' fav-on' : ''}" data-action="np-fav" aria-label="收藏" aria-pressed="${isFav}" title="收藏">${svgIcon(isFav ? "ic-heart-fill" : "ic-heart", 18, 18)}</button>
      </div>
    </div>`;

    // 抽屉（歌曲列表）
    renderQueueDrawer(st);

    // 缓存高频更新节点（syncNowPlaying 每 timeupdate 调用，避免 4Hz 全文档查询）
    npCache.seek = document.getElementById("npSeek");
    npCache.cur = document.getElementById("npCur");
    npCache.dur = document.getElementById("npDur");
    npCache.vinyl = document.getElementById("vinylDisc");
    npCache.playBtn = dom.view.querySelector(".np-play");
    npCache.lastPlaying = null;
    npCache.lastSec = -1;

    // 异步加载歌词
    currentLyrics = [];
    lyricIndex = -1;
    const lyricsEl = document.getElementById("lyricsList");
    const emptyEl = document.getElementById("lyricEmpty");
    fetchLyrics(song).then(function (lines) {
      currentLyrics = lines;
      if (!lyricsEl) return;
      if (lines.length === 0) {
        if (emptyEl) emptyEl.textContent = "暂无歌词，享受音乐吧 🎵";
        return;
      }
      if (emptyEl) emptyEl.remove();
      lyricsEl.innerHTML = lines.map(function (l) {
        return `<div class="lyric-line" data-time="${l.time}">${escAttr(l.text || '♪')}${l.translation ? `<div class="lyric-translation">${escAttr(l.translation)}</div>` : ''}</div>`;
      }).join("");
      syncLyrics(st.current);
    });
  }

  // 渲染歌曲列表抽屉
  function renderQueueDrawer(st) {
    let drawer = document.getElementById("queueDrawer");
    if (!drawer) {
      drawer = document.createElement("div");
      drawer.id = "queueDrawer";
      drawer.className = "queue-drawer";
      document.body.appendChild(drawer);
      const scrim = document.createElement("div");
      scrim.id = "queueScrim";
      scrim.className = "queue-scrim";
      document.body.appendChild(scrim);
    }
    const list = (st.queue && st.queue.length) ? st.queue : [];
    drawer.innerHTML = `
      <div class="queue-drawer-head">
        <span>播放队列 · ${list.length} 首</span>
        <button class="queue-drawer-close" data-action="np-queue-toggle" aria-label="关闭">✕</button>
      </div>
      <div class="queue-drawer-list">
        ${list.map(function (id, i) {
          const qs = D.get(id); if (!qs) return "";
          const act = i === st.index ? " active" : "";
          const qCover = qs.coverUrl
            ? `<img src="${qs.coverUrl}" alt="" loading="lazy" decoding="async" onerror="this.remove()" /><span class="qi-emoji" aria-hidden="true">${qs.emoji}</span>`
            : `<span class="qi-emoji" aria-hidden="true">${qs.emoji}</span>`;
          return `<div class="queue-item${act}" data-action="play" data-id="${id}" data-list="queue" role="button" tabindex="0"><div class="qi-cover" style="background:linear-gradient(135deg,${qs.c.from},${qs.c.to})">${qCover}</div><div class="qi-main"><div class="qi-title">${qs.title}</div><div class="qi-artist">${qs.artist}</div></div><div class="qi-dur">${qs.durStr || fmt(qs.dur)}</div></div>`;
        }).join("") || '<div class="lyric-empty">队列为空</div>'}
      </div>`;
  }

  // 歌词同步（当前行高亮 + 滚动）
  function syncLyrics(current) {
    const linesEl = document.querySelectorAll(".lyric-line");
    if (linesEl.length === 0) return;
    let activeIdx = -1;
    for (let i = 0; i < currentLyrics.length; i++) {
      if (currentLyrics[i].time <= current) activeIdx = i;
      else break;
    }
    if (activeIdx === lyricIndex) return;
    lyricIndex = activeIdx;
    linesEl.forEach(function (el, i) {
      el.classList.toggle("active", i === activeIdx);
    });
    // 迷你歌词条（右下角悬浮）
    const mini = document.getElementById("miniLyric");
    if (mini) {
      if (activeIdx >= 0 && currentLyrics[activeIdx]) {
        const cur = currentLyrics[activeIdx];
        mini.hidden = false;
        mini.innerHTML = `<span class="ml-line">${escAttr(cur.text || '♪')}</span>${cur.translation ? `<span class="ml-trans">${escAttr(cur.translation)}</span>` : ''}`;
      } else {
        mini.hidden = true;
      }
    }
    // 滚动到当前行（当前行居中）
    const listEl = document.getElementById("lyricsList");
    if (listEl && activeIdx >= 0) {
      const activeEl = linesEl[activeIdx];
      const offset = activeEl.offsetTop - listEl.clientHeight / 2 + activeEl.clientHeight / 2;
      listEl.style.transform = `translateY(${-offset}px)`;
    }
  }

  // 播放模式循环：顺序 → 随机 → 单曲循环 → 顺序
  function cyclePlayMode() {
    const m = P.getMode();
    if (!m.shuffle && m.repeat !== "one") {
      P.setShuffle(true);
    } else if (m.shuffle) {
      P.setShuffle(false); P.setRepeat("one");
    } else {
      P.setRepeat("off");
    }
    renderNowPlaying();
    updatePlayerBar();
  }

  // 抽屉开关
  function toggleQueueDrawer() {
    const drawer = document.getElementById("queueDrawer");
    const scrim = document.getElementById("queueScrim");
    if (!drawer) return;
    const open = drawer.classList.toggle("open");
    if (scrim) scrim.classList.toggle("show", open);
    if (open) renderQueueDrawer(P.getState());
  }


  // 绑定播放页的进度条事件（动态渲染后调用）
  function bindNowPlayingControls() {
    const seekEl = document.getElementById("npSeek");
    if (seekEl) {
      let drag = false;
      seekEl.addEventListener("input", function () {
        drag = true;
        const pct = seekEl.max > 0 ? (seekEl.value / seekEl.max) * 100 : 0;
        seekEl.style.background = `linear-gradient(90deg, var(--color-primary) ${pct}%, var(--color-border) ${pct}%)`;
        const curEl = document.getElementById("npCur");
        if (curEl) curEl.textContent = fmt(Number(seekEl.value));
      });
      seekEl.addEventListener("change", function () {
        P.seek(Number(seekEl.value)); drag = false;
      });
    }
    const volEl = document.getElementById("npVol");
    if (volEl) {
      volEl.addEventListener("input", function () {
        P.setVolume(Number(volEl.value) / 100);
        const volBtn = volEl.parentElement && volEl.parentElement.querySelector('[data-action="np-vol"]');
        if (volBtn) volBtn.innerHTML = svgIcon(Number(volEl.value) > 0 ? "ic-vol-high" : "ic-vol-mute", 18, 18);
      });
    }
  }

  // 同步播放页状态（进度、黑胶旋转、按钮高亮、歌词）
  // 播放页高频更新节点缓存（renderNowPlaying 时重建）
  const npCache = { seek: null, cur: null, dur: null, vinyl: null, playBtn: null, lastPlaying: null, lastSec: -1 };

  function syncNowPlaying() {
    if (currentRoute !== "/nowplaying") return;
    const st = P.getState();
    const sec = Math.floor(st.current);
    // 进度：仅秒数变化时更新（timeupdate 约 4Hz，大部分调用数值未变）
    if (sec !== npCache.lastSec) {
      npCache.lastSec = sec;
      const seekEl = npCache.seek;
      if (seekEl && !seekEl.matches(":active")) {
        seekEl.max = st.duration || (st.song ? st.song.dur : 1) || 1;
        seekEl.value = Math.min(st.current, seekEl.max);
        const pct = seekEl.max > 0 ? (seekEl.value / seekEl.max) * 100 : 0;
        seekEl.style.background = `linear-gradient(90deg, var(--color-primary) ${pct}%, var(--color-border) ${pct}%)`;
      }
      if (npCache.cur) npCache.cur.textContent = fmt(st.current);
      if (npCache.dur) npCache.dur.textContent = fmt(st.duration || (st.song ? st.song.dur : 0));
    }
    // 播放/暂停图标：仅状态变化时重写（避免 4Hz 重建 SVG）
    if (st.playing !== npCache.lastPlaying) {
      npCache.lastPlaying = st.playing;
      if (npCache.vinyl) npCache.vinyl.classList.toggle("playing", st.playing);
      const playBtn = npCache.playBtn && npCache.playBtn.isConnected ? npCache.playBtn : document.querySelector(".np-play");
      if (playBtn) {
        playBtn.innerHTML = svgIcon(st.playing ? "ic-pause" : "ic-play", 26, 26);
        playBtn.setAttribute("aria-pressed", st.playing);
        npCache.playBtn = playBtn;
      }
    }
    syncLyrics(st.current);
  }

  /* ---- 播放条更新 ---- */
  function updatePlayerBar() {
    const st = P.getState();
    const song = st.song;
    if (song) {
      if (song.coverUrl) {
        dom.pbCover.innerHTML = `<img src="${song.coverUrl}" alt="" loading="lazy" decoding="async" onerror="this.remove();this.parentElement.innerHTML='${svgIcon("ic-music", 22, 22)}'" />`;
        dom.pbCover.style.background = "linear-gradient(135deg, #1d1d2b, #2a2f45)";
      } else {
        dom.pbCover.style.background = `linear-gradient(135deg, ${song.c.from}, ${song.c.to})`;
        dom.pbCover.innerHTML = song.emoji;
      }
      dom.pbTitle.textContent = song.title;
      dom.pbArtist.textContent = song.artist + " · " + song.album;
      const fav = S.isFavorite(song.id);
      dom.pbFav.classList.toggle("on", fav);
      dom.pbFav.innerHTML = svgIcon(fav ? "ic-heart-fill" : "ic-heart", 18, 18);
      dom.timeDur.textContent = fmt(st.duration || song.dur);
      if (song.themeColor) setAmbient(song.themeColor);
    } else {
      dom.pbCover.style.background = "linear-gradient(135deg, var(--color-bg-elevated), #252a36)";
      dom.pbCover.innerHTML = svgIcon("ic-music", 22, 22);
      dom.pbTitle.textContent = "未在播放";
      dom.pbArtist.textContent = "选择一首歌开始";
      dom.pbFav.classList.remove("on");
      dom.pbFav.innerHTML = svgIcon("ic-heart", 18, 18);
      setAmbient("#4D6BFE");
    }
    dom.timeCur.textContent = fmt(st.current);
    dom.btnPlay.innerHTML = svgIcon(st.playing ? "ic-pause" : "ic-play", 22, 22);
    if (!seekDrag) {
      const max = st.duration || (song ? song.dur : 1);
      dom.seek.max = max || 1;
      dom.seek.value = Math.min(st.current, dom.seek.max);
    }
    // 进度条填充色跟随当前进度
    const seekPct = dom.seek.max > 0 ? (dom.seek.value / dom.seek.max) * 100 : 0;
    dom.seek.style.background = `linear-gradient(90deg, var(--color-primary) ${seekPct}%, var(--color-border) ${seekPct}%)`;

    const shuffleOn = st.mode.shuffle;
    const rpt = st.mode.repeat;
    const btnShuffle = $("#btnShuffle");
    const btnRepeat = $("#btnRepeat");
    if (btnShuffle) { btnShuffle.classList.toggle("active", shuffleOn); btnShuffle.setAttribute("aria-pressed", shuffleOn); }
    if (btnRepeat) {
      btnRepeat.classList.toggle("active", rpt !== "off");
      btnRepeat.setAttribute("aria-pressed", rpt !== "off");
      btnRepeat.innerHTML = svgIcon(rpt === "one" ? "ic-repeat-one" : "ic-repeat", 18, 18);
    }
    if (dom.btnPlay) dom.btnPlay.setAttribute("aria-pressed", st.playing);
    if (dom.pbFav) dom.pbFav.setAttribute("aria-pressed", S.isFavorite(song ? song.id : ""));
    syncNowPlaying();
  }

  /* ---- 侧边栏用户状态 ---- */
  function updateSidebar() {
    const u = S.currentUser();
    if (u) {
      const initial = escAttr((u[0] || "乐").toUpperCase());
      dom.sidebarFoot.innerHTML = `<div class="sidebar-user">
        <div class="av">${initial}</div>
        <div><div class="un">${escAttr(u)}</div><div class="role">音乐爱好者</div></div>
      </div>`;
      // 异步填充头像与昵称
      S.getProfile(false).then((p) => {
        if (!p || S.currentUser() !== u) return;
        const name = p.nickname || u;
        const av = p.avatar
          ? `<img class="av-img" src="${escAttr(p.avatar)}" alt="" onerror="this.remove()" />`
          : escAttr((name[0] || "乐").toUpperCase());
        dom.sidebarFoot.innerHTML = `<div class="sidebar-user">
          <div class="av">${av}</div>
          <div><div class="un">${escAttr(name)}</div><div class="role">音乐爱好者</div></div>
        </div>`;
      });
    } else {
      dom.sidebarFoot.innerHTML = `<button class="btn-primary" style="font-size:13px;padding:10px" id="sidebarLogin">登录 / 注册</button>`;
    }
    updateTopbar();
  }

  function updateTopbar() {
    const u = S.currentUser();
    if (u) {
      dom.topbarUser.innerHTML = `<button class="theme-toggle" id="themeToggle">${theme==='dark'?'☀':'🌙'}</button><span style="font-size:var(--font-body);color:var(--color-text-secondary)">${escAttr(u)}</span>`;
      S.getProfile(false).then((p) => {
        if (!p || S.currentUser() !== u) return;
        const name = p.nickname || u;
        dom.topbarUser.innerHTML = `<button class="theme-toggle" id="themeToggle">${theme==='dark'?'☀':'🌙'}</button><span style="font-size:var(--font-body);color:var(--color-text-secondary)">${escAttr(name)}</span>`;
      });
    } else {
      dom.topbarUser.innerHTML = `<button class="theme-toggle" id="themeToggle">${theme==='dark'?'☀':'🌙'}</button><button class="login-btn" id="topLogin">登录</button>`;
    }
  }

  /* ---- 主题切换 ---- */
  function applyThemeClass() {
    // 用 toggle 而非 className 覆盖，避免抹掉 html 上的其他类
    document.documentElement.classList.toggle("light", theme === "light");
  }
  function toggleTheme() {
    theme = theme === "dark" ? "light" : "dark";
    applyThemeClass();
    localStorage.setItem("mp_theme", theme);
    updateTopbar();
    updateSidebar();
  }

  /* ---- 弹窗 ---- */
  // 根据登录模式更新表单字段显示
  function setAuthFields() {
    verifyUserId = null;
    dom.emailField.hidden = authMode !== "register";   // 注册时显示邮箱
    dom.codeField.hidden = true;                        // 默认隐藏验证码
    dom.codeHint.textContent = "";
    dom.authSubmit.textContent = authMode === "register" ? "注册" : "登录";
  }

  function showAuth() {
    authMode = "login";
    dom.authTabs.forEach((t) => t.classList.toggle("active", t.dataset.tab === "login"));
    dom.authUser.value = ""; dom.authPass.value = "";
    if (dom.authEmail) dom.authEmail.value = "";
    if (dom.authCode) dom.authCode.value = "";
    dom.authError.textContent = "";
    setAuthFields();
    openModal(dom.authMask, "#authUser");
  }

  function showPlaylistModal(songId) {
    plTargetSongId = songId;
    const pls = S.getPlaylists();
    dom.plList.innerHTML = pls.length === 0
      ? `<div style="color:var(--color-text-muted);padding:10px 0;font-size:var(--font-body)">还没有歌单，在下方新建一个</div>`
      : pls.map((pl) => `<div class="pl-item" data-action="addToPl" data-plid="${pl.id}" tabindex="0" role="button" aria-label="添加到歌单 ${pl.name.replace(/"/g,'&quot;')}"><span>📝 ${pl.name.replace(/"/g,'&quot;')} · ${pl.songIds.length}首</span><span style="color:var(--color-primary)">+ 添加</span></div>`).join("");
    dom.plNewName.value = "";
    openModal(dom.plMask, "#plNewName");
  }

  /* ---- 键盘 Enter/Space 触发 role=button 元素（卡片等） ---- */
  document.addEventListener("keydown", function (e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.getAttribute && e.target.getAttribute("role") === "button") {
      const action = e.target.dataset.action;
      if (action) {
        e.preventDefault();
        e.target.click();
      }
    }
  });

  /* ---- 全局事件委托 ---- */
  document.addEventListener("click", function (e) {
    // 抽屉遮罩点击关闭
    if (e.target.id === "queueScrim") { toggleQueueDrawer(); return; }
    const target = e.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action, id = target.dataset.id;

    if (action === "goto-artist") {
      const n = target.dataset.name;
      if (n) location.hash = "#/artist/" + encodeURIComponent(n);
      return;
    }
    if (action === "goto-album") {
      const n = target.dataset.name;
      if (n) location.hash = "#/album/" + encodeURIComponent(n);
      return;
    }

    if (action === "play") {
      const list = target.dataset.list;
      let queueIds;
      if (list === "queue") queueIds = currentSongs;
      else if (list === "fav") queueIds = S.getFavorites();
      else if (list) queueIds = (S.getPlaylists().find((p) => p.id === list) || {}).songIds;
      else queueIds = currentSongs.length ? currentSongs : D.SONGS.map((s) => s.id);
      if (!queueIds || queueIds.length === 0) queueIds = [id];
      const _sv = D.get(id);
      if (_sv && _sv.vip) toast("VIP 专属歌曲 · 试听模式");
      P.playSong(id, queueIds);
      updatePlayerBar();
      return;
    }

    // Hero 导航按钮
    if (action === "goto-library") { navigate("/library"); return; }
    if (action === "goto-search") { navigate("/search"); return; }

    // 曲库手动刷新（强制拉取在线源）
    if (target.id === "libRefreshBtn") {
      target.disabled = true;
      target.textContent = "刷新中…";
      onlineTracksCache = null;
      loadOnlineTracks(true).then(function ({ netease, audius }) {
        const container = document.getElementById("librarySections");
        if (container) {
          let html = "";
          if (netease.length) html += gridSection("🎶 网易云热歌榜", netease.length + " 首", netease, neteaseCard);
          if (audius.length) html += gridSection("🌐 Audius 热门", audius.length + " 首", audius, audiusCard);
          container.innerHTML = html || `<div class="empty-state"><p>在线曲库暂时加载失败，请稍后重试</p></div>`;
        }
        const btn = document.getElementById("libRefreshBtn");
        if (btn) { btn.disabled = false; btn.textContent = "🔄 刷新"; }
        toast("曲库已刷新 🔄");
      });
      return;
    }

    // Audius 在线歌曲播放
    if (action === "audius-play") {
      const track = audiusCache[id];
      if (!track) return;
      // 把当前 Audius 结果全部注册为外部歌曲，作为播放队列
      const queueIds = currentAudius.map((aid) => {
        const t = audiusCache[aid];
        return t ? D.registerExternal(t).id : null;
      }).filter(Boolean);
      const full = D.registerExternal(track);
      P.playSong(full.id, queueIds.length ? queueIds : [full.id]);
      updatePlayerBar();
      return;
    }

    // 网易云在线歌曲播放（先异步获取播放地址）
    if (action === "netease-play") {
      const track = neteaseCache[id];
      if (!track) return;
      playNetease(track);
      return;
    }

    // QQ 音乐在线歌曲播放
    if (action === "qq-play") {
      const track = qqCache[id];
      if (!track) return;
      playQQ(track);
      return;
    }

    if (action === "fav") {
      if (!S.isLoggedIn()) { showAuth(); return; }
      const fav = S.toggleFavorite(id);
      toast(fav ? "已添加到收藏夹 ❤" : "已取消收藏");
      // 更新卡片上的心（用 SVG 图标，与初始渲染一致）
      const badge = target.closest(".card")?.querySelector(".fav-badge");
      if (badge) { badge.classList.toggle("on", fav); badge.innerHTML = heartSvg(fav); }
      updatePlayerBar();
      return;
    }

    if (action === "menu") {
      if (!S.isLoggedIn()) { showAuth(); return; }
      showPlaylistModal(id);
      return;
    }

    if (action === "open-playlist") { navigate("/playlist/" + id); return; }

    // ---- 好友 / 分享 ----
    if (action === "friend-add") {
      toast("添加中…");
      S.addFriend(id, true).then(function (res) {
        if (res.ok) {
          toast("好友添加成功 🎉");
          const row = target.closest(".fr-user-row");
          if (row) {
            const btn = row.querySelector(".fr-add-btn");
            if (btn) { btn.outerHTML = `<span class="fr-added-tag">✓ 已是好友</span>`; }
          }
          refreshFriends();
        } else { toast(res.error || "添加失败", "error"); }
      });
      return;
    }
    if (action === "friend-remove") {
      const name = target.dataset.name || "该好友";
      showConfirm({
        title: "删除好友",
        message: "确定删除好友 " + name + " 吗？",
        okText: "删除",
        cancelText: "取消",
      }).then(function (confirmed) {
        if (!confirmed) return;
        S.removeFriend(id).then(function (res) {
          if (res.ok) { toast("已删除好友"); refreshFriends(); }
          else toast(res.error || "删除失败", "error");
        });
      });
      return;
    }
    if (action === "friend-share") {
      // 好友页：先选歌（默认当前播放歌曲），再定向给该好友
      const cur = P.currentSong();
      if (!cur) { toast("先播放一首歌，再来分享吧", "error"); return; }
      openShareModal(cur);
      return;
    }
    if (action === "share-send") {
      sendShareTo(id, target.dataset.name);
      return;
    }
    if (action === "share-play") {
      playSharedSong(target.dataset.sid);
      return;
    }
    if (action === "goto-friends") { navigate("/friends"); return; }
    if (action === "addToPl") {
      const ok = S.addToPlaylist(target.dataset.plid, plTargetSongId);
      closeModal(dom.plMask);
      toast(ok ? "已添加到歌单 ✅" : "已经在歌单中了");
      return;
    }

    // ---- 播放页控制按钮 ----
    if (action === "np-play") { P.toggle(); updatePlayerBar(); syncNowPlaying(); return; }
    if (action === "np-prev") { P.prev(); updatePlayerBar(); return; }
    if (action === "np-next") { P.next(); updatePlayerBar(); return; }
    if (action === "np-mode") { cyclePlayMode(); return; }
    if (action === "np-queue-toggle") { toggleQueueDrawer(); return; }
    if (action === "np-vol") {
      const v = P.getVolume();
      const nv = v > 0 ? 0 : 0.8;
      P.setVolume(nv);
      const volEl = document.getElementById("npVol");
      if (volEl) volEl.value = Math.round(nv * 100);
      const volBtn = target.closest('[data-action="np-vol"]');
      if (volBtn) volBtn.innerHTML = svgIcon(nv > 0 ? "ic-vol-high" : "ic-vol-mute", 18, 18);
      return;
    }
    if (action === "goto-nowplaying") {
      // 点击封面 toggle：播放页 → 返回上一个页面；其他页 → 打开播放页
      if (currentRoute === "/nowplaying") navigate(prevRoute || "/home");
      else navigate("/nowplaying");
      return;
    }
    if (action === "np-fav") {
      const s = P.currentSong(); if (!s) return;
      if (!S.isLoggedIn()) { showAuth(); return; }
      const fav = S.toggleFavorite(s.id);
      toast(fav ? "已收藏 ❤" : "已取消收藏");
      renderNowPlaying();
      updatePlayerBar();
      return;
    }
  });

  /* ---- 搜索输入（防抖：停止输入 350ms 后才触发搜索） ---- */
  let searchTimer = null;
  document.addEventListener("input", function (e) {
    if (e.target.id === "mainSearch") {
      searchQuery = e.target.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () {
        if (currentRoute === "/search") renderSearch();
      }, 350);
    }
  });

  document.addEventListener("click", function (e) {
    if (e.target.id === "btnNewPlaylist") {
      showConfirm({ title: "新建歌单", message: "为你的新歌单起个名字", placeholder: "请输入歌单名称", defaultValue: "我的歌单" })
        .then((name) => {
          if (name && String(name).trim()) { S.createPlaylist(String(name).trim()); renderPlaylists(); toast("歌单已创建 ✅"); }
        });
      return;
    }
    if (e.target.id === "btnImportPlaylist") {
      showConfirm({ title: "导入歌单", message: "粘贴网易云或 QQ 音乐的歌单链接（需为公开歌单）", placeholder: "https://music.163.com/playlist?id=... 或 https://y.qq.com/n/ryqq/playlist/...", defaultValue: "" })
        .then((url) => {
          if (url && String(url).trim()) { importPlaylist(String(url).trim()); }
        });
      return;
    }
    if (e.target.id === "btnDelPlaylist") {
      showConfirm({ title: "删除歌单", message: "确定删除这个歌单？此操作不可撤销。" })
        .then((ok) => { if (ok) { S.deletePlaylist(e.target.dataset.id); navigate("/playlists"); toast("歌单已删除"); } });
    }
    if (e.target.id === "goLogin" || e.target.id === "sidebarLogin" || e.target.id === "topLogin") { showAuth(); return; }
    if (e.target.id === "btnLogout") { S.logout(); stopSocialTimers(); updateFriendsDot(0); updateSidebar(); updateTopbar(); navigate("/home"); toast("已退出登录"); }
    if (e.target.id === "btnReset") {
      showConfirm({ title: "重置演示数据", message: "确定重置所有演示数据？此操作不可撤销！", okText: "重置" })
        .then((ok) => { if (ok) { S.resetAll(); location.reload(); } });
    }
    if (e.target.id === "themeToggle") { toggleTheme(); }
  });

  /* ---- 播放控制 ---- */
  dom.btnPlay.addEventListener("click", () => { P.toggle(); updatePlayerBar(); });
  if ($("#btnPrev")) $("#btnPrev").addEventListener("click", () => { P.prev(); updatePlayerBar(); });
  if ($("#btnNext")) $("#btnNext").addEventListener("click", () => { P.next(); updatePlayerBar(); });
  if ($("#btnShuffle")) $("#btnShuffle").addEventListener("click", () => { P.toggleShuffle(); updatePlayerBar(); });
  if ($("#btnRepeat")) $("#btnRepeat").addEventListener("click", () => { P.cycleRepeat(); updatePlayerBar(); });
  if ($("#pbFav")) dom.pbFav.addEventListener("click", () => {
    const s = P.currentSong(); if (!s) return;
    const fav = S.toggleFavorite(s.id);
    dom.pbFav.classList.toggle("on", fav);
    dom.pbFav.innerHTML = svgIcon(fav ? "ic-heart-fill" : "ic-heart", 18, 18);
    toast(fav ? "已收藏 ❤" : "已取消收藏");
  });

  // 「更多」菜单：切换显示
  if ($("#btnNow")) {
    $("#btnNow").addEventListener("click", function (e) {
      e.stopPropagation();
      const open = dom.pbMenu.hidden;
      dom.pbMenu.hidden = !open;
      this.setAttribute("aria-expanded", open);
      if (!open) {
        // 打开时初始化：收起子菜单、刷新档位显示
        const opts = document.getElementById("boostOptions");
        if (opts) opts.hidden = true;
        const hint = document.getElementById("boostHint");
        const lvl = P.getBoostLevel();
        if (hint) hint.textContent = Math.round(lvl * 100) + "%";
        updateBoostOptions(lvl);
      }
    });
  }
  // 菜单项处理
  if (dom.pbMenu) {
    dom.pbMenu.addEventListener("click", function (e) {
      // 音量增强子菜单展开/收起
      if (e.target.closest("#boostToggle")) {
        const opts = document.getElementById("boostOptions");
        if (opts) opts.hidden = !opts.hidden;
        e.target.closest("#boostToggle").setAttribute("aria-expanded", String(!opts.hidden));
        return;
      }
      // 档位选择
      const opt = e.target.closest(".boost-opt");
      if (opt) {
        applyBoost(Number(opt.dataset.boost));
        return;
      }
      // 普通菜单项
      const item = e.target.closest("[data-menu]");
      if (!item) return;
      handlePbMenu(item.dataset.menu);
      dom.pbMenu.hidden = true;
      $("#btnNow")?.setAttribute("aria-expanded", false);
    });
  }
  // 点击外部关闭菜单
  document.addEventListener("click", function (e) {
    if (dom.pbMenu && !dom.pbMenu.hidden && !e.target.closest(".pb-menu") && !e.target.closest("#btnNow")) {
      dom.pbMenu.hidden = true;
      $("#btnNow")?.setAttribute("aria-expanded", false);
    }
  });

  // 应用音量增强档位
  function applyBoost(level) {
    const hint = document.getElementById("boostHint");
    if (level <= 1) {
      P.resetBoost();
      P.setVolume(1.0);
      if (hint) hint.textContent = "100%";
      updateBoostOptions(1);
      toast("已恢复 100% 音量");
    } else {
      const r = P.boostVolume(level);
      if (r.ok) {
        if (hint) hint.textContent = Math.round(level * 100) + "%";
        updateBoostOptions(level);
        toast("音量增强 " + Math.round(level * 100) + "% 🔊");
      } else {
        toast(r.reason || "音量增强失败", "error");
      }
    }
    dom.pbMenu.hidden = true;
    $("#btnNow")?.setAttribute("aria-expanded", false);
  }
  function updateBoostOptions(activeLevel) {
    document.querySelectorAll(".boost-opt").forEach(function (o) {
      o.classList.toggle("active", Number(o.dataset.boost) === activeLevel);
    });
  }

  // 菜单功能
  /* ---- 全屏 / 壁纸沉浸模式 ---- */
  function enterImmersive() {
    navigate("/nowplaying");
    document.body.classList.add("immersive");
    const exitBtn = document.getElementById("immersiveExit");
    if (exitBtn) exitBtn.hidden = false;
    const el = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;
    if (req) { try { req.call(el); } catch (e) { /* 移动端可能不支持全屏 API */ } }
  }
  function exitImmersive() {
    document.body.classList.remove("immersive");
    const exitBtn = document.getElementById("immersiveExit");
    if (exitBtn) exitBtn.hidden = true;
    const ex = document.exitFullscreen || document.webkitExitFullscreen;
    if (ex && document.fullscreenElement) { try { ex.call(document); } catch (e) {} }
  }

  /* ---- 横屏播放模式（封面主题色背景 + 大唱片 + 横排歌词） ---- */
  let lpTimer = null;
  let lpSongId = null; // 当前横屏展示的歌曲 id，切歌时触发背景重取色

  // 颜色加深（把主色调暗作为渐变的暗端）
  function darkenColor(color, factor) {
    const m = /rgb\((\d+), *?(\d+), *?(\d+)\)/.exec(color);
    if (!m) return color;
    const r = Math.max(0, Math.min(255, Math.round(parseInt(m[1], 10) * factor)));
    const g = Math.max(0, Math.min(255, Math.round(parseInt(m[2], 10) * factor)));
    const b = Math.max(0, Math.min(255, Math.round(parseInt(m[3], 10) * factor)));
    return "rgb(" + r + ", " + g + ", " + b + ")";
  }

  // 从真实封面图片提取主色（Canvas 直方图，量化到 16 桶）
  function extractDominantColor(imgUrl, fallback) {
    return new Promise(function (resolve) {
      if (!imgUrl) return resolve(fallback);
      const img = new Image();
      img.crossOrigin = "anonymous";
      let done = false;
      function finish(c) { if (!done) { done = true; resolve(c); } }
      img.onload = function () {
        try {
          const size = 32;
          const canvas = document.createElement("canvas");
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, size, size);
          const data = ctx.getImageData(0, 0, size, size).data;
          const buckets = {};
          for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 100) continue;
            const br = (data[i] + data[i + 1] + data[i + 2]) / 3;
            if (br < 25 || br > 235) continue;
            const k = (Math.floor(data[i] / 16) * 16) + "," + (Math.floor(data[i + 1] / 16) * 16) + "," + (Math.floor(data[i + 2] / 16) * 16);
            buckets[k] = (buckets[k] || 0) + 1;
          }
          let best = null, maxC = 0;
          for (const k in buckets) {
            if (buckets[k] > maxC) { maxC = buckets[k]; best = k.split(",").map(Number); }
          }
          const from = best ? "rgb(" + best[0] + ", " + best[1] + ", " + best[2] + ")" : fallback.from;
          finish({ from: from, to: darkenColor(from, 0.55) });
        } catch (e) { finish(fallback); }
      };
      img.onerror = function () { finish(fallback); };
      img.src = imgUrl;
    });
  }

  // 应用封面主题色到横屏背景（优先真实封面取色，回退歌曲预设渐变色）
  function applyLandscapeTheme(song) {
    const el = document.getElementById("landscapePlay");
    if (!el || !song) return;
    const tc = song.themeColor || "#2a1a6e";
    const ac = song.accentColor || "#6a3cce";
    el.style.setProperty("--lp-tc", tc);
    el.style.setProperty("--lp-ac", ac);
    // 有真实封面（在线歌曲）时，异步从封面图提取主色覆盖，让背景跟随每首歌的封面
    if (song.coverUrl) {
      extractDominantColor(song.coverUrl, { from: tc, to: ac }).then(function (c) {
        const el2 = document.getElementById("landscapePlay");
        if (el2) {
          el2.style.setProperty("--lp-tc", c.from);
          el2.style.setProperty("--lp-ac", c.to);
        }
      });
    }
  }

  function enterLandscapePlay() {
    if (document.getElementById("landscapePlay")) return;
    const song = P.currentSong();
    if (!song) { toast("请先播放一首歌曲"); return; }
    const st = P.getState();
    const tc = song.themeColor || "#2a1a6e";
    const ac = song.accentColor || "#6a3cce";
    const fav = S.isLoggedIn() && S.isFavorite(song.id);
    const el = document.createElement("div");
    el.id = "landscapePlay";
    el.className = "landscape-play";
    el.setAttribute("role", "dialog");
    el.innerHTML = `<div class="lp-bg" aria-hidden="true"></div>
      <button class="lp-exit" id="lpExit" aria-label="退出横屏">✕</button>
      <div class="lp-main">
        <div class="lp-left">
          <div class="lp-lyrics" id="lpLyrics"></div>
          <div class="lp-controls">
            <button class="lp-btn" id="lpPrev" aria-label="上一首">${svgIcon("ic-prev", 28, 28)}</button>
            <button class="lp-play" id="lpToggle" aria-label="播放或暂停">${svgIcon(st.playing ? "ic-pause" : "ic-play", 32, 32)}</button>
            <button class="lp-btn" id="lpNext" aria-label="下一首">${svgIcon("ic-next", 28, 28)}</button>
          </div>
          <div class="lp-progress">
            <span id="lpCur">0:00</span>
            <input type="range" id="lpSeek" class="lp-seek" min="0" max="1" value="0" step="1" aria-label="播放进度" />
            <span id="lpDur">0:00</span>
          </div>
          <button class="lp-heart${fav ? " on" : ""}" id="lpFav" aria-label="喜欢">${svgIcon(fav ? "ic-heart-fill" : "ic-heart", 24, 24)}</button>
        </div>
        <div class="lp-right">
          <div class="lp-disc${st.playing ? " playing" : ""}" id="lpDisc">
            <div class="lp-disc-inner" style="background:linear-gradient(135deg, ${tc}, ${ac})">
              ${song.coverUrl ? `<img src="${escAttr(song.coverUrl)}" alt="" onerror="this.remove()"/>` : `<span>${song.emoji || "🎵"}</span>`}
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    lpSongId = song.id;
    applyLandscapeTheme(song);
    // 尝试请求真横屏（Android Chrome 支持；iOS Safari 不支持锁方向但 requestFullscreen 可用）
    try {
      if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
      if (screen.orientation && screen.orientation.lock) {
        screen.orientation.lock("landscape").catch(function () {
          // 锁方向失败：toast 提示用户手动旋转手机（仍可进入横屏视图）
          toast("请将手机旋转至横屏以获得完整体验", "");
        });
      } else {
        toast("请将手机旋转至横屏以获得完整体验", "");
      }
    } catch (e) {}
    document.getElementById("lpExit").addEventListener("click", exitLandscapePlay);
    document.getElementById("lpPrev").addEventListener("click", function () { P.prev(); });
    document.getElementById("lpNext").addEventListener("click", function () { P.next(); });
    document.getElementById("lpToggle").addEventListener("click", function () {
      if (P.getState().playing) P.pause(); else P.play();
    });
    document.getElementById("lpFav").addEventListener("click", function () {
      if (!S.isLoggedIn()) { showAuth(); return; }
      const f = S.toggleFavorite(song.id);
      const btn = document.getElementById("lpFav");
      if (btn) { btn.classList.toggle("on", f); btn.innerHTML = svgIcon(f ? "ic-heart-fill" : "ic-heart", 24, 24); }
      updatePlayerBar();
    });
    const seekEl = document.getElementById("lpSeek");
    seekEl.addEventListener("input", function () {
      const dur = P.getState().duration || (song ? song.dur : 0);
      P.seek((Number(seekEl.value) / (seekEl.max || 1)) * dur);
    });
    renderLandscapeLyrics();
    if (lpTimer) clearInterval(lpTimer);
    lpTimer = setInterval(syncLandscapeState, 250);
  }

  function renderLandscapeLyrics() {
    const el = document.getElementById("lpLyrics");
    if (!el) return;
    const song = P.currentSong();
    if (!currentLyrics || currentLyrics.length === 0) {
      el.innerHTML = `<div class="lp-line active">${escAttr((song && song.title) || "")}</div>`;
      return;
    }
    el.innerHTML = currentLyrics.map(function (l, i) {
      return `<div class="lp-line" data-i="${i}">${escAttr(l.text || "♪")}${l.translation ? `<span class="lp-trans">${escAttr(l.translation)}</span>` : ""}</div>`;
    }).join("");
  }

  function syncLandscapeState() {
    const el = document.getElementById("landscapePlay");
    if (!el) { if (lpTimer) { clearInterval(lpTimer); lpTimer = null; } return; }
    const st = P.getState();
    const song = P.currentSong();
    if (song && song.id !== lpSongId) {
      lpSongId = song.id;
      applyLandscapeTheme(song); // 切歌后背景跟随新歌封面主题色
      renderLandscapeLyrics();
    }
    const dur = st.duration || (song ? song.dur : 1);
    const seek = document.getElementById("lpSeek");
    const curEl = document.getElementById("lpCur");
    const durEl = document.getElementById("lpDur");
    const toggle = document.getElementById("lpToggle");
    const disc = document.getElementById("lpDisc");
    if (seek) { seek.max = dur || 1; if (document.activeElement !== seek) seek.value = st.current || 0; }
    if (curEl) curEl.textContent = fmt(st.current || 0);
    if (durEl) durEl.textContent = fmt(dur || 0);
    if (toggle) toggle.innerHTML = svgIcon(st.playing ? "ic-pause" : "ic-play", 32, 32);
    if (disc) disc.classList.toggle("playing", !!st.playing);
    if (currentLyrics.length > 0) {
      let activeIdx = -1;
      for (let i = 0; i < currentLyrics.length; i++) {
        if (currentLyrics[i].time <= (st.current || 0)) activeIdx = i; else break;
      }
      el.querySelectorAll(".lp-line").forEach(function (n, i) {
        n.classList.toggle("active", i === activeIdx);
      });
      const activeEl = activeIdx >= 0 ? el.querySelector('.lp-line[data-i="' + activeIdx + '"]') : null;
      const container = document.getElementById("lpLyrics");
      if (container && activeEl) {
        container.scrollTop = activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2;
      }
    }
  }

  function exitLandscapePlay() {
    const el = document.getElementById("landscapePlay");
    if (el) el.remove();
    if (lpTimer) { clearInterval(lpTimer); lpTimer = null; }
    try {
      if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    } catch (e) {}
  }

  function handlePbMenu(menu) {
    if (menu === "bg") { openBgSettings(); return; }
    if (menu === "fullscreen") { enterImmersive(); return; }
    if (menu === "landscape") { enterLandscapePlay(); return; }
    if (menu === "haptic") { toggleHaptic(); return; }
    const song = P.currentSong();
    if (!song) { toast("当前没有播放中的歌曲", "error"); return; }
    if (menu === "info") {
      // 歌曲信息弹窗
      showConfirm({
        title: "歌曲信息",
        message: `歌曲：${song.title}\n歌手：${song.artist}${song.album ? '\n专辑：' + song.album : ''}${song.genre ? '\n流派：' + song.genre : ''}${song.duration ? '\n时长：' + fmt(song.duration) : ''}`,
        okText: "知道了",
        cancelText: "关闭",
      });
    } else if (menu === "playlist") {
      if (!S.isLoggedIn()) { showAuth(); return; }
      showPlaylistModal(song.id);
    } else if (menu === "share") {
      if (!S.isLoggedIn()) { showAuth(); return; }
      openShareModal(song);
    } else if (menu === "download") {
      // 下载歌曲：同域 fetch+blob 直接保存，跨域回退新标签打开
      const url = song.audio || song.coverUrl;
      if (!url) { toast("该歌曲没有可下载的音源", "error"); return; }
      toast("下载中...");
      fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error("bad status");
          return res.blob();
        })
        .then(function (blob) {
          const blobUrl = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = `${song.title} - ${song.artist}.mp3`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(function () { URL.revokeObjectURL(blobUrl); }, 2000);
          toast("下载完成 ✅");
        })
        .catch(function () {
          // 跨域 fetch 失败，回退到直接打开下载链接
          const a = document.createElement("a");
          a.href = url;
          a.download = `${song.title} - ${song.artist}.mp3`;
          a.target = "_blank";
          a.rel = "noopener";
          document.body.appendChild(a);
          a.click();
          a.remove();
          toast("已在新标签打开下载链接");
        });
    }
  }

  dom.seek.addEventListener("input", () => {
    seekDrag = true;
    const pct = dom.seek.max > 0 ? (dom.seek.value / dom.seek.max) * 100 : 0;
    dom.seek.style.background = `linear-gradient(90deg, var(--color-primary) ${pct}%, var(--color-border) ${pct}%)`;
  });
  dom.seek.addEventListener("change", () => { P.seek(Number(dom.seek.value)); seekDrag = false; updatePlayerBar(); });
  dom.seek.addEventListener("mouseup", () => { seekDrag = false; }); // actually change already fires
  dom.seek.addEventListener("touchend", () => { seekDrag = false; });

  // 键盘快捷键（排除输入框、contenteditable、聚焦的按钮）
  document.addEventListener("keydown", function (e) {
    const tag = e.target.tagName;
    const interactive = tag === "INPUT" || tag === "TEXTAREA" ||
      e.target.isContentEditable ||
      e.target.getAttribute("role") === "button" ||
      e.target.tagName === "BUTTON";
    if (interactive) return;
    if (e.code === "Space") { e.preventDefault(); P.toggle(); updatePlayerBar(); }
    if (e.code === "ArrowRight") { e.preventDefault(); P.next(); updatePlayerBar(); }
    if (e.code === "ArrowLeft") { e.preventDefault(); P.prev(); updatePlayerBar(); }
  });

  /* ---- 播放条事件 ---- */
  P.on("track", function () { updatePlayerBar(); if (currentRoute === "/nowplaying") renderNowPlaying(); });
  P.on("state", updatePlayerBar);
  P.on("time", function (t) {
    if (!seekDrag) {
      dom.seek.value = t.current;
      dom.seek.max = t.duration || 1;
      dom.timeCur.textContent = fmt(t.current);
      dom.timeDur.textContent = fmt(t.duration);
    }
    syncNowPlaying();
  });
  P.on("mode", updatePlayerBar);
  P.on("ended", () => { updatePlayerBar(); if (currentRoute === "/nowplaying") renderNowPlaying(); });
  P.on("error", (e) => toast(e.message, "error"));

  /* ---- 节拍驱动视觉（背景光晕脉冲 + 粒子爆发 + 黑胶顿点） ---- */
  let beatSimPhase = 0, beatThumpTimer = null;
  function applyBeatVisual(energy, bass, isBeat) {
    document.documentElement.style.setProperty("--beat-glow", Math.min(1, energy || 0).toFixed(3));
    if (window.App && window.App.Particles) window.App.Particles.setBeat(energy, bass, isBeat);
    if (isBeat) {
      const disc = document.getElementById("vinylDisc");
      if (disc) {
        disc.classList.add("beat");
        clearTimeout(beatThumpTimer);
        beatThumpTimer = setTimeout(function () { disc.classList.remove("beat"); }, 200);
      }
    }
  }
  function resetBeatVisual() {
    document.documentElement.style.setProperty("--beat-glow", "0");
    if (window.App && window.App.Particles) window.App.Particles.setBeat(0, 0, false);
  }
  P.on("beat", function (b) {
    if (!b) return;
    if (b.live) {
      applyBeatVisual(b.energy, b.bass, b.beat);
    } else {
      // 跨域/无实时信号 → 模拟呼吸律动（画面依旧有生命感）
      beatSimPhase += 0.05;
      const e = 0.5 + 0.5 * Math.sin(beatSimPhase);
      applyBeatVisual(e, e, Math.sin(beatSimPhase) > 0.95);
    }
  });
  P.on("state", function (s) { if (!s.playing) resetBeatVisual(); });

  /* ---- 登录弹窗 ---- */
  dom.authTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      authMode = tab.dataset.tab;
      dom.authTabs.forEach((t) => t.classList.toggle("active", t === tab));
      dom.authError.textContent = "";
      setAuthFields();
      dom.authUser.focus();
    });
  });

  dom.authForm.addEventListener("submit", async function (e) {
    e.preventDefault();

    // 二次验证步骤：正在等待输入验证码
    if (verifyUserId) {
      const code = dom.authCode.value.trim();
      if (!/^\d{6}$/.test(code)) { dom.authError.textContent = "请输入 6 位数字验证码"; return; }
      dom.authSubmit.disabled = true;
      dom.authSubmit.textContent = "验证中...";
      const vres = await S.verifyLogin(verifyUserId, code);
      dom.authSubmit.disabled = false;
      dom.authSubmit.textContent = "登录";
      if (vres.ok) {
        closeModal(dom.authMask);
        verifyUserId = null;
        updateSidebar();
        startSocialTimers();
        navigate("/home");
        toast("登录成功！欢迎回来 👋");
      } else {
        dom.authError.textContent = vres.error;
      }
      return;
    }

    // 第一步：用户名 + 密码
    const un = dom.authUser.value.trim(), pw = dom.authPass.value;
    dom.authSubmit.disabled = true;
    dom.authSubmit.textContent = "处理中...";
    let res;
    if (authMode === "register") {
      const email = (dom.authEmail ? dom.authEmail.value : "").trim();
      res = await S.register(un, pw, email);
    } else {
      res = await S.login(un, pw);
    }
    dom.authSubmit.disabled = false;
    dom.authSubmit.textContent = authMode === "register" ? "注册" : "登录";

    if (res.ok) {
      closeModal(dom.authMask);
      updateSidebar();
      startSocialTimers();
      navigate("/home");
      toast(authMode === "register" ? "注册成功！欢迎 🎉" : "登录成功！欢迎回来 👋");
    } else if (res.needVerify) {
      // 进入二次验证步骤
      verifyUserId = res.userId;
      dom.codeField.hidden = false;
      dom.codeHint.textContent = "验证码已发送至 " + (res.maskedEmail || "你的邮箱");
      dom.authError.textContent = "";
      dom.authSubmit.textContent = "验证并登录";
      dom.authCode.value = "";
      dom.authCode.focus();
    } else {
      dom.authError.textContent = res.error;
    }
  });

  dom.authMask.addEventListener("click", function (e) {
    if (e.target === dom.authMask) closeModal(dom.authMask);
  });

  // 演示账号（主要用于本地/静态预览模式）
  if ($("#demoLogin")) {
    $("#demoLogin").addEventListener("click", async function (e) {
      e.preventDefault();
      let res = await S.login("demo", "demo1234");
      if (!res.ok && !res.needVerify) {
        res = await S.register("demo", "demo1234", "demo@wave.demo");
      }
      if (res.ok) {
        closeModal(dom.authMask);
        updateSidebar();
        startSocialTimers();
        navigate("/home");
        toast("演示账号已登录 👋");
      } else if (res.needVerify) {
        toast("演示账号已绑定邮箱，请通过正常登录流程验证", "error");
      } else {
        toast("演示账号登录失败：" + (res.error || "未知错误"), "error");
      }
    });
  }

  /* ---- 播放列表弹窗 ---- */
  if ($("#plNewBtn")) {
    $("#plNewBtn").addEventListener("click", () => {
      const name = dom.plNewName.value.trim() || "我的歌单";
      const pl = S.createPlaylist(name);
      S.addToPlaylist(pl.id, plTargetSongId);
      closeModal(dom.plMask);
      toast("已新建歌单并添加 ✅");
    });
  }
  if ($("#plClose")) $("#plClose").addEventListener("click", () => { closeModal(dom.plMask); });
  dom.plMask.addEventListener("click", function (e) {
    if (e.target === dom.plMask) closeModal(dom.plMask);
  });
  // 歌单弹窗里的「分享给好友」：分享当前弹窗针对的歌曲
  if ($("#plShareBtn")) {
    $("#plShareBtn").addEventListener("click", () => {
      closeModal(dom.plMask);
      const s = plTargetSongId ? D.get(plTargetSongId) : P.currentSong();
      if (!s) { toast("找不到歌曲信息", "error"); return; }
      openShareModal(s);
    });
  }

  /* ---- 分享弹窗 ---- */
  if ($("#shareClose")) $("#shareClose").addEventListener("click", () => { closeModal($("#shareMask")); });
  const shareMaskEl = $("#shareMask");
  if (shareMaskEl) shareMaskEl.addEventListener("click", function (e) {
    if (e.target === shareMaskEl) closeModal(shareMaskEl);
  });

  /* ---- 侧边栏导航 ---- */
  dom.nav.addEventListener("click", function (e) {
    const item = e.target.closest(".nav-item");
    if (item) { navigate(item.dataset.route); closeSidebar(); }
  });

  /* ---- 移动端菜单 ---- */
  dom.menuBtn.addEventListener("click", () => {
    const open = dom.sidebar.classList.toggle("open");
    dom.scrim.hidden = !open;
    dom.menuBtn.setAttribute("aria-expanded", open);
  });
  dom.scrim.addEventListener("click", closeSidebar);
  function closeSidebar() {
    dom.sidebar.classList.remove("open");
    dom.scrim.hidden = true;
    dom.menuBtn.setAttribute("aria-expanded", false);
  }

  /* ---- 哈希路由 ---- */
  window.addEventListener("hashchange", () => {
    const hash = location.hash.replace("#", "") || "/home";
    navigate(hash);
  });

  /* ============================================================
   * 触感反馈 (Haptics)
   * 优先 Capacitor Haptics 插件（原生马达，Android / iOS 均可用）
   * 降级：Web Vibration API（Android Chrome 支持；iOS Safari 不支持）
   * 开关：localStorage.mp_haptic = "0" 表示关闭
   * 用法：元素加 data-haptic="light|medium|heavy|selection|success|warning|error"
   *       未标注的 button / .chip / .nav-item 等默认 light
   * ============================================================ */
  var HAPTIC_KEY = "mp_haptic";
  var HAPTIC_STYLE = { light: "LIGHT", medium: "MEDIUM", heavy: "HEAVY" };
  var HAPTIC_FALLBACK = {
    light: 12, medium: 22, heavy: 38, selection: 8,
    success: [12, 40, 12], warning: [20, 50, 20], error: [30, 60, 30]
  };

  function hapticOn() {
    try { return localStorage.getItem(HAPTIC_KEY) !== "0"; } catch (e) { return true; }
  }
  function setHaptic(on) {
    try { localStorage.setItem(HAPTIC_KEY, on ? "1" : "0"); } catch (e) {}
  }

  function haptic(kind) {
    if (!hapticOn()) return;
    kind = kind || "light";
    var Cap = global.Capacitor;
    var H = Cap && Cap.Plugins && Cap.Plugins.Haptics;
    if (H && typeof H.impact === "function") {
      try {
        if (HAPTIC_STYLE[kind]) { H.impact({ style: HAPTIC_STYLE[kind] }); return; }
        if (kind === "selection" && typeof H.selectionChanged === "function") {
          H.selectionChanged(); return;
        }
        if ((kind === "success" || kind === "warning" || kind === "error")
            && typeof H.notification === "function") {
          H.notification({ type: kind.toUpperCase() }); return;
        }
        H.impact({ style: "LIGHT" }); return;
      } catch (e) { /* 原生不可用，继续走降级 */ }
    }
    /* 降级：Web Vibration API */
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      try { navigator.vibrate(HAPTIC_FALLBACK[kind] || 12); } catch (e) {}
    }
  }

  function bindHaptics() {
    if (bindHaptics._done) return;
    bindHaptics._done = true;
    document.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || typeof t.closest !== "function") return;
      var marked = t.closest("[data-haptic]");
      if (marked) { haptic(marked.getAttribute("data-haptic")); return; }
      if (t.closest("button, .btn, .icon-btn, .chip, .nav-item, .menu-item, .pb-menu-item, [role='button']")) {
        haptic("light");
      }
    }, true);
  }

  function updateHapticHint() {
    var el = document.getElementById("hapticHint");
    if (el) el.textContent = hapticOn() ? "开启" : "关闭";
  }

  function toggleHaptic() {
    var on = !hapticOn();
    setHaptic(on);
    if (on) haptic("medium");
    toast(on ? "已开启触感反馈" : "已关闭触感反馈", "");
    updateHapticHint();
  }

  /* ---- 初始化 ---- */
  function init() {
    // 恢复主题与背景
    theme = localStorage.getItem("mp_theme") || "dark";
    applyThemeClass();
    loadBg();
    loadBgBlur();
    loadGlass();
    bindBgSettings();
    bindImmersive();
    bindProfileEditor();
    bindHaptics();
    updateHapticHint();
    updateSidebar();
    const hash = location.hash.replace("#", "") || "/home";
    navigate(hash);
    updatePlayerBar();
    // 登录态下启动时从服务器拉取最新数据（跨设备同步收藏/歌单/历史/外部歌曲）
    if (S.isLoggedIn()) {
      S.pullFromServer().then(function () {
        renderView();
        updateSidebar();
      }).catch(function () { /* 网络失败时沿用本地缓存 */ });
    }
    // 社交：在线心跳 + 未读分享红点（统一管理，登出/重登时正确启停）
    startSocialTimers();
  }

  // 绑定全屏沉浸模式事件
  function bindImmersive() {
    const exitBtn = document.getElementById("immersiveExit");
    if (exitBtn) exitBtn.addEventListener("click", exitImmersive);
    // 浏览器原生 ESC 退出全屏后，同步移除沉浸态
    document.addEventListener("fullscreenchange", function () {
      if (!document.fullscreenElement && document.body.classList.contains("immersive")) {
        exitImmersive();
      }
    });
    // 非全屏 API 环境下按 ESC 兜底退出
    document.addEventListener("keydown", function (e) {
      if (e.code === "Escape" && document.body.classList.contains("immersive") && !document.fullscreenElement) {
        exitImmersive();
      }
    });
  }

  // 绑定背景设置弹窗事件
  function bindBgSettings() {
    const mask = document.getElementById("bgMask");
    if (!mask) return;
    // 预设点击
    const presetsEl = document.getElementById("bgPresets");
    if (presetsEl) {
      presetsEl.addEventListener("click", function (e) {
        const preset = e.target.closest(".bg-preset");
        if (!preset) return;
        const value = decodeURIComponent(preset.dataset.bg);
        applyBg(value);
        presetsEl.querySelectorAll(".bg-preset").forEach(function (p) { p.classList.remove("active"); });
        preset.classList.add("active");
      });
    }
    // 上传图片
    const fileInput = document.getElementById("bgFileInput");
    if (fileInput) {
      fileInput.addEventListener("change", function () {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        compressImage(file, function (dataUrl) {
          if (dataUrl) {
            applyBg(dataUrl);
            toast("背景已更新 🖼️");
          } else {
            toast("图片加载失败", "error");
          }
        });
        fileInput.value = "";
      });
    }
    // 背景模糊滑块
    const blurRange = document.getElementById("bgBlurRange");
    const blurVal = document.getElementById("bgBlurValue");
    if (blurRange) {
      const paintBlurRange = function () {
        const pct = (blurRange.value / blurRange.max) * 100;
        blurRange.style.background = `linear-gradient(90deg, var(--color-primary) ${pct}%, var(--color-border) ${pct}%)`;
      };
      blurRange.addEventListener("input", function () {
        applyBgBlur(Number(blurRange.value));
        if (blurVal) blurVal.textContent = blurRange.value + "px";
        paintBlurRange();
      });
      paintBlurRange();
    }
    // 透明度滑块
    const glassRange = document.getElementById("bgGlassRange");
    const glassVal = document.getElementById("bgGlassValue");
    if (glassRange) {
      const paintRange = function () {
        const pct = (glassRange.value / glassRange.max) * 100;
        glassRange.style.background = `linear-gradient(90deg, var(--color-primary) ${pct}%, var(--color-border) ${pct}%)`;
      };
      glassRange.addEventListener("input", function () {
        applyGlass(glassRange.value / 100);
        if (glassVal) glassVal.textContent = glassRange.value + "%";
        paintRange();
      });
      paintRange();
    }
    // 恢复默认
    const resetBtn = document.getElementById("bgReset");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        localStorage.removeItem("mp_bg");
        localStorage.removeItem("mp_bg_blur");
        localStorage.removeItem("mp_bg_blur_px");
        localStorage.removeItem("mp_glass");
        applyBg(defaultBgValue());
        applyBgBlur(6);
        applyGlass(0.30);
        if (blurRange) { blurRange.value = 6; if (blurVal) blurVal.textContent = "6px"; }
        if (glassRange) { glassRange.value = 30; if (glassVal) glassVal.textContent = "30%"; }
        presetsEl.querySelectorAll(".bg-preset").forEach(function (p) { p.classList.toggle("active", p.dataset.bg === encodeURIComponent(BG_PRESETS[0].value)); });
        toast("已恢复默认背景");
      });
    }
    // 关闭
    const closeBtn = document.getElementById("bgClose");
    if (closeBtn) closeBtn.addEventListener("click", function () { closeModal(mask); });
    mask.addEventListener("click", function (e) { if (e.target === mask) closeModal(mask); });
  }

  global.App.UI = { init, navigate, updatePlayerBar, updateSidebar, formatTime: fmt, toast, closeSidebar };
  global.App.UI.init = init;
})(window);
