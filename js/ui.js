/* ============================================================
 * ui.js — 外壳渲染 / 通用组件 / 浮层系统
 * 侧栏 / 底栏 / 播放条 / 抽屉 / 模态 / 吐司 / 菜单 / 命令面板
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const D = global.App.DATA;
  const bus = C.bus;
  const { $, $$, el, icon, esc } = C;

  /* ==================== 封面 ==================== */
  function coverStyle(song) {
    if (song && song.coverUrl) return "background:#111";
    if (song && song.c) {
      return "background:linear-gradient(150deg," + song.c.from + "," + song.c.to + ")";
    }
    return "background:" + C.gradientFor(song ? song.title : "wave");
  }
  function coverHTML(song, cls) {
    if (!song) return '<div class="cover ' + (cls || "") + '"></div>';
    const inner = song.coverUrl
      ? '<img src="' + esc(song.coverUrl) + '" alt="' + esc(song.title) + '" loading="lazy" />'
      : '<span class="cover-emoji">' + (song.emoji || "🎵") + "</span>";
    return '<div class="cover ' + (cls || "") + '" style="' + coverStyle(song) + '">' + inner + '<span class="cover-noise"></span></div>';
  }
  function smallCover(song, cls) {
    if (!song) return '<div class="' + (cls || "") + '"></div>';
    const inner = song.coverUrl
      ? '<img src="' + esc(song.coverUrl) + '" alt="" loading="lazy" />'
      : (song.emoji || "🎵");
    return '<div class="' + (cls || "") + '" style="' + coverStyle(song) + '">' + inner + "</div>";
  }

  /* ==================== 区块 / 空状态 ==================== */
  function sectionHead(title, sub, moreHref, moreText) {
    return (
      '<div class="sec-head">' +
      '<div class="sec-title">' + esc(title) + "</div>" +
      (sub ? '<div class="sec-sub">' + esc(sub) + "</div>" : "") +
      (moreHref
        ? '<a class="sec-more" href="#' + moreHref + '">' + esc(moreText || "查看全部") + C.icon("chev-right", 13) + "</a>"
        : "") +
      "</div>"
    );
  }

  function emptyState(ic, title, sub, actionHtml) {
    return (
      '<div class="empty">' +
      '<div class="empty-ic">' + C.icon(ic, 26) + "</div>" +
      '<div class="empty-title">' + esc(title) + "</div>" +
      (sub ? '<div class="empty-sub">' + esc(sub) + "</div>" : "") +
      (actionHtml || "") +
      "</div>"
    );
  }

  /* ==================== 歌曲卡片 / 行 ==================== */
  function songCard(song) {
    const playing = C.currentPlaying && C.currentPlaying.id === song.id;
    return (
      '<div class="song-card" data-song="' + esc(song.id) + '" data-action="play-song">' +
      (song.vip ? '<span class="card-badge">VIP</span>' : "") +
      coverHTML(song) +
      '<button class="card-play" data-action="play-song" data-song="' + esc(song.id) + '" aria-label="播放 ' + esc(song.title) + '">' +
        '<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></button>' +
      '<div class="card-title ellipsis">' + esc(song.title) + "</div>" +
      '<div class="card-sub ellipsis">' + esc(song.artist) + (playing ? ' · <span style="color:var(--accent-text)">播放中</span>' : "") + "</div>" +
      "</div>"
    );
  }

  function songRow(song, index, opts) {
    opts = opts || {};
    const playing = C.currentPlaying && C.currentPlaying.id === song.id;
    const isCur = C.currentPlaying && C.currentPlaying.id === song.id;
    return (
      '<div class="song-row' + (isCur ? " playing" : "") + '" data-song="' + esc(song.id) + '" data-action="play-song">' +
      '<div class="sr-idx">' +
        '<span class="sr-num">' + (opts.index !== false ? (index + 1) : "") + "</span>" +
        (playing
          ? '<span class="eq-bars"><i></i><i></i><i></i><i></i></span>'
          : '<span class="sr-play-ic"><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg></span>') +
      "</div>" +
      '<div class="sr-main">' + smallCover(song, "sr-cover") +
        '<div class="grow"><div class="sr-title ellipsis">' + esc(song.title) + "</div>" +
        '<div class="sr-artist ellipsis">' + esc(song.artist) + (song.vip ? ' <span style="color:var(--warning);font-size:0.66rem">VIP</span>' : "") + "</div></div>" +
      "</div>" +
      '<div class="sr-album ellipsis">' + esc(song.album || "") + "</div>" +
      '<div class="sr-dur">' + (song.durStr || "0:00") + "</div>" +
      '<div class="sr-ops"><button class="icon-btn" data-action="song-menu" data-song="' + esc(song.id) + '" aria-label="更多操作">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button></div>' +
      "</div>"
    );
  }

  function songListHTML(songs, opts) {
    if (!songs || !songs.length) return "";
    return '<div class="lib-list stagger">' + songs.map((s, i) => songRow(s, i, opts)).join("") + "</div>";
  }

  function cardGridHTML(songs, emptyHtml) {
    if (!songs || !songs.length) return emptyHtml || "";
    return '<div class="card-grid stagger">' + songs.map(songCard).join("") + "</div>";
  }

  /* ==================== Toast ==================== */
  function toast(msg, type) {
    const wrap = $("#toastWrap");
    const t = el("div", "toast " + (type || ""));
    const ic = type === "error" ? "close" : type === "success" ? "check" : "sparkle";
    t.innerHTML = '<span class="t-ic">' + C.icon(ic, 15) + "</span><span>" + esc(msg) + "</span>";
    wrap.appendChild(t);
    setTimeout(() => {
      t.classList.add("out");
      setTimeout(() => t.remove(), 300);
    }, 2400);
  }

  /* ==================== 模态 ==================== */
  let activeModal = null;

  function modal(opts) {
    closeModal();
    const mask = el("div", "modal-mask");
    mask.setAttribute("role", "dialog");
    mask.setAttribute("aria-modal", "true");
    const box = el("div", "modal");
    if (opts.width) box.style.width = opts.width;
    box.innerHTML =
      '<div class="modal-head"><div class="modal-title">' + esc(opts.title || "") + "</div>" +
      '<button class="icon-btn" data-close aria-label="关闭">' + C.icon("close", 15) + "</button></div>" +
      '<div class="modal-body"></div>' +
      (opts.actions
        ? '<div class="modal-actions">' +
          (opts.actions.cancel ? '<button class="btn btn-ghost" data-close>' + esc(opts.actions.cancel) + "</button>" : "") +
          (opts.actions.ok ? '<button class="btn btn-primary" data-ok>' + esc(opts.actions.ok) + "</button>" : "") +
          "</div>"
        : "");
    const body = $(".modal-body", box);
    if (typeof opts.body === "string") body.innerHTML = opts.body;
    else if (opts.body) body.appendChild(opts.body);

    mask.appendChild(box);
    $("#modalRoot").appendChild(mask);
    activeModal = { mask, box, opts };

    mask.addEventListener("click", (e) => { if (e.target === mask) closeModal(); });
    $$("[data-close]", box).forEach((b) => b.addEventListener("click", closeModal));
    const okBtn = $("[data-ok]", box);
    if (okBtn && opts.onOk) okBtn.addEventListener("click", () => opts.onOk(box, closeModal));

    const first = $("input,textarea", box);
    if (first) setTimeout(() => first.focus(), 80);
    return box;
  }

  function closeModal() {
    if (!activeModal) return;
    const { mask } = activeModal;
    activeModal = null;
    mask.classList.add("closing");
    setTimeout(() => mask.remove(), 160);
  }

  function confirmDialog(opts) {
    return new Promise((resolve) => {
      const body =
        '<div style="font-size:0.88rem;color:var(--text-2);line-height:1.65">' + esc(opts.message || "") + "</div>" +
        (opts.input
          ? '<div class="field" style="margin-top:14px"><input class="field-input" id="cfmInput" placeholder="' + esc(opts.inputPlaceholder || "") + '" value="' + esc(opts.inputValue || "") + '" maxlength="200" /></div>'
          : "");
      modal({
        title: opts.title || "确认操作",
        body,
        actions: { cancel: "取消", ok: opts.okText || "确定" },
        onOk: (box, close) => {
          const v = opts.input ? $("#cfmInput", box).value.trim() : true;
          if (opts.input && !v) { toast("请输入内容", "error"); return; }
          close();
          resolve(v);
        },
      });
      // 取消也要 resolve(false)
      const obs = new MutationObserver(() => {
        if (!document.body.contains($("#modalRoot"))) return;
      });
      const cancelBtn = $$("#modalRoot [data-close]").pop();
      if (cancelBtn) cancelBtn.addEventListener("click", () => resolve(false), { once: true });
      obs.disconnect();
    });
  }

  /* ==================== 上下文菜单 ==================== */
  function contextMenu(items, x, y) {
    closeMenu();
    const mask = el("div", "menu-mask");
    const menu = el("div", "menu");
    menu.setAttribute("role", "menu");
    items.forEach((it) => {
      if (it.sep) { menu.appendChild(el("div", "menu-sep")); return; }
      const b = el("button", "menu-item" + (it.danger ? " danger" : ""));
      b.setAttribute("role", "menuitem");
      b.innerHTML =
        (it.icon ? C.icon(it.icon, 15) : "") +
        "<span>" + esc(it.label) + "</span>" +
        (it.hint ? '<span class="mi-hint">' + esc(it.hint) + "</span>" : "");
      b.addEventListener("click", () => {
        closeMenu();
        if (it.onClick) it.onClick();
      });
      menu.appendChild(b);
    });
    mask.appendChild(menu);
    document.body.appendChild(mask);
    mask.addEventListener("click", closeMenu);
    // 定位（防溢出）—— menu 必须留在 mask 内，才能随 mask 一起被移除。
    // 用 offsetWidth/offsetHeight 而不是 getBoundingClientRect：菜单带 pop-in 缩放动画，
    // rect 量到的是缩放中的尺寸，会导致贴右边时仍溢出屏幕。
    const mw = menu.offsetWidth;
    const mh = menu.offsetHeight;
    const px = Math.max(8, Math.min(x, window.innerWidth - mw - 12));
    const py = Math.max(8, Math.min(y, window.innerHeight - mh - 12));
    menu.style.left = px + "px";
    menu.style.top = py + "px";
    window.__activeMenu = { mask, menu };
  }
  function closeMenu() {
    if (window.__activeMenu) {
      window.__activeMenu.mask.remove();
      window.__activeMenu.menu.remove();
      window.__activeMenu = null;
    }
    // 兜底：清掉历史遗留的游离菜单（旧版 bug 会把 menu 挂在 body 上，遮罩删了它还在）
    $$("body > .menu").forEach((n) => n.remove());
  }

  /* ==================== 命令面板（Ctrl+K） ==================== */
  function openPalette() {
    closePalette();
    const mask = el("div", "palette-mask");
    const box = el("div", "palette");
    box.innerHTML =
      '<div class="palette-input-row">' + C.icon("search", 17) +
      '<input id="paletteInput" placeholder="搜索歌曲、跳转页面、执行命令…" autocomplete="off" />' +
      '<kbd style="font-size:0.66rem;color:var(--text-3);border:1px solid var(--hairline);padding:2px 6px;border-radius:6px">ESC</kbd></div>' +
      '<div class="palette-list" id="paletteList"></div>';
    mask.appendChild(box);
    $("#paletteRoot").appendChild(mask);
    const input = $("#paletteInput", box);
    const list = $("#paletteList", box);
    input.focus();

    const render = debounceRender();
    function debounceRender() {
      let t = null;
      return (q) => {
        clearTimeout(t);
        t = setTimeout(() => renderList(q), 120);
      };
    }

    function renderList(q) {
      q = (q || "").trim();
      let html = "";
      if (!q) {
        html += '<div class="palette-group">快速跳转</div>';
        html += paletteItem("home", "发现", "首页推荐", "#/home");
        html += paletteItem("library", "曲库", "36 首本地曲目", "#/library");
        html += paletteItem("search", "搜索", "网易云 / QQ / Audius", "#/search");
        html += paletteItem("users", "社交", "好友与分享", "#/social");
        html += paletteItem("user", "我的", "个人中心", "#/profile");
        html += paletteItem("settings", "设置", "主题与背景", "#/settings");
        html += '<div class="palette-group">最近播放</div>';
        const rec = global.App.Recommend.recent(5);
        if (rec.length) {
          rec.forEach((s) => {
            html +=
              '<button class="palette-item" data-play="' + esc(s.id) + '">' +
              '<span class="palette-cover" style="' + coverStyle(s) + '">' + (s.coverUrl ? '<img src="' + esc(s.coverUrl) + '"/>' : (s.emoji || "🎵")) + "</span>" +
              "<span>" + esc(s.title) + "</span><span class='pi-sub'>" + esc(s.artist) + "</span></button>";
          });
        } else {
          html += '<div style="padding:10px 14px;color:var(--text-3);font-size:0.8rem">还没有播放记录</div>';
        }
      } else {
        // 本地搜索
        const localHits = D.SONGS.filter(
          (s) => (s.title + s.artist + s.album).toLowerCase().includes(q.toLowerCase())
        ).slice(0, 6);
        if (localHits.length) {
          html += '<div class="palette-group">本地曲库</div>';
          localHits.forEach((s) => {
            html +=
              '<button class="palette-item" data-play="' + esc(s.id) + '">' +
              '<span class="palette-cover" style="' + coverStyle(s) + '">' + (s.coverUrl ? '<img src="' + esc(s.coverUrl) + '"/>' : (s.emoji || "🎵")) + "</span>" +
              "<span>" + esc(s.title) + "</span><span class='pi-sub'>" + esc(s.artist) + "</span></button>";
          });
        }
        html += '<div class="palette-group">在线音源</div>';
        html +=
          '<button class="palette-item" data-online="' + esc(q) + '"><span class="pi-ic">' + C.icon("search", 15) + "</span>" +
          "<span>全网搜索「" + esc(q) + "」</span><span class='pi-sub'>网易云 / QQ / Audius</span></button>";
      }
      list.innerHTML = html;
      $$(".palette-item", list).forEach((b) => {
        b.addEventListener("click", () => {
          const playId = b.dataset.play;
          const online = b.dataset.online;
          const href = b.dataset.href;
          closePalette();
          if (playId) {
            global.App.Player.playList([playId], 0);
          } else if (online) {
            location.hash = "#/search?q=" + encodeURIComponent(online);
          } else if (href) {
            location.hash = href;
          }
        });
      });
    }

    function paletteItem(ic, label, sub, href) {
      return (
        '<button class="palette-item" data-href="' + href + '"><span class="pi-ic">' + C.icon(ic, 15) + "</span>" +
        "<span>" + esc(label) + "</span><span class='pi-sub'>" + esc(sub) + "</span></button>"
      );
    }

    input.addEventListener("input", () => render(input.value));
    mask.addEventListener("click", (e) => { if (e.target === mask) closePalette(); });
    renderList("");
  }
  function closePalette() {
    const root = $("#paletteRoot");
    if (root) root.innerHTML = "";
  }

  /* ==================== 歌曲操作菜单 ==================== */
  function songActions(song, ev) {
    if (!song) return;
    const fav = C.isFavorite(song.id);
    const items = [
      { icon: "play", label: "立即播放", onClick: () => global.App.Player.playList([song.id], 0) },
      { icon: "plus", label: "下一首播放", onClick: () => {
          const q = global.App.Player.queueList();
          q.splice(global.App.Player.state.index + 1, 0, song.id);
          global.App.Player.setQueue(q, global.App.Player.state.index);
          toast("已添加到下一首", "success");
        } },
      { sep: true },
      { icon: fav ? "heart-fill" : "heart", label: fav ? "取消收藏" : "收藏", onClick: () => {
          if (!C.isLoggedIn()) { toast("请先登录", "error"); openAuthModal("login"); return; }
          C.toggleFavorite(song.id);
          toast(fav ? "已取消收藏" : "已加入收藏", "success");
          refreshCurrentView();
        } },
      { icon: "playlist", label: "添加到歌单", onClick: () => openPlaylistPicker(song) },
      { icon: "users", label: "分享给好友", onClick: () => openShareModal(song) },
      { sep: true },
      { icon: "disc", label: "查看专辑", onClick: () => { location.hash = "#/album/" + encodeURIComponent(song.album || ""); } },
      { icon: "user", label: "查看艺人", onClick: () => { location.hash = "#/artist/" + encodeURIComponent(song.artist || ""); } },
    ];
    if (song.external) {
      items.push({ icon: "download", label: "下载歌曲", onClick: () => downloadSong(song) });
    }
    const r = (ev && ev.currentTarget && ev.currentTarget.getBoundingClientRect) ? ev.currentTarget.getBoundingClientRect() : null;
    contextMenu(items, r ? r.left : (ev ? ev.clientX : 100), r ? r.bottom + 6 : (ev ? ev.clientY : 100));
  }

  function downloadSong(song) {
    const a = document.createElement("a");
    a.href = song.audio;
    a.download = (song.title || "wave") + ".mp3";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast("开始下载 " + song.title);
  }

  /* ==================== 登录 / 注册 ==================== */
  let authTab = "login";

  function openAuthModal(tab) {
    authTab = tab || "login";
    const body =
      '<div class="auth-tabs" style="display:flex;gap:6px;margin-bottom:18px;background:var(--glass-card);padding:4px;border-radius:var(--r-full)">' +
      '<button class="btn ' + (authTab === "login" ? "btn-primary" : "btn-ghost") + '" style="flex:1" data-atab="login">登录</button>' +
      '<button class="btn ' + (authTab === "register" ? "btn-primary" : "btn-ghost") + '" style="flex:1" data-atab="register">注册</button>' +
      "</div>" +
      '<div class="field"><label class="field-label">用户名</label><input class="field-input" id="authUser" placeholder="至少 3 个字符" autocomplete="username" /></div>' +
      '<div class="field" id="emailField" hidden><label class="field-label">邮箱（用于登录验证码）</label><input class="field-input" id="authEmail" type="email" placeholder="name@example.com" autocomplete="email" /></div>' +
      '<div class="field"><label class="field-label">密码</label><input class="field-input" id="authPass" type="password" placeholder="至少 4 个字符" autocomplete="current-password" /></div>' +
      '<div class="field" id="codeField" hidden><label class="field-label">邮箱验证码</label><input class="field-input" id="authCode" inputmode="numeric" maxlength="6" placeholder="6 位数字" style="letter-spacing:4px;text-align:center" /></div>' +
      '<div class="field-err" id="authErr" aria-live="polite"></div>' +
      '<button class="btn btn-ghost" id="demoLogin" style="width:100%;margin-top:4px">🎭 演示账号快速登录</button>' +
      '<div class="auth-legal">继续即表示同意<a href="terms.html" target="_blank" rel="noopener">《用户条款》</a>与<a href="privacy.html" target="_blank" rel="noopener">《隐私政策》</a></div>';

    const box = modal({
      title: authTab === "login" ? "登录 Wave" : "注册 Wave",
      body,
      actions: { cancel: "取消", ok: authTab === "login" ? "登录" : "注册" },
      width: "400px",
      onOk: async (box, close) => {
        const err = $("#authErr", box);
        err.textContent = "";
        // 第二阶段：邮箱验证码
        if (box.dataset.stage === "verify") {
          const code = $("#authCode", box).value.trim();
          if (!code) { err.textContent = "请输入验证码"; return; }
          const vr = await C.verifyLogin(box.dataset.verifyId, code);
          if (vr.ok) {
            close();
            toast("登录成功", "success");
            refreshCurrentView();
            renderUser();
          } else {
            err.textContent = vr.error || "验证失败";
          }
          return;
        }
        // 第一阶段：用户名密码
        const user = $("#authUser", box).value.trim();
        const pass = $("#authPass", box).value;
        const email = $("#authEmail", box).value.trim();
        let r;
        if (authTab === "login") r = await C.login(user, pass);
        else r = await C.register(user, pass, email);
        if (r.ok) {
          close();
          toast(authTab === "login" ? "欢迎回来" : "注册成功，已自动登录", "success");
          refreshCurrentView();
          renderUser();
        } else if (r.needVerify) {
          box.dataset.stage = "verify";
          box.dataset.verifyId = r.userId;
          $("#codeField", box).hidden = false;
          $$("[data-ok]", box).forEach((b) => (b.textContent = "验证"));
          err.textContent = "验证码已发送至 " + (r.maskedEmail || "邮箱");
          $("#authCode", box).focus();
        } else {
          err.textContent = r.error || "操作失败";
        }
      },
    });

    $$("[data-atab]", box).forEach((b) =>
      b.addEventListener("click", () => {
        openAuthModal(b.dataset.atab);
      })
    );

    // 演示账号（本地/静态预览与快速体验用）：先尝试登录，不存在则自动注册
    const demoBtn = $("#demoLogin", box);
    if (demoBtn)
      demoBtn.addEventListener("click", async () => {
        demoBtn.disabled = true;
        demoBtn.textContent = "正在登录...";
        let res = await C.login("demo", "demo1234");
        if (!res.ok && !res.needVerify) {
          res = await C.register("demo", "demo1234", "demo@wave.demo");
        }
        demoBtn.disabled = false;
        demoBtn.textContent = "🎭 演示账号快速登录";
        if (res.ok) {
          closeModal();
          toast("演示账号已登录 👋", "success");
          refreshCurrentView();
          renderUser();
        } else if (res.needVerify) {
          toast("演示账号已绑定邮箱，请通过正常登录流程验证", "error");
        } else {
          toast("演示账号登录失败：" + (res.error || "未知错误"), "error");
        }
      });
    return box;
  }

  /* ==================== 歌单选择器 ==================== */
  function openPlaylistPicker(song) {
    if (!C.isLoggedIn()) { toast("请先登录", "error"); openAuthModal("login"); return; }
    const pls = C.getPlaylists();
    let html = "";
    if (pls.length) {
      html += '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px">';
      pls.forEach((p) => {
        const has = p.songIds.indexOf(song.id) >= 0;
        html +=
          '<button class="menu-row" data-pl="' + esc(p.id) + '" style="border:1px solid var(--hairline);border-radius:var(--r-sm)">' +
          '<span class="mr-ic">' + C.icon(has ? "check" : "playlist", 16) + "</span>" +
          '<span class="grow" style="text-align:left">' + esc(p.name) + " · " + p.songIds.length + " 首</span>" +
          (has ? '<span style="font-size:0.72rem;color:var(--accent-text)">已在其中</span>' : "") +
          "</button>";
      });
      html += "</div>";
    } else {
      html += '<div style="color:var(--text-3);font-size:0.84rem;margin-bottom:12px">还没有歌单，创建一个吧</div>';
    }
    html +=
      '<div style="display:flex;gap:8px"><input class="field-input" id="plNewName" placeholder="新歌单名称" maxlength="30" />' +
      '<button class="btn btn-primary" id="plNewBtn">新建</button></div>';

    modal({
      title: "添加到歌单",
      body: html,
      actions: { cancel: "完成" },
    });
    $$("[data-pl]").forEach((b) =>
      b.addEventListener("click", () => {
        const ok = C.addToPlaylist(b.dataset.pl, song.id);
        toast(ok ? "已添加到歌单" : "该歌曲已在此歌单", ok ? "success" : "error");
        closeModal();
      })
    );
    const create = () => {
      const name = $("#plNewName").value.trim();
      if (!name) { toast("请输入歌单名称", "error"); return; }
      const pl = C.createPlaylist(name);
      C.addToPlaylist(pl.id, song.id);
      toast("已创建并添加", "success");
      closeModal();
      refreshCurrentView();
    };
    $("#plNewBtn").addEventListener("click", create);
    $("#plNewName").addEventListener("keydown", (e) => { if (e.key === "Enter") create(); });
  }

  /* ==================== 分享给好友 ==================== */
  function openShareModal(song) {
    if (!C.isLoggedIn()) { toast("请先登录", "error"); openAuthModal("login"); return; }
    const body =
      '<div style="display:flex;gap:12px;align-items:center;padding:13px;border-radius:var(--r-md);background:var(--glass-card);margin-bottom:14px">' +
      smallCover(song, "sc-cover") +
      '<div class="grow"><div style="font-size:0.9rem;font-weight:600">' + esc(song.title) + "</div>" +
      '<div style="font-size:0.76rem;color:var(--text-3)">' + esc(song.artist) + "</div></div></div>" +
      '<div style="font-size:0.78rem;color:var(--text-3);margin-bottom:8px">选择好友</div>' +
      '<div id="shareFriendList" style="max-height:220px;overflow-y:auto;display:flex;flex-direction:column;gap:4px"><div class="loading-box"><span class="spinner"></span>加载好友…</div></div>' +
      '<div class="field" style="margin-top:12px"><input class="field-input" id="shareMsg" maxlength="100" placeholder="写一句分享留言（可选）" /></div>';

    modal({ title: "分享给好友", body, actions: { cancel: "取消" } });

    C.social.listFriends().then((r) => {
      const list = $("#shareFriendList");
      if (!r.ok || !r.data || !r.data.length) {
        list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-3);font-size:0.8rem">暂无好友，先去社交页添加吧</div>';
        return;
      }
      list.innerHTML = "";
      r.data.forEach((f) => {
        const b = el("button", "user-row");
        b.style.width = "100%";
        b.innerHTML =
          '<span class="ur-avatar" style="background:' + C.gradientFor(f.username) + '">' + esc((f.nickname || f.username || "?")[0].toUpperCase()) +
          (f.online ? '<span class="ur-online"></span>' : "") + "</span>" +
          '<span class="ur-main"><span class="ur-name">' + esc(f.nickname || f.username) + "</span>" +
          '<span class="ur-sub">@' + esc(f.username) + "</span></span>" +
          '<span class="btn btn-ghost" style="height:30px;padding:0 14px;font-size:0.78rem">分享</span>';
        b.addEventListener("click", async () => {
          const res = await C.social.shareSong(f.id, {
            id: song.id, title: song.title, artist: song.artist,
            album: song.album, coverUrl: song.coverUrl || null,
            c: song.c || null, source: song.external ? (song.id.indexOf("ne_") === 0 ? "netease" : song.id.indexOf("qq_") === 0 ? "qq" : "audius") : "local",
          }, $("#shareMsg").value.trim());
          if (res.ok) { toast("已分享给 " + (f.nickname || f.username), "success"); closeModal(); }
          else toast(res.error || "分享失败", "error");
        });
        list.appendChild(b);
      });
    });
  }

  /* ==================== 歌曲信息 ==================== */
  function openSongInfo(song) {
    if (!song) return;
    const rows = [
      ["标题", song.title],
      ["艺人", song.artist],
      ["专辑", song.album || "-"],
      ["年份", song.year || "-"],
      ["流派", song.genre || "-"],
      ["时长", song.durStr || "-"],
      ["音源", song.external ? (song.id.indexOf("ne_") === 0 ? "网易云音乐" : song.id.indexOf("qq_") === 0 ? "QQ音乐" : "Audius") : "本地曲库"],
      ["全局播放", C.fmtNum((C.getPlays()[song.id] || song.plays || 0))],
    ];
    const body =
      '<div style="display:flex;gap:14px;align-items:center;margin-bottom:16px">' + smallCover(song, "sc-cover") +
      '<div><div style="font-weight:700">' + esc(song.title) + "</div>" +
      '<div style="font-size:0.78rem;color:var(--text-3)">' + esc(song.artist) + "</div></div></div>" +
      '<div style="display:grid;grid-template-columns:auto 1fr;gap:7px 16px;font-size:0.84rem">' +
      rows.map((r) => '<span style="color:var(--text-3)">' + esc(r[0]) + '</span><span>' + esc(r[1]) + "</span>").join("") +
      "</div>";
    modal({ title: "歌曲信息", body, actions: { ok: "完成" } });
  }

  /* ==================== 播放条接线 ==================== */
  function wirePlayerBar() {
    const P = global.App.Player;

    $("#btnPlay").addEventListener("click", () => P.toggle());
    $("#btnNext").addEventListener("click", () => P.next(false));
    $("#btnPrev").addEventListener("click", () => P.prev());
    $("#btnShuffle").addEventListener("click", () => {
      const on = P.toggleShuffle();
      $("#btnShuffle").setAttribute("aria-pressed", on);
      toast(on ? "随机播放开" : "随机播放关");
    });
    $("#btnRepeat").addEventListener("click", () => {
      const mode = P.cycleRepeat();
      const btn = $("#btnRepeat");
      // 普通循环图标用于 all / none 两种状态（none 时整体压暗），单曲循环才换成带 1 的图标
      C.showIcon(btn.querySelector(".ic-repeat"), mode !== "one");
      C.showIcon(btn.querySelector(".ic-repeat-one"), mode === "one");
      btn.classList.toggle("off", mode === "off");
      btn.setAttribute("aria-pressed", mode !== "off");
      btn.title = mode === "all" ? "列表循环" : mode === "one" ? "单曲循环" : "不循环";
      toast(mode === "all" ? "列表循环" : mode === "one" ? "单曲循环" : "循环已关");
    });
    // 初始化时同步一次图标（刷新后状态可能与 HTML 默认值不同）
    (function syncRepeatIcon() {
      const mode = P.state.repeat || "all";
      const btn = $("#btnRepeat");
      C.showIcon(btn.querySelector(".ic-repeat"), mode !== "one");
      C.showIcon(btn.querySelector(".ic-repeat-one"), mode === "one");
      btn.classList.toggle("off", mode === "off");
      btn.setAttribute("aria-pressed", mode !== "off");
    })();

    // 进度条
    const seek = $("#seek");
    let seeking = false;
    seek.addEventListener("input", () => {
      seeking = true;
      const r = seek.value / 1000;
      $("#seekFill").style.width = r * 100 + "%";
      $("#seekKnob").style.left = r * 100 + "%";
    });
    const commitSeek = () => {
      if (!seeking) return;
      seeking = false;
      P.seekTo(seek.value / 1000);
    };
    seek.addEventListener("change", commitSeek);
    seek.addEventListener("pointerup", commitSeek);

    // 音量
    const volBtn = $("#volBtn");
    const volPop = $("#volPop");
    volBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      volPop.hidden = !volPop.hidden;
    });
    document.addEventListener("click", (e) => {
      if (!volPop.hidden && !volPop.contains(e.target) && e.target !== volBtn) volPop.hidden = true;
    });
    $("#volRange").addEventListener("input", (e) => {
      const v = e.target.value / 100;
      P.setVolume(v);
      $("#volVal").textContent = e.target.value + "%";
      volBtn.innerHTML = v === 0 ? C.icon("mute", 17) : C.icon("volume", 17);
    });
    volBtn.innerHTML = C.icon("volume", 17);

    // 收藏 / 队列 / 歌词 / 更多
    $("#pbFav").addEventListener("click", () => {
      const s = P.currentSong();
      if (!s) return;
      if (!C.isLoggedIn()) { toast("请先登录", "error"); openAuthModal("login"); return; }
      const fav = C.toggleFavorite(s.id);
      updateFavBtn(s);
      $("#pbFav").classList.add("burst");
      setTimeout(() => $("#pbFav").classList.remove("burst"), 500);
      toast(fav ? "已加入收藏" : "已取消收藏", "success");
      refreshCurrentView();
    });
    $("#pbCover").addEventListener("click", () => { location.hash = "#/now-playing"; });
    $("#btnQueue").addEventListener("click", () => toggleDrawer("queue"));
    $("#btnLyric").addEventListener("click", () => toggleDrawer("lyric"));
    $("#btnMore").addEventListener("click", (e) => {
      const s = P.currentSong();
      if (!s) { toast("当前没有播放歌曲"); return; }
      const r = e.currentTarget.getBoundingClientRect();
      contextMenu([
        { icon: "music", label: "歌曲信息", onClick: () => openSongInfo(s) },
        { icon: "playlist", label: "添加到歌单", onClick: () => openPlaylistPicker(s) },
        { icon: "users", label: "分享给好友", onClick: () => openShareModal(s) },
        { icon: "download", label: "下载歌曲", onClick: () => downloadSong(s) },
        { sep: true },
        { icon: "settings", label: "播放设置", onClick: () => { location.hash = "#/settings"; } },
      ], r.left - 150, r.top - 10);
    });

    // 播放器事件 → 播放条
    bus.on("player:changed", (song) => {
      C.currentPlaying = song;
      C.applySongAccent(song);
      P.updateMediaSession(song);
      P.fetchLyrics(song);
      if (song) {
        $("#pbTitle").textContent = song.title;
        $("#pbArtist").textContent = song.artist;
        const img = $("#pbCoverImg");
        img.innerHTML = song.coverUrl
          ? '<img src="' + esc(song.coverUrl) + '" alt="" />'
          : (song.emoji || "🎵");
        img.style.background = song.coverUrl ? "#111" : "linear-gradient(150deg," + song.c.from + "," + song.c.to + ")";
        updateFavBtn(song);
        if (C.isLoggedIn()) C.addHistory(song.id);
        C.bumpPlays(song.id);
      } else {
        $("#pbTitle").textContent = "未在播放";
        $("#pbArtist").textContent = "选一首歌开始旅程";
        $("#pbCoverImg").innerHTML = "";
      }
      // 正在播放页自行原地更新（见 pages.js nowPlaying），跳过整页重渲染
      const cur = global.App.Router && global.App.Router.current;
      if (!cur || cur.route !== "/now-playing") refreshCurrentView();
      renderQueuePane();
    });
    bus.on("player:state", (playing) => {
      const bp = $("#btnPlay");
      C.showIcon(bp.querySelector(".ic-play"), !playing);
      C.showIcon(bp.querySelector(".ic-pause"), playing);
      $("#btnPlay").classList.toggle("playing", playing);
      $("#btnPlay").setAttribute("aria-label", playing ? "暂停" : "播放");
    });
    bus.on("player:time", (t) => {
      if (seeking) return;
      const r = t.dur ? t.cur / t.dur : 0;
      $("#seekFill").style.width = r * 100 + "%";
      $("#seekKnob").style.left = r * 100 + "%";
      seek.value = Math.round(r * 1000);
      $("#timeCur").textContent = C.fmtDur(t.cur);
      $("#timeDur").textContent = C.fmtDur(t.dur);
    });
    bus.on("player:queue", renderQueuePane);
    bus.on("player:loading", (loading) => {
      const btn = $("#btnPlay");
      btn.style.opacity = loading ? 0.6 : 1;
    });
    bus.on("player:error", ({ song }) => {
      toast(song ? "无法播放：" + song.title : "播放出错", "error");
    });
    bus.on("player:lyric", renderLyricPane);
  }

  function updateFavBtn(song) {
    const fav = C.isFavorite(song.id);
    const btn = $("#pbFav");
    btn.setAttribute("aria-pressed", fav);
    btn.innerHTML = C.icon(fav ? "heart-fill" : "heart", 17);
    if (fav) btn.querySelector("svg").style.fill = "var(--danger)";
  }

  /* ==================== 抽屉（队列/歌词） ==================== */
  let drawerTab = "queue";
  let drawerPrevFocus = null;

  function toggleDrawer(tab) {
    const drawer = $("#drawer");
    if (tab) drawerTab = tab;
    const willOpen = drawer.hidden || !drawer.classList.contains("open");
    drawer.hidden = false;
    if (willOpen) {
      drawerPrevFocus = document.activeElement;
      drawer.classList.add("open");
      renderDrawer();
      $("#btnQueue").setAttribute("aria-pressed", true);
      $("#btnLyric").setAttribute("aria-pressed", true);
      setTimeout(() => {
        const f = focusables(drawer)[0];
        if (f) f.focus();
      }, 60);
      drawer.addEventListener("keydown", drawerTrap);
    } else {
      drawer.classList.remove("open");
      drawer.removeEventListener("keydown", drawerTrap);
      $("#btnQueue").setAttribute("aria-pressed", false);
      $("#btnLyric").setAttribute("aria-pressed", false);
      setTimeout(() => { if (!drawer.classList.contains("open")) drawer.hidden = true; }, 400);
      if (drawerPrevFocus && drawerPrevFocus.isConnected) drawerPrevFocus.focus();
      drawerPrevFocus = null;
    }
  }

  // 可聚焦元素列表（排除 SVG <use href> 这类 tabIndex=-1 的伪焦点项）
  function focusables(root) {
    return $$("button, [href], input, select, textarea, [tabindex]", root)
      .filter((el) => el.tabIndex >= 0 && !el.disabled && el.offsetParent !== null);
  }

  // 抽屉内 Tab 循环，避免焦点跑到背后页面
  function drawerTrap(e) {
    if (e.key !== "Tab") return;
    const drawer = $("#drawer");
    const items = focusables(drawer);
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  function renderDrawer() {
    $$(".dtab").forEach((t) => {
      const on = t.dataset.dtab === drawerTab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on);
    });
    $("#drawerQueue").hidden = drawerTab !== "queue";
    $("#drawerLyric").hidden = drawerTab !== "lyric";
    $("#drawerLook").hidden = drawerTab !== "look";
    if (drawerTab === "queue") renderQueuePane();
    else if (drawerTab === "lyric") renderLyricPane();
    else renderLookPane();
  }

  /* ---- 工作台第三 Tab：外观（主题 / 强调色 / 背景 / 模糊 / 透明度）---- */
  function renderLookPane() {
    const pane = $("#drawerLook");
    const s = C.getSettings();
    const accents = [
      { name: "跟随歌曲", val: "" },
      { name: "极光紫", val: "#7c5cff" },
      { name: "霓虹粉", val: "#ff5c9d" },
      { name: "湖水蓝", val: "#38bdf8" },
      { name: "青柠绿", val: "#3ddc97" },
      { name: "落日橙", val: "#ff9a3d" },
      { name: "警戒红", val: "#ff5c6c" },
    ];
    const bgs = [
      { id: "aurora", name: "极光" },
      { id: "desktop", name: "桌面" },
      { id: "mobile", name: "移动" },
      { id: "none", name: "纯色" },
    ];
    pane.innerHTML =
      '<div class="look-block"><div class="look-label">主题</div><div class="chip-row" id="lookTheme">' +
      '<button class="chip' + (s.theme === "dark" ? " active" : "") + '" data-ltheme="dark">深色</button>' +
      '<button class="chip' + (s.theme === "light" ? " active" : "") + '" data-ltheme="light">浅色</button></div></div>' +
      '<div class="look-block"><div class="look-label">界面风格</div>' +
      '<div class="chip-row" id="lookUiStyle">' +
      '<button class="chip' + (s.uiStyle !== "clear" ? " active" : "") + '" data-luistyle="solid">实心</button>' +
      '<button class="chip' + (s.uiStyle === "clear" ? " active" : "") + '" data-luistyle="clear">通透</button>' +
      "</div></div>" +
      '<div class="look-block"><div class="look-label">强调色</div><div class="swatches" id="lookAccents">' +
      accents.map((a) =>
        '<button class="swatch' + (s.accent === a.val ? " active" : "") + '" data-laccent="' + a.val + '" title="' + a.name + '" style="' +
        (a.val ? "background:" + a.val : "background:conic-gradient(#7c5cff,#ff5c9d,#38bdf8,#7c5cff)") + '"></button>'
      ).join("") +
      "</div></div>" +
      '<div class="look-block"><div class="look-label">背景</div><div class="bg-picker" id="lookBg">' +
      bgs.map((b) => '<button class="bg-preset' + (s.bgPreset === b.id ? " active" : "") + '" data-lbg="' + b.id + '" title="' + b.name + '" aria-label="' + b.name + '" style="' +
        (b.id === "desktop" ? "background-image:url('assets/bg-desktop.jpg')" : b.id === "mobile" ? "background-image:url('assets/bg-mobile.jpg')" : b.id === "none" ? "background:var(--bg-2)" : "background:linear-gradient(135deg,#1a1c2e,#101322)") +
        '"></button>').join("") +
      C.BG_GRADIENTS.map((g, i) => '<button class="bg-preset' + (s.bgPreset === "grad:" + i ? " active" : "") + '" data-lbg="grad:' + i + '" title="' + g.name + '" aria-label="' + g.name + '" style="background:' + g.value + '"></button>').join("") +
      "</div>" +
      '<div class="bg-custom-row"><label class="btn btn-ghost bg-upload">' + C.icon("image", 13) +
      ' 上传<input type="file" id="lookBgFile" accept="image/*" hidden /></label>' +
      (s.bgImage ? '<button class="btn btn-ghost" id="lookBgUse">我的图片</button>' : "") +
      "</div></div>" +
      '<div class="look-block"><div class="look-label">背景模糊<span class="look-val" id="lookBlurVal">' + s.bgBlur + "px</span></div>" +
      '<input type="range" class="range" id="lookBlur" min="0" max="30" value="' + s.bgBlur + '" aria-label="背景模糊" /></div>' +
      '<div class="look-block"><div class="look-label">界面透明度<span class="look-val" id="lookGlassVal">' + s.glass + "%</span></div>" +
      '<input type="range" class="range" id="lookGlass" min="0" max="100" value="' + s.glass + '" aria-label="界面透明度" /></div>' +
      '<div class="look-block"><div class="look-label">本地壁纸<span class="look-val">' +
      (() => {
        const w = wpState();
        if (!w.count) return w.total ? "分级下无可见壁纸" : "未添加";
        const rl = (global.App.Wallpaper && global.App.Wallpaper.RATING_LABEL) || {};
        return w.count + " 个 · " + (rl[w.cfg.rating] || "大众级");
      })() + "</span></div>" +
      '<div class="wp-actions"><button class="btn btn-ghost" data-lookwp="add" style="height:32px">' + C.icon("plus", 13) + " 添加壁纸目录</button>" +
      '<button class="btn btn-ghost" data-lookwp="settings" style="height:32px">全部设置</button></div></div>' +
      '<div class="look-tip">' + C.icon("sparkle", 13) + " 正在播放页支持全屏沉浸与横屏模式</div>";

    const refresh = () => renderLookPane();
    $$("[data-ltheme]", pane).forEach((b) => b.addEventListener("click", () => { C.saveSettings({ theme: b.dataset.ltheme }); refresh(); }));
    $$("[data-luistyle]", pane).forEach((b) => b.addEventListener("click", () => {
      C.saveSettings({ uiStyle: b.dataset.luistyle });
      refresh();
    }));
    $$("[data-laccent]", pane).forEach((b) => b.addEventListener("click", () => {
      C.saveSettings({ accent: b.dataset.laccent });
      if (!b.dataset.laccent && global.App.Player && global.App.Player.currentSong()) C.applySongAccent(global.App.Player.currentSong());
      refresh();
    }));
    $$("[data-lbg]", pane).forEach((b) => b.addEventListener("click", () => { C.saveSettings({ bgPreset: b.dataset.lbg }); refresh(); }));
    const bgFile = $("#lookBgFile", pane);
    if (bgFile) bgFile.addEventListener("change", () => {
      const f = bgFile.files && bgFile.files[0];
      if (!f) return;
      if (!/^image\//.test(f.type)) { toast("请选择图片文件", "error"); return; }
      C.compressImage(f, 1600).then((data) => {
        if (!data) { toast("图片读取失败", "error"); return; }
        C.saveSettings({ bgImage: data, bgPreset: "custom" });
        if (C.getSettings().bgImage !== data) { toast("图片过大，请换一张", "error"); return; }
        C.applyBgPreset("custom");
        toast("背景已更新", "success");
        refresh();
      });
    });
    const bgUse = $("#lookBgUse", pane);
    if (bgUse) bgUse.addEventListener("click", () => { C.saveSettings({ bgPreset: "custom" }); refresh(); });
    const blur = $("#lookBlur", pane);
    if (blur) blur.addEventListener("input", () => {
      C.saveSettings({ bgBlur: parseInt(blur.value, 10) });
      $("#lookBlurVal", pane).textContent = blur.value + "px";
    });
    const glass = $("#lookGlass", pane);
    if (glass) glass.addEventListener("input", () => {
      C.saveSettings({ glass: parseInt(glass.value, 10) });
      $("#lookGlassVal", pane).textContent = glass.value + "%";
    });
    // 工作台里的壁纸入口：添加目录 / 跳设置页
    $$("[data-lookwp]", pane).forEach((b) => b.addEventListener("click", async () => {
      if (b.dataset.lookwp === "settings") { location.hash = "#/settings"; return; }
      const W = global.App.Wallpaper;
      if (!W) return;
      let r = await W.pickDir();
      if (!r.ok && r.error === "NO_API") {
        r = await W.pickDirFallback();
        if (r.ok) { toast("已加载 " + r.count + " 个视频（刷新后需重选）", "success"); W.saveCfg({ mode: "dynamic" }); }
      } else if (r.ok) {
        toast(r.count ? "已连接「" + r.name + "」，识别到 " + r.count + " 个视频" : "目录里没有视频文件", r.count ? "success" : "error");
        if (r.count) W.saveCfg({ mode: "dynamic" });
      } else if (!r.canceled) {
        toast(r.error || "添加失败", "error");
      }
      refresh();
    }));
  }

  function renderQueuePane() {
    const pane = $("#drawerQueue");
    const P = global.App.Player;
    const q = P.queueList();
    $("#drawerQueueCount").textContent = q.length;
    if (!q.length) {
      pane.innerHTML = emptyState("music", "队列是空的", "去曲库或搜索页选几首歌吧");
      return;
    }
    const cur = P.state.index;
    let html =
      '<div class="q-head"><span>即将播放 · ' + q.length + " 首</span>" +
      '<button class="q-clear" id="qClear">清空队列</button></div>';
    q.forEach((id, i) => {
      const s = D.get(id);
      if (!s) return;
      html +=
        '<div class="q-item' + (i === cur ? " playing" : "") + '" data-qidx="' + i + '">' +
        smallCover(s, "q-cover") +
        '<div class="q-body"><div class="q-title ellipsis">' + esc(s.title) + "</div>" +
        '<div class="q-sub ellipsis">' + esc(s.artist) + "</div></div>" +
        (i === cur ? '<span class="eq-bars"><i></i><i></i><i></i><i></i></span>' : '<span class="q-dur">' + s.durStr + "</span>") +
        '<button class="q-remove" data-qrm="' + i + '" aria-label="移除">' + C.icon("close", 13) + "</button></div>";
    });
    pane.innerHTML = html;
    const clear = $("#qClear", pane);
    if (clear) clear.addEventListener("click", () => {
      global.App.Player.setQueue([], -1);
      renderQueuePane();
    });
    $$(".q-item", pane).forEach((item) =>
      item.addEventListener("click", (e) => {
        if (e.target.closest("[data-qrm]")) return;
        global.App.Player.playAt(parseInt(item.dataset.qidx, 10));
      })
    );
    $$("[data-qrm]", pane).forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        const i = parseInt(b.dataset.qrm, 10);
        const qq = global.App.Player.queueList();
        qq.splice(i, 1);
        global.App.Player.setQueue(qq, i < global.App.Player.state.index ? global.App.Player.state.index - 1 : global.App.Player.state.index);
        renderQueuePane();
      })
    );
  }

  function renderLyricPane() {
    const pane = $("#drawerLyric");
    const P = global.App.Player;
    const lyrics = P.state.lyrics;
    if (!lyrics || !lyrics.length) {
      pane.innerHTML = emptyState("music", "暂无歌词", "播放网易云 / QQ 音乐歌曲时可自动加载歌词");
      return;
    }
    pane.innerHTML =
      '<div class="np-lyrics" id="drawerLyricScroll" style="height:100%;padding:24% 6px">' +
      lyrics.map((l, i) => '<div class="lyric-line" data-li="' + i + '">' + l.text + "</div>").join("") +
      "</div>";
  }

  bus.on("player:lyricline", (idx) => {
    const box = $("#drawerLyricScroll");
    $$("#drawerLyric .lyric-line").forEach((l, i) => {
      const on = i === idx;
      if (on !== l.classList.contains("active")) {
        l.classList.toggle("active", on);
        // 只滚歌词容器（scrollIntoView 会连带把页面滚走）
        if (on) C.centerInScroll(box, l);
      }
    });
  });

  /* ==================== 侧栏 / 底栏 ==================== */
  const NAV = [
    { group: "发现" },
    { route: "/home", label: "发现", icon: "home" },
    { route: "/library", label: "曲库", icon: "library" },
    { route: "/search", label: "搜索", icon: "search" },
    { group: "我的音乐" },
    { route: "/favorites", label: "收藏夹", icon: "heart" },
    { route: "/playlists", label: "歌单", icon: "playlist" },
    { route: "/history", label: "历史", icon: "history" },
    { group: "社交" },
    { route: "/social", label: "好友", icon: "users", badge: "social" },
    { route: "/profile", label: "我的", icon: "user" },
  ];

  const TABS = [
    { route: "/home", label: "发现", icon: "home" },
    { route: "/library", label: "曲库", icon: "library" },
    { route: "/search", label: "搜索", icon: "search" },
    { route: "/social", label: "好友", icon: "users", badge: "social" },
    { route: "/profile", label: "我的", icon: "user" },
  ];

  function renderNav(activeRoute) {
    const nav = $("#sbNav");
    let html = "";
    NAV.forEach((n) => {
      if (n.group) { html += '<div class="nav-group nav-label">' + esc(n.group) + "</div>"; return; }
      const active = activeRoute === n.route;
      html +=
        '<a class="nav-item' + (active ? " active" : "") + '" href="#' + n.route + '" data-route="' + n.route + '"' +
        (active ? ' aria-current="page"' : "") + ">" +
        C.icon(n.icon, 17) + "<span class='nav-label'>" + esc(n.label) + "</span>" +
        (n.badge ? '<span class="nav-badge" id="navBadgeSocial" hidden>0</span>' : "") +
        "</a>";
    });
    nav.innerHTML = html;

    const tabbar = $("#tabbar");
    tabbar.innerHTML = TABS.map(
      (t) =>
        '<a class="tab-item' + (activeRoute === t.route ? " active" : "") + '" href="#' + t.route + '"' +
        (activeRoute === t.route ? ' aria-current="page"' : "") + ">" +
        C.icon(t.icon, 19) + "<span>" + esc(t.label) + "</span>" +
        (t.badge ? '<span class="nav-badge" id="tabBadgeSocial" hidden style="position:absolute;top:4px;right:calc(50% - 22px)">0</span>' : "") +
        "</a>"
    ).join("");
    updateSocialBadge();
  }

  let socialUnread = 0;
  async function updateSocialBadge() {
    if (!C.isLoggedIn()) { socialUnread = 0; }
    else {
      try {
        const r = await C.social.listShares();
        if (r.ok && r.data) {
          const seen = C.read("mp_v1_shares_seen", []);
          socialUnread = r.data.filter((s) => seen.indexOf(s.id) < 0).length;
        }
      } catch (e) { /* 忽略 */ }
    }
    $$(".nav-badge").forEach((b) => {
      b.hidden = socialUnread === 0;
      b.textContent = socialUnread;
    });
  }

  function renderSidebarPlaylists(activeId) {
    const list = $("#sbPlList");
    if (!C.isLoggedIn()) {
      list.innerHTML = '<div style="padding:8px 10px;font-size:0.76rem;color:var(--text-3)">登录后查看歌单</div>';
      return;
    }
    const pls = C.getPlaylists();
    if (!pls.length) {
      list.innerHTML = '<div style="padding:8px 10px;font-size:0.76rem;color:var(--text-3)">还没有歌单</div>';
      return;
    }
    list.innerHTML = pls
      .map(
        (p) =>
          '<a class="sb-pl-item' + (activeId === p.id ? " active" : "") + '" href="#/playlist/' + esc(p.id) + '">' +
          '<span class="pl-dot"></span><span class="ellipsis grow">' + esc(p.name) + "</span>" +
          "<span style='font-size:0.68rem;color:var(--text-3)'>" + p.songIds.length + "</span></a>"
      )
      .join("");
  }

  function renderUser() {
    const av = $("#tuAvatar");
    if (C.isLoggedIn()) {
      const name = C.currentUser() || "我";
      av.textContent = name[0].toUpperCase();
      av.style.background = C.gradientFor(name);
    } else {
      av.textContent = "游";
      av.style.background = "";
    }
  }

  /* ==================== 视图刷新辅助 ==================== */
  function refreshCurrentView() {
    if (global.App.Router && global.App.Router.refresh) global.App.Router.refresh();
  }

  /* ==================== 全局事件 ==================== */
  function wireGlobal() {
    // 侧栏折叠（折叠态持久化）
    const syncSbLabel = () => {
      const mini = document.body.classList.contains("sb-mini");
      const label = mini ? "展开导航" : "折叠导航";
      $("#sbCollapse").setAttribute("aria-label", label);
      $("#sbCollapse").setAttribute("title", label);
    };
    syncSbLabel();
    $("#sbCollapse").addEventListener("click", () => {
      const on = !document.body.classList.contains("sb-mini");
      document.body.classList.toggle("sb-mini", on);
      C.saveSettings({ sidebarMini: on });
      syncSbLabel();
    });
    // 移动端菜单
    const closeSidebar = () => {
      document.body.classList.remove("sb-open");
      $("#navToggle").setAttribute("aria-expanded", "false");
    };
    $("#navToggle").addEventListener("click", () => {
      document.body.classList.toggle("sb-open");
      $("#navToggle").setAttribute("aria-expanded", document.body.classList.contains("sb-open"));
    });
    document.addEventListener("click", (e) => {
      if (document.body.classList.contains("sb-open") && !e.target.closest(".sidebar") && !e.target.closest("#navToggle")) {
        closeSidebar();
      }
    });
    // 主题图标随设置同步（顶栏按钮 / 设置页按钮 / 首屏恢复都走这里）
    const syncThemeIcon = () => {
      const dark = C.getSettings().theme === "dark";
      $("#themeBtn").innerHTML = C.icon(dark ? "moon" : "sun", 17);
      $("#themeBtn").setAttribute("aria-label", dark ? "切换浅色主题" : "切换深色主题");
    };
    syncThemeIcon();
    bus.on("settings:changed", syncThemeIcon);
    // 主题切换
    $("#themeBtn").addEventListener("click", () => {
      const next = C.getSettings().theme === "dark" ? "light" : "dark";
      C.saveSettings({ theme: next });
      toast(next === "dark" ? "已切换深色主题" : "已切换浅色主题");
    });
    // 搜索入口
    $("#searchTrigger").addEventListener("click", () => { location.hash = "#/search"; });
    $("#topbarUser").addEventListener("click", () => {
      location.hash = C.isLoggedIn() ? "#/profile" : "#/profile";
      if (!C.isLoggedIn()) setTimeout(() => openAuthModal("login"), 120);
    });
    // 新建歌单
    $("#sbPlAdd").addEventListener("click", () => {
      if (!C.isLoggedIn()) { toast("请先登录", "error"); openAuthModal("login"); return; }
      confirmDialog({ title: "新建歌单", message: "给新歌单起个名字", input: true, inputPlaceholder: "歌单名称", okText: "创建" }).then((name) => {
        if (!name) return;
        const pl = C.createPlaylist(name);
        renderSidebarPlaylists();
        location.hash = "#/playlist/" + pl.id;
        toast("歌单已创建", "success");
      });
    });
    // 抽屉
    $("#drawerClose").addEventListener("click", () => toggleDrawer());
    $$(".dtab").forEach((t) => t.addEventListener("click", () => { drawerTab = t.dataset.dtab; renderDrawer(); }));

    // 快捷键
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
      }
      if (e.key === "Escape") {
        closeMenu();
        closePalette();
        // 只关最上层：有弹窗先关弹窗，否则再收抽屉/侧栏
        if (activeModal) { closeModal(); return; }
        const dw = $("#drawer");
        if (dw && !dw.hidden) toggleDrawer();
        if (document.body.classList.contains("sb-open")) closeSidebar();
      }
      const tag = (e.target.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || e.target.isContentEditable) return;
      // 焦点在可激活元素上时，Space 交给元素自身（原生激活），不做全局播放/暂停
      if (e.target.closest && e.target.closest("button, a, [role='button'], [role='tab'], [role='menuitem']")) return;
      if (e.code === "Space") {
        e.preventDefault();
        global.App.Player.toggle();
      }
      if (e.key === "ArrowRight" && e.altKey) global.App.Player.next(false);
      if (e.key === "ArrowLeft" && e.altKey) global.App.Player.prev();
    });

    // 全局点击代理：data-action
    document.addEventListener("click", (e) => {
      const t = e.target.closest("[data-action]");
      if (!t) return;
      const action = t.dataset.action;
      const songId = t.dataset.song;
      if (action === "play-song" && songId) {
        const song = D.get(songId);
        if (!song) return;
        // 智能入队：若当前队列包含该歌则直接跳转，否则以「当前列表 + 点击项」方式播放
        const q = global.App.Player.queueList();
        const inQ = q.indexOf(songId);
        if (inQ >= 0) global.App.Player.playAt(inQ);
        else global.App.Player.playList(q.concat([songId]), q.length);
      }
      if (action === "song-menu" && songId) {
        e.stopPropagation();
        songActions(D.get(songId), e);
      }
    });

    // 心跳（在线状态）
    setInterval(() => { if (C.isLoggedIn()) C.social.heartbeat().catch(() => {}); }, 120000);
    if (C.isLoggedIn()) C.social.heartbeat().catch(() => {});

    bus.on("auth:changed", () => {
      renderUser();
      renderSidebarPlaylists();
      updateSocialBadge();
      refreshCurrentView();
    });
    bus.on("data:changed", () => {
      updateSocialBadge();
    });
  }

  /* ==================== 初始化 ==================== */
  function init() {
    C.applySettings(C.getSettings());
    wirePlayerBar();
    wireGlobal();
    renderUser();
    renderNav("/home");
    renderSidebarPlaylists();
    // 恢复上次播放（不自动播放）
    const P = global.App.Player;
    const cur = P.currentSong();
    if (cur) {
      $("#pbTitle").textContent = cur.title;
      $("#pbArtist").textContent = cur.artist;
      const img = $("#pbCoverImg");
      img.innerHTML = cur.coverUrl ? '<img src="' + esc(cur.coverUrl) + '" alt="" />' : (cur.emoji || "🎵");
      img.style.background = cur.coverUrl ? "#111" : "linear-gradient(150deg," + cur.c.from + "," + cur.c.to + ")";
      updateFavBtn(cur);
    }
    renderQueuePane();
  }

  /* ==================== 壁纸面板（设置页 / 工作台共用） ==================== */
  function wpState() {
    const W = global.App.Wallpaper;
    return W ? W.getState() : { cfg: {}, dirs: [], count: 0, supported: false, error: "", scanning: false };
  }
  function wallpaperPanelHTML() {
    const st = wpState();
    const c = st.cfg || {};
    const W = global.App.Wallpaper;
    const RL = (W && W.RATING_LABEL) || { everyone: "大众级", questionable: "家长指导", mature: "成人" };
    const mode = c.mode || "off";
    const on = mode !== "off" && st.count > 0;
    const rating = c.rating || "everyone";
    const autoRotate = c.autoRotate !== false;
    const seg = (k, cur, opts, disabled) =>
      '<div class="wp-seg" data-seg="' + k + '">' +
      opts.map((o) => '<button type="button" data-wp="' + k + ":" + o.v + '"' +
        (cur === o.v ? ' class="active"' : "") + (disabled ? " disabled" : "") + ">" + o.t + "</button>").join("") +
      "</div>";

    const statusText =
      (st.supported ? "" : "当前浏览器不支持目录访问（需 Chrome / Edge 86+）") +
      (st.supported && st.scanning ? "正在扫描目录…" : "") +
      (st.supported && !st.scanning && st.count ? "已连接 · 可见 " + st.count + " 个壁纸" + (st.hidden ? "（已按分级筛掉 " + st.hidden + " 个）" : "") : "") +
      (st.supported && !st.scanning && !st.count && !st.error && st.dirs.length ? "目录里没有当前分级下可显示的壁纸" : "") +
      (st.supported && !st.scanning && !st.count && !st.error && !st.dirs.length ? "尚未添加目录" : "") +
      (st.error ? esc(st.error) : "");

    let html = '<div class="wp-status' + (on ? " on" : "") + '"><span class="wp-dot"></span><span>' + statusText +
      (st.current ? '<span class="wp-cur" data-wpcur> · 当前：' + esc(st.current) + "</span>" : "") +
      "</span></div>";

    if (st.dirs.length) {
      html += '<div class="wp-dirs">' + st.dirs.map((d) =>
        '<div class="wp-dir">' + C.icon("library", 13) + '<span class="wp-dir-name">' + esc(d.name) +
        (d.session ? '<span class="wp-dir-flag"> 仅本次会话</span>' : "") +
        (d.needPerm ? '<span class="wp-dir-flag"> 需重新授权</span>' : "") +
        "</span></div>").join("") + "</div>";
    }

    // 分级筛选：Wallpaper Engine 的 project.json 里 contentrating 字段
    html += '<div class="look-block" style="margin-top:14px"><div class="look-label">壁纸分级<span class="look-val">' +
      (st.hidden ? "筛掉 " + st.hidden + " 个" : "全部可见") + "</span></div>" +
      seg("rating", rating, [
        { v: "everyone", t: "大众级" },
        { v: "questionable", t: "家长指导" },
        { v: "mature", t: "成人" },
      ], false) +
      '<div class="wp-note">' +
      (rating === "mature" ? "显示全部三个级别。成人级内容只在本机渲染，不经过服务器。"
        : rating === "questionable" ? "显示大众级 + 家长指导级，成人级不加载。"
        : "只显示标注为大众级的壁纸。没有 project.json 的普通视频目录一律按大众级处理。") +
      "</div></div>";

    // 壁纸列表：按扫描顺序列出，点哪张放哪张
    if (st.count) {
      html += '<div class="look-block"><div class="look-label">壁纸列表<span class="look-val">' +
        st.count + " 个 · 顺序播放</span></div>" +
        '<div class="wp-list' + (st.count <= 8 ? " is-short" : "") + '" role="listbox" aria-label="壁纸列表">' +
        st.list.map((it) =>
          '<button type="button" class="wp-item' + (it.on ? " on" : "") + '" data-wpitem="' + it.i + '"' +
          ' role="option" aria-selected="' + (it.on ? "true" : "false") + '">' +
          '<span class="wp-item-idx">' + String(it.i + 1).padStart(2, "0") + "</span>" +
          '<span class="wp-item-name">' + esc(it.title) + "</span>" +
          (it.rating !== "everyone" ? '<span class="wp-badge is-' + it.rating + '">' + (RL[it.rating] || "") + "</span>" : "") +
          '<span class="wp-item-play">' + (it.on ? C.icon("check", 12) : "") + "</span>" +
          "</button>").join("") +
        "</div></div>";
    }

    html += '<div class="look-block"><div class="look-label">渲染模式</div>' +
      seg("mode", mode, [{ v: "dynamic", t: "动态" }, { v: "static", t: "静态帧" }, { v: "off", t: "关闭壁纸" }], !st.count) +
      "</div>";

    // 自动轮换做成开关：关掉就单张循环，不再播完自己换
    html += '<div class="look-block"><div class="look-label">自动轮换<span class="look-val">' +
      (autoRotate ? "播完换下一张" : "单张循环") + "</span></div>" +
      '<button class="switch' + (autoRotate ? " on" : "") + '" data-wpt="autoRotate" role="switch" aria-checked="' +
      (autoRotate ? "true" : "false") + '" aria-label="自动轮换壁纸"></button></div>';

    html += '<div class="look-block"><div class="look-label">适配方式</div>' +
      seg("fit", c.fit || "cover", [{ v: "cover", t: "满屏裁剪" }, { v: "contain", t: "完整缩放" }, { v: "fill", t: "拉伸铺满" }], false) +
      "</div>";
    html += '<div class="look-block"><div class="look-label">壁纸暗化<span class="look-val" data-wpv="dim">' + (c.dim ?? 25) + "%</span></div>" +
      '<input type="range" class="range" data-wpr="dim" min="0" max="100" value="' + (c.dim ?? 25) + '" aria-label="壁纸暗化" /></div>';
    html += '<div class="look-block"><div class="look-label">壁纸不透明度<span class="look-val" data-wpv="opacity">' + (c.opacity ?? 100) + "%</span></div>" +
      '<input type="range" class="range" data-wpr="opacity" min="10" max="100" value="' + (c.opacity ?? 100) + '" aria-label="壁纸不透明度" /></div>';
    html += '<div class="look-block"><div class="look-label">壁纸模糊<span class="look-val" data-wpv="blur">' + (c.blur ?? 0) + "px</span></div>" +
      '<input type="range" class="range" data-wpr="blur" min="0" max="30" value="' + (c.blur ?? 0) + '" aria-label="壁纸模糊" /></div>';

    html += '<div class="look-block"><div class="look-label">窗口隐藏时暂停</div>' +
      '<button class="switch' + (c.pauseHidden !== false ? " on" : "") + '" data-wpt="pauseHidden" role="switch" aria-checked="' + (c.pauseHidden !== false) + '" aria-label="窗口隐藏时暂停"></button></div>';
    html += '<div class="look-block"><div class="look-label">壁纸声音</div>' +
      '<button class="switch' + (c.sound ? " on" : "") + '" data-wpt="sound" role="switch" aria-checked="' + (c.sound ? "true" : "false") + '" aria-label="壁纸声音"></button></div>';

    html += '<div class="wp-actions">' +
      '<button class="btn btn-primary" data-wpact="add" style="height:32px">' + C.icon("plus", 13) + " 添加目录</button>" +
      (st.needPerm ? '<button class="btn btn-ghost" data-wpact="reauth" style="height:32px">重新授权</button>' : "") +
      (st.count > 1 ? '<button class="btn btn-ghost" data-wpact="next" style="height:32px">下一张</button>' : "") +
      (st.dirs.length ? '<button class="btn btn-ghost" data-wpact="rescan" style="height:32px">重新扫描</button>' : "") +
      (st.dirs.length ? '<button class="btn btn-danger" data-wpact="clear" style="height:32px">清除</button>' : "") +
      "</div>";
    html += '<div class="wp-hint">' + C.icon("sparkle", 12) + " 选择存放 mp4 / webm 的目录；也可以直接选 Wallpaper Engine 的壁纸库目录（Steam → steamapps → workshop → content → 431960），会自动读取每个子目录 project.json 里的标题与分级。" +
      "<br>场景壁纸（scene.pkg）与网页壁纸需要 Wallpaper Engine 自身的渲染器，浏览器无法加载，请改用视频壁纸。" +
      "<br>浏览器安全限制：每次重新打开页面需要点一次目录授权，无法像桌面客户端那样记住。" +
      "</div>";
    return html;
  }

  function wireWallpaperPanel(root, refresh) {
    const W = global.App.Wallpaper;
    if (!W) return;
    $$("[data-wp]", root).forEach((b) => {
      b.addEventListener("click", () => {
        const [k, v] = b.dataset.wp.split(":");
        W.saveCfg({ [k]: v });
        if (refresh) refresh();
      });
    });
    $$("[data-wpr]", root).forEach((r) => {
      r.addEventListener("input", () => {
        const k = r.dataset.wpr;
        const val = parseInt(r.value, 10);
        W.saveCfg({ [k]: val });
        const lab = $('[data-wpv="' + k + '"]', root);
        if (lab) lab.textContent = val + (k === "blur" ? "px" : "%");
      });
    });
    $$("[data-wpt]", root).forEach((s) => {
      s.addEventListener("click", () => {
        const k = s.dataset.wpt;
        const on = !s.classList.contains("on");
        W.saveCfg({ [k]: on });
        s.classList.toggle("on", on);
        s.setAttribute("aria-checked", on ? "true" : "false");
        // 自动轮换的说明要跟着变，否则开关拨了、旁边文字还是旧的
        if (k === "autoRotate") {
          const blk = s.closest(".look-block");
          const val = blk && blk.querySelector(".look-val");
          if (val) val.textContent = on ? "播完换下一张" : "单张循环";
        }
      });
    });

    // 列表点选：就地更新选中态，不整页重渲染（壁纸多时重渲染会明显掉帧）
    $$("[data-wpitem]", root).forEach((b) => {
      b.addEventListener("click", () => {
        const i = parseInt(b.dataset.wpitem, 10);
        if (!isNaN(i)) W.playAt(i);
        $$("[data-wpitem]", root).forEach((x) => {
          const cur = x === b;
          x.classList.toggle("on", cur);
          x.setAttribute("aria-selected", cur ? "true" : "false");
          const slot = x.querySelector(".wp-item-play");
          if (slot) slot.innerHTML = cur ? C.icon("check", 12) : "";
        });
        const name = (b.querySelector(".wp-item-name") || {}).textContent || "";
        const cur = $("[data-wpcur]", root);
        if (cur) cur.textContent = " · 当前：" + name;
      });
    });
    $$("[data-wpact]", root).forEach((b) => {
      b.addEventListener("click", async () => {
        const act = b.dataset.wpact;
        if (act === "add") {
          let r = await W.pickDir();
          if (!r.ok && r.error === "NO_API") {
            r = await W.pickDirFallback();
            if (r.ok) toast("已加载 " + r.count + " 个视频（刷新后需重选）", "success");
          } else if (r.ok) {
            const total = W.getState().total;
            toast(r.count
              ? "已连接「" + r.name + "」，识别到 " + r.count + " 个视频"
              : total ? "已连接「" + r.name + "」，但这个分级下没有可显示的壁纸" : "目录里没有视频文件",
              r.count || total ? "success" : "error");
            // 有壁纸就启用（哪怕当前分级全筛掉了）——放开分级后能直接看到，
            // 不然开关会一直停在「关闭壁纸」，用户以为坏了
            if (total) W.saveCfg({ mode: "dynamic" });
          } else if (!r.canceled) {
            toast(r.error || "添加失败", "error");
          }
        } else if (act === "reauth") {
          const ok = await W.reauthorize();
          toast(ok ? "已恢复访问" : "授权未通过", ok ? "success" : "error");
        } else if (act === "next") {
          W.next();
        } else if (act === "rescan") {
          const n = await W.rescan();
          toast("扫描完成 · " + n + " 个视频", "success");
        } else if (act === "clear") {
          await W.clearDirs();
          toast("已移除壁纸目录");
        }
        if (refresh) refresh();
      });
    });
  }

  global.App.UI = {
    init,
    coverStyle, coverHTML, smallCover,
    sectionHead, emptyState, songCard, songRow, songListHTML, cardGridHTML,
    toast, modal, closeModal, confirmDialog, contextMenu, closeMenu,
    openPalette, openAuthModal, openPlaylistPicker, openShareModal, openSongInfo, songActions,
    renderNav, renderSidebarPlaylists, renderUser, refreshCurrentView, updateSocialBadge,
    toggleDrawer, renderDrawer,
    wallpaperPanelHTML, wireWallpaperPanel,
  };
})(window);
