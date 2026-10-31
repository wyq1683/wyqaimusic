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
