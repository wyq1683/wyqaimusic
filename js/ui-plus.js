/* ============================================================
 * ui-plus.js — Wave 布局改版伴生脚本（新增文件，不修改任何原有 JS）
 * ------------------------------------------------------------
 * 只负责 index.html 里【新增】的四块结构：
 *   1) 侧栏折叠（body.rail-mini）
 *   2) 顶栏全局搜索（跳转到原有搜索页并回填关键词）
 *   3) 首页「继续播放」续听条（读原有播放历史）
 *   4) 右侧播放工作台（队列 / 歌词 / 外观）
 * 全部通过 window.App 暴露的公开接口调用，不碰内部实现。
 * 回滚：删除 index.html 里引用本文件的那一行即可。
 * ============================================================ */
(function (global) {
  "use strict";

  var doc = document;
  var body = doc.body;

  function ready(fn) {
    if (doc.readyState === "complete" || doc.readyState === "interactive") setTimeout(fn, 0);
    else doc.addEventListener("DOMContentLoaded", fn);
  }

  function $(id) { return doc.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.round(Number(sec) || 0));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }
  function ago(ts) {
    var d = Date.now() - (Number(ts) || 0);
    if (!(d >= 0)) return "刚刚";
    var min = Math.floor(d / 60000);
    if (min < 1) return "刚刚";
    if (min < 60) return min + " 分钟前";
    var h = Math.floor(min / 60);
    if (h < 24) return h + " 小时前";
    var day = Math.floor(h / 24);
    if (day < 7) return day + " 天前";
    return new Date(Number(ts)).toLocaleDateString("zh-CN");
  }
  function coverStyle(s) {
    if (s && s.c && s.c.from) return "background:linear-gradient(135deg," + s.c.from + "," + s.c.to + ")";
    return "background:linear-gradient(135deg,#4D6BFE,#8B5CF6)";
  }
  function coverInner(s) {
    if (s && s.coverUrl) return '<img src="' + esc(s.coverUrl) + '" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover" onerror="this.remove()" />';
    return '<span aria-hidden="true">' + esc((s && s.emoji) || "🎵") + "</span>";
  }

  ready(function () {
    var App = global.App;
    if (!App || !App.Player || !App.Store || !App.DATA) return; // 原有脚本未加载则整体不动作
    var P = App.Player, S = App.Store, D = App.DATA, UI = App.UI || {};

    /* ================= 1. 侧栏折叠 ================= */
    (function railCollapse() {
      var btn = $("railToggle");
      if (!btn) return;
      var KEY = "mp_rail_mini";
      var navItems = doc.querySelectorAll("#nav .nav-item, .download-app");
      // 折叠后文字隐藏，补 title 作为悬停提示（不改原有文案）
      navItems.forEach(function (el) {
        if (!el.getAttribute("title")) {
          var txt = (el.textContent || "").replace(/\s+/g, "").trim();
          if (txt) el.setAttribute("title", txt);
        }
      });
      function apply(on) {
        body.classList.toggle("rail-mini", !!on);
        btn.setAttribute("aria-label", on ? "展开导航" : "折叠导航");
        btn.setAttribute("title", on ? "展开导航" : "折叠导航");
        try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch (e) {}
      }
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (e) {}
      if (saved === "1" && global.innerWidth > 768) apply(true);
      btn.addEventListener("click", function () { apply(!body.classList.contains("rail-mini")); });
    })();

    /* ================= 2. 顶栏全局搜索 ================= */
    (function globalSearch() {
      var box = $("globalSearch"), input = $("globalSearchInput");
      if (!box || !input) return;
      function goSearch(kw) {
        if (UI.navigate) UI.navigate("/search");
        else location.hash = "#/search";
        // 等原有搜索页渲染出 #mainSearch 再回填，触发它自己的 input 监听
        setTimeout(function () {
          var ms = $("mainSearch");
          if (!ms) return;
          ms.value = kw || "";
          ms.dispatchEvent(new Event("input", { bubbles: true }));
          if (kw) ms.focus();
        }, 80);
      }
      box.addEventListener("click", function () {
        // 窄屏下输入框被隐藏，整个胶囊当作「去搜索」按钮
        if (global.innerWidth <= 768) goSearch("");
      });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); goSearch(input.value.trim()); }
        if (e.key === "Escape") { input.value = ""; input.blur(); }
      });
      doc.addEventListener("keydown", function (e) {
        if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
          e.preventDefault();
          if (global.innerWidth > 768) input.focus();
          else goSearch("");
        }
      });
    })();

    /* ================= 3. 首页继续播放（续听条） ================= */
    var resumeApi = (function resumeBar() {
      var bar = $("resumeBar"), list = $("resumeList"), sub = $("resumeSub"), all = $("resumeAll");
      if (!bar || !list) return { render: function () {} };
      var ids = [];

      function historyIds() {
        if (!S.isLoggedIn || !S.isLoggedIn()) return [];
        var d = (S.getUserData && S.getUserData()) || {};
        var his = (d.history || []).slice().sort(function (a, b) { return (b.last || 0) - (a.last || 0); });
        var seen = {}, out = [];
        his.forEach(function (h) {
          if (out.length >= 8) return;
          if (!h || !h.id || seen[h.id]) return;
          if (!D.get(h.id)) return; // 外部歌曲未注册时跳过，避免点了没反应
          seen[h.id] = 1;
          out.push(h);
        });
        return out;
      }

      function render() {
        var isHome = (location.hash || "#/home").replace("#", "") === "/home";
        var items = isHome ? historyIds() : [];
        ids = items.map(function (h) { return h.id; });
        if (!items.length) { bar.hidden = true; list.innerHTML = ""; return; }
        bar.hidden = false;
        if (sub) sub.textContent = "最近 " + items.length + " 首 · " + ago(items[0].last);
        list.innerHTML = items.map(function (h) {
          var s = D.get(h.id);
          return '<div class="resume-item" data-rid="' + esc(s.id) + '" role="button" tabindex="0" title="播放 ' + esc(s.title) + '">' +
            '<div class="resume-cover" style="' + coverStyle(s) + '">' + coverInner(s) + "</div>" +
            '<div style="min-width:0">' +
              '<div class="resume-t">' + esc(s.title) + "</div>" +
              '<div class="resume-a">' + esc(s.artist) + (s.album ? " · " + esc(s.album) : "") + "</div>" +
              '<div class="resume-when"><i></i>' + ago(h.last) + (h.weight > 1 ? " · 播放 " + h.weight + " 次" : "") + "</div>" +
            "</div>" +
            '<button class="resume-play" type="button" data-rid="' + esc(s.id) + '" aria-label="播放 ' + esc(s.title) + '">' +
              '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>' +
            "</button>" +
          "</div>";
        }).join("");
      }

      function playId(id) {
        if (!id) return;
        var queue = ids.length ? ids : [id];
        P.playSong(id, queue);
        if (UI.toast) UI.toast("已从续听列表播放");
      }

      list.addEventListener("click", function (e) {
        var t = e.target.closest("[data-rid]");
        if (t) playId(t.getAttribute("data-rid"));
      });
      list.addEventListener("keydown", function (e) {
        if (e.key !== "Enter" && e.key !== " ") return;
        var t = e.target.closest(".resume-item");
        if (t) { e.preventDefault(); playId(t.getAttribute("data-rid")); }
      });
      if (all) all.addEventListener("click", function () { if (ids.length) playId(ids[0]); });

      global.addEventListener("hashchange", function () { setTimeout(render, 60); });
      return { render: render };
    })();

    /* ================= 4. 右侧播放工作台 ================= */
    (function workbench() {
      var panel = $("workbench"), toggle = $("wbToggle"), close = $("wbClose");
      var qPane = $("wbQueue"), lPane = $("wbLyric"), count = $("wbQueueCount");
      if (!panel || !toggle) return;
      var KEY = "mp_wb_open";
      var activeTab = "queue";

      function setOpen(on) {
        body.classList.toggle("wb-open", !!on);
        panel.hidden = !on;
        toggle.classList.toggle("active", !!on);
        toggle.setAttribute("aria-expanded", on ? "true" : "false");
        try { on ? localStorage.setItem(KEY, "1") : localStorage.removeItem(KEY); } catch (e) {}
        if (on) { renderQueue(); renderLyric(); }
      }
      toggle.addEventListener("click", function () { setOpen(!body.classList.contains("wb-open")); });
      if (close) close.addEventListener("click", function () { setOpen(false); });
      doc.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && body.classList.contains("wb-open") && global.innerWidth <= 1180) setOpen(false);
      });

      /* ---- Tab 切换 ---- */
      panel.addEventListener("click", function (e) {
        var t = e.target.closest(".wb-tab");
        if (!t) return;
        activeTab = t.getAttribute("data-wb");
        panel.querySelectorAll(".wb-tab").forEach(function (b) { b.classList.toggle("active", b === t); });
        if (qPane) qPane.hidden = activeTab !== "queue";
        if (lPane) lPane.hidden = activeTab !== "lyric";
        var look = $("wbLook"); if (look) look.hidden = activeTab !== "look";
        if (activeTab === "queue") renderQueue();
        if (activeTab === "lyric") renderLyric();
      });

      /* ---- 队列 ---- */
      function renderQueue() {
        if (!qPane) return;
        var st = P.getState ? P.getState() : null;
        var queue = (st && st.queue) || [];
        var idx = st ? st.index : -1;
        if (count) count.textContent = String(queue.length);
        if (!queue.length) {
          qPane.innerHTML = '<div class="wb-q-empty"><span class="ic">🎧</span>队列还是空的<br />去首页或曲库点一首歌，这里会实时列出播放顺序</div>';
          return;
        }
        qPane.innerHTML = queue.map(function (id, i) {
          var s = D.get(id);
          if (!s) return "";
          var cur = i === idx ? " current" : "";
          return '<div class="wb-q-item' + cur + '" data-qid="' + esc(s.id) + '" role="button" tabindex="0" title="' + esc(s.title) + '">' +
            '<div class="wb-q-cover" style="' + coverStyle(s) + '">' + coverInner(s) + "</div>" +
            '<div style="min-width:0"><div class="wb-q-title">' + (i === idx ? "▶ " : "") + esc(s.title) + "</div>" +
            '<div class="wb-q-artist">' + esc(s.artist) + "</div></div>" +
            '<span class="wb-q-dur">' + fmtDur(s.dur) + "</span>" +
          "</div>";
        }).join("");
      }
      if (qPane) {
        qPane.addEventListener("click", function (e) {
          var t = e.target.closest("[data-qid]");
          if (!t) return;
          var st = P.getState();
          P.playSong(t.getAttribute("data-qid"), st.queue);
        });
      }

      /* ---- 歌词（镜像播放页已加载的歌词，不重复请求接口） ---- */
      var lyricRaf = 0;
      function renderLyric() {
        if (!lPane) return;
        var src = $("lyricsList");
        var html = src ? src.innerHTML.trim() : "";
        var has = html && !/lyric-empty/.test(html);
        if (has) {
          lPane.innerHTML = html;
        } else {
          var st = P.getState ? P.getState() : null;
          var name = st && st.song ? st.song.title : "";
          lPane.innerHTML = '<div class="wb-l-empty"><span class="ic">📝</span>' +
            (name ? "《" + esc(name) + "》" : "当前歌曲") + "的歌词尚未加载<br />歌词由播放页拉取，打开播放页后这里会自动同步" +
            '<div style="margin-top:14px"><button class="wb-btn" id="wbGoNp" type="button">打开播放页</button></div></div>';
          var go = $("wbGoNp");
          if (go) go.addEventListener("click", function () {
            if (UI.navigate) UI.navigate("/nowplaying"); else location.hash = "#/nowplaying";
          });
        }
      }
      // 播放页歌词更新时同步（节流到每帧一次）
      var mo = new MutationObserver(function () {
        if (lyricRaf) return;
        lyricRaf = requestAnimationFrame(function () {
          lyricRaf = 0;
          if (activeTab === "lyric" && body.classList.contains("wb-open")) renderLyric();
        });
      });
      mo.observe(body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["class"] });

      /* ---- 外观：与原有「更换背景 / 音量增强」同源 ---- */
      (function lookPane() {
        var themeBtn = $("wbTheme"), blur = $("wbBlur"), blurVal = $("wbBlurVal");
        var glass = $("wbGlass"), glassVal = $("wbGlassVal"), bgBtn = $("wbBg"), boostBox = $("wbBoost");

        if (themeBtn) themeBtn.addEventListener("click", function () {
          var t = $("themeToggle");
          if (t) { t.click(); return; } // 复用原有主题切换逻辑（含持久化）
          var light = doc.documentElement.classList.toggle("light");
          try { localStorage.setItem("mp_theme", light ? "light" : "dark"); } catch (e) {}
        });

        // 读取当前值，与原有设置保持一致
        var curBlur = 6, curGlass = 30;
        try {
          var b = parseFloat(localStorage.getItem("mp_bg_blur_px"));
          if (!isNaN(b) && b >= 0 && b <= 30) curBlur = b;
          var g = parseFloat(localStorage.getItem("mp_glass"));
          if (!isNaN(g) && g >= 0 && g <= 1) curGlass = Math.round(g * 100);
        } catch (e) {}
        if (blur) { blur.value = curBlur; if (blurVal) blurVal.textContent = curBlur + "px"; }
        if (glass) { glass.value = curGlass; if (glassVal) glassVal.textContent = curGlass + "%"; }

        if (blur) blur.addEventListener("input", function () {
          var px = Math.max(0, Math.min(30, Number(blur.value) || 0));
          doc.documentElement.style.setProperty("--bg-blur", px + "px");
          try { localStorage.setItem("mp_bg_blur_px", String(px)); } catch (e) {}
          if (blurVal) blurVal.textContent = px + "px";
          var mr = $("bgBlurRange"), mv = $("bgBlurValue");
          if (mr) mr.value = px; if (mv) mv.textContent = px + "px";
        });
        if (glass) glass.addEventListener("input", function () {
          var pctv = Math.max(0, Math.min(100, Number(glass.value) || 0));
          var v = pctv / 100;
          doc.documentElement.style.setProperty("--glass-alpha", v.toFixed(2));
          try { localStorage.setItem("mp_glass", v.toFixed(2)); } catch (e) {}
          if (glassVal) glassVal.textContent = pctv + "%";
          var gr = $("bgGlassRange"), gv = $("bgGlassValue");
          if (gr) gr.value = pctv; if (gv) gv.textContent = pctv + "%";
        });

        if (bgBtn) bgBtn.addEventListener("click", function () {
          var item = doc.querySelector('#pbMenu [data-menu="bg"]');
          if (item) item.click(); // 复用原有背景设置弹窗
          else if (UI.toast) UI.toast("请在播放条「更多」里打开背景设置");
        });

        if (boostBox) {
          var lvl = 1;
          try { lvl = Number(P.getBoostLevel && P.getBoostLevel()) || 1; } catch (e) {}
          boostBox.querySelectorAll(".wb-chip").forEach(function (c) {
            c.classList.toggle("active", Math.abs(parseFloat(c.getAttribute("data-boost")) - lvl) < 0.01);
            c.addEventListener("click", function () {
              var v = parseFloat(c.getAttribute("data-boost")) || 1;
              boostBox.querySelectorAll(".wb-chip").forEach(function (x) { x.classList.toggle("active", x === c); });
              try {
                if (v <= 1) { if (P.resetBoost) P.resetBoost(); }
                else if (P.boostVolume) P.boostVolume(v);
              } catch (e) {}
              var hint = $("boostHint");
              if (hint) hint.textContent = Math.round(v * 100) + "%";
              if (UI.toast) UI.toast("音量增强 " + Math.round(v * 100) + "%");
            });
          });
        }
      })();

      /* ---- 跟随播放状态刷新 ---- */
      if (P.on) {
        P.on("track", function () { renderQueue(); renderLyric(); resumeApi.render(); });
        P.on("state", function () { if (activeTab === "queue") renderQueue(); });
        P.on("ended", function () { setTimeout(renderQueue, 300); });
      }

      // 初始状态
      var saved = null;
      try { saved = localStorage.getItem(KEY); } catch (e) {}
      if (saved === "1" && global.innerWidth > 1180) setOpen(true);
      else { panel.hidden = true; }
      renderQueue();
      setInterval(function () {
        if (body.classList.contains("wb-open") && activeTab === "queue") renderQueue();
      }, 4000);
    })();

    /* ================= 5. 首次进入渲染续听条 ================= */
    setTimeout(function () { resumeApi.render(); }, 400);
    setTimeout(function () { resumeApi.render(); }, 1600);
    if (P.on) P.on("track", function () { setTimeout(function () { resumeApi.render(); }, 800); });
  });
})(window);
