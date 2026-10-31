/* ============================================================
 * updater.js — 版本检查与安装包下载
 * ------------------------------------------------------------
 * 数据源是同站的 version.json（不是 GitHub API）：没有限流、没有跨域、
 * 也不会因为 GitHub 抽风就把「检查更新」变成报错。
 *
 * 网页版是远端加载的，永远是最新；真正会落后的是安卓安装包，
 * 所以这里的「更新」本质是「拿到最新的 APK」。
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const UI = () => global.App.UI;

  let cache = null;

  async function manifest(force) {
    if (cache && !force) return cache;
    const res = await fetch("version.json?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    cache = data;
    return data;
  }

  function parts(v) {
    return String(v || "")
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((x) => parseInt(x, 10) || 0);
  }
  function newer(remote, local) {
    const a = parts(remote), b = parts(local);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
      const x = a[i] || 0, y = b[i] || 0;
      if (x !== y) return x > y;
    }
    return false;
  }

  function isNative() {
    return !!(global.Capacitor && global.Capacitor.isNativePlatform && global.Capacitor.isNativePlatform());
  }

  async function download() {
    try {
      const m = await manifest();
      if (!m.apk || !m.apk.url) throw new Error("no apk");
      // 安卓内直接跳下载会留在 WebView 里；交给系统浏览器更稳
      if (isNative()) {
        window.open(m.apk.url, "_system");
      } else {
        location.href = m.apk.url;
      }
    } catch (e) {
      if (UI()) UI().toast("拿不到安装包地址，请稍后重试", "error");
    }
  }

  function openUpdate(m) {
    const apk = m.apk || {};
    const items = (m.highlights || [])
      .map((t) => '<li class="wn-item"><span class="wn-dot" aria-hidden="true"></span><div class="wn-item-txt"><span>' + C.esc(t) + "</span></div></li>")
      .join("");
    const body =
      '<div class="wn">' +
      '<div class="wn-top"><span class="wn-ver">v' + C.esc(m.version) + '</span><span class="wn-date">' + C.esc(m.released || "") + "</span></div>" +
      '<p class="wn-lead">网页已是最新，安装包更新到 v' + C.esc(apk.version || m.version) + "，覆盖安装即可。</p>" +
      (items ? '<ul class="wn-list">' + items + "</ul>" : "") +
      (apk.notes ? '<p class="wn-note">' + C.esc(apk.notes) + "</p>" : "") +
      '<a class="wn-more" href="' + C.esc(m.releaseUrl || "#") + '" target="_blank" rel="noopener">查看更新详情<span aria-hidden="true">↗</span></a>' +
      "</div>";
    UI().modal({
      title: "有新版本",
      width: "min(460px, 92vw)",
      body: body,
      actions: { cancel: "稍后", ok: "下载安装包" },
      onOk: (box, close) => { close(); download(); },
    });
  }

  async function check() {
    const ui = UI();
    try {
      const m = await manifest(true);
      if (newer(m.version, C.VERSION)) {
        openUpdate(m);
      } else if (ui) {
        ui.toast("已是最新版本 v" + C.VERSION, "success");
      }
    } catch (e) {
      if (ui) ui.toast("检查更新失败，请稍后再试", "error");
    }
  }

  /** 设置页用：把安装包版本填进说明文字 */
  async function fillAbout(root) {
    // 设置页是在挂载前构建的，必须从传入的页元素里找，document 里还查不到
    const scope = root || document;
    const desc = scope.querySelector ? scope.querySelector("#stApkDesc") : null;
    if (!desc) return;
    try {
      const m = await manifest();
      const apk = m.apk || {};
      desc.textContent = "最新安装包 v" + (apk.version || "-") + (apk.size ? " · " + apk.size : "") + " · 覆盖安装不丢数据";
    } catch (e) {
      desc.textContent = "安装包下载 · 覆盖安装不丢数据";
    }
  }

  function boot() {
    const link = document.getElementById("sbDownload");
    if (link) link.addEventListener("click", download);
    fillAbout();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  global.App = global.App || {};
  global.App.Updater = { check: check, download: download, manifest: manifest, fillAbout: fillAbout, newer: newer };
})(window);
