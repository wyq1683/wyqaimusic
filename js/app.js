/* ============================================================
 * app.js — 应用入口
 * 加载顺序：data → store → recommend → player → ui → app
 * 此处初始化 UI 并启动应用。
 * ============================================================ */
(function () {
  "use strict";

  // 注册 Service Worker（为离线缓存/未来 PWA 做准备）
  // if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(() => {}); }

  // 全局错误兜底
  window.addEventListener("error", function (e) {
    console.warn("Runtime error:", e.message);
    // 不中断用户使用，仅静默记录
  });

  // 检测浏览器音频支持
  if (typeof Audio === "undefined") {
    document.body.innerHTML = `<div style="display:grid;place-items:center;height:100vh;font-family:sans-serif;color:#666"><div><h2>你的浏览器不支持音频播放</h2><p>请使用最新版 Chrome / Edge / Safari</p></div></div>`;
    return;
  }

  // 启动 UI
  if (window.App && window.App.UI && window.App.UI.init) {
    window.App.UI.init();
  } else {
    console.error("App.UI.init 未就绪，请检查脚本加载顺序");
  }
})();
