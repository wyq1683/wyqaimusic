/* ============================================================
 * router.js — Hash 路由 + 页面转场
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const { $, $$ } = C;

  let current = null; // {route, params, query}
  let firstRender = true;
  // 每个路径记住离开时的滚动位置：从歌手页/播放页返回歌单时，
  // 不该把用户扔回顶部再让他自己划回来。
  const scrollMem = new Map();
  // 应用内导航栈：history.back() 在深链 / 全屏场景下没有可靠回退目标，
  // 用它来判断「上一页」到底是哪一页，没有则回首页。
  const navStack = [];
  let lastPath = null;

  function parseHash() {
    const raw = location.hash.replace(/^#/, "") || "/home";
    const qi = raw.indexOf("?");
    const path = qi >= 0 ? raw.slice(0, qi) : raw;
    const query = {};
    if (qi >= 0) {
      new URLSearchParams(raw.slice(qi + 1)).forEach((v, k) => (query[k] = v));
    }
    return { path: path || "/home", query };
  }

  // 路由表：pattern → { title, render(params, query), showBack }
  const routes = [
    { pattern: "/home", title: "发现" },
    { pattern: "/library", title: "曲库" },
    { pattern: "/search", title: "搜索" },
    { pattern: "/favorites", title: "收藏夹" },
    { pattern: "/playlists", title: "播放列表" },
    { pattern: "/playlist/:id", title: "歌单", back: true },
    { pattern: "/history", title: "收听历史" },
    { pattern: "/social", title: "好友" },
    { pattern: "/user/:id", title: "个人主页", back: true },
    { pattern: "/profile", title: "我的" },
    { pattern: "/artist/:name", title: "艺人", back: true },
    { pattern: "/album/:name", title: "专辑", back: true },
    { pattern: "/now-playing", title: "正在播放", full: true },
    { pattern: "/settings", title: "设置" },
    { pattern: "/import", title: "音乐库导入", back: true },
  ];

  function matchRoute(path) {
    for (const r of routes) {
      const rp = r.pattern.split("/");
      const pp = path.split("/");
      if (rp.length !== pp.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < rp.length; i++) {
        if (rp[i].startsWith(":")) params[rp[i].slice(1)] = decodeURIComponent(pp[i]);
        else if (rp[i] !== pp[i]) { ok = false; break; }
      }
      if (ok) return { route: r, params };
    }
    return null;
  }

  function startProgress() {
    const p = $("#routeProgress");
    p.classList.remove("done");
    p.classList.add("loading");
  }
  function endProgress() {
    const p = $("#routeProgress");
    p.classList.remove("loading");
    p.classList.add("done");
    setTimeout(() => { p.classList.remove("done"); p.style.width = "0"; }, 300);
  }

  function render(soft) {
    const { path, query } = parseHash();
    const m = matchRoute(path);
    const view = $("#view");
    // 先记下「上一页」的位置，再往下走（lastPath 马上会被改成当前路径）
    const prevPath = lastPath;

    // 记录导航栈（同一路径不重复入栈；软刷新不改变栈）
    if (path !== lastPath) {
      const exist = navStack.indexOf(path);
      if (exist >= 0) {
        // 浏览器前进/后退回到了栈内已有的页：截断到该位置
        navStack.length = exist + 1;
      } else if (!soft) {
        navStack.push(path);
        if (navStack.length > 40) navStack.shift();
      }
      lastPath = path;
    }

    if (!soft) startProgress();

    // 切页时关掉可能还开着的右键菜单 / 命令面板，避免浮层被带到新页面
    if (global.App.UI && global.App.UI.closeMenu) global.App.UI.closeMenu();

    const routeInfo = m || { route: { pattern: "*", title: "页面不存在" }, params: {} };
    current = { route: routeInfo.route.pattern, params: routeInfo.params, query };

    // 顶栏标题：先停动画并强制回流，否则直接换 textContent 不会重播动画
    const titleEl = $("#topbarTitle");
    titleEl.style.animation = "none";
    void titleEl.offsetWidth;
    titleEl.textContent = routeInfo.route.title;
    titleEl.style.animation = "";
    $("#topbarBack").hidden = !routeInfo.route.back;
    document.body.dataset.np = routeInfo.route.full ? "1" : "0";
    document.body.dataset.route = routeInfo.route.pattern;

    // 导航高亮
    const navRoute = "/" + (path.split("/")[1] || "home");
    if (global.App.UI) global.App.UI.renderNav(navRoute);
    if (global.App.UI) global.App.UI.renderSidebarPlaylists(routeInfo.params.id);

    // 渲染新页面
    let pageEl;
    if (m && global.App.Pages && global.App.Pages[routeInfo.route.pattern]) {
      pageEl = global.App.Pages[routeInfo.route.pattern](routeInfo.params, query);
    } else if (m && global.App.Pages && global.App.Pages[routeInfo.route.pattern.split("/")[1]]) {
      // 兼容仅注册了段的页面
      pageEl = global.App.Pages[routeInfo.route.pattern.split("/")[1]](routeInfo.params, query);
    } else {
      pageEl = C.el("div", "page");
      pageEl.innerHTML = global.App.UI.emptyState("search", "页面不存在", "看看别的吧", '<a class="btn btn-primary" href="#/home">回到发现</a>');
    }
    pageEl.classList.add("page");

    // 转场方向：层级变深=前进（新页从右侧轻推入），变浅=返回（从左侧），同级=横移
    // 不做 100vw 的抽屉式位移 —— 手机上太重，24px 就够表达"方向"
    const depthOf = (p) => (p || "").split("/").filter(Boolean).length;
    if (!prevPath) view.dataset.dir = "forward";
    else {
      const a = depthOf(path), b = depthOf(prevPath);
      view.dataset.dir = a > b ? "forward" : (a < b ? "back" : "side");
    }

    // 转场：旧页退出 → 新页进入（soft 模式静默替换并保持滚动）
    const old = $(".page", view);
    const keepScroll = view.scrollTop;
    if (prevPath) scrollMem.set(prevPath, keepScroll);
    if (old && !firstRender && !soft) {
      old.classList.add("page-exit");
      view.appendChild(pageEl);
      setTimeout(() => old.remove(), 260);
    } else {
      if (old) old.remove();
      view.appendChild(pageEl);
    }
    // 共享元素转场：接管目标页里标了 data-morph 的元素
    if (global.App._morphPending) {
      const target = pageEl.querySelector("[data-morph]");
      if (target) target.style.viewTransitionName = target.getAttribute("data-morph");
    }
    if (soft) {
      view.scrollTop = keepScroll;
    } else {
      // 回到这一页：恢复到上次离开的位置；没记录过就滚到正在播放的那首
      const want = scrollMem.get(path) || 0;
      view.scrollTop = 0;
      requestAnimationFrame(() => {
        if (want > 0) view.scrollTop = want;
        else scrollToPlaying(view);
      });
    }
    firstRender = false;
    if (!soft) endProgress();

    // 关闭移动端侧栏
    document.body.classList.remove("sb-open");
  }

  // 页面里若有「正在播放」的行，把它滚到可视区中间。
  // 只在没有滚动记忆时用，避免覆盖用户自己的位置。
  function scrollToPlaying(view) {
    let row = view.querySelector(".song-row.playing, .q-item.playing");
    if (!row) {
      // 冷启动时 currentPlaying 还没回填，类名没打上 —— 退一步按 id 找
      const P = global.App.Player;
      const cur = P && P.currentSong ? P.currentSong() : null;
      if (cur) row = view.querySelector('.song-row[data-song="' + cur.id + '"]');
    }
    if (!row) return;
    C.centerInScroll(view, row);
  }

  // 软刷新：数据变更后原地重绘当前页（无转场动画、保持滚动位置）
  function refresh() {
    render(true);
  }

  function navigate(path) {
    if (location.hash === "#" + path) render();
    else location.hash = path;
  }

  /* ==================== 共享元素转场 ====================
   * 把一个 DOM 元素「变成」目标页里的同名元素（目前只用于封面 → 播放页）。
   * 三个必须做对的点：
   *  ① 新旧两个状态各只能有一个同名元素，多一个浏览器会直接放弃整次转场
   *  ② 转场期间要禁掉 page-in/page-exit，否则新状态截图会拍到 opacity:0 的第一帧
   *  ③ 结束时必须清 name，否则下一次进播放页会撞重名
   */
  const MORPH_NAME = "song-cover";

  function waitForRender() {
    return new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        // 两帧：一帧给 render 插入 DOM，一帧给样式计算完成
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      };
      window.addEventListener("hashchange", done, { once: true });
      setTimeout(done, 120);   // hash 未变（同页）时的兜底，别让转场卡住
    });
  }

  function endMorph() {
    document.documentElement.classList.remove("vt-running");
    global.App._morphPending = false;
    // 按 data-morph 找，不靠 style 属性串匹配（换行/顺序都会导致匹配不到）
    document.querySelectorAll("[data-morph]").forEach((e) => {
      e.style.viewTransitionName = "";
    });
  }

  function morphTo(path, fromEl) {
    // 支持不了就退回普通导航，不能白屏或卡住
    if (!fromEl || typeof document.startViewTransition !== "function") {
      endMorph();
      navigate(path);
      return null;
    }
    endMorph();                      // 先清干净上一次可能残留的 name
    fromEl.style.viewTransitionName = MORPH_NAME;
    global.App._morphPending = true;
    document.documentElement.classList.add("vt-running");

    let vt;
    try {
      vt = document.startViewTransition(async () => {
        // 旧状态已经拍过了，这里立刻摘掉源元素的 name
        fromEl.style.viewTransitionName = "";
        navigate(path);
        await waitForRender();
      });
    } catch (e) {
      fromEl.style.viewTransitionName = "";
      endMorph();
      navigate(path);
      return null;
    }
    // finished 在部分 WebView / headless 里可能永远不 resolve（转场被跳过时）。
    // 必须兜底清理，否则 vt-running 会一直挂着，把所有页面动画都禁掉。
    const guard = setTimeout(endMorph, 1200);
    vt.finished.catch(() => {}).finally(() => { clearTimeout(guard); endMorph(); });
    return vt;
  }

  // 应用内返回：优先回退到导航栈中的上一页；栈里没有上一页时回首页。
  // 不用 history.back()：深链进入 / 浏览器历史被清空时它会静默失败（点了没反应）。
  function back(fallback) {
    const curPath = parseHash().path;
    // 栈顶是当前页时先弹掉
    if (navStack.length && navStack[navStack.length - 1] === curPath) navStack.pop();
    const prev = navStack.length ? navStack[navStack.length - 1] : null;
    if (prev && prev !== curPath) {
      navStack.pop();
      navigate(prev);
      return true;
    }
    navigate(fallback || "/home");
    return true;
  }

  function init() {
    // 注意：不能直接把 render 传给 hashchange —— 事件对象是 truthy，会被当成 soft 参数
    window.addEventListener("hashchange", function () { render(); });
    $("#topbarBack").addEventListener("click", () => back());
    // 点导航栏 = 从头看这一页，清掉它的滚动记忆（返回时才恢复位置）
    document.addEventListener("click", (e) => {
      const a = e.target && e.target.closest && e.target.closest("a[data-route]");
      if (!a) return;
      const href = (a.getAttribute("href") || "").replace(/^#/, "");
      if (href) scrollMem.delete(href);
    });
    if (!location.hash) location.hash = "#/home";
    render();
  }

  global.App.Router = {
    init, navigate, render, refresh, back, morphTo,
    get current() { return current; },
  };
})(window);
