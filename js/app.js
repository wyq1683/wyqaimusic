/* ============================================================
 * app.js — 应用入口
 * 初始化顺序：core → data → recommend → player → ui → router → pages → app
 * ============================================================ */
(function () {
  "use strict";

  const C = window.App.Core;

  // 全局错误兜底（不中断使用）
  window.addEventListener("error", (e) => console.warn("Runtime error:", e.message));
  window.addEventListener("unhandledrejection", (e) => console.warn("Unhandled rejection:", e.reason));

  // 浏览器音频支持检测
  if (typeof Audio === "undefined") {
    document.body.innerHTML =
      '<div style="display:grid;place-items:center;height:100vh;font-family:sans-serif;color:#888"><div style="text-align:center"><h2>浏览器不支持音频播放</h2><p>请使用最新版 Chrome / Edge / Safari</p></div></div>';
    return;
  }

  /* ==================== 背景星光粒子 ==================== */
  function initStars() {
    const canvas = document.getElementById("stars");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let stars = [];
    let raf = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function resize() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const count = Math.min(90, Math.floor((canvas.width * canvas.height) / 22000));
      stars = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.4 + 0.3,
        p: Math.random() * Math.PI * 2,
        s: 0.008 + Math.random() * 0.02,
      }));
    }
    function tick() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const light = document.body.dataset.theme === "light";
      stars.forEach((st) => {
        st.p += st.s;
        const a = 0.25 + Math.abs(Math.sin(st.p)) * 0.5;
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fillStyle = light ? "rgba(80,90,130," + a * 0.5 + ")" : "rgba(200,210,255," + a + ")";
        ctx.fill();
      });
      raf = requestAnimationFrame(tick);
    }
    resize();
    window.addEventListener("resize", C.debounce(resize, 200));
    if (!reduced) tick();
    else {
      // 降低动效：静态绘制一帧
      stars.forEach((st) => {
        ctx.beginPath();
        ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(200,210,255,0.4)";
        ctx.fill();
      });
    }
    // 页面隐藏时暂停动画，省电
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = null; }
      else if (!raf && !reduced) tick();
    });
  }

  /* ==================== 启动 ==================== */
  function boot() {
    window.App.UI.init();
    window.App.Router.init();
    initStars();
    // 登录状态下拉取云端数据
    if (C.isLoggedIn()) {
      C.pullFromServer().then(() => {
        window.App.UI.refreshCurrentView();
        window.App.UI.updateSocialBadge();
      });
    }
    console.log("%c Wave 2.1 %c 音乐播放器已就绪 ", "background:#7c5cff;color:#fff;border-radius:4px 0 0 4px;padding:2px 6px", "background:#222;color:#aaa;padding:2px 6px;border-radius:0 4px 4px 0");
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
