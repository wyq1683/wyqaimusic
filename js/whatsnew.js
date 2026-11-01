/* ============================================================
 * whatsnew.js — 更新公告
 * ------------------------------------------------------------
 * 发版后第一次打开弹一次「这次改了什么」，只弹一次（按版本号记在本地）。
 * 版本号单一来源：Core.VERSION；内容写在本文件的 CHANGELOG 里。
 *
 * 为什么不从 GitHub API 拉：多一个网络请求、多一处失败点，
 * 而且 Release 正文是给开发者看的，跟用户该看到的两三句话不是一回事。
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const RELEASES = "https://github.com/wyq1683/wyqaimusic/releases/tag/";

  // 只留最近几版，越新越靠前。items 每条：["标题", "一句话说明"]
  const CHANGELOG = [
    {
      v: "2.7.4",
      date: "2026-11-02",
      lead: "修好了大歌单导入后「歌被吞一半」的问题，顺带把重复的歌单收干净。",
      items: [
        ["导入不再掉歌", "以前在线歌曲的本地注册表硬上限 500 首，导入 995 首会从最早的一批开始删——刷新后只剩后 500 首。现在按存储配额管，不再按条数砍。"],
        ["导入自动去重合并", "同一个歌单再导入一次，会合并进原来那条而不是新建一条；同名歌单里重复的歌也会去掉。"],
        ["数字终于对得上", "列表卡片显示「500 / 998 首可用」，详情页标出缺失多少首，不再出现 995 和 500 两个数打架。"],
        ["一键去重", "歌单里如果有重复，操作栏会出现「去掉 N 首重复」。"],
      ],
      note: "之前被吞掉的歌找不回来了（信息当时没存下来），重新导入一次同一个歌单就能补齐，会自动合并进原歌单。",
    },
    {
      v: "2.7.3",
      date: "2026-11-02",
      lead: "修两个用起来很烦的问题：队列不认歌单，返回又跳回顶部。",
      items: [
        ["点歌就是播这张歌单", "在歌单里点任意一首，播放列表就是这张歌单本身、从这首开始；以前是往旧队列末尾追加，顺序完全对不上。"],
        ["返回不再跳回顶部", "每个页面记住离开时的滚动位置，返回时原样恢复；从别处第一次进歌单，会自动滚到正在播放的那首。"],
        ["点导航才回到顶部", "侧栏/底栏点当前页面仍然从头看，不会被记忆位置拦着。"],
      ],
    },
    {
      v: "2.7.2",
      date: "2026-11-01",
      lead: "下载与更新有了正经入口，不用再翻 Release 页面。",
      items: [
        ["侧栏「下载 App」", "左侧栏底部新增入口，点一下直接拿最新的安卓安装包。"],
        ["设置里的检查更新", "设置 → 关于：显示最新安装包版本与体积，可一键检查更新、下载覆盖安装。"],
        ["版本号统一", "侧栏、设置页、公告读同一个来源，不会再出现写着 2.1、实际 2.7 的情况。"],
      ],
    },
    {
      v: "2.7.1",
      date: "2026-10-31",
      lead: "系统终于能看见你在听什么了，新版本也会主动告诉你改了什么。",
      items: [
        ["系统灵动岛", "锁屏、通知栏和手机顶部的胶囊会显示封面、歌名、歌手和播放进度，胶囊上的按钮也能直接切歌。"],
        ["更新公告", "以后每次发版，升级后第一次打开会弹一次这次改了什么。"],
        ["强调色修正", "修掉了在线歌曲强调色全变成默认紫的问题。"],
      ],
      note: "第一次播放时如果系统询问通知权限，允许之后顶部胶囊才会出现。",
    },
    {
      v: "2.7.0",
      date: "2026-10-31",
      lead: "App 里也有了自己的「灵动岛」。",
      items: [
        ["顶部播放胶囊", "顶栏下方多了一条胶囊，收起显示封面、歌名和实时频谱，点开能切歌、看进度。"],
        ["可关闭", "设置 → 外观 → 灵动岛，随时关掉。"],
      ],
    },
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }

  function entryFor(v) {
    return CHANGELOG.find((x) => x.v === v) || null;
  }

  function bodyHTML(e) {
    const items = e.items
      .map(
        (it) =>
          '<li class="wn-item"><span class="wn-dot" aria-hidden="true"></span>' +
          '<div class="wn-item-txt"><b>' + esc(it[0]) + "</b><span>" + esc(it[1]) + "</span></div></li>"
      )
      .join("");
    return (
      '<div class="wn">' +
      '<div class="wn-top"><span class="wn-ver">v' + esc(e.v) + '</span><span class="wn-date">' + esc(e.date) + "</span></div>" +
      '<p class="wn-lead">' + esc(e.lead) + "</p>" +
      '<ul class="wn-list">' + items + "</ul>" +
      (e.note ? '<p class="wn-note">' + esc(e.note) + "</p>" : "") +
      '<a class="wn-more" href="' + RELEASES + "v" + esc(e.v) + '" target="_blank" rel="noopener">查看完整更新记录<span aria-hidden="true">↗</span></a>' +
      "</div>"
    );
  }

  function open(entry) {
    const UI = global.App.UI;
    if (!UI || !UI.modal) return;
    UI.modal({
      title: "更新公告",
      width: "min(460px, 92vw)",
      body: bodyHTML(entry),
      actions: { ok: "知道了" },
    });
  }

  /** 手动查看（设置页「更新记录」按钮）：永远弹最新一版 */
  function openLatest() {
    const e = entryFor(C.VERSION) || CHANGELOG[0];
    if (e) open(e);
  }

  // Core.read 内部走 JSON.parse，解析失败会退回 fallback；
  // 老数据/手写值不是合法 JSON 时会被当成「没读过」，导致公告永远不弹。
  // 这里自己取原始串，两种格式都认。
  function seenVersion() {
    try {
      const raw = localStorage.getItem(C.K.VERSION_SEEN);
      if (!raw) return "";
      try {
        const v = JSON.parse(raw);
        return typeof v === "string" ? v : String(v == null ? "" : v);
      } catch (e) {
        return raw;
      }
    } catch (e) { return ""; }
  }

  /** 后台检查：发版后第一次打开弹一次 */
  function check() {
    const seen = seenVersion();
    const cur = C.VERSION;

    // 第一次来：不打扰，直接记成当前版本
    if (!seen) {
      try { C.write(C.K.VERSION_SEEN, cur); } catch (e) { /* 忽略 */ }
      return;
    }
    if (seen === cur) return;

    const entry = entryFor(cur);
    try { C.write(C.K.VERSION_SEEN, cur); } catch (e) { /* 忽略 */ }
    if (!entry) return; // 这一版没写公告就静默跳过，别弹空窗
    setTimeout(() => open(entry), 900);
  }

  function boot() {
    // 侧栏版本号跟着 Core.VERSION 走，避免硬编码落后
    const sbv = document.querySelector(".sb-version");
    if (sbv) sbv.textContent = "Wave " + C.VERSION;
    check();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.App = global.App || {};
  global.App.WhatsNew = { openLatest: openLatest, open: open, CHANGELOG: CHANGELOG };
})(window);
