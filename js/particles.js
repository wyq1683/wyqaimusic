/* ============================================================
 * particles.js — 背景粒子流动动效
 * 蓝色调流动光点 + 光晕 + 粒子间连接线 + 鼠标轻微响应
 * 性能：粒子数按屏幕面积自适应，页面隐藏时暂停，尊重减少动效偏好
 * ============================================================ */
(function () {
  "use strict";

  // 尊重"减少动效"偏好，前庭敏感用户可自动关闭
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  const canvas = document.getElementById("particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 品牌蓝系粒子调色
  const COLORS = ["#4D6BFE", "#679efe", "#7cb8ff", "#8a7cff", "#5b8cff"];
  const LINK_DIST = 130;      // 连接线最大距离
  const MOUSE_RADIUS = 140;   // 鼠标影响半径

  let particles = [];
  let mouse = { x: -9999, y: -9999 };
  let w = 0, h = 0;
  let rafId = null;
  let running = false;

  // 节拍能量驱动（由 ui.js 通过 App.Particles.setBeat 注入）
  let beatEnergy = 0;   // 0..1，整体律动强度
  let beatPulse = 0;    // 重拍脉冲（衰减型），触发粒子光晕爆发

  // 暴露给 UI 的节拍接口
  window.App = window.App || {};
  window.App.Particles = window.App.Particles || {};
  window.App.Particles.setBeat = function (energy, bass, isBeat) {
    beatEnergy = Math.max(0, Math.min(1, energy || 0));
    if (isBeat) beatPulse = 1;
  };

  function spawn() {
    const angle = Math.random() * Math.PI * 2;
    const speed = Math.random() * 0.35 + 0.08;
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r: Math.random() * 1.9 + 0.7,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      baseAlpha: Math.random() * 0.45 + 0.2,
      twinkle: Math.random() * Math.PI * 2,
      twinkleSpeed: Math.random() * 0.03 + 0.01,
    };
  }

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;
    // 按面积自适应粒子数（移动端更少，保证流畅）
    const target = Math.max(30, Math.min(110, Math.floor((w * h) / 16000)));
    if (particles.length < target) {
      while (particles.length < target) particles.push(spawn());
    } else {
      particles.length = target;
    }
  }

  function step() {
    if (!running) return;
    ctx.clearRect(0, 0, w, h);

    // 节拍脉冲逐帧衰减（约 10 帧回落到静止）
    beatPulse *= 0.88;

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      // 流动漂移（节拍能量轻微加速流动）
      const flow = 1 + beatEnergy * 0.6;
      p.x += p.vx * flow;
      p.y += p.vy * flow;

      // 鼠标轻微吸引，产生互动流动感
      const mdx = mouse.x - p.x;
      const mdy = mouse.y - p.y;
      const mdist = Math.hypot(mdx, mdy);
      if (mdist < MOUSE_RADIUS && mdist > 1) {
        const force = (1 - mdist / MOUSE_RADIUS) * 0.25;
        p.x += (mdx / mdist) * force;
        p.y += (mdy / mdist) * force;
      }

      // 边界环绕（流动不中断）
      if (p.x < -30) p.x = w + 30; else if (p.x > w + 30) p.x = -30;
      if (p.y < -30) p.y = h + 30; else if (p.y > h + 30) p.y = -30;

      // 呼吸闪烁
      p.twinkle += p.twinkleSpeed;
      const alpha = p.baseAlpha * (0.72 + 0.28 * Math.sin(p.twinkle));

      // 光晕（节拍脉冲放大光晕 + 能量提亮）
      const pulse = 1 + beatPulse * 0.7 + beatEnergy * 0.25;
      const glow = p.r * 3.5 * pulse;
      const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glow);
      grad.addColorStop(0, p.color);
      grad.addColorStop(1, "rgba(77,107,254,0)");
      ctx.globalAlpha = alpha * 0.35;
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, glow, 0, Math.PI * 2);
      ctx.fill();

      // 核心光点
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }

    // 粒子间连接线（形成星网流动感）
    ctx.lineWidth = 1;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const q = particles[j];
        const dx = p.x - q.x;
        const dy = p.y - q.y;
        const d = Math.hypot(dx, dy);
        if (d < LINK_DIST) {
          ctx.globalAlpha = (1 - d / LINK_DIST) * 0.12;
          ctx.strokeStyle = "#4D6BFE";
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(q.x, q.y);
          ctx.stroke();
        }
      }
    }

    ctx.globalAlpha = 1;
    rafId = requestAnimationFrame(step);
  }

  function start() {
    if (running) return;
    running = true;
    step();
  }
  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", function (e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
  });
  window.addEventListener("touchmove", function (e) {
    if (e.touches && e.touches.length) {
      mouse.x = e.touches[0].clientX;
      mouse.y = e.touches[0].clientY;
    }
  });
  window.addEventListener("mouseleave", function () {
    mouse.x = -9999;
    mouse.y = -9999;
  });

  // 页面不可见时暂停，节省资源
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop();
    else start();
  });

  resize();
  start();
})();
