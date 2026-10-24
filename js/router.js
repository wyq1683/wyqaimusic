/* ============================================================
 * router.js — Hash 路由 + 页面转场
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const { $, $$ } = C;

  let current = null; // {route, params, query}
  let firstRender = true;
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

    // 转场：旧页退出 → 新页进入（soft 模式静默替换并保持滚动）
    const old = $(".page", view);
    const keepScroll = view.scrollTop;
    if (old && !firstRender && !soft) {
      old.classList.add("page-exit");
      view.appendChild(pageEl);
      setTimeout(() => old.remove(), 260);
      view.scrollTop = 0;
    } else {
      if (old) old.remove();
      view.appendChild(pageEl);
      view.scrollTop = soft ? keepScroll : 0;
    }
    firstRender = false;
    if (!soft) endProgress();

    // 关闭移动端侧栏
    document.body.classList.remove("sb-open");
  }

  // 软刷新：数据变更后原地重绘当前页（无转场动画、保持滚动位置）
  function refresh() {
    render(true);
  }

  function navigate(path) {
    if (location.hash === "#" + path) render();
    else location.hash = path;
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
    if (!location.hash) location.hash = "#/home";
    render();
  }

  global.App.Router = {
    init, navigate, render, refresh, back,
    get current() { return current; },
  };
})(window);
