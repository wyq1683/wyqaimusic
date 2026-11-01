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
      v: "2.7.9",
      date: "2026-11-02",
      lead: "逐字回到「跟着唱」的节奏：普通句子铺满一整行，只有长间奏才提前收。",
      items: [
        ["不再提前唱完", "上一版一律按自然语速收尾，慢歌里人声还没唱完字就停了。现在短句按整行间隙铺开，跟着人声走。"],
        ["长间奏不拖", "间隙超过自然语速 2.2 倍（比如中间插了 20 秒伴奏）才压缩，最多压缩到那个上限，不会一直慢慢爬到下一句。"],
        ["外观保持逐字", "一个字一个字点亮、亮过的保持亮，不是整行一起亮。"],
      ],
    },
    {
      v: "2.7.8",
      date: "2026-11-02",
      lead: "逐字高亮回到「一个字一个字亮，亮过就不灭」。",
      items: [
        ["唱过的字不再熄灭", "上一版把判定写成「开始 ≤ 当前 < 结束」，字唱完 0.6 秒就被清掉，看着像闪一下。现在只判开始，亮到换行为止。"],
        ["只有 LRC 的歌更清楚", "每个字间隔 0.19→0.26 秒，颜色过渡 0.28→0.12 秒；过渡比间隔长会把整行糊成一片。"],
      ],
    },
    {
      v: "2.7.7",
      date: "2026-11-02",
      lead: "逐字歌词终于跟着人走，找不到歌词会自己换源。",
      items: [
        ["长间奏不再慢慢爬", "之前拿「到下一行之前的时间」均摊给每个字，一句后面跟 20 秒伴奏，字就慢慢挪 20 秒。现在按文字的自然语速估算演唱时长，唱完就停。"],
        ["卡拉OK 不再整块失效", "修了个变量声明顺序的错：歌词已经加载好时进播放页会抛错，逐字动画直接不启动。"],
        ["歌词多源兜底", "本音源没有歌词时，会去另一个音源找同名曲目；还找不到就查 LRCLIB（第三方歌词库，海外曲目覆盖更好）。"],
      ],
    },
    {
      v: "2.7.6",
      date: "2026-11-02",
      lead: "修两个「按了没反应、看着像坏了」的问题。",
      items: [
        ["更新公告能关掉了", "「知道了」之前没绑关闭事件，点了没反应——只能点右上角叉。"],
        ["设置页不再竖排", "歌词动效、玻璃质感、音量增强、主题强调色这几行的选项一多，就把左边说明挤成每行一个字。现在说明占满一行，选项在下面换行排列。"],
      ],
    },
    {
      v: "2.7.5",
      date: "2026-11-02",
      lead: "补偿：歌单记住来源，缺歌可以一键补回来了。",
      items: [
        ["歌单记住来源", "导入的歌单会记下来自哪个网易云/QQ 歌单，以后随时能重新拉取。"],
        ["一键同步", "歌单详情多了「同步歌单」，歌单里缺的歌会从原歌单补齐；只增不删，不会动你手动加的歌。"],
        ["批量修复", "歌单列表顶部会提示哪些歌单缺歌，能一次全部同步。"],
      ],
      note: "2.7.4 之前导入的歌单没有记录来源，需要重新导入一次同一个歌单；之后就会记住来源，再出问题一键同步即可。",
    },
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
      // modal 的「确定」只在传了 onOk 时才绑点击；
      // 不传就是个按不动、也关不掉的按钮（2.7.1~2.7.5 一直是这个问题）。
      onOk: function (box, close) { close(); },
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
