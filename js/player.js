/* ============================================================
 * player.js — 播放引擎
 * 队列 / 随机 / 循环 / 音量增强(GainNode) / 媒体会话 / 歌词
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;
  const D = global.App.DATA;
  const bus = C.bus;

  /* ==================== 状态 ==================== */
  const audio = new Audio();
  audio.preload = "metadata";
  audio.crossOrigin = "anonymous";

  let boostCtx = null;
  let boostGain = null;
  let boostLevel = 1;

  const state = {
    queue: [],          // 歌曲 id 数组
    index: -1,          // 当前下标
    playing: false,
    loading: false,
    shuffle: false,
    repeat: "all",      // "off" | "all" | "one"
    volume: 0.8,
    muted: false,
    lyrics: [],         // [{t, text}]
    lyricIndex: -1,
    current: null,      // 当前歌曲对象
  };

  const K_QUEUE = "mp_v1_queue";

  /* ==================== 音量增强 ==================== */
  function ensureBoostGraph() {
    if (boostCtx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      boostCtx = new AC();
      const src = boostCtx.createMediaElementSource(audio);
      boostGain = boostCtx.createGain();
      boostGain.gain.value = boostLevel;
      src.connect(boostGain);
      boostGain.connect(boostCtx.destination);
    } catch (e) {
      console.warn("音量增强不可用（可能已创建音频图）", e);
      boostCtx = null;
    }
  }

  function setBoost(level) {
    boostLevel = level;
    if (level > 1.001) ensureBoostGraph();
    if (boostCtx && boostCtx.state === "suspended") boostCtx.resume().catch(() => {});
    if (boostGain) boostGain.gain.value = level;
    audio.volume = level > 1.001 ? 1 : 1; // 原始音量恒定，增益交给 GainNode
  }

  /* ==================== 队列 ==================== */
  function loadQueue() {
    try {
      const q = JSON.parse(localStorage.getItem(K_QUEUE) || "null");
      if (q && Array.isArray(q.queue)) {
        state.queue = q.queue;
        state.index = typeof q.index === "number" ? q.index : -1;
      }
    } catch (e) { /* 忽略 */ }
  }
  function saveQueue() {
    try {
      localStorage.setItem(K_QUEUE, JSON.stringify({ queue: state.queue, index: state.index }));
    } catch (e) { /* 忽略 */ }
  }
  loadQueue();

  function setQueue(ids, startIndex) {
    state.queue = ids.slice();
    state.index = startIndex || 0;
    saveQueue();
    bus.emit("player:queue", state.queue);
  }

  function queueList() { return state.queue.slice(); }

  function currentSong() {
    if (state.index < 0 || state.index >= state.queue.length) return null;
    return D.get(state.queue[state.index]) || null;
  }

  /* ==================== 播放控制 ==================== */
  function loadSong(song, autoplay) {
    if (!song) return;
    state.current = song;
    state.lyrics = [];
    state.lyricIndex = -1;
    audio.src = song.audio;
    audio.load();
    C.applySongAccent(song);
    updateMediaSession(song);
    if (autoplay !== false) play();
    bus.emit("player:changed", song);
    bus.emit("player:lyric", null);
  }

  function play() {
    if (!state.current) return;
    ensureBoostGraph();
    if (boostCtx && boostCtx.state === "suspended") boostCtx.resume().catch(() => {});
    const p = audio.play();
    if (p && p.catch) p.catch((e) => console.warn("播放被拒绝", e));
  }

  function pause() { audio.pause(); }

  function toggle() {
    if (!state.current) {
      if (state.queue.length) {
        playAt(state.index >= 0 ? state.index : 0);
      } else {
        // 空队列：播放热门第一首
        const t = global.App.Recommend.trending(1)[0];
        if (t) playList([t.id], 0);
      }
      return;
    }
    if (audio.paused) play();
    else pause();
  }

  function playList(ids, startIndex) {
    setQueue(ids, startIndex || 0);
    loadSong(currentSong(), true);
  }

  function playAt(i) {
    if (i < 0 || i >= state.queue.length) return;
    state.index = i;
    saveQueue();
    loadSong(currentSong(), true);
  }

  function next(auto) {
    if (!state.queue.length) return;
    if (state.shuffle) {
      let i;
      do { i = Math.floor(Math.random() * state.queue.length); }
      while (state.queue.length > 1 && i === state.index);
      playAt(i);
      return;
    }
    if (state.index + 1 < state.queue.length) playAt(state.index + 1);
    else if (state.repeat === "all") playAt(0);
    else if (auto) { /* 列表播完且不循环：停止 */ }
    else bus.emit("player:ended-all", null);
  }

  function prev() {
    if (!state.queue.length) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; }
    if (state.index > 0) playAt(state.index - 1);
    else if (state.repeat === "all") playAt(state.queue.length - 1);
    else audio.currentTime = 0;
  }

  function seekTo(ratio) {
    if (audio.duration && isFinite(audio.duration)) {
      audio.currentTime = Math.max(0, Math.min(1, ratio)) * audio.duration;
    }
  }

  function setVolume(v) {
    state.volume = Math.max(0, Math.min(1, v));
    state.muted = state.volume === 0;
    audio.volume = state.volume;
    bus.emit("player:volume", state.volume);
  }

  function toggleMute() {
    if (state.muted || state.volume === 0) setVolume(0.8);
    else setVolume(0);
  }

  function toggleShuffle() {
    state.shuffle = !state.shuffle;
    bus.emit("player:mode", { shuffle: state.shuffle, repeat: state.repeat });
    return state.shuffle;
  }

  function cycleRepeat() {
    state.repeat = state.repeat === "all" ? "one" : state.repeat === "one" ? "off" : "all";
    bus.emit("player:mode", { shuffle: state.shuffle, repeat: state.repeat });
    return state.repeat;
  }

  /* ==================== 媒体会话（锁屏 / 耳机线控） ==================== */
  const capMediaSession =
    (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.MediaSession) || null;

  // 系统灵动岛 / 灵动胶囊 / 锁屏 / 通知栏读的是 MediaSession 的三样东西：
  // 元数据（含封面位图）、播放状态、进度。缺一样就只剩个空壳或不出现。
  function artworkFor(song) {
    if (!song || !song.coverUrl) return [];
    let u = song.coverUrl;
    // 网易云图床支持按尺寸裁剪；通知大图不需要原图，压到 400 能少占内存、少卡原生解码
    if (/music\.126\.net/.test(u) && u.indexOf("?") < 0) u += "?param=400y400";
    // 必须走同源代理：直连 CDN 原生解码会拿到重定向/防盗链的空流，
    // 之前的版本正是因为这点把封面整个关掉了。
    const src = (global.location.origin || "") + "/api/cover.php?u=" + encodeURIComponent(u);
    return [{ src: src, sizes: "400x400", type: "image/jpeg" }];
  }

  function sessionMeta(song) {
    if (!song) return;
    const art = artworkFor(song);
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title, artist: song.artist, album: song.album, artwork: art,
        });
      } catch (e) { /* 旧浏览器 */ }
    }
    if (capMediaSession && capMediaSession.setMetadata) {
      try {
        capMediaSession.setMetadata({
          title: song.title, artist: song.artist, album: song.album, artwork: art,
        });
      } catch (e) { /* 忽略 */ }
    }
  }

  function sessionState(playing) {
    if ("mediaSession" in navigator) {
      try { navigator.mediaSession.playbackState = playing ? "playing" : "paused"; } catch (e) { /* 忽略 */ }
    }
    if (capMediaSession && capMediaSession.setPlaybackState) {
      try { capMediaSession.setPlaybackState({ playbackState: playing ? "playing" : "paused" }); } catch (e) { /* 忽略 */ }
    }
  }

  let posAt = 0;
  function sessionPosition(force) {
    const a = audio;
    if (!a || !isFinite(a.duration) || a.duration <= 0) return;
    const now = Date.now();
    if (!force && now - posAt < 900) return;
    posAt = now;
    const pos = Math.min(Math.max(a.currentTime || 0, 0), a.duration);
    const payload = { duration: a.duration, playbackRate: a.playbackRate || 1, position: pos };
    if ("mediaSession" in navigator && navigator.mediaSession.setPositionState) {
      try { navigator.mediaSession.setPositionState(payload); } catch (e) { /* 忽略 */ }
    }
    if (capMediaSession && capMediaSession.setPositionState) {
      try { capMediaSession.setPositionState(payload); } catch (e) { /* 忽略 */ }
    }
  }

  function updateMediaSession(song) {
    if (!song) return;
    sessionMeta(song);
    sessionState(!!state.playing);
    sessionPosition(true);
  }

  function setupMediaSession() {
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      try {
        ms.setActionHandler("play", play);
        ms.setActionHandler("pause", pause);
        ms.setActionHandler("previoustrack", prev);
        ms.setActionHandler("nexttrack", () => next(false));
        ms.setActionHandler("seekto", (d) => { if (d && d.seekTime != null) seekTo(d.seekTime); });
      } catch (e) { /* 部分 action 不支持 */ }
    }
    // APK 里通知上的按钮走原生回调，同样要注册，否则点了没反应
    if (capMediaSession && capMediaSession.setActionHandler) {
      const bind = (action, fn) => {
        try { capMediaSession.setActionHandler({ action: action }, fn); } catch (e) { /* 忽略 */ }
      };
      bind("play", play);
      bind("pause", pause);
      bind("previoustrack", prev);
      bind("nexttrack", () => next(false));
      bind("seekto", (d) => { if (d && d.seekTime != null) seekTo(d.seekTime); });
    }
  }

  /* ==================== 歌词 ==================== */
  function parseLrc(text) {
    if (!text) return [];
    const lines = [];
    const re = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
    text.split(/\r?\n/).forEach((line) => {
      const stamps = [];
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(line)) !== null) {
        const t = parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / 1000 : 0);
        stamps.push(t);
      }
      const txt = line.replace(re, "").trim();
      if (!txt) return;
      stamps.forEach((t) => lines.push({ t, text: txt }));
    });
    lines.sort((a, b) => a.t - b.t);
    return lines;
  }

  // 网易云逐字歌词（yrc）：每行 [行起ms,行长ms]字(字起ms,字长ms,标志)文本
  // 字时间是绝对秒。返回 [{t, text, words:[{text,start,end}], trans?}]
  function parseYrc(yrc, tlyric) {
    if (!yrc) return null;
    const tmap = {};
    if (tlyric) {
      parseLrc(tlyric).forEach((t) => (tmap[t.t.toFixed(2)] = t.text));
    }
    const lines = [];
    yrc.replace(/^\uFEFF/, "").split(/\r?\n/).forEach((raw) => {
      const lm = raw.match(/^\[(\d+),(\d+)\](.*)/);
      if (!lm) return;
      const lineStart = parseInt(lm[1], 10) / 1000;
      const rest = lm[3];
      const words = [];
      let fullText = "";
      const wr = /\((\d+),(\d+),(\d+)\)([^\(]*)/g;
      let wm;
      while ((wm = wr.exec(rest)) !== null) {
        const cs = parseInt(wm[1], 10) / 1000;
        const cd = parseInt(wm[2], 10) / 1000;
        const txt = wm[4];
        if (!txt) continue;
        words.push({ text: txt, start: cs, end: cs + cd });
        fullText += txt;
      }
      if (!words.length) return;
      const key = Object.keys(tmap).find((k) => Math.abs(parseFloat(k) - lineStart) < 0.05);
      const trans = key ? tmap[key] : "";
      // text 保留译文（与 lrc 模式一致，fade / 抽屉直接可用）；karaoke 用 words + trans
      const text = trans ? fullText + "<span class='lyric-trans'>" + C.esc(trans) + "</span>" : fullText;
      lines.push({ t: lineStart, text, words, trans });
    });
    return lines.length ? lines : null;
  }

  // 把接口返回的 lyric/yrc 统一转成 [{t,text,words?,trans?}]
  function parseLyricPayload(data, isNetease) {
    if (!data || !data.ok) return null;
    if (isNetease && data.yrc) {
      const y = parseYrc(data.yrc, data.tlyric || "");
      if (y && y.length) return y;
    }
    if (!data.lyric) return null;
    const orig = parseLrc(data.lyric);
    if (!orig.length) return null;
    const trans = parseLrc(data.tlyric || "");
    if (trans.length) {
      const tmap = {};
      trans.forEach((t) => (tmap[t.t.toFixed(2)] = t.text));
      orig.forEach((l) => {
        const key = Object.keys(tmap).find((k) => Math.abs(parseFloat(k) - l.t) < 0.05);
        if (key) {
          l.text = l.text + "<span class='lyric-trans'>" + C.esc(tmap[key]) + "</span>";
          l.trans = tmap[key];
        }
      });
    }
    return orig;
  }

  function normTitle(t) {
    return String(t || "")
      .toLowerCase()
      .replace(/[（(\[].*?[)）\]]/g, "")   // 去掉 (Live) (深情版) 这类后缀
      .replace(/\s+/g, "")
      .replace(/[^\w\u4e00-\u9fa5]/g, "");
  }

  // 换源找歌词：歌在网易云就去 QQ 找同名曲目，反之亦然
  async function lyricsFromOtherSource(song) {
    const isNe = song.id.indexOf("ne_") === 0;
    const other = isNe ? "qq.php" : "netease.php";
    const want = normTitle(song.title);
    if (!want) return null;
    const kw = (song.title + " " + (song.artist || "")).trim();
    const r = await C.apiGet(other, { action: "search", keywords: kw, limit: 8 });
    if (!r || !r.ok || !Array.isArray(r.data) || !r.data.length) return null;
    const hit = r.data.find((x) => {
      const n = normTitle(x.title);
      return n === want || n.indexOf(want) === 0 || want.indexOf(n) === 0;
    });
    if (!hit) return null;
    const d = await C.apiGet(other, { action: "lyric", id: String(hit.id) });
    return parseLyricPayload(d, !isNe);
  }

  // 第三方歌词库：lrclib.net（免 key、带 CORS），主要补海外曲目
  async function lyricsFromLrclib(song) {
    const title = String(song.title || "").replace(/[（(].*?[)）]/g, "").trim();
    const artist = String(song.artist || "").split(/[、,&/]/)[0].trim();
    if (!title) return null;
    try {
      const qs = new URLSearchParams({ artist_name: artist, track_name: title });
      if (song.dur) qs.set("duration", String(Math.round(song.dur)));
      // 不要加自定义请求头：非简单头会触发 OPTIONS 预检，
      // 对方没在 Access-Control-Allow-Headers 里放行就直接跨域失败。
      let res = await fetch("https://lrclib.net/api/get?" + qs);
      if (res.ok) {
        const j = await res.json();
        if (j && j.syncedLyrics) return j.syncedLyrics;
      }
      // 精确匹配不到就模糊搜一次，取第一条带时间轴的
      res = await fetch("https://lrclib.net/api/search?" + new URLSearchParams({ q: title + " " + artist }));
      if (!res.ok) return null;
      const arr = await res.json();
      const hit = (arr || []).find((x) => x.syncedLyrics);
      return hit ? hit.syncedLyrics : null;
    } catch (e) {
      return null;
    }
  }

  async function fetchLyrics(song) {
    if (!song) return;
    if (!song.external) {
      bus.emit("player:lyric", null);
      state.lyrics = [];
      return;
    }
    const rawId = String(song.id).replace(/^(ne_|qq_|au_)/, "");
    const isNe = song.id.indexOf("ne_") === 0;
    const isQQ = song.id.indexOf("qq_") === 0;
    const apply = (lines, source) => {
      if (!lines || !lines.length) return false;
      state.lyrics = lines;
      state.lyricSource = source;
      bus.emit("player:lyric", lines);
      return true;
    };

    try {
      // 1) 先用歌曲自己的音源
      if (isNe || isQQ) {
        const d = isNe
          ? await C.apiGet("netease.php", { action: "lyric", id: rawId })
          : await C.apiGet("qq.php", { action: "lyric", id: rawId });
        if (apply(parseLyricPayload(d, isNe), isNe ? "网易云" : "QQ音乐")) return;
      }
      // 2) 换一个音源，按「歌名 + 歌手」找同一首
      if (isNe || isQQ) {
        const alt = await lyricsFromOtherSource(song);
        if (apply(alt, isNe ? "QQ音乐" : "网易云")) return;
      }
      // 3) 第三方歌词库兜底
      const lr = await lyricsFromLrclib(song);
      if (lr) {
        const lines = parseLrc(lr);
        if (apply(lines, "LRCLIB")) return;
      }
    } catch (e) { /* 全部失败走下面的清空 */ }

    state.lyrics = [];
    state.lyricSource = "";
    bus.emit("player:lyric", null);
  }

  function updateLyricIndex() {
    if (!state.lyrics.length) return;
    const t = audio.currentTime;
    let idx = -1;
    for (let i = 0; i < state.lyrics.length; i++) {
      if (state.lyrics[i].t <= t + 0.15) idx = i;
      else break;
    }
    if (idx !== state.lyricIndex) {
      state.lyricIndex = idx;
      bus.emit("player:lyricline", idx);
    }
  }

  /* ==================== 音频事件 ==================== */
  audio.addEventListener("play", () => {
    state.playing = true;
    sessionState(true);
    // 原生前台服务是异步绑定的：启动瞬间推的元数据会被丢掉，
    // 这里等它起来再补一次（通知栏的封面/歌名就靠这次）。
    setTimeout(() => { if (state.current && state.playing) sessionMeta(state.current); }, 400);
    setTimeout(() => { if (state.current && state.playing) { sessionMeta(state.current); sessionPosition(true); } }, 1500);
    bus.emit("player:state", true);
  });
  audio.addEventListener("pause", () => {
    state.playing = false;
    sessionState(false);
    bus.emit("player:state", false);
  });
  audio.addEventListener("timeupdate", () => {
    bus.emit("player:time", { cur: audio.currentTime, dur: audio.duration || 0 });
    sessionPosition(false);
    updateLyricIndex();
  });
  audio.addEventListener("loadedmetadata", () => {
    bus.emit("player:time", { cur: audio.currentTime, dur: audio.duration || 0 });
    sessionPosition(true);
  });
  audio.addEventListener("waiting", () => { state.loading = true; bus.emit("player:loading", true); });
  audio.addEventListener("playing", () => { state.loading = false; bus.emit("player:loading", false); });
  audio.addEventListener("canplay", () => { state.loading = false; bus.emit("player:loading", false); });
  audio.addEventListener("ended", () => {
    if (state.repeat === "one") { audio.currentTime = 0; play(); return; }
    next(true);
  });
  audio.addEventListener("error", () => {
    state.loading = false;
    bus.emit("player:loading", false);
    bus.emit("player:error", { song: state.current });
  });

  /* ==================== 频谱旁路（captureStream，不改原生播放链路） ==================== */
  let specCtx = null, specAnalyser = null, specData = null, specOK = false, specFailed = false;
  function setupSpectrum() {
    if (specOK) return true;
    if (specFailed || !audio.captureStream) return false; // 失败后不再重试，避免每帧刷错误
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) { specFailed = true; return false; }
      specCtx = new AC();
      specCtx.addEventListener("error", function () { specFailed = true; specOK = false; });
      const src = specCtx.createMediaStreamSource(audio.captureStream());
      specAnalyser = specCtx.createAnalyser();
      specAnalyser.fftSize = 128;
      specAnalyser.smoothingTimeConstant = 0.8;
      src.connect(specAnalyser); // 只观察，不接 destination
      specData = new Uint8Array(specAnalyser.frequencyBinCount);
      specOK = true;
      return true;
    } catch (e) {
      specFailed = true;
      try { if (specCtx) specCtx.close(); } catch (err) { /* ignore */ }
      return false;
    }
  }
  // 返回 64 个 0-255 的频段值；不支持时返回 null（调用方降级为模拟律动）
  function getSpectrum() {
    if (!setupSpectrum()) return null;
    if (specCtx.state === "suspended") { try { specCtx.resume(); } catch (e) { /* ignore */ } }
    specAnalyser.getByteFrequencyData(specData);
    return specData;
  }

  /* ==================== 导出 ==================== */
  setupMediaSession();
  setVolume(state.volume);

  global.App.Player = {
    state, audio,
    play, pause, toggle, next, prev, seekTo,
    playList, playAt, setQueue, queueList, currentSong,
    setVolume, toggleMute, setBoost, toggleShuffle, cycleRepeat,
    loadSong, fetchLyrics, updateMediaSession, getSpectrum,
  };
})(window);
