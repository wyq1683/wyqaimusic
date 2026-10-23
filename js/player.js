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

  function updateMediaSession(song) {
    if (!song) return;
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: song.title,
          artist: song.artist,
          album: song.album,
        });
      } catch (e) { /* 旧浏览器 */ }
    }
    if (capMediaSession && capMediaSession.setMetadata) {
      // Capacitor APK：仅同步文字（封面 URL 会导致原生崩溃）
      try {
        capMediaSession.setMetadata({ title: song.title, artist: song.artist, album: song.album });
      } catch (e) { /* 忽略 */ }
    }
  }

  function setupMediaSession() {
    if ("mediaSession" in navigator) {
      const ms = navigator.mediaSession;
      try {
        ms.setActionHandler("play", play);
        ms.setActionHandler("pause", pause);
        ms.setActionHandler("previoustrack", prev);
        ms.setActionHandler("nexttrack", () => next(false));
      } catch (e) { /* 部分action不支持 */ }
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

  async function fetchLyrics(song) {
    if (!song) return;
    if (!song.external) {
      bus.emit("player:lyric", null);
      state.lyrics = [];
      return;
    }
    const rawId = String(song.id).replace(/^(ne_|qq_|au_)/, "");
    try {
      let data = null;
      if (song.id.indexOf("ne_") === 0) {
        data = await C.apiGet("netease.php", { action: "lyric", id: rawId });
      } else if (song.id.indexOf("qq_") === 0) {
        data = await C.apiGet("qq.php", { action: "lyric", id: rawId });
      } else {
        bus.emit("player:lyric", null);
        return;
      }
      if (data && data.ok && data.lyric) {
        const orig = parseLrc(data.lyric);
        const trans = parseLrc(data.tlyric || "");
        if (trans.length) {
          // 合并译文：同时间戳行附加翻译
          const tmap = {};
          trans.forEach((t) => (tmap[t.t.toFixed(2)] = t.text));
          orig.forEach((l) => {
            const key = Object.keys(tmap).find((k) => Math.abs(parseFloat(k) - l.t) < 0.05);
            if (key) l.text = l.text + "<span class='lyric-trans'>" + C.esc(tmap[key]) + "</span>";
          });
        }
        state.lyrics = orig;
        bus.emit("player:lyric", orig);
      } else {
        state.lyrics = [];
        bus.emit("player:lyric", null);
      }
    } catch (e) {
      state.lyrics = [];
      bus.emit("player:lyric", null);
    }
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
    if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "playing"; } catch (e) {} }
    bus.emit("player:state", true);
  });
  audio.addEventListener("pause", () => {
    state.playing = false;
    if ("mediaSession" in navigator) { try { navigator.mediaSession.playbackState = "paused"; } catch (e) {} }
    bus.emit("player:state", false);
  });
  audio.addEventListener("timeupdate", () => {
    bus.emit("player:time", { cur: audio.currentTime, dur: audio.duration || 0 });
    updateLyricIndex();
  });
  audio.addEventListener("loadedmetadata", () => {
    bus.emit("player:time", { cur: audio.currentTime, dur: audio.duration || 0 });
    if ("mediaSession" in navigator && navigator.mediaSession.setPositionState && isFinite(audio.duration)) {
      try {
        navigator.mediaSession.setPositionState({
          duration: audio.duration,
          playbackRate: audio.playbackRate,
          position: Math.min(audio.currentTime, audio.duration),
        });
      } catch (e) { /* 忽略 */ }
    }
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
