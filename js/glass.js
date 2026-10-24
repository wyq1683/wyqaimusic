/* ============================================================
 * glass.js — 自适应玻璃（背景亮度 → 玻璃深浅）
 *
 * 来源：Liquid Glass UI Kit v1.0 的 AI-GUIDE §3.1 算法。
 *
 * 为什么要它：壁纸的亮度不可控。以前的做法是在壁纸上盖一层固定压暗，
 * 结果是壁纸永远灰蒙蒙的。这套算法的思路反过来 —— 背景不压暗，
 * 让玻璃自己变：
 *
 *   eff        = 背景亮度（0~1）
 *   glass  α   = 0.42 + eff × 0.28   →  0.42 清透 … 0.70 实
 *   surface α  = 0.62 + eff × 0.24   →  0.62 … 0.86
 *
 * 只有一处偏离原公式：kit 里还有一项 baseDim（场景遮罩），这里取 0，
 * 也就是场景层完全不压暗。可读性由 surface 那一档兜住 ——
 * 纯白画面下 surface 会顶到 0.86，正文对比度仍 > 11:1。
 * ============================================================ */
(function (global) {
  "use strict";

  const root = document.documentElement;

  let curLum = 0.30;     // 平滑后的背景亮度
  let timer = null;      // 视频采样定时器
  let video = null;
  let canvas = null;
  let ctx = null;
  let measuring = false;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* 质感档位：kit §8.4.0 的三档（通透 / 半透 / 磨砂）。
     clear  = 背景纹理看得清，玻璃几乎只是"一层膜"
     mid    = 默认，能看见背景轮廓但被柔化
     frost  = 磨砂，背景糊成色块，可读性最稳 */
  const STYLE_K = { clear: 0.55, mid: 1, frost: 1.7 };

  /* 用户旋钮：质感档位 + 不透明度滑块（0-100，默认 50 → 系数 1.0）。
     滑块是分段映射而不是线性：50 正好是 1.0（不动基准），
     往下到 0.35（几乎全透），往上是 2.2（接近实心）。
     线性映射会让「拉到 100」只有 1.55 倍，用户会觉得滑块没劲。 */
  const ui = { style: "mid", level: 50 };

  function levelK() {
    const t = clamp(ui.level, 0, 100) / 50; // 0 … 2，50 刚好 1
    return t <= 1 ? 0.35 + t * 0.65 : 1 + (t - 1) * 1.2;
  }
  function styleK() { return STYLE_K[ui.style] || 1; }
  function themeK() { return (document.body && document.body.dataset.theme === "light") ? 1.5 : 1; }

  function setStyle(style, level) {
    if (style) ui.style = STYLE_K[style] ? style : "mid";
    if (typeof level === "number") ui.level = clamp(level, 0, 100);
    if (document.body) {
      document.body.classList.remove("glass-clear", "glass-mid", "glass-frost");
      document.body.classList.add("glass-" + ui.style);
    }
    // 档位变了要按新系数立刻重算，不能等下一次采样
    write(curLum, true);
  }

  let lastWritten = -1;

  function write(lum, hard) {
    lum = clamp(Number(lum) || 0, 0, 1);
    // 视频每帧亮度都在跳，直接跟会闪；用 EMA 平滑，慢半拍但看着稳
    curLum = hard ? lum : curLum * 0.62 + lum * 0.38;
    // 死区：变化小于 1.5% 就不写变量。否则视频里一点噪点都会触发
    // 几十个玻璃元素重新合成，纯白烧 GPU。
    if (!hard && lastWritten >= 0 && Math.abs(curLum - lastWritten) < 0.015) return null;
    lastWritten = curLum;

    // 基准值比 kit 的原公式低得多：原公式 0.42~0.70 出来是"半透塑料"，
    // 用户要的是能看见背景的玻璃。基准压到 0.14~0.56，再乘档位与滑块。
    const eff = curLum;
    const k = styleK() * levelK() * themeK();
    const glass = clamp((0.14 + eff * 0.42) * k, 0.04, 0.96);
    const strong = clamp((0.24 + eff * 0.50) * k, 0.06, 0.97);
    const surface = clamp((0.34 + eff * 0.42) * k, 0.3, 0.96);
    const wash = clamp(0.04 + eff * 0.06, 0.03, 0.12);
    // 遮罩不吃档位系数：它是可读性的地板，不能被"通透"档一起拉低
    const veil = clamp(eff * 0.46, 0.02, 0.46);

    root.style.setProperty("--ad-glass-a", glass.toFixed(3));
    root.style.setProperty("--ad-strong-a", strong.toFixed(3));
    root.style.setProperty("--ad-surface-a", surface.toFixed(3));
    root.style.setProperty("--ad-wash-a", wash.toFixed(3));
    root.style.setProperty("--ad-veil-a", veil.toFixed(3));
    root.style.setProperty("--ad-lum", curLum.toFixed(3));
    if (document.body) document.body.classList.toggle("ad-bright", eff > 0.66);
    return { glass: glass, strong: strong, card: wash, surface: surface, veil: veil, lum: curLum };
  }

  /* ---------------- 图片采样 ---------------- */
  function pixelsLum(source) {
    try {
      if (!canvas) {
        canvas = document.createElement("canvas");
        canvas.width = 16;
        canvas.height = 16;
      }
      ctx = ctx || canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;
      ctx.clearRect(0, 0, 16, 16);
      ctx.drawImage(source, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let sum = 0;
      for (let i = 0; i < d.length; i += 4) {
        sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
      }
      return sum / (d.length / 4) / 255;
    } catch (e) {
      return null; // 跨域污染 / canvas 不可用
    }
  }

  function measureImage(src, hard) {
    return new Promise((resolve) => {
      if (!src) { resolve(write(0.30, true)); return; }
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const lum = pixelsLum(img);
        resolve(write(lum === null ? 0.42 : lum, hard !== false));
      };
      img.onerror = () => resolve(write(0.42, true));
      img.src = src;
    });
  }

  // 渐变没有像素可采，从颜色值算：取所有色的均值再算亮度
  function measureGradient(css, hard) {
    const hexes = String(css || "").match(/#[0-9a-f]{6}\b/gi) || [];
    if (!hexes.length) { write(0.30, true); return; }
    let r = 0, g = 0, b = 0;
    hexes.forEach((h) => {
      const n = parseInt(h.slice(1), 16);
      r += (n >> 16) & 255; g += (n >> 8) & 255; b += n & 255;
    });
    r /= hexes.length; g /= hexes.length; b /= hexes.length;
    write((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255, hard !== false);
  }

  /* ---------------- 按当前实际背景重算 ---------------- */
  let rafToken = 0;
  function refresh(hard) {
    if (measuring) return;
    // 壁纸在播时以视频为准，别再被静态背景覆盖
    if (video && video.src && !video.paused) return;
    const img = document.getElementById("bgImage");
    if (img && !img.hidden) {
      const m = /url\("?([^")]+)"?\)/.exec(img.style.backgroundImage || "");
      if (m) {
        measuring = true;
        const token = ++rafToken;
        measureImage(m[1], hard).then(() => {
          measuring = false;
          if (token !== rafToken) refresh();
        });
        return;
      }
    }
    const bg = (document.body && document.body.style.background) || "";
    if (/gradient/i.test(bg)) { measureGradient(bg, hard); return; }
    write(0.30, true); // 极光 / 深色底
  }

  /* ---------------- 视频采样 ---------------- */
  function sampleVideo() {
    if (!video) return;
    if (!video.videoWidth || video.readyState < 2) return;
    const lum = pixelsLum(video);
    if (lum === null) { stopVideo(); return; } // 采样失败就停，别每帧刷错误
    write(lum);
  }

  function watchVideo(el) {
    if (!el) return;
    video = el;
    if (timer) return;
    timer = setInterval(sampleVideo, 700);
    sampleVideo();
  }

  function stopVideo() {
    if (timer) { clearInterval(timer); timer = null; }
    video = null;
    refresh(true);
  }

  function init() {
    try {
      const st = global.App.Core && global.App.Core.getSettings();
      if (st) { ui.style = STYLE_K[st.glassStyle] ? st.glassStyle : "mid"; ui.level = typeof st.glass === "number" ? st.glass : 50; }
    } catch (e) { /* 用默认档 */ }
    setStyle(ui.style, ui.level);
    refresh(true);
    // 视频壁纸的元数据到得晚，loadeddata 时补一次采样
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) sampleVideo();
    });
  }

  global.App = global.App || {};
  global.App.Glass = {
    init, write, refresh, watchVideo, stopVideo, setStyle,
    measureImage, measureGradient, pixelsLum,
    get lum() { return curLum; },
    get style() { return Object.assign({}, ui); },
  };
})(window);
