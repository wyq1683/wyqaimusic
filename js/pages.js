/* ============================================================
 * pages.js — 页面视图集合
 * 发现 / 曲库 / 搜索 / 收藏 / 歌单 / 历史 / 社交 / 我的
 * 正在播放 / 艺人 / 专辑 / 设置
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const D = global.App.DATA;
  const R = global.App.Recommend;
  const bus = C.bus;
  const { $, $$ } = C;

  const UI = () => global.App.UI;
  const P = () => global.App.Player;

  function page(html) {
    const d = C.el("div", "page");
    d.innerHTML = html;
    return d;
  }

  /* ==================== 发现 ==================== */
  function home() {
    const hour = new Date().getHours();
    const greet = hour < 5 ? "夜深了" : hour < 9 ? "早上好" : hour < 12 ? "上午好" : hour < 14 ? "中午好" : hour < 18 ? "下午好" : "晚上好";
    const sec = R.homeSections();
    const name = C.isLoggedIn() ? C.currentUser() : "朋友";

    let html =
      '<div class="hero">' +
      '<div><div class="hero-greet">' + greet + "，<span class='grad-text'>" + C.esc(name) + "</span></div>" +
      '<div class="hero-sub">来点旋律，为这一刻上色。</div></div>' +
      '<button class="btn btn-ghost" id="homeShuffle">' + C.icon("shuffle", 15) + "随便听听</button></div>";

    // 音源入口
    html +=
      '<div class="hero-cards">' +
      srcCard("t", "trend", "网易云热歌", "华语流行 · 每日更新", "#/search?src=netease") +
      srcCard("#00c1ff", "music", "QQ 音乐", "海量曲库 · 即点即播", "#/search?src=qq") +
      srcCard("#c47cff", "disc", "Audius", "全球独立音乐人", "#/search?src=audius") +
      srcCard("var(--accent)", "library", "本地曲库", "36 首精选示例曲目", "#/library") +
      "</div>";

    // 心情 chips
    html += '<div class="sec"><div class="sec-head"><div class="sec-title">心情电台</div><div class="sec-sub">点一下，播一整张歌单</div></div><div class="chip-row">';
    D.MOODS.forEach((m) => {
      html += '<button class="chip" data-mood="' + m + '">' + moodEmoji(m) + " " + (D.MOOD_LABEL[m] || m) + "</button>";
    });
    html += "</div></div>";

    // 推荐区
    html += '<div class="sec">' + UI().sectionHead("为你推荐", sec.personalized.length ? "" : "", "/library", "去曲库") + '<div class="hscroll">' + sec.personalized.map(UI().songCard).join("") + "</div></div>";
    html += '<div class="sec">' + UI().sectionHead("热门趋势", "", "/library") + '<div class="hscroll">' + sec.trending.map(UI().songCard).join("") + "</div></div>";

    if (C.isLoggedIn() && sec.recent.length) {
      html += '<div class="sec">' + UI().sectionHead("最近在听", "", "/history", "更多") + '<div class="hscroll">' + sec.recent.map(UI().songCard).join("") + "</div></div>";
    }
    if (C.isLoggedIn() && sec.fromFavorites.length) {
      html += '<div class="sec">' + UI().sectionHead("根据收藏猜你喜欢", "", "/favorites") + '<div class="hscroll">' + sec.fromFavorites.map(UI().songCard).join("") + "</div></div>";
    }
    html += '<div class="sec">' + UI().sectionHead("新歌速递", "", "/library") + '<div class="hscroll">' + sec.newReleases.map(UI().songCard).join("") + "</div></div>";

    const el = page(html);
    // 随便听听
    $("#homeShuffle", el).addEventListener("click", () => {
      const pool = R.trending(36);
      P().playList(pool.map((s) => s.id), Math.floor(Math.random() * pool.length));
      toast("开始随便听");
    });
    // 心情电台
    $$("[data-mood]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const mood = b.dataset.mood;
        const songs = R.fromMood(mood, 20);
        if (songs.length) {
          P().playList(songs.map((s) => s.id), 0);
          toast("正在播放：" + (D.MOOD_LABEL[mood] || mood) + "电台");
        }
      })
    );
    return el;
  }

  function srcCard(color, ic, name, desc, href) {
    return (
      '<a class="src-card" href="' + href + '">' +
      '<span class="src-ic" style="background:' + color + '">' + C.icon(ic, 20) + "</span>" +
      '<span><span class="src-name">' + C.esc(name) + "</span><br/><span class='src-desc'>" + C.esc(desc) + "</span></span></a>"
    );
  }
  function moodEmoji(m) {
    return { Happy: "😄", Relax: "🌙", Energetic: "⚡", Sad: "🌧", Focus: "🎯", Party: "🎉" }[m] || "🎵";
  }

  /* ==================== 曲库 ==================== */
  const libState = { genre: "", mood: "", sort: "hot", view: "list" };

  function library() {
    let html =
      '<div class="lib-head">' +
      '<div><div class="lib-title">曲库</div><div class="lib-count" id="libCount"></div></div>' +
      '<div class="lib-tools">' +
      '<button class="btn btn-primary" id="libPlayAll" style="height:32px">' + C.icon("play", 14) + " 全部播放</button>" +
      '<div class="seg" id="libViewSeg">' +
      '<button data-view="list" class="' + (libState.view === "list" ? "active" : "") + '" aria-label="列表视图">' + C.icon("list", 14) + "</button>" +
      '<button data-view="grid" class="' + (libState.view === "grid" ? "active" : "") + '" aria-label="网格视图">' + C.icon("grid", 14) + "</button>" +
      "</div></div></div>";

    html += '<div class="chip-row" style="margin-bottom:18px">';
    html += '<button class="chip' + (libState.genre === "" ? " active" : "") + '" data-genre="">全部流派</button>';
    D.GENRES.forEach((g) => {
      html += '<button class="chip' + (libState.genre === g ? " active" : "") + '" data-genre="' + g + '">' + g + "</button>";
    });
    html += "</div>";
    html += '<div class="chip-row" style="margin-bottom:18px">';
    html += '<button class="chip' + (libState.mood === "" ? " active" : "") + '" data-mood="">全部心情</button>';
    D.MOODS.forEach((m) => {
      html += '<button class="chip' + (libState.mood === m ? " active" : "") + '" data-mood="' + m + '">' + moodEmoji(m) + " " + (D.MOOD_LABEL[m] || m) + "</button>";
    });
    html += "</div>";

    html += '<div id="libBody"></div>';
    const el = page(html);

    function filtered() {
      let songs = D.SONGS.slice();
      if (libState.genre) songs = songs.filter((s) => s.genre === libState.genre);
      if (libState.mood) songs = songs.filter((s) => s.mood === libState.mood);
      if (libState.sort === "hot") {
        const plays = C.getPlays();
        songs.sort((a, b) => (plays[b.id] || 0) - (plays[a.id] || 0));
      } else if (libState.sort === "new") songs.sort((a, b) => b.year - a.year);
      else if (libState.sort === "dur") songs.sort((a, b) => b.dur - a.dur);
      return songs;
    }

    function renderBody() {
      const songs = filtered();
      $("#libCount", el).textContent = songs.length + " 首 · 按" + ({ hot: "热度", new: "年份", dur: "时长" }[libState.sort]) + "排序";
      const body = $("#libBody", el);
      body.innerHTML = songs.length
        ? libState.view === "list"
          ? UI().songListHTML(songs)
          : UI().cardGridHTML(songs)
        : UI().emptyState("search", "没有符合条件的歌曲", "换个筛选条件试试");
    }
    renderBody();

    $$("[data-genre]", el).forEach((b) => b.addEventListener("click", () => { libState.genre = b.dataset.genre; global.App.Router.refresh(); }));
    $$("[data-mood]", el).forEach((b) => b.addEventListener("click", () => { libState.mood = b.dataset.mood; global.App.Router.refresh(); }));
    $$("#libViewSeg button", el).forEach((b) =>
      b.addEventListener("click", () => { libState.view = b.dataset.view; global.App.Router.refresh(); })
    );
    $("#libPlayAll", el).addEventListener("click", () => {
      const songs = filtered();
      if (songs.length) { P().playList(songs.map((s) => s.id), 0); toast("开始播放 " + songs.length + " 首"); }
    });
    return el;
  }

  /* ==================== 搜索 ==================== */
  const searchState = { q: "", src: "all", results: [], loading: false, searched: false };

  const SOURCES = [
    { key: "all", label: "综合" },
    { key: "netease", label: "网易云音乐" },
    { key: "qq", label: "QQ 音乐" },
    { key: "audius", label: "Audius" },
  ];
  const HOT_WORDS = ["周杰伦", "邓紫棋", "陈奕迅", "林俊杰", "电子音乐", "Lo-Fi", "钢琴", "夏日"];

  function search(params, query) {
    if (query.src && SOURCES.some((s) => s.key === query.src)) searchState.src = query.src;
    if (query.q) searchState.q = query.q;

    let html =
      '<div class="search-head">' +
      '<div class="search-box">' + C.icon("search", 17) +
      '<input id="searchInput" placeholder="搜索歌曲、艺人、专辑…" value="' + C.esc(searchState.q) + '" autocomplete="off" />' +
      (searchState.q ? '<button class="clear-btn" id="searchClear" aria-label="清空">' + C.icon("close", 14) + "</button>" : "") +
      "</div>" +
      '<div class="src-tabs">';
    SOURCES.forEach((s) => {
      html += '<button class="chip' + (searchState.src === s.key ? " active" : "") + '" data-src="' + s.key + '">' + s.label + "</button>";
    });
    html += "</div></div>";
    html += '<div id="searchBody"></div>';

    const el = page(html);
    const input = $("#searchInput", el);
    if (query.q) setTimeout(() => doSearch(query.q), 60);

    function renderBody() {
      const body = $("#searchBody", el);
      if (searchState.loading) {
        body.innerHTML = '<div class="loading-box"><span class="spinner"></span>正在搜索…</div>';
        return;
      }
      if (!searchState.searched) {
        // 未搜索：历史 + 热词
        const hist = C.getSearchHistory();
        let h = "";
        if (hist.length) {
          h += '<div class="sec"><div class="sec-head"><div class="sec-title">搜索历史</div><button class="sec-more" id="clearHist">清空</button></div><div class="hot-words">';
          hist.forEach((w) => (h += '<button class="chip" data-word="' + C.esc(w) + '">' + C.esc(w) + "</button>"));
          h += "</div></div>";
        }
        h += '<div class="sec"><div class="sec-head"><div class="sec-title">热门搜索</div></div><div class="hot-words">';
        HOT_WORDS.forEach((w) => (h += '<button class="chip" data-word="' + C.esc(w) + '">' + C.esc(w) + "</button>"));
        h += "</div></div>";
        body.innerHTML = h;
        $$("[data-word]", el).forEach((b) => b.addEventListener("click", () => { input.value = b.dataset.word; doSearch(b.dataset.word); }));
        const cl = $("#clearHist", el);
        if (cl) cl.addEventListener("click", () => { C.clearSearchHistory(); renderBody(); });
        return;
      }
      // 有音源失败时给一条明确的提示，别让"少了一半结果"看起来像坏了
      const failed = searchState.failed || [];
      const note = failed.length
        ? '<div class="src-note">' + C.esc(failed.join("、")) + " 音源暂时不可用，以下为其余音源的结果</div>"
        : "";
      if (!searchState.results.length) {
        body.innerHTML = note + UI().emptyState("search", "没有找到相关歌曲", "换个关键词，或切换音源试试");
        return;
      }
      body.innerHTML = note + UI().songListHTML(searchState.results);
    }

    async function doSearch(q) {
      q = (q || "").trim();
      searchState.q = q;
      if (!q) { searchState.searched = false; searchState.results = []; renderBody(); return; }
      searchState.loading = true;
      searchState.searched = true;
      searchState.failed = [];
      renderBody();
      C.addSearchHistory(q);
      try {
        if (searchState.src === "all") {
          // 综合 = 站内 + 全部在线源。单源失败不能拖垮整体（QQ 上游被限制时尤其如此），
          // 否则用户看到的是「搜索失败」而不是「少了一个源」。
          searchState.failed = [];
          const k = q.toLowerCase();
          const local = D.SONGS.filter((s) => (s.title + s.artist + s.album + s.genre).toLowerCase().includes(k));
          const jobs = [
            ["网易云", C.apiGet("netease.php", { action: "search", keywords: q, limit: 15 })],
            ["QQ 音乐", C.apiGet("qq.php", { action: "search", keywords: q, limit: 15 })],
            ["Audius", C.apiGet("audius.php", { action: "search", q: q, limit: 15 })],
          ];
          const settled = await Promise.allSettled(jobs.map(async ([name, p]) => {
            const r = await p;
            // 只有接口挂了才 reject（进失败名单）；「成功但没结果」走空数组
            if (!r || !r.ok || !r.data) throw new Error(name);
            return r.data.map((song) => D.registerExternal(song));
          }));
          const online = [];
          settled.forEach((res, i) => {
            // 任务返回的是歌曲数组，不是接口响应 —— 别拿 res.value.ok 判断
            if (res.status === "fulfilled" && Array.isArray(res.value)) online.push(...res.value);
            else searchState.failed.push(jobs[i][0]);
          });
          searchState.results = local.concat(online);
        } else if (searchState.src === "netease") {
          const r = await C.apiGet("netease.php", { action: "search", keywords: q, limit: 30 });
          searchState.results = r.ok && r.data ? r.data.map((s) => D.registerExternal(s)) : [];
          if (!r.ok) UI().toast(r.error || "网易云搜索失败", "error");
        } else if (searchState.src === "qq") {
          const r = await C.apiGet("qq.php", { action: "search", keywords: q, limit: 30 });
          searchState.results = r.ok && r.data ? r.data.map((s) => D.registerExternal(s)) : [];
          if (!r.ok) UI().toast(r.error || "QQ 音乐搜索失败", "error");
        } else {
          const r = await C.apiGet("audius.php", { action: "search", q: q, limit: 30 });
          searchState.results = r.ok && r.data ? r.data.map((s) => D.registerExternal(s)) : [];
          if (!r.ok) UI().toast(r.error || "Audius 搜索失败", "error");
        }
      } catch (e) {
        searchState.results = [];
        UI().toast("搜索出错，请稍后重试", "error");
      }
      searchState.loading = false;
      renderBody();
    }

    const debouncedSearch = C.debounce(() => doSearch(input.value), 450);
    input.addEventListener("input", debouncedSearch);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(input.value); });
    const cl = $("#searchClear", el);
    if (cl) cl.addEventListener("click", () => { input.value = ""; doSearch(""); input.focus(); });
    $$("[data-src]", el).forEach((b) =>
      b.addEventListener("click", () => {
        searchState.src = b.dataset.src;
        $$("[data-src]", el).forEach((x) => x.classList.toggle("active", x === b));
        if (searchState.q) doSearch(searchState.q);
        else renderBody();
      })
    );
    renderBody();
    setTimeout(() => input.focus(), 100);
    return el;
  }

  /* ==================== 收藏夹 ==================== */
  function favorites() {
    const favIds = C.getFavorites();
    const songs = favIds.map((id) => D.get(id)).filter(Boolean);
    let html =
      '<div class="page-head">' +
      '<div class="ph-cover" style="background:linear-gradient(150deg,#ff5c6c,#7c5cff)">' + C.icon("heart-fill", 44) + "</div>" +
      '<div class="ph-info"><div class="ph-kicker">收藏夹</div>' +
      '<div class="ph-title">我喜欢的音乐</div>' +
      '<div class="ph-meta"><span>' + songs.length + " 首</span>" + (C.isLoggedIn() ? "<span>@" + C.esc(C.currentUser()) + "</span>" : "") + "</div>" +
      '<div class="ph-actions">' +
      '<button class="btn btn-primary" id="favPlayAll">' + C.icon("play", 14) + " 播放全部</button>" +
      '<button class="btn btn-ghost" id="favShuffle">' + C.icon("shuffle", 14) + " 随机</button>" +
      "</div></div></div>";
    html += songs.length ? UI().songListHTML(songs) : UI().emptyState("heart", "收藏夹是空的", "听到喜欢的歌，点一下爱心就能收进来", '<a class="btn btn-primary" href="#/library">去曲库逛逛</a>');
    const el = page(html);
    const pa = $("#favPlayAll", el);
    if (pa) pa.addEventListener("click", () => P().playList(songs.map((s) => s.id), 0));
    const sh = $("#favShuffle", el);
    if (sh) sh.addEventListener("click", () => P().playList(songs.map((s) => s.id), Math.floor(Math.random() * songs.length)));
    return el;
  }

  /* ==================== 播放列表 ==================== */
  function playlists() {
    const pls = C.getPlaylists();
    let html = '<div class="lib-head"><div><div class="lib-title">播放列表</div><div class="lib-count">' + pls.length + " 个歌单</div></div>";
    if (C.isLoggedIn()) {
      html += '<div class="lib-tools"><button class="btn btn-primary" id="plNew" style="height:32px">' + C.icon("plus", 14) + " 新建歌单</button>" +
        '<button class="btn btn-ghost" id="plImport" style="height:32px">' + C.icon("download", 14) + " 导入歌单</button></div>";
    }
    html += "</div>";
    if (!pls.length) {
      html += UI().emptyState(
        "playlist",
        C.isLoggedIn() ? "还没有创建歌单" : "登录后即可创建歌单",
        "歌单可以跨设备同步，也可以分享给好友",
        C.isLoggedIn()
          ? '<button class="btn btn-primary" id="plNew2">创建第一个歌单</button>'
          : '<button class="btn btn-primary" id="plLogin">去登录</button>'
      );
    } else {
      html += '<div class="pl-grid stagger">';
      pls.forEach((p) => {
        html +=
          '<a class="pl-card" href="#/playlist/' + C.esc(p.id) + '">' +
          UI().coverHTML({ c: gradientFrom(p.name), emoji: "🎵" }) +
          '<div class="card-title ellipsis" style="margin-top:9px">' + C.esc(p.name) + "</div>" +
          '<div class="card-sub">' + p.songIds.length + " 首</div></a>";
      });
      html += "</div>";
    }
    const el = page(html);
    const nb = $("#plNew", el) || $("#plNew2", el);
    if (nb) nb.addEventListener("click", createPlaylistFlow);
    const ib = $("#plImport", el);
    if (ib) ib.addEventListener("click", importPlaylistFlow);
    const lb = $("#plLogin", el);
    if (lb) lb.addEventListener("click", () => UI().openAuthModal("login"));
    return el;
  }

  function gradientFrom(name) {
    // 由歌单名生成稳定渐变
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (Math.imul(31, h) + name.charCodeAt(i)) | 0;
    const a = Math.abs(h) % 360;
    return { from: "hsl(" + a + ",70%,58%)", to: "hsl(" + ((a + 50) % 360) + ",66%,42%)" };
  }

  function createPlaylistFlow() {
    if (!C.isLoggedIn()) { UI().toast("请先登录", "error"); UI().openAuthModal("login"); return; }
    UI().confirmDialog({ title: "新建歌单", message: "给新歌单起个名字", input: true, inputPlaceholder: "歌单名称", okText: "创建" }).then((name) => {
      if (!name) return;
      const pl = C.createPlaylist(name);
      location.hash = "#/playlist/" + pl.id;
      UI().toast("歌单已创建", "success");
    });
  }

  /* ---- 歌单导入（网易云 + QQ 音乐） ---- */
  function parsePlaylistUrl(url) {
    url = String(url || "").trim();
    if (!url) return null;
    let m;
    // 网易云：music.163.com/playlist?id=XXX 或 /#/playlist?id=XXX 或 /playlist/XXX/YYY/
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

  async function importPlaylistFlow() {
    if (!C.isLoggedIn()) { UI().toast("请先登录", "error"); UI().openAuthModal("login"); return; }
    const url = await UI().confirmDialog({
      title: "导入歌单",
      message: "粘贴网易云或 QQ 音乐的歌单链接（需为公开歌单）",
      input: true,
      inputPlaceholder: "https://music.163.com/playlist?id=... 或 https://y.qq.com/n/ryqq/playlist/...",
      okText: "导入",
    });
    if (!url) return;
    const parsed = parsePlaylistUrl(url);
    if (!parsed) { UI().toast("无法识别的歌单链接，请粘贴网易云或 QQ 音乐的歌单链接", "error"); return; }

    const isQQ = parsed.source === "qq";
    const endpoint = isQQ
      ? "api/qq.php?action=playlist&id=" + encodeURIComponent(parsed.id)
      : "api/netease.php?action=playlist&id=" + encodeURIComponent(parsed.id);

    UI().toast("正在导入歌单...");
    try {
      const res = await fetch(endpoint);
      const data = await res.json();
      if (!data.ok || !data.data || !data.data.length) {
        UI().toast(data.error || "歌单导入失败（可能为私密歌单）", "error");
        return;
      }
      // 统一注册为外部歌曲（netease 的播放地址由 registerExternal 内部回退拼装）
      const songIds = data.data
        .map((t) => { const full = D.registerExternal(t); return full ? full.id : null; })
        .filter(Boolean);
      if (!songIds.length) { UI().toast("歌单中没有可导入的歌曲", "error"); return; }

      const name = (data.name || (isQQ ? "QQ音乐歌单" : "网易云歌单")).trim() || "导入的歌单";
      C.importPlaylist(name, songIds);
      UI().toast("已导入 " + songIds.length + " 首歌曲到「" + name + "」✅", "success");
      // 同 hash 赋值不会触发 hashchange：已在歌单页时软刷新，否则跳转
      if (location.hash === "#/playlists") global.App.Router.refresh();
      else location.hash = "#/playlists";
    } catch (e) {
      UI().toast("导入失败，请检查网络或链接", "error");
    }
  }

  /* ==================== 歌单详情 ==================== */
  function playlistDetail(params) {
    const pl = C.getPlaylist(params.id);
    if (!pl) {
      return page(UI().emptyState("playlist", "歌单不存在或已删除", "", '<a class="btn btn-primary" href="#/playlists">返回歌单列表</a>'));
    }
    const songs = pl.songIds.map((id) => D.get(id)).filter(Boolean);
    let html =
      '<div class="page-head">' +
      '<div class="ph-cover" style="background:linear-gradient(150deg,' + gradientFrom(pl.name).from + "," + gradientFrom(pl.name).to + ')">' + C.icon("playlist", 40) + "</div>" +
      '<div class="ph-info"><div class="ph-kicker">播放列表</div>' +
      '<div class="ph-title">' + C.esc(pl.name) + "</div>" +
      '<div class="ph-meta"><span>' + songs.length + " 首</span></div>" +
      '<div class="ph-actions">' +
      '<button class="btn btn-primary" id="pdPlay">' + C.icon("play", 14) + " 播放全部</button>" +
      '<button class="btn btn-ghost" id="pdShuffle">' + C.icon("shuffle", 14) + " 随机</button>" +
      '<button class="btn btn-ghost" id="pdRename">' + C.icon("edit", 14) + " 重命名</button>" +
      '<button class="btn btn-danger" id="pdDelete">' + C.icon("trash", 14) + " 删除</button>" +
      "</div></div></div>";
    html += songs.length ? UI().songListHTML(songs) : UI().emptyState("music", "歌单还是空的", "在歌曲菜单里选择「添加到歌单」", '<a class="btn btn-ghost" href="#/library">去曲库添加</a>');
    const el = page(html);

    $("#pdPlay", el).addEventListener("click", () => P().playList(songs.map((s) => s.id), 0));
    $("#pdShuffle", el).addEventListener("click", () => P().playList(songs.map((s) => s.id), Math.floor(Math.random() * songs.length)));
    $("#pdRename", el).addEventListener("click", () =>
      UI().confirmDialog({ title: "重命名歌单", message: "输入新的歌单名称", input: true, inputValue: pl.name, okText: "保存" }).then((name) => {
        if (!name || name === pl.name) return;
        C.renamePlaylist(pl.id, name);
        UI().toast("已重命名", "success");
        global.App.Router.refresh();
      })
    );
    $("#pdDelete", el).addEventListener("click", () =>
      UI().confirmDialog({ title: "删除歌单", message: "删除后无法恢复，确定删除「" + pl.name + "」吗？", okText: "删除" }).then((ok) => {
        if (!ok) return;
        C.deletePlaylist(pl.id);
        UI().toast("歌单已删除");
        location.hash = "#/playlists";
      })
    );
    // 行内菜单增加「从歌单移除」
    $$("[data-action='song-menu']", el).forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const song = D.get(b.dataset.song);
        UI().contextMenu(
          [
            { icon: "close", label: "从歌单移除", danger: true, onClick: () => {
                C.removeFromPlaylist(pl.id, song.id);
                UI().toast("已移除");
                global.App.Router.refresh();
              } },
            { sep: true },
            { icon: "play", label: "立即播放", onClick: () => P().playList([song.id], 0) },
            { icon: "users", label: "分享给好友", onClick: () => UI().openShareModal(song) },
          ],
          e.clientX - 160,
          e.clientY
        );
      })
    );
    return el;
  }

  /* ==================== 收听历史 ==================== */
  function historyPage() {
    const data = C.isLoggedIn() ? C.getUserData() : null;
    const items = data ? data.history.slice().sort((a, b) => (b.last || 0) - (a.last || 0)) : [];
    const songs = items.map((h) => D.get(h.id)).filter(Boolean);
    let html =
      '<div class="page-head">' +
      '<div class="ph-cover" style="background:linear-gradient(150deg,#38bdf8,#7c5cff)">' + C.icon("history", 40) + "</div>" +
      '<div class="ph-info"><div class="ph-kicker">最近播放</div>' +
      '<div class="ph-title">收听历史</div>' +
      '<div class="ph-meta"><span>' + songs.length + " 条记录</span></div>" +
      '<div class="ph-actions">' +
      '<button class="btn btn-primary" id="hisPlay">' + C.icon("play", 14) + " 播放全部</button>" +
      '<button class="btn btn-ghost" id="hisClear">' + C.icon("trash", 14) + " 清空历史</button>" +
      "</div></div></div>";
    if (!songs.length) {
      html += UI().emptyState("history", "还没有收听记录", "播放过的歌曲会出现在这里");
    } else {
      html +=
        '<div class="lib-list stagger">' +
        songs
          .map((s, i) => {
            const row = UI().songRow(s, i, { index: false });
            return row.replace('</div>$', '<span class="sr-time">' + C.fmtTime(items[i].last) + "</span></div>");
          })
          .join("") +
        "</div>";
    }
    const el = page(html);
    // 给每行插入时间（songRow 之后追加一列简单处理：用标题后缀）
    const pa = $("#hisPlay", el);
    if (pa) pa.addEventListener("click", () => P().playList(songs.map((s) => s.id), 0));
    const cl = $("#hisClear", el);
    if (cl) cl.addEventListener("click", () =>
      UI().confirmDialog({ title: "清空历史", message: "确定清空全部收听历史吗？", okText: "清空" }).then((ok) => {
        if (!ok) return;
        const d = C.getUserData();
        d.history = [];
        C.saveUserData(C.currentUser(), d);
        UI().toast("已清空");
        global.App.Router.refresh();
      })
    );
    return el;
  }

  /* ==================== 社交 ==================== */
  const socialState = { tab: "friends", friends: [], online: [], shares: [] };

  function social() {
    let html =
      '<div class="social-tabs">' +
      '<button class="stab' + (socialState.tab === "friends" ? " active" : "") + '" data-stab="friends">' + C.icon("users", 15) + " 关注</button>" +
      '<button class="stab' + (socialState.tab === "online" ? " active" : "") + '" data-stab="online">' + C.icon("trend", 15) + " 在线</button>" +
      '<button class="stab' + (socialState.tab === "inbox" ? " active" : "") + '" data-stab="inbox">' + C.icon("inbox", 15) + " 收件箱<span class='stab-badge' id='socialBadge' hidden>0</span></button>" +
      "</div>";
    html += '<div id="socialBody"></div>';
    const el = page(html);

    function renderBody() {
      const body = $("#socialBody", el);
      if (!C.isLoggedIn()) {
        body.innerHTML = UI().emptyState("users", "登录后解锁社交功能", "添加好友、分享歌曲、看看谁在线", '<button class="btn btn-primary" id="socialLogin">去登录</button>');
        $("#socialLogin", body).addEventListener("click", () => UI().openAuthModal("login"));
        return;
      }
      if (socialState.tab === "friends") body.innerHTML = friendsPane();
      else if (socialState.tab === "online") body.innerHTML = onlinePane();
      else body.innerHTML = inboxPane();
      bindPane(body);
    }

    function friendsPane() {
      let h =
        '<div class="search-box" style="height:42px;margin-bottom:16px">' + C.icon("user-plus", 16) +
        '<input id="friendSearch" placeholder="搜索用户名 / ID 添加好友" autocomplete="off" /></div>"';
      h = h.replace('</div>"', "</div>");
      h += '<div id="friendList"></div>';
      return h;
    }

    function onlinePane() {
      return '<div class="sec-head"><div class="sec-title">在线好友</div><div class="sec-sub">5 分钟内有活动</div></div><div id="onlineList"><div class="loading-box"><span class="spinner"></span>加载中…</div></div>';
    }

    function inboxPane() {
      return '<div id="shareList"><div class="loading-box"><span class="spinner"></span>加载中…</div></div>';
    }

    function bindPane(body) {
      $$("[data-stab]", el).forEach((b) =>
        b.addEventListener("click", () => {
          socialState.tab = b.dataset.stab;
          $$("[data-stab]", el).forEach((x) => x.classList.toggle("active", x === b));
          renderBody();
        })
      );
      if (!C.isLoggedIn()) return;

      if (socialState.tab === "friends") {
        const input = $("#friendSearch", body);
        const list = $("#friendList", body);
        const loadFriends = async () => {
          const r = await C.social.listFriends();
          socialState.friends = r.ok ? r.data || [] : [];
          renderFriends(list);
        };
        const renderFriends = (list) => {
          if (!socialState.friends.length) {
            list.innerHTML = UI().emptyState("users", "还没有关注任何人", "在上方搜索用户名，关注感兴趣的人吧");
            return;
          }
          list.innerHTML = '<div class="menu-list">' + socialState.friends.map((f) =>
            '<div class="user-row">' +
            '<span class="ur-avatar" style="background:' + C.gradientFor(f.username) + '">' + C.esc((f.nickname || f.username || "?")[0].toUpperCase()) +
            (f.online ? '<span class="ur-online"></span>' : '<span class="ur-online off"></span>') + "</span>" +
            '<div class="ur-main"><div class="ur-name">' + C.esc(f.nickname || f.username) + "</div>" +
            '<div class="ur-sub">@' + C.esc(f.username) + (f.online ? " · 在线" : "") + "</div></div>" +
            '<div class="ur-ops">' +
            '<a class="btn btn-ghost" style="height:30px;padding:0 12px;font-size:0.76rem" href="#/user/' + f.id + '">主页</a>' +
            '<button class="btn btn-danger" style="height:30px;padding:0 12px;font-size:0.76rem" data-rm="' + f.id + '">取消关注</button>' +
            "</div></div>"
          ).join("") + "</div>";
          $$("[data-rm]", list).forEach((b) =>
            b.addEventListener("click", async () => {
              const r = await C.social.removeFriend(b.dataset.rm);
              UI().toast(r.ok ? "已删除好友" : r.error || "操作失败", r.ok ? "success" : "error");
              if (r.ok) loadFriends();
            })
          );
        };
        loadFriends();
        const doSearch = C.debounce(async () => {
          const q = input.value.trim();
          if (!q) { renderFriends(); return; }
          const r = await C.social.searchUsers(q);
          if (r.ok && r.data && r.data.length) {
            list.innerHTML = '<div style="font-size:0.76rem;color:var(--text-3);margin:8px 2px">搜索结果</div><div class="menu-list">' + r.data.map((u) =>
              '<div class="user-row">' +
              '<span class="ur-avatar" style="background:' + C.gradientFor(u.username) + '">' + C.esc((u.nickname || u.username || "?")[0].toUpperCase()) + "</span>" +
              '<div class="ur-main"><div class="ur-name">' + C.esc(u.nickname || u.username) + "</div>" +
              '<div class="ur-sub">@' + C.esc(u.username) + "</div></div>" +
              '<div class="ur-ops"><button class="btn btn-primary" style="height:30px;padding:0 12px;font-size:0.76rem" data-add="' + (u.id || "") + '" data-uid="' + C.esc(u.username) + '">加好友</button></div></div>'
            ).join("") + "</div>";
            $$("[data-add]", list).forEach((b) =>
              b.addEventListener("click", async () => {
                const r = await C.social.addFriend(b.dataset.uid, false);
                UI().toast(r.ok ? "已添加好友" : r.error || "添加失败", r.ok ? "success" : "error");
                if (r.ok) { input.value = ""; loadFriends(); }
              })
            );
          } else {
            list.innerHTML = UI().emptyState("search", "没有找到用户", "换个关键词试试");
          }
        }, 400);
        input.addEventListener("input", doSearch);
      }

      if (socialState.tab === "online") {
        const list = $("#onlineList", body);
        C.social.listOnline().then((r) => {
          if (!r.ok || !r.data || !r.data.length) {
            list.innerHTML = UI().emptyState("trend", "当前没有好友在线", "好友 5 分钟内有活动就会显示在这里");
            return;
          }
          list.innerHTML = '<div class="card-grid">' + r.data.map((u) =>
            '<a class="song-card" href="#/user/' + u.id + '" style="cursor:pointer">' +
            '<div style="display:flex;align-items:center;gap:12px">' +
            '<span class="ur-avatar" style="width:52px;height:52px;background:' + C.gradientFor(u.username) + '">' + C.esc((u.nickname || u.username || "?")[0].toUpperCase()) + '<span class="ur-online"></span></span>' +
            '<div class="grow"><div class="card-title ellipsis">' + C.esc(u.nickname || u.username) + "</div>" +
            '<div class="card-sub ellipsis">@' + C.esc(u.username) + "</div></div></div></a>"
          ).join("") + "</div>";
        });
      }

      if (socialState.tab === "inbox") {
        const list = $("#shareList", body);
        const seen = C.read("mp_v1_shares_seen", []);
        C.social.listShares().then((r) => {
          if (!r.ok || !r.data || !r.data.length) {
            list.innerHTML = UI().emptyState("inbox", "收件箱是空的", "好友分享的歌曲会出现在这里");
            return;
          }
          list.innerHTML = r.data.map((s) => {
            const song = s.song || {};
            const cover = song.coverUrl
              ? '<img src="' + C.esc(song.coverUrl) + '" alt=""/>'
              : (song.emoji || "🎵");
            const style = song.coverUrl ? "background:#111" : "background:" + C.gradientFor(song.title || "wave");
            return (
              '<div class="share-card">' +
              '<div class="sc-cover" style="' + style + '">' + cover + "</div>" +
              '<div class="sc-body">' +
              '<div class="sc-from"><b>' + C.esc(s.from_name || s.from_username || "好友") + "</b> 给你分享了一首歌</div>" +
              '<div class="sc-title">' + C.esc(song.title || "未知曲目") + "</div>" +
              '<div class="sc-msg">' + C.esc(song.artist || "") + (s.message ? " · " + C.esc(s.message) : "") + "</div>" +
              '<div class="sc-time">' + C.fmtTime(s.created_at || Date.now()) + "</div>" +
              "</div>" +
              '<div class="sc-ops">' +
              '<button class="btn btn-primary" style="height:30px;padding:0 12px;font-size:0.76rem" data-shareplay=\'' + C.esc(JSON.stringify({ id: song.id, title: song.title, artist: song.artist, album: song.album, coverUrl: song.coverUrl, duration: song.duration, source: song.source })) + '\'>播放</button>' +
              "</div></div>"
            );
          }).join("");
          $$("[data-shareplay]", list).forEach((b) =>
            b.addEventListener("click", () => {
              try {
                const raw = JSON.parse(b.dataset.shareplay);
                const full = D.registerExternal(raw);
                if (full) P().playList([full.id], 0);
              } catch (e) { UI().toast("歌曲信息已失效", "error"); }
            })
          );
          // 标记已读
          const ids = r.data.map((s) => s.id);
          C.write("mp_v1_shares_seen", Array.from(new Set(seen.concat(ids))).slice(-100));
          UI().updateSocialBadge();
        });
      }
    }

    renderBody();
    return el;
  }

  /* ==================== 他人主页 ==================== */
  function userDetail(params) {
    const el = page('<div class="loading-box"><span class="spinner"></span>加载中…</div>');
    C.social.viewProfile(params.id).then((r) => {
      if (!r.ok || !r.profile) {
        el.innerHTML = UI().emptyState("user", "无法查看该用户", "可能设置了隐私或用户不存在", '<a class="btn btn-primary" href="#/social">返回社交</a>');
        return;
      }
      const p = r.profile;
      el.innerHTML =
        '<div class="profile-hero">' +
        '<span class="pf-avatar" style="background:' + C.gradientFor(p.username) + '">' + (p.avatar ? '<img src="' + C.esc(p.avatar) + '" alt=""/>' : C.esc((p.nickname || p.username || "?")[0].toUpperCase())) + "</span>" +
        '<div class="grow"><div class="pf-name">' + C.esc(p.nickname || p.username) + "</div>" +
        '<div class="pf-sig">' + (p.signature ? C.esc(p.signature) : "这个人很懒，什么都没写") + "</div>" +
        '<div class="pf-tags">' +
        (p.region ? '<span class="pf-tag">' + C.esc(p.region) + "</span>" : "") +
        (p.gender ? '<span class="pf-tag">' + ({ male: "男", female: "女", secret: "保密" }[p.gender] || "保密") + "</span>" : "") +
        (p.age ? '<span class="pf-tag">' + p.age + " 岁</span>" : "") +
        (p.interests ? String(p.interests).split(/[,，]/).filter(Boolean).map((i) => '<span class="pf-tag">' + C.esc(i.trim()) + "</span>").join("") : "") +
        "</div></div>" +
        '<div class="ph-actions"><button class="btn btn-primary" id="udAdd">' + C.icon("user-plus", 14) + " 加好友</button></div>" +
        "</div>";
      // 关注（后端以好友关系承载）：先查关系，再决定按钮文案与动作
      const add = $("#udAdd", el);
      if (add && C.isLoggedIn()) {
        const paint = (on) => {
          add.className = "btn " + (on ? "btn-ghost" : "btn-primary");
          add.innerHTML = C.icon(on ? "check" : "user-plus", 14) + (on ? " 已关注" : " 关注");
          add.setAttribute("aria-pressed", on ? "true" : "false");
        };
        C.social.listFriends().then((fr) => {
          paint(fr.ok && (fr.data || []).some((f) => Number(f.id) === Number(p.id)));
        });
        add.addEventListener("click", async () => {
          const on = add.getAttribute("aria-pressed") === "true";
          const rr = on ? await C.social.removeFriend(p.id) : await C.social.addFriend(p.id, true);
          UI().toast(rr.ok ? (on ? "已取消关注" : "已关注") : rr.error || "操作失败", rr.ok ? "success" : "error");
          if (rr.ok) paint(!on);
        });
      } else if (add) {
        add.textContent = "登录后关注";
        add.addEventListener("click", () => UI().openAuthModal("login"));
      }
    });
    return el;
  }

  /* ==================== 我的 ==================== */
  /* ==================== 音乐库导入 / 同步 ====================
     免登录：网易云的「用户歌单列表」与「歌单详情」本身就是公开接口，
     只要知道 UID 或歌单 ID 就能读。所以这里不要求用户给账号密码。 */
  const IMPORTS_KEY = "mp_v1_ncimport";

  function readImports() {
    try { return JSON.parse(localStorage.getItem(IMPORTS_KEY) || "null") || { uid: 0, nickname: "", bound: [] }; }
    catch (e) { return { uid: 0, nickname: "", bound: [] }; }
  }
  function writeImports(v) {
    try { localStorage.setItem(IMPORTS_KEY, JSON.stringify(v)); } catch (e) { /* 配额 */ }
  }

  // 从粘贴内容里解析出 uid 或歌单 id
  function parseNeteaseInput(raw) {
    const t = (raw || "").trim();
    if (!t) return null;
    const host = /(?:https?:\/\/)?(?:www\.)?music\.163\.com/i.test(t);
    if (host) {
      const uid = /[?&#]id=(\d+)/.exec(t);
      const isUser = /\/(?:user\/home|#\/user)/i.test(t);
      if (!uid) return null;
      return isUser ? { kind: "user", id: uid[1] } : { kind: "playlist", id: uid[1] };
    }
    if (/^\d+$/.test(t)) return { kind: "user", id: t, ambiguous: true };
    return null;
  }

  function importMusic() {
    const st = readImports();
    const el = page(
      '<div class="sec"><div class="sec-head"><div class="sec-title">音乐库导入</div>' +
      '<div class="sec-sub">免登录 · 按 UID 或歌单链接同步</div></div>' +
      '<div class="set-card">' +
      '<div class="set-row" style="display:block">' +
      '<div class="imp-input">' + C.icon("link", 15) +
      '<input id="impInput" placeholder="粘贴网易云 UID、个人主页链接或歌单链接" value="' +
      C.esc(st.uid ? String(st.uid) : "") + '" autocomplete="off" />' +
      '<button class="btn btn-primary" id="impRead" style="height:34px">读取</button></div>' +
      '<div class="imp-hint">个人主页链接形如 https://music.163.com/#/user/home?id=123456 —— 那个 id 就是 UID。' +
      '歌单链接里 <code>id=</code> 后面的是歌单 ID。两种方式都不需要登录，也不需要你的密码。</div>' +
      "</div></div></div>" +
      '<div id="impBody"></div>'
    );

    const body = $("#impBody", el);
    const input = $("#impInput", el);
    let pending = [];   // 读取到的歌单
    let mode = null;    // user | playlist

    function renderEmpty() {
      const b = st.bound || [];
      if (!b.length) {
        body.innerHTML = UI().emptyState("playlist", "还没有绑定任何歌单", "在上面粘贴 UID 或歌单链接，点「读取」");
        return;
      }
      let h = '<div class="set-card"><div class="set-row" style="display:block">';
      h += '<div class="imp-bound-head">已绑定 · ' + C.esc(st.nickname || ("UID " + st.uid)) +
        '</div><div class="imp-bound">';
      b.forEach((x) => {
        h += '<div class="imp-item"><span class="imp-name">' + C.esc(x.name) + "</span>" +
          '<span class="imp-meta">' + (x.localId === "__fav__" ? "已导入为收藏" : "已导入为歌单") +
          " · " + x.count + " 首</span></div>";
      });
      h += '</div><div class="imp-actions">' +
        '<button class="btn btn-ghost" id="impSync" style="height:32px">同步新歌</button>' +
        '<button class="btn btn-ghost" id="impClear" style="height:32px">解除绑定</button></div>';
      h += "</div></div>";
      body.innerHTML = h;
      $("#impSync", el).addEventListener("click", doSync);
      $("#impClear", el).addEventListener("click", () => {
        writeImports({ uid: 0, nickname: "", bound: [] });
        global.App.Router.refresh();
      });
    }

    function renderPick(list, kind) {
      pending = list;
      mode = kind;
      let h = '<div class="set-card"><div class="set-row" style="display:block">';
      h += '<div class="imp-bound-head">选择要导入的内容</div><div class="imp-pick">';
      list.forEach((p, i) => {
        h += '<label class="imp-pick-row"><input type="checkbox" data-pick="' + i + '"' +
          (p.isFav ? " checked" : "") + " />" +
          '<span class="imp-name">' + C.esc(p.name) + "</span>" +
          (p.isFav ? '<span class="imp-tag">收藏</span>' : "") +
          '<span class="imp-meta">' + p.trackCount + " 首</span></label>";
      });
      h += '</div><div class="imp-actions">' +
        '<button class="btn btn-primary" id="impGo" style="height:34px">导入选中</button>' +
        '<button class="btn btn-ghost" id="impCancel" style="height:32px">取消</button></div>';
      h += "</div></div>";
      body.innerHTML = h;
      $("#impGo", el).addEventListener("click", doImport);
      $("#impCancel", el).addEventListener("click", () => { pending = []; renderEmpty(); });
    }

    async function doFetch() {
      const parsed = parseNeteaseInput(input.value);
      if (!parsed) { UI().toast("没能识别，请粘贴 UID 或 music.163.com 的链接", "error"); return; }
      body.innerHTML = '<div class="loading-box"><span class="spinner"></span>正在读取…</div>';
      try {
        if (parsed.kind === "user") {
          const r = await C.apiGet("netease.php", { action: "user", uid: parsed.id });
          if (!r.ok || !r.playlists) {
            body.innerHTML = '<div class="src-note">' + C.esc(r.error || "读取失败") + "</div>" + UI().emptyState("user", "读取不到这个用户", "确认 UID 正确，且该用户主页不是隐私的");
            return;
          }
          st.uid = parseInt(parsed.id, 10);
          st.nickname = r.nickname || "";
          writeImports(st);
          renderPick(r.playlists, "user");
        } else {
          const r = await C.apiGet("netease.php", { action: "playlist", id: parsed.id });
          if (!r.ok || !r.data) {
            body.innerHTML = '<div class="src-note">' + C.esc(r.error || "读取失败") + "</div>" + UI().emptyState("playlist", "读取不到这个歌单", "确认链接里的 id，且歌单不是隐私的");
            return;
          }
          renderPick([{ id: r.id, name: r.name, trackCount: r.trackCount, isFav: false }], "playlist");
        }
      } catch (e) {
        UI().toast("网络错误，稍后再试", "error");
        renderEmpty();
      }
    }

    async function runImport(picks, onProgress) {
      let favAdded = 0;
      const bound = (st.bound || []).slice();
      for (let i = 0; i < picks.length; i++) {
        const p = picks[i];
        if (onProgress) onProgress(i + 1, picks.length, p.name);
        const r = await C.apiGet("netease.php", { action: "playlist", id: p.id });
        if (!r.ok || !r.data) continue;
        const songs = D.registerMany(r.data);
        const ids = songs.map((x) => x.id);
        let localId;
        if (p.isFav) {
          // 「xxx喜欢的音乐」= 网易的收藏，导入成站内收藏
          favAdded += C.addFavorites(ids);
          localId = "__fav__";
        } else {
          let exist = bound.find((b) => b.remoteId === p.id && b.localId !== "__fav__");
          if (exist && global.App.Core.getPlaylists().some((pl) => pl.id === exist.localId)) {
            // 已导入过：增量补新歌，不重复建歌单
            const cur = global.App.Core.getPlaylists().find((pl) => pl.id === exist.localId);
            const have = new Set(cur.songIds || []);
            const fresh = ids.filter((id) => !have.has(id));
            if (fresh.length) {
              const d = global.App.Core.getUserData();
              const t = d.playlists.find((pl) => pl.id === exist.localId);
              if (t) { t.songIds = fresh.concat(t.songIds); global.App.Core.saveUserData(global.App.Core.currentUser(), d); }
            }
            exist.count = ids.length;
            localId = exist.localId;
          } else {
            const pl = C.importPlaylist(p.name, ids);
            if (!pl) { UI().toast("请先登录再导入歌单", "error"); return { favAdded: 0, bound: bound }; }
            localId = pl.id;
          }
        }
        const rec = { remoteId: p.id, name: p.name, localId: localId, count: ids.length };
        const idx = bound.findIndex((b) => b.remoteId === p.id);
        if (idx >= 0) bound[idx] = rec; else bound.push(rec);
      }
      st.bound = bound;
      writeImports(st);
      return { favAdded: favAdded, bound: bound };
    }

    async function doImport() {
      const picks = [];
      $$("[data-pick]", el).forEach((b) => { if (b.checked) picks.push(pending[+b.dataset.pick]); });
      if (!picks.length) { UI().toast("至少选一个", "error"); return; }
      body.innerHTML = '<div class="loading-box"><span class="spinner"></span>正在导入…</div>';
      const res = await runImport(picks, (i, n, name) => {
        const box = $(".loading-box", body);
        if (box) box.innerHTML = '<span class="spinner"></span>正在导入 ' + i + "/" + n + "：" + C.esc(name);
      });
      UI().toast("已导入 " + picks.length + " 项" + (res.favAdded ? "，收藏新增 " + res.favAdded + " 首" : ""), "success");
      // 重新读一次绑定状态再渲染
      const fresh = readImports();
      st.bound = fresh.bound; st.uid = fresh.uid; st.nickname = fresh.nickname;
      renderEmpty();
      UI().renderSidebarPlaylists && UI().renderSidebarPlaylists();
    }

    async function doSync() {
      if (!(st.bound || []).length) return;
      body.innerHTML = '<div class="loading-box"><span class="spinner"></span>正在同步…</div>';
      let added = 0;
      const list = st.bound.slice();
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        const box = $(".loading-box", body);
        if (box) box.innerHTML = '<span class="spinner"></span>正在同步 ' + (i + 1) + "/" + list.length + "：" + C.esc(b.name);
        const r = await C.apiGet("netease.php", { action: "playlist", id: b.remoteId });
        if (!r.ok || !r.data) continue;
        const ids = D.registerMany(r.data).map((x) => x.id);
        const cur = C.getUserData();
        if (b.localId === "__fav__") {
          added += C.addFavorites(ids);
        } else {
          const t = cur.playlists.find((pl) => pl.id === b.localId);
          if (t) {
            const have = new Set(t.songIds || []);
            const fresh = ids.filter((id) => !have.has(id));
            if (fresh.length) { t.songIds = fresh.concat(t.songIds); C.saveUserData(C.currentUser(), cur); added += fresh.length; }
          }
        }
        b.count = ids.length;
      }
      writeImports(st);
      UI().toast(added ? "新增 " + added + " 首" : "已是最新，没有新歌", added ? "success" : "info");
      renderEmpty();
    }

    $("#impRead", el).addEventListener("click", doFetch);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") doFetch(); });
    renderEmpty();
    return el;
  }

  function profile() {
    if (!C.isLoggedIn()) {
      return page(UI().emptyState("user", "还没有登录", "登录后即可同步收藏、歌单与收听历史", '<button class="btn btn-primary" id="pfLogin">登录 / 注册</button>'));
    }
    const u = C.currentUser();
    const favs = C.getFavorites().length;
    const pls = C.getPlaylists().length;
    const his = (C.getUserData().history || []).length;
    const totalPlays = Object.values(C.getPlays()).reduce((a, b) => a + b, 0);

    const el = page(
      '<div class="profile-hero">' +
      '<span class="pf-avatar" id="pfAvatar">' + C.esc(u[0].toUpperCase()) + "</span>" +
      '<div class="grow"><div class="pf-name">' + C.esc(u) + ' <span style="font-size:0.72rem;color:var(--text-3);font-weight:400">@' + C.esc(u) + "</span></div>" +
      '<div class="pf-sig" id="pfSig">这个人很懒，什么都没写</div>' +
      '<div class="pf-tags" id="pfTags"></div></div>' +
      '<button class="btn btn-ghost" id="pfEdit">' + C.icon("edit", 14) + " 编辑资料</button></div>" +

      '<div class="stat-row">' +
      statCard(favs, "收藏歌曲", "#/favorites") +
      statCard(pls, "创建歌单", "#/playlists") +
      statCard(his, "收听历史", "#/history") +
      statCard(totalPlays, "全局播放", "") +
      "</div>" +

      '<div class="menu-list">' +
      '<button class="menu-row" id="pfEdit2"><span class="mr-ic">' + C.icon("edit", 17) + '</span>编辑个人资料<span class="mr-chev">' + C.icon("chev-right", 15) + "</span></button>" +
      '<button class="menu-row" id="pfSettings"><span class="mr-ic">' + C.icon("settings", 17) + '</span>设置<span class="mr-chev">' + C.icon("chev-right", 15) + "</span></button>" +
      '<a class="menu-row" href="https://github.com/wyq1683/wyqaimusic" target="_blank" rel="noopener"><span class="mr-ic">' + C.icon("external", 17) + '</span>GitHub 开源仓库<span class="mr-chev">' + C.icon("external", 14) + "</span></a>" +
      '<button class="menu-row danger" id="pfLogout"><span class="mr-ic">' + C.icon("logout", 17) + '</span>退出登录</button>' +
      "</div>"
    );

    C.getProfile().then((p) => {
      if (!p) return;
      if (p.nickname) $(".pf-name", el).innerHTML = C.esc(p.nickname) + ' <span style="font-size:0.72rem;color:var(--text-3);font-weight:400">@' + C.esc(u) + "</span>";
      if (p.signature) $("#pfSig", el).textContent = p.signature;
      const av = $("#pfAvatar", el);
      if (p.avatar) { av.innerHTML = '<img src="' + C.esc(p.avatar) + '" alt=""/>'; av.style.background = "#111"; }
      const tags = [];
      if (p.region) tags.push(p.region);
      if (p.hobby) p.hobby.split(/[,，]/).filter(Boolean).slice(0, 3).forEach((h) => tags.push(h.trim()));
      $("#pfTags", el).innerHTML = tags.map((t) => '<span class="pf-tag">' + C.esc(t) + "</span>").join("");
    });

    const edit = () => openProfileEdit(() => global.App.Router.refresh());
    $("#pfEdit", el).addEventListener("click", edit);
    $("#pfEdit2", el).addEventListener("click", edit);
    $("#pfSettings", el).addEventListener("click", () => { location.hash = "#/settings"; });
    $("#pfLogout", el).addEventListener("click", () =>
      UI().confirmDialog({ title: "退出登录", message: "确定退出当前账号吗？", okText: "退出" }).then((ok) => {
        if (!ok) return;
        C.logout();
        UI().toast("已退出登录");
        location.hash = "#/home";
      })
    );
    return el;

    function statCard(num, label, href) {
      const inner = '<div class="stat-num">' + num + '</div><div class="stat-label">' + C.esc(label) + "</div>";
      return href ? '<a class="stat-card" href="' + href + '">' + inner + "</a>" : '<div class="stat-card">' + inner + "</div>";
    }
  }

  /* ==================== 编辑资料 ==================== */
  function openProfileEdit(done) {
    if (!C.isLoggedIn()) { UI().openAuthModal("login"); return; }
    C.getProfile(true).then((p) => {
      p = p || {};
      const body =
        '<div style="display:flex;align-items:center;gap:14px;margin-bottom:16px">' +
        '<span class="pf-avatar" id="peAvatar" style="width:56px;height:56px;font-size:1.3rem;background:' + (p.avatar ? "#111" : C.gradientFor(C.currentUser())) + '">' +
        (p.avatar ? '<img src="' + C.esc(p.avatar) + '" alt=""/>' : C.esc(C.currentUser()[0].toUpperCase())) + "</span>" +
        '<div class="grow"><input class="field-input" id="peAvatarUrl" placeholder="头像图片 URL" value="' + C.esc(p.avatar || "") + '" />' +
        '<label class="btn btn-ghost" style="margin-top:6px;height:30px;font-size:0.76rem;cursor:pointer">上传图片<input type="file" id="peAvatarFile" accept="image/*" hidden /></label></div></div>' +
        '<div class="field"><label class="field-label">昵称</label><input class="field-input" id="peNickname" maxlength="32" placeholder="你的昵称" value="' + C.esc(p.nickname || "") + '" /></div>' +
        '<div class="field"><label class="field-label">个性签名</label><textarea class="field-input" id="peSig" maxlength="100" rows="2" placeholder="写一句你的个性签名">' + C.esc(p.signature || "") + "</textarea></div>" +
        '<div style="display:flex;gap:10px"><div class="field grow"><label class="field-label">地区</label><input class="field-input" id="peRegion" maxlength="64" placeholder="如：河南 洛阳" value="' + C.esc(p.region || "") + '" /></div>' +
        '<div class="field grow"><label class="field-label">年龄</label><input class="field-input" id="peAge" type="number" min="1" max="150" placeholder="年龄" value="' + (p.age || "") + '" /></div></div>' +
        '<div class="field"><label class="field-label">爱好（逗号分隔）</label><input class="field-input" id="peHobby" maxlength="120" placeholder="如：音乐、航拍、旅行" value="' + C.esc(p.hobby || "") + '" /></div>' +
        '<div class="field"><label class="field-label">我的兴趣流派（用于推荐，最多 8 个）</label><div class="chip-row" id="peInterests">' +
        D.GENRES.map((g) => '<button class="chip' + ((p.interests || "").includes(g) ? " active" : "") + '" data-interest="' + g + '">' + g + "</button>").join("") +
        "</div></div>";

      UI().modal({
        title: "编辑个人资料",
        body,
        width: "460px",
        actions: { cancel: "取消", ok: "保存" },
        onOk: async (box, close) => {
          const fields = {
            nickname: $("#peNickname", box).value.trim(),
            avatar: $("#peAvatarUrl", box).value.trim(),
            signature: $("#peSig", box).value.trim(),
            region: $("#peRegion", box).value.trim(),
            age: parseInt($("#peAge", box).value, 10) || null,
            hobby: $("#peHobby", box).value.trim(),
            interests: $$("[data-interest].active", box).map((b) => b.dataset.interest).join(","),
          };
          const r = await C.updateProfile(fields);
          if (r.ok) { close(); UI().toast("资料已保存", "success"); if (done) done(); }
          else UI().toast(r.error || "保存失败", "error");
        },
      });

      // 兴趣 chips 多选
      $$("[data-interest]").forEach((b) => b.addEventListener("click", () => {
        const actives = $$("[data-interest].active");
        if (!b.classList.contains("active") && actives.length >= 8) { UI().toast("最多选择 8 个兴趣"); return; }
        b.classList.toggle("active");
      }));
      // 头像上传
      const file = $("#peAvatarFile");
      if (file) file.addEventListener("change", async () => {
        if (!file.files || !file.files[0]) return;
        const r = await C.uploadAvatar(file.files[0]);
        if (r.ok && r.url) {
          $("#peAvatarUrl").value = r.url;
          $("#peAvatar").innerHTML = '<img src="' + C.esc(r.url) + '" alt=""/>';
          UI().toast("头像已上传", "success");
        } else UI().toast(r.error || "上传失败", "error");
      });
    });
  }

  /* ==================== 艺人 / 专辑 ==================== */
  function artist(params) {
    const a = D.getArtist(params.name);
    if (!a) return page(UI().emptyState("user", "没有找到这位艺人", "", '<a class="btn btn-primary" href="#/library">去曲库</a>'));
    return detailPage({
      round: true,
      art: a.songs[0],
      kicker: "艺人",
      title: a.name,
      meta: a.count + " 首歌曲",
      songs: a.songs,
    });
  }

  function album(params) {
    const a = D.getAlbum(params.name);
    if (!a) return page(UI().emptyState("disc", "没有找到这张专辑", "", '<a class="btn btn-primary" href="#/library">去曲库</a>'));
    return detailPage({
      round: false,
      art: a.songs[0],
      kicker: "专辑 · " + a.artist,
      title: a.name,
      meta: a.count + " 首歌曲",
      songs: a.songs,
    });
  }

  function detailPage(o) {
    let html =
      '<div class="detail-hero" style="--hero-grad:linear-gradient(135deg,' + o.art.c.from + "33,transparent)" + '">' +
      '<div class="dh-art' + (o.round ? " round" : "") + '" style="background:linear-gradient(150deg,' + o.art.c.from + "," + o.art.c.to + ')">' + (o.art.emoji || "🎵") + "</div>" +
      '<div class="ph-info"><div class="ph-kicker">' + C.esc(o.kicker) + "</div>" +
      '<div class="ph-title">' + C.esc(o.title) + "</div>" +
      '<div class="ph-meta"><span>' + C.esc(o.meta) + "</span></div>" +
      '<div class="ph-actions">' +
      '<button class="btn btn-primary" id="dpPlayAll">' + C.icon("play", 14) + " 播放全部</button>" +
      '<button class="btn btn-ghost" id="dpShuffle">' + C.icon("shuffle", 14) + " 随机播放</button>" +
      "</div></div></div>";
    html += UI().songListHTML(o.songs);
    const el = page(html);
    $("#dpPlayAll", el).addEventListener("click", () => P().playList(o.songs.map((s) => s.id), 0));
    $("#dpShuffle", el).addEventListener("click", () => P().playList(o.songs.map((s) => s.id), Math.floor(Math.random() * o.songs.length)));
    return el;
  }

  /* ==================== 正在播放 ==================== */
  function nowPlaying() {
    const song0 = P().currentSong();
    if (!song0) {
      return page(UI().emptyState("music", "还没有开始播放", "选一首歌，进入沉浸模式", '<a class="btn btn-primary" href="#/library">去曲库</a>'));
    }
    let npSong = song0; // 跟随 player:changed 原地更新，避免整页重挂载
    let html =
      '<div class="np-page">' +
      '<div class="np-immerse" id="npImmerse"></div>' +
      '<button class="np-mode-exit" id="npModeExit" type="button" hidden>' + C.icon("close", 13) + " 退出</button>" +
      '<div class="np-cover-wrap">' +
      '<div class="np-cover spinning" id="npCover" style="background:linear-gradient(150deg,' + npSong.c.from + "," + npSong.c.to + ')">' +
      (npSong.coverUrl ? '<img src="' + C.esc(npSong.coverUrl) + '" alt="' + C.esc(npSong.title) + '" />' : (npSong.emoji || "🎵")) + "</div>" +
      '<div><div class="np-title">' + C.esc(npSong.title) + "</div>" +
      '<div class="np-artist">' + C.esc(npSong.artist) + " · " + C.esc(npSong.album || "") + "</div>" +
      '<div class="np-badge-row">' +
      (npSong.vip ? '<span class="pf-tag" style="color:var(--warning);background:rgba(255,184,77,.12)">VIP</span>' : "") +
      '<span class="pf-tag">' + (npSong.external ? (npSong.id.indexOf("ne_") === 0 ? "网易云音乐" : npSong.id.indexOf("qq_") === 0 ? "QQ音乐" : "Audius") : "本地曲库") + "</span>" +
      '<span class="pf-tag">' + (npSong.durStr || "") + "</span>" +
      "</div></div>" +
      '<div class="np-modes">' +
      '<button class="icon-btn" id="npImmersive" type="button" aria-label="全屏沉浸" title="全屏沉浸" aria-pressed="false">' + C.icon("expand", 17) + "</button>" +
      '<button class="icon-btn" id="npLandscape" type="button" aria-label="横屏模式" title="横屏模式" aria-pressed="false">' +
      '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="7" width="18" height="10" rx="2"/><path d="M8 21l-3-3 3-3"/><path d="M16 3l3 3-3 3"/></svg>' +
      "</button>" +
      "</div>" +
      '<div class="np-controls">' +
      '<button class="icon-btn" id="npPrev" type="button" aria-label="上一首" title="上一首"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg></button>' +
      '<button class="play-btn" id="npPlay" type="button" aria-label="播放或暂停" title="播放/暂停">' +
      '<svg class="ic-play" width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>' +
      '<svg class="ic-pause" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" hidden><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>' +
      "</button>" +
      '<button class="icon-btn" id="npNext" type="button" aria-label="下一首" title="下一首"><svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"/></svg></button>' +
      "</div>" +
      '<div class="np-progress">' +
      '<span class="pb-time" id="npTimeCur">0:00</span>' +
      '<div class="pb-seek"><div class="pb-seek-fill" id="npSeekFill"></div><div class="pb-seek-knob" id="npSeekKnob"></div><input type="range" id="npSeek" min="0" max="1000" value="0" aria-label="播放进度" /></div>' +
      '<span class="pb-time" id="npTimeDur">0:00</span>' +
      "</div>" +
      '<canvas class="np-spec" id="npSpec" aria-hidden="true"></canvas>' +
      '<div class="ph-actions" style="justify-content:center">' +
      '<button class="icon-btn" id="npFav" aria-label="收藏" aria-pressed="' + C.isFavorite(npSong.id) + '">' + C.icon(C.isFavorite(npSong.id) ? "heart-fill" : "heart", 19) + "</button>" +
      '<button class="icon-btn" id="npAddPl" aria-label="添加到歌单">' + C.icon("playlist", 19) + "</button>" +
      '<button class="icon-btn" id="npShare" aria-label="分享">' + C.icon("share", 19) + "</button>" +
      '<button class="icon-btn" id="npBack" aria-label="返回">' + C.icon("arrow-left", 19) + "</button>" +
      "</div></div>" +

      '<div class="np-side"><div class="social-tabs" style="margin-bottom:14px">' +
      '<button class="stab active" data-nptab="lyric">歌词</button>' +
      '<button class="stab" data-nptab="queue">队列 ' + P().queueList().length + "</button>" +
      "</div>" +
      '<div id="npLyricPane"></div>' +
      '<div id="npQueuePane" hidden></div></div>' +
      "</div>";

    const el = page(html);
    // 沉浸背景挂到 .main-wrap 直属：absolute inset:0 铺满主内容区，
    // 否则它只能铺 .np-page 那块，被 .view 的 padding 与 .page 的 1180px 居中裁出一圈边框。
    const immerseEl = $("#npImmerse", el);
    const mainWrapEl = document.getElementById("mainWrap");
    if (immerseEl && mainWrapEl) mainWrapEl.appendChild(immerseEl);

    // 歌词渲染
    function mainText(l) {
      // 去掉译文 span，取纯主歌文本（供伪逐字退化使用）
      return l.text.replace(/<span class='lyric-trans'>[\s\S]*?<\/span>/g, "");
    }
    function pseudoWords(text, t, nextT) {
      const chars = Array.from(text);
      if (!chars.length) return null;
      const dur = Math.max(nextT - t, 1.5);
      const step = dur / chars.length;
      return chars.map((c, i) => ({ text: c, start: t + step * i, end: t + step * (i + 1) }));
    }
    function renderLyric() {
      const pane = $("#npLyricPane", el);
      const lyrics = P().state.lyrics;
      const mode = C.getSettings().lyricMode || "fade";
      if (!lyrics || !lyrics.length) {
        pane.innerHTML = '<div class="np-lyrics"><div class="lyric-empty">' + (npSong.external ? "暂无歌词" : "本地曲目暂无歌词，播放网易云 / QQ 音乐歌曲可自动加载") + "</div></div>";
        return;
      }
      // 逐字 span 的两种模式：karaoke（rAF 驱动逐字发光）与 type（纯 CSS 逐字揭示，靠 --i 变量错开延迟）
      const needWords = mode === "karaoke" || mode === "type";
      const html = lyrics.map((l, i) => {
        let inner;
        if (needWords) {
          const words = l.words || pseudoWords(mainText(l), l.t, lyrics[i + 1] ? lyrics[i + 1].t : l.t + 4);
          inner = words.map((w, wi) => '<span class="kw" data-s="' + w.start.toFixed(3) + '" data-e="' + w.end.toFixed(3) + '" style="--i:' + wi + '">' + C.esc(w.text) + "</span>").join("");
          if (l.trans) inner += '<div class="lyric-trans-row">' + C.esc(l.trans) + "</div>";
        } else {
          inner = l.text;
        }
        return '<div class="lyric-line" data-li="' + i + '">' + inner + "</div>";
      }).join("");
      pane.innerHTML = '<div class="np-lyrics np-lyrics--' + mode + '" id="npLyricScroll">' + html + "</div>";
      // 重新渲染后立刻对齐当前播放进度：否则要等下一次 lyricline 事件才高亮，
      // 中途进入页面 / 切歌时会看到歌词停在中间不动。
      const box = $("#npLyricScroll", el);
      const idx = P().state.lyricIndex;
      if (box && idx >= 0) {
        const line = $$(".lyric-line", box)[idx];
        if (line) {
          line.classList.add("active");
          C.centerInScroll(box, line, false); // 首帧直接定位，不做平滑滚动
        }
      }
      if (mode === "karaoke") startKaraoke();
    }
    function renderQueue() {
      const pane = $("#npQueuePane", el);
      const q = P().queueList();
      const cur = P().state.index;
      pane.innerHTML =
        '<div class="q-head"><span>队列 · ' + q.length + " 首</span></div>" +
        q.map((id, i) => {
          const s = D.get(id);
          if (!s) return "";
          return (
            '<div class="q-item' + (i === cur ? " playing" : "") + '" data-qidx="' + i + '">' +
            UI().smallCover(s, "q-cover") +
            '<div class="q-body"><div class="q-title ellipsis">' + C.esc(s.title) + "</div>" +
            '<div class="q-sub ellipsis">' + C.esc(s.artist) + "</div></div>" +
            (i === cur ? '<span class="eq-bars"><i></i><i></i><i></i><i></i></span>' : '<span class="q-dur">' + s.durStr + "</span>") +
            "</div>"
          );
        }).join("");
      $$("[data-qidx]", pane).forEach((item) => item.addEventListener("click", () => P().playAt(parseInt(item.dataset.qidx, 10))));
    }

    let npTab = "lyric";
    // 队列面板按剩余高度自适应限高，避免长列表把面板顶到播放条后面
    function fitQueueHeight() {
      const pane = $("#npQueuePane", el);
      if (!pane || pane.hidden) return;
      const np = $(".np-page", el);
      const stacked = np && getComputedStyle(np).gridTemplateColumns.split(" ").length < 2;
      if (stacked) { pane.style.maxHeight = ""; return; } // 堆叠布局由 CSS 固定高度，避免切 Tab 时整页跳动
      const top = pane.getBoundingClientRect().top;
      const avail = window.innerHeight - Math.max(top, 72) - 26;
      pane.style.maxHeight = Math.max(120, Math.min(460, Math.round(avail))) + "px";
    }
    const onNpResize = () => fitQueueHeight();
    $$("[data-nptab]", el).forEach((b) => {
      // 鼠标点击不取焦：列表变高后浏览器会把“焦点元素”滚进视野，导致整页跳到列表底部
      b.addEventListener("mousedown", (e) => { if (e.button === 0) e.preventDefault(); });
      b.addEventListener("click", () => {
        const view = document.getElementById("view");
        const keepTop = view ? view.scrollTop : 0; // 切 Tab 后锁住滚动位置，避免整页跳到列表底部
        npTab = b.dataset.nptab;
        $$("[data-nptab]", el).forEach((x) => x.classList.toggle("active", x === b));
        $("#npLyricPane", el).hidden = npTab !== "lyric";
        $("#npQueuePane", el).hidden = npTab !== "queue";
        if (npTab === "queue") renderQueue();
        if (npTab === "lyric") {
          // 回到歌词 Tab：隐藏期间容器没有布局，滚动量算不出来，这里重新对齐当前行
          const box = $("#npLyricScroll", el);
          const idx = P().state.lyricIndex;
          const line = box && idx >= 0 ? $$(".lyric-line", box)[idx] : null;
          if (line) C.centerInScroll(box, line, false);
        }
        requestAnimationFrame(() => {
          if (view) view.scrollTop = keepTop;
          fitQueueHeight();
          // 堆叠布局下队列可能在首屏下方：切过来时滚到可见处，避免“点了没反应”的错觉
          const pane = $("#npQueuePane", el);
          if (pane && !pane.hidden && view) {
            const r = pane.getBoundingClientRect();
            if (r.bottom > window.innerHeight + 8) {
              view.scrollTo({ top: view.scrollTop + r.top - 72, behavior: "smooth" });
            }
          }
        });
      });
    });
    window.addEventListener("resize", onNpResize);
    renderLyric();

    // ---- 播放控制（正在播放页自持控制，底栏在 data-np 下被隐藏）----
    let npSeeking = false;
    const npSeek = $("#npSeek", el);
    $("#npPlay", el).addEventListener("click", () => P().toggle());
    $("#npPrev", el).addEventListener("click", () => P().prev());
    $("#npNext", el).addEventListener("click", () => P().next(false));
    npSeek.addEventListener("pointerdown", () => { npSeeking = true; });
    npSeek.addEventListener("input", () => {
      const r = npSeek.value / 1000;
      $("#npSeekFill", el).style.width = r * 100 + "%";
      $("#npSeekKnob", el).style.left = r * 100 + "%";
    });
    const npSeekCommit = () => { npSeeking = false; P().seekTo(npSeek.value / 1000); };
    npSeek.addEventListener("change", npSeekCommit);
    npSeek.addEventListener("pointerup", npSeekCommit);
    const onNpState = (playing) => {
      const b = $("#npPlay", el);
      C.showIcon(b.querySelector(".ic-play"), !playing);
      C.showIcon(b.querySelector(".ic-pause"), playing);
      b.classList.toggle("playing", playing);
      b.setAttribute("aria-label", playing ? "暂停" : "播放");
    };
    const onNpTime = (t) => {
      if (npSeeking) return;
      const r = t.dur ? t.cur / t.dur : 0;
      $("#npSeekFill", el).style.width = r * 100 + "%";
      $("#npSeekKnob", el).style.left = r * 100 + "%";
      npSeek.value = Math.round(r * 1000);
      $("#npTimeCur", el).textContent = C.fmtDur(t.cur);
      $("#npTimeDur", el).textContent = C.fmtDur(t.dur);
    };
    bus.on("player:state", onNpState);
    bus.on("player:time", onNpTime);
    onNpState(P().state.playing); // 立即同步当前状态

    // ---- 全屏沉浸 / 横屏模式（P：2.1 回填）----
    const modeExit = $("#npModeExit", el);
    function syncModes() {
      const imm = document.body.classList.contains("immersive");
      const land = document.body.classList.contains("np-landscape");
      modeExit.hidden = !(imm || land);
      $("#npImmersive", el).setAttribute("aria-pressed", imm);
      $("#npLandscape", el).setAttribute("aria-pressed", land);
    }
    function setImmersive(on) {
      document.body.classList.toggle("immersive", on);
      if (on) {
        try {
          const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
          if (p && p.catch) p.catch(function () {});
        } catch (e) { /* 不支持全屏时仅做布局沉浸 */ }
      } else if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(function () {});
      }
      syncModes();
    }
    function setLandscape(on) {
      document.body.classList.toggle("np-landscape", on);
      try {
        if (on) {
          if (screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(function () {});
        } else if (screen.orientation && screen.orientation.unlock) {
          screen.orientation.unlock();
        }
      } catch (e) { /* 桌面浏览器不支持锁方向 */ }
      syncModes();
    }
    $("#npImmersive", el).addEventListener("click", () => setImmersive(!document.body.classList.contains("immersive")));
    $("#npLandscape", el).addEventListener("click", () => setLandscape(!document.body.classList.contains("np-landscape")));
    modeExit.addEventListener("click", () => { setImmersive(false); setLandscape(false); });
    // 沉浸 / 横屏下先退出模式，再按应用内导航栈回退
    const goBack = () => {
      if (document.body.classList.contains("immersive")) setImmersive(false);
      if (document.body.classList.contains("np-landscape")) setLandscape(false);
      const R2 = global.App.Router;
      if (R2 && R2.back) R2.back();
      else window.history.back();
    };
    const onFsChange = () => { if (!document.fullscreenElement) setImmersive(false); };
    document.addEventListener("fullscreenchange", onFsChange);
    const onEscMode = (e) => {
      if (e.key !== "Escape") return;
      if (document.body.classList.contains("np-landscape")) setLandscape(false);
      else if (document.body.classList.contains("immersive")) setImmersive(false);
    };
    document.addEventListener("keydown", onEscMode);

    // ---- 频谱：真实信号优先，无信号（跨域/静音）降级为低幅律动 ----
    const specCanvas = $("#npSpec", el);
    const sctx = specCanvas.getContext("2d");
    let specRAF = 0;
    function drawSpec() {
      const dpr = window.devicePixelRatio || 1;
      const w = specCanvas.clientWidth || 420;
      const h = 40;
      if (specCanvas.width !== Math.round(w * dpr)) {
        specCanvas.width = Math.round(w * dpr);
        specCanvas.height = Math.round(h * dpr);
      }
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, w, h);
      const data = P().getSpectrum ? P().getSpectrum() : null;
      const bars = 32;
      const bw = w / bars;
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#7c5cff";
      const playing = P().state.playing;
      for (let i = 0; i < bars; i++) {
        let v;
        if (data) {
          const idx = Math.floor(Math.pow(i / bars, 1.3) * data.length * 0.7);
          v = data[idx] / 255;
        } else {
          v = playing ? 0.18 + Math.abs(Math.sin(Date.now() / 240 + i * 0.42)) * 0.22 : 0.05;
        }
        const bh = Math.max(2, Math.round(v * h));
        sctx.fillStyle = accent;
        sctx.globalAlpha = 0.28 + v * 0.72;
        sctx.fillRect(i * bw + bw * 0.22, h - bh, bw * 0.56, bh);
      }
      sctx.globalAlpha = 1;
      specRAF = requestAnimationFrame(drawSpec);
    }
    drawSpec();
    syncModes();

    // 歌词行高亮
    const onLyricLine = (idx) => {
      // 逐字卡拉OK 模式下，高亮 / 已唱行状态 / 逐字点亮全部由 startKaraoke 的 rAF 接管
      if ((C.getSettings().lyricMode || "fade") === "karaoke") return;
      const box = $("#npLyricScroll", el);
      $$("#npLyricPane .lyric-line", el).forEach((l, i) => {
        const on = i === idx;
        if (on !== l.classList.contains("active")) {
          l.classList.toggle("active", on);
          // 只滚歌词容器，不能用 scrollIntoView（它会连带滚动 #view，把整页拉走）
          if (on) C.centerInScroll(box, l);
        }
      });
    };
    bus.on("player:lyricline", onLyricLine);

    // ---- 逐字卡拉OK 驱动（仅 karaoke 模式，仅正在播放页）----
    // 思路来自 Folia：每个字只持 waiting / active / passed 三态，状态跳变才改 DOM class；
    // 用 rAF 读 audio.currentTime 驱动，只处理当前行，历史行整行置亮、未来行保持暗。
    let karaokeRAF = 0;
    let karaokeLines = [];
    function stopKaraoke() { if (karaokeRAF) { cancelAnimationFrame(karaokeRAF); karaokeRAF = 0; } }
    function startKaraoke() {
      stopKaraoke();
      if ((C.getSettings().lyricMode || "fade") !== "karaoke") return;
      let lastIdx = -999;
      const tick = () => {
        const box = $("#npLyricScroll", el);
        if (!box || !box.isConnected) { stopKaraoke(); return; } // 离开播放页自动停止
        const idx = P().state.lyricIndex;
        if (idx !== lastIdx) {
          karaokeLines = Array.from(box.querySelectorAll(".lyric-line"));
          karaokeLines.forEach((l, i) => {
            l.classList.toggle("active", i === idx);
            const kws = l.querySelectorAll(".kw");
            if (i < idx) kws.forEach((kw) => kw.classList.add("on"));      // 已唱过：整行点亮
            else kws.forEach((kw) => kw.classList.remove("on"));            // 未唱 / 当前：待点亮
          });
          const cur = karaokeLines[idx];
          if (cur) C.centerInScroll(box, cur);
          lastIdx = idx;
        }
        const line = karaokeLines[idx];
        if (line) {
          const t = P().audio.currentTime;
          line.querySelectorAll(".kw").forEach((kw) => {
            const s = parseFloat(kw.dataset.s), e = parseFloat(kw.dataset.e);
            const on = t >= s && t < e + 0.04;
            if (on !== kw.classList.contains("on")) kw.classList.toggle("on", on);
          });
        }
        karaokeRAF = requestAnimationFrame(tick);
      };
      karaokeRAF = requestAnimationFrame(tick);
    }
    // 歌词到达/清空后总是重绘一次，顺带对齐当前进度（只在有容器时重绘会残留上一首的歌词）
    bus.on("player:lyric", () => renderLyric());
    bus.on("player:queue", () => {
      const tab = $("[data-nptab='queue']", el);
      if (tab) tab.innerHTML = "队列 " + P().queueList().length;
      if (npTab === "queue") { renderQueue(); fitQueueHeight(); }
    });

    // 切歌时原地更新（避免整页重挂载丢失歌词滚动 / 队列 tab / 收藏态）
    function updateSongInfo(s) {
      npSong = s;
      $(".np-title", el).textContent = s.title;
      $(".np-artist", el).textContent = s.artist + " · " + (s.album || "");
      const cover = $("#npCover", el);
      cover.style.background = "linear-gradient(150deg," + s.c.from + "," + s.c.to + ")";
      cover.innerHTML = s.coverUrl ? '<img src="' + C.esc(s.coverUrl) + '" alt="' + C.esc(s.title) + '" />' : (s.emoji || "🎵");
      $(".np-badge-row", el).innerHTML =
        (s.vip ? '<span class="pf-tag" style="color:var(--warning);background:rgba(255,184,77,.12)">VIP</span>' : "") +
        '<span class="pf-tag">' + (s.external ? (s.id.indexOf("ne_") === 0 ? "网易云音乐" : s.id.indexOf("qq_") === 0 ? "QQ音乐" : "Audius") : "本地曲库") + "</span>" +
        '<span class="pf-tag">' + (s.durStr || "") + "</span>";
      const favBtn = $("#npFav", el);
      const fav = C.isFavorite(s.id);
      favBtn.setAttribute("aria-pressed", fav);
      favBtn.innerHTML = C.icon(fav ? "heart-fill" : "heart", 19);
      favBtn.style.color = fav ? "var(--danger)" : "";
      renderLyric();
      if (npTab === "queue") renderQueue();
    }
    const onCoverColor = (info) => {
      if (!immerseEl) return;
      let bg = "linear-gradient(135deg," + info.from + "," + info.to + ")";
      if (info.coverUrl) {
        // 关键：CSS 里的 url() 是相对样式表(css/app.css)解析的，
        // 写相对路径会变成 css/api/cover.php（404，模糊层就没图）。
        // 这里必须转成绝对地址。
        let abs = "api/cover.php?u=" + encodeURIComponent(info.coverUrl);
        try { abs = new URL(abs, location.href).href; } catch (e) {}
        bg = "url('" + abs + "')";
      }
      immerseEl.style.setProperty("--im-img", bg);
      immerseEl.style.setProperty("--im-from", info.from);
      immerseEl.style.setProperty("--im-to", info.to);
      immerseEl.classList.add("ready");
    };
    bus.on("player:covercolor", onCoverColor);

    const onSongChanged = (s) => { if (s) updateSongInfo(s); };
    bus.on("player:changed", onSongChanged);
    // 初次进入播放页：已取得该曲颜色则直接补渲染，否则触发一次取色
    if (npSong && npSong.themeColor) {
      onCoverColor({ accent: npSong.themeColor, from: (npSong._coverGrad && npSong._coverGrad.from) || npSong.themeColor, to: (npSong._coverGrad && npSong._coverGrad.to) || npSong.themeColor, coverUrl: npSong.coverUrl });
    } else if (npSong) {
      C.applySongAccent(npSong);
    }

    // 页面移除时解绑监听
    const obs = new MutationObserver(() => {
      if (!document.body.contains(el)) {
        bus.off("player:lyricline", onLyricLine);
        bus.off("player:changed", onSongChanged);
        bus.off("player:covercolor", onCoverColor);
        if (immerseEl) immerseEl.remove();
        bus.off("player:state", onNpState);
        bus.off("player:time", onNpTime);
        if (specRAF) cancelAnimationFrame(specRAF);
        document.removeEventListener("keydown", onEscMode);
        document.removeEventListener("fullscreenchange", onFsChange);
        window.removeEventListener("resize", onNpResize);
        document.body.classList.remove("immersive", "np-landscape");
        obs.disconnect();
      }
    });
    obs.observe($("#view"), { childList: true });

    // 操作按钮
    const favBtn = $("#npFav", el);
    favBtn.addEventListener("click", () => {
      if (!C.isLoggedIn()) { UI().toast("请先登录", "error"); UI().openAuthModal("login"); return; }
      const fav = C.toggleFavorite(npSong.id);
      favBtn.setAttribute("aria-pressed", fav);
      favBtn.innerHTML = C.icon(fav ? "heart-fill" : "heart", 19);
      favBtn.style.color = fav ? "var(--danger)" : "";
      UI().toast(fav ? "已加入收藏" : "已取消收藏", "success");
    });
    if (C.isFavorite(npSong.id)) favBtn.style.color = "var(--danger)";
    $("#npAddPl", el).addEventListener("click", () => UI().openPlaylistPicker(npSong));
    $("#npShare", el).addEventListener("click", () => UI().openShareModal(npSong));
    $("#npBack", el).addEventListener("click", goBack);
    return el;
  }

  /* ==================== 设置 ==================== */
  function settings() {
    const s = C.getSettings();
    const accents = [
      { name: "跟随歌曲", val: "" },
      { name: "极光紫", val: "#7c5cff" },
      { name: "霓虹粉", val: "#ff5c9d" },
      { name: "湖水蓝", val: "#38bdf8" },
      { name: "青柠绿", val: "#3ddc97" },
      { name: "落日橙", val: "#ff9a3d" },
      { name: "警戒红", val: "#ff5c6c" },
    ];

    let html =
      '<div class="set-section"><div class="sec-head"><div class="sec-title">外观</div></div><div class="set-card">' +
      '<div class="set-row"><div class="set-info"><div class="set-name">主题模式</div><div class="set-desc">深色沉浸 / 浅色清新</div></div>' +
      '<div class="set-ctrl"><button class="btn btn-ghost" id="stTheme" style="height:32px">' + (s.theme === "dark" ? "切换到浅色" : "切换到深色") + "</button></div></div>" +

      '<div class="set-row"><div class="set-info"><div class="set-name">主题强调色</div><div class="set-desc">默认跟随播放中歌曲的封面取色</div></div>' +
      '<div class="set-ctrl"><div class="swatches" id="stAccents">' +
      accents.map((a) => '<button class="swatch' + (s.accent === a.val ? " active" : "") + '" data-accent="' + a.val + '" title="' + a.name + '" style="' + (a.val ? "background:" + a.val + ";color:" + a.val : "background:conic-gradient(#7c5cff,#ff5c9d,#38bdf8,#7c5cff)") + '"></button>').join("") +
      "</div></div></div>" +

      '<div class="set-row" style="display:block"><div class="set-info"><div class="set-name">背景</div><div class="set-desc">极光 / 8 组渐变 / 上传自己的图片</div></div>' +
      '<div class="bg-picker" id="stBgs">' +
      bgPresetBtn("aurora", "极光", "", s.bgPreset) +
      bgPresetBtn("desktop", "桌面", "assets/bg-desktop.jpg", s.bgPreset) +
      bgPresetBtn("mobile", "移动", "assets/bg-mobile.jpg", s.bgPreset) +
      bgPresetBtn("none", "纯色", "", s.bgPreset) +
      C.BG_GRADIENTS.map((g, i) => bgPresetBtn("grad:" + i, g.name, "", s.bgPreset, g.value)).join("") +
      "</div>" +
      '<div class="bg-custom-row">' +
      '<label class="btn btn-ghost bg-upload">' + C.icon("image", 14) + ' 上传图片<input type="file" id="stBgFile" accept="image/*" hidden /></label>' +
      (s.bgImage ? '<button class="btn btn-ghost" id="stBgUse">使用我的图片</button><button class="btn btn-danger" id="stBgClear">移除</button>' : "") +
      "</div></div>" +

      '<div class="set-row"><div class="set-info"><div class="set-name">背景模糊</div><div class="set-desc">数值越大背景越朦胧</div></div>' +
      '<div class="set-ctrl"><input type="range" class="range" id="stBlur" min="0" max="30" value="' + s.bgBlur + '" /><span class="range-val" id="stBlurVal">' + s.bgBlur + "px</span></div></div>" +

      '<div class="set-row"><div class="set-info"><div class="set-name">玻璃质感</div><div class="set-desc">通透 = 背景纹理清晰可见，只隔一层膜；磨砂 = 背景糊成色块，最好读</div></div>' +
      '<div class="set-ctrl"><div class="chip-row" id="stGlassStyle">' +
      '<button class="chip' + (s.glassStyle !== "clear" && s.glassStyle !== "frost" ? " active" : "") + '" data-gstyle="mid">半透</button>' +
      '<button class="chip' + (s.glassStyle === "clear" ? " active" : "") + '" data-gstyle="clear">通透</button>' +
      '<button class="chip' + (s.glassStyle === "frost" ? " active" : "") + '" data-gstyle="frost">磨砂</button>' +
      "</div></div></div>" +

      '<div class="set-row"><div class="set-info"><div class="set-name">玻璃不透明度</div><div class="set-desc">0 = 全透（只剩模糊与边缘），50 = 标准，100 = 接近实心</div></div>' +
      '<div class="set-ctrl"><input type="range" class="range" id="stGlass" min="0" max="100" value="' + s.glass + '" /><span class="range-val" id="stGlassVal">' + s.glass + "%</span></div></div>" +

      '<div class="set-row"><div class="set-info"><div class="set-name">玻璃模糊</div><div class="set-desc">背景被磨掉多少细节。0 时玻璃几乎只剩一层描边</div></div>' +
      '<div class="set-ctrl"><input type="range" class="range" id="stGlassBlur" min="0" max="60" value="' + s.glassBlur + '" /><span class="range-val" id="stGlassBlurVal">' + s.glassBlur + "px</span></div></div>" +

      '<div class="set-row"><div class="set-info"><div class="set-name">背景饱和</div><div class="set-desc">模糊之后要补饱和，否则背景只剩一团灰</div></div>' +
      '<div class="set-ctrl"><input type="range" class="range" id="stGlassSat" min="100" max="220" value="' + s.glassSat + '" /><span class="range-val" id="stGlassSatVal">' + s.glassSat + "%</span></div></div>" +

      '<div class="set-row"><div class="set-info"><div class="set-name">边缘高光</div><div class="set-desc">玻璃的厚度感来自边缘：顶部高光 + 上冷下暖的色散</div></div>' +
      '<div class="set-ctrl"><input type="range" class="range" id="stGlassRim" min="0" max="150" value="' + s.glassRim + '" /><span class="range-val" id="stGlassRimVal">' + s.glassRim + "%</span></div></div>" +

      '<div class="set-row"><div class="set-info"><div class="set-name">内容区底色</div><div class="set-desc">列表和文字底下那层。0 时内容区也全透，壁纸直接穿过来</div></div>' +
      '<div class="set-ctrl"><input type="range" class="range" id="stSurface" min="0" max="100" value="' + s.surfaceLevel + '" /><span class="range-val" id="stSurfaceVal">' + s.surfaceLevel + "%</span></div></div>" +
      "</div></div>" +

      '<div class="set-section"><div class="sec-head"><div class="sec-title">音乐库</div><div class="sec-sub">把别处的歌单与收藏同步过来</div></div>' +
      '<div class="set-card"><div class="set-row"><div class="set-info"><div class="set-name">导入与同步</div>' +
      '<div class="set-desc">粘贴网易云 UID 或歌单链接即可同步，不需要登录，也不需要密码</div></div>' +
      '<div class="set-ctrl"><a class="btn btn-ghost" href="#/import" style="height:32px">去导入</a></div></div></div></div>' +

      '<div class="set-section"><div class="sec-head"><div class="sec-title">本地壁纸</div><div class="sec-sub">用本地视频目录做动态背景</div></div>' +
      '<div class="set-card"><div class="set-row" style="display:block" id="stWallpaper">' + UI().wallpaperPanelHTML() + "</div></div></div>" +

      '<div class="set-section"><div class="sec-head"><div class="sec-title">播放</div></div><div class="set-card">' +
      '<div class="set-row"><div class="set-info"><div class="set-name">音量增强</div><div class="set-desc">通过 Web Audio 增益突破 100% 音量上限</div></div>' +
      '<div class="set-ctrl"><div class="chip-row" id="stBoost">' +
      [1, 1.25, 1.5, 2].map((b) => '<button class="chip' + (s.boost === b ? " active" : "") + '" data-boost="' + b + '">' + Math.round(b * 100) + "%</button>").join("") +
      "</div></div></div>" +
      '<div class="set-row"><div class="set-info"><div class="set-name">触感反馈</div><div class="set-desc">支持震动的设备上播放操作时轻震</div></div>' +
      '<div class="set-ctrl"><button class="switch' + (s.haptics ? " on" : "") + '" id="stHaptic" role="switch" aria-checked="' + s.haptics + '" aria-label="触感反馈"></button></div></div>' +
      '<div class="set-row"><div class="set-info"><div class="set-name">歌词动效</div><div class="set-desc">逐字卡拉OK / 逐字打字需网易云逐字歌词；其他音源按行时长均匀揭示</div></div>' +
      '<div class="set-ctrl"><div class="chip-row" id="stLyricFx">' +
      '<button class="chip' + (s.lyricMode === "fade" ? " active" : "") + '" data-lm="fade">整行渐显</button>' +
      '<button class="chip' + (s.lyricMode === "karaoke" ? " active" : "") + '" data-lm="karaoke">逐字卡拉OK</button>' +
      '<button class="chip' + (s.lyricMode === "tilt" ? " active" : "") + '" data-lm="tilt">倾斜浮现</button>' +
      '<button class="chip' + (s.lyricMode === "pulse" ? " active" : "") + '" data-lm="pulse">脉冲呼吸</button>' +
      '<button class="chip' + (s.lyricMode === "arc" ? " active" : "") + '" data-lm="arc">弧线卷轴</button>' +
      '<button class="chip' + (s.lyricMode === "bubble" ? " active" : "") + '" data-lm="bubble">气泡对话</button>' +
      '<button class="chip' + (s.lyricMode === "type" ? " active" : "") + '" data-lm="type">逐字打字</button>' +
      '</div></div></div>' +
      "</div></div>" +

      '<div class="set-section"><div class="sec-head"><div class="sec-title">键盘快捷键</div></div><div class="set-card">' +
      '<div class="kbd-list">' +
      '<div class="kbd-row"><span><kbd>Space</kbd></span><span>播放 / 暂停</span></div>' +
      '<div class="kbd-row"><span><kbd>Alt</kbd> + <kbd>←</kbd></span><span>上一首</span></div>' +
      '<div class="kbd-row"><span><kbd>Alt</kbd> + <kbd>→</kbd></span><span>下一首</span></div>' +
      '<div class="kbd-row"><span><kbd>Ctrl</kbd> + <kbd>K</kbd></span><span>命令面板</span></div>' +
      '<div class="kbd-row"><span><kbd>Esc</kbd></span><span>关闭浮层</span></div>' +
      "</div></div></div>" +

      '<div class="set-section"><div class="sec-head"><div class="sec-title">账户</div></div><div class="set-card">' +
      (C.isLoggedIn()
        ? '<div class="set-row"><div class="set-info"><div class="set-name">' + C.esc(C.currentUser()) + '</div><div class="set-desc">收藏 / 歌单 / 历史已开启云端同步</div></div>' +
          '<div class="set-ctrl"><button class="btn btn-ghost" id="stEdit" style="height:32px">编辑资料</button>' +
          '<button class="btn btn-danger" id="stLogout" style="height:32px">退出</button></div></div>'
        : '<div class="set-row"><div class="set-info"><div class="set-name">未登录</div><div class="set-desc">登录后体验云同步与社交功能</div></div>' +
          '<div class="set-ctrl"><button class="btn btn-primary" id="stLogin" style="height:32px">登录 / 注册</button></div></div>') +
      "</div></div>" +

      '<div class="set-section"><div class="sec-head"><div class="sec-title">关于</div></div><div class="set-card">' +
      '<div class="set-row"><div class="set-info"><div class="set-name">Wave 音乐播放器</div><div class="set-desc">原生 JavaScript · PHP · MySQL · 部署于 InfinityFree</div></div>' +
      '<div class="set-ctrl" style="color:var(--text-3);font-size:0.78rem">v2.1</div></div>' +
      '<div class="set-row"><div class="set-info"><div class="set-name">音源</div><div class="set-desc">网易云音乐 / QQ音乐 / Audius / 本地曲库</div></div></div>' +
      '<a class="set-row" href="privacy.html" target="_blank" rel="noopener"><div class="set-info"><div class="set-name">隐私政策</div><div class="set-desc">我们收集什么、怎么用、如何删除</div></div>' +
      '<span class="mr-chev">' + C.icon("external", 15) + "</span></a>" +
      '<a class="set-row" href="terms.html" target="_blank" rel="noopener"><div class="set-info"><div class="set-name">用户条款</div><div class="set-desc">使用本站前请阅读的约定</div></div>' +
      '<span class="mr-chev">' + C.icon("external", 15) + "</span></a>" +
      '<a class="set-row" href="https://github.com/wyq1683/wyqaimusic" target="_blank" rel="noopener"><div class="set-info"><div class="set-name">开源仓库</div><div class="set-desc">github.com/wyq1683/wyqaimusic</div></div>' +
      '<span class="mr-chev">' + C.icon("external", 15) + "</span></a>" +
      "</div></div>";

    const el = page(html);

    // 主题
    $("#stTheme", el).addEventListener("click", () => {
      const next = C.getSettings().theme === "dark" ? "light" : "dark";
      C.saveSettings({ theme: next });
      $("#stTheme", el).textContent = next === "dark" ? "切换到浅色" : "切换到深色";
    });
    // 主题色
    $$("[data-accent]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.accent;
        C.saveSettings({ accent: v });
        if (!v && P().currentSong()) C.applySongAccent(P().currentSong());
        $$("[data-accent]", el).forEach((x) => x.classList.toggle("active", x === b));
        UI().toast(v ? "主题色已更新" : "已恢复跟随歌曲封面");
      })
    );
    // 背景
    $$("[data-bg]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.bg;
        C.saveSettings({ bgPreset: v });
        C.applyBgPreset(v);
        $$("[data-bg]", el).forEach((x) => x.classList.toggle("active", x === b));
      })
    );
    // 上传自定义背景（压缩后存 localStorage）
    const bgFile = $("#stBgFile", el);
    if (bgFile) bgFile.addEventListener("change", () => {
      const f = bgFile.files && bgFile.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { UI().toast("请选择图片文件", "error"); return; }
      C.compressImage(f, 1600).then((data) => {
        if (!data) { UI().toast("图片读取失败", "error"); return; }
        C.saveSettings({ bgImage: data, bgPreset: "custom" });
        if (C.getSettings().bgImage !== data) { UI().toast("图片过大，请换一张", "error"); return; }
        C.applyBgPreset("custom");
        UI().toast("背景已更新", "success");
        global.App.Router.refresh();
      });
    });
    const bgUse = $("#stBgUse", el);
    if (bgUse) bgUse.addEventListener("click", () => {
      C.saveSettings({ bgPreset: "custom" });
      C.applyBgPreset("custom");
      $$("[data-bg]", el).forEach((x) => x.classList.remove("active"));
      UI().toast("已启用自定义背景", "success");
    });
    const bgClear = $("#stBgClear", el);
    if (bgClear) bgClear.addEventListener("click", () => {
      C.saveSettings({ bgImage: "", bgPreset: "aurora" });
      C.applyBgPreset("aurora");
      UI().toast("已移除自定义背景", "success");
      global.App.Router.refresh();
    });
    C.applyBgPreset(s.bgPreset);
    if (s.bgPreset === "custom") {
      const use = $("#stBgUse", el);
      if (use) use.classList.add("active");
    }
    // 滑杆
    $("#stBlur", el).addEventListener("input", (e) => {
      C.saveSettings({ bgBlur: parseInt(e.target.value, 10) });
      $("#stBlurVal", el).textContent = e.target.value + "px";
    });
    $("#stGlass", el).addEventListener("input", (e) => {
      C.saveSettings({ glass: parseInt(e.target.value, 10) });
      $("#stGlassVal", el).textContent = e.target.value + "%";
    });
    // 玻璃质感三档：切档时把模糊/饱和一起换成该档默认值，滑块跟着跳
    $$("[data-gstyle]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.gstyle;
        const dflt = global.App.Glass.defaultsOf(v);
        C.saveSettings({ glassStyle: v, glassBlur: dflt.glassBlur, glassSat: dflt.glassSat });
        $$("[data-gstyle]", el).forEach((x) => x.classList.toggle("active", x === b));
        const bl = $("#stGlassBlur", el), sa = $("#stGlassSat", el);
        if (bl) { bl.value = dflt.glassBlur; $("#stGlassBlurVal", el).textContent = dflt.glassBlur + "px"; }
        if (sa) { sa.value = dflt.glassSat; $("#stGlassSatVal", el).textContent = dflt.glassSat + "%"; }
      })
    );
    // 玻璃细调：模糊 / 饱和 / 边缘高光 / 内容区底色
    [["stGlassBlur", "glassBlur", "px"], ["stGlassSat", "glassSat", "%"], ["stGlassRim", "glassRim", "%"], ["stSurface", "surfaceLevel", "%"]]
      .forEach(([id, key, unit]) => {
        const input = $("#" + id, el);
        if (!input) return;
        input.addEventListener("input", (e) => {
          C.saveSettings({ [key]: parseInt(e.target.value, 10) });
          $("#" + id + "Val", el).textContent = e.target.value + unit;
        });
      });
    // 音量增强
    $$("[data-boost]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const v = parseFloat(b.dataset.boost);
        C.saveSettings({ boost: v });
        P().setBoost(v);
        $$("[data-boost]", el).forEach((x) => x.classList.toggle("active", x === b));
        UI().toast("音量增强 " + Math.round(v * 100) + "%");
      })
    );
    P().setBoost(s.boost);
    // 本地壁纸面板
    const wpBox = $("#stWallpaper", el);
    if (wpBox && UI().wireWallpaperPanel) {
      UI().wireWallpaperPanel(wpBox, () => {
        const keep = document.getElementById("view") ? document.getElementById("view").scrollTop : 0;
        global.App.Router.refresh();
        requestAnimationFrame(() => { const v = document.getElementById("view"); if (v) v.scrollTop = keep; });
      });
    }
    // 歌词动效
    const fxName = { fade: "整行渐显", karaoke: "逐字卡拉OK", tilt: "倾斜浮现", pulse: "脉冲呼吸", arc: "弧线卷轴", bubble: "气泡对话", type: "逐字打字" };
    $$("[data-lm]", el).forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.lm;
        C.saveSettings({ lyricMode: v });
        $$("[data-lm]", el).forEach((x) => x.classList.toggle("active", x === b));
        UI().toast("已切换到" + (fxName[v] || v));
      })
    );
    // 触感
    $("#stHaptic", el).addEventListener("click", () => {
      const on = !C.getSettings().haptics;
      C.saveSettings({ haptics: on });
      $("#stHaptic", el).classList.toggle("on", on);
      $("#stHaptic", el).setAttribute("aria-checked", on);
    });
    // 账户
    const lg = $("#stLogin", el);
    if (lg) lg.addEventListener("click", () => UI().openAuthModal("login"));
    const ed = $("#stEdit", el);
    if (ed) ed.addEventListener("click", () => openProfileEdit());
    const lo = $("#stLogout", el);
    if (lo) lo.addEventListener("click", () =>
      UI().confirmDialog({ title: "退出登录", message: "确定退出当前账号吗？", okText: "退出" }).then((ok) => {
        if (!ok) return;
        C.logout();
        UI().toast("已退出登录");
        global.App.Router.refresh();
      })
    );
    return el;

    function bgPresetBtn(key, name, img, cur, grad) {
      const style = img
        ? "background-image:url('" + img + "')"
        : grad
          ? "background:" + grad
          : key === "aurora"
            ? "background:linear-gradient(135deg,#1a1c2e,#101322)"
            : "background:var(--bg-2)";
      return '<button class="bg-preset' + (cur === key ? " active" : "") + '" data-bg="' + key + '" title="' + name + '" aria-label="' + name + '" style="' + style + '"></button>';
    }
  }

  /* ==================== 导出 ==================== */
  global.App.Pages = {
    "/home": home,
    "/library": library,
    "/search": search,
    "/favorites": favorites,
    "/playlists": playlists,
    "/playlist/:id": playlistDetail,
    "/history": historyPage,
    "/social": social,
    "/user/:id": userDetail,
    "/profile": profile,
    "/artist/:name": artist,
    "/album/:name": album,
    "/now-playing": nowPlaying,
    "/settings": settings,
    "/import": importMusic,
  };
})(window);
