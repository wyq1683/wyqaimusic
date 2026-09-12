/* ============================================================
 * player.js — 播放引擎
 * 播放/暂停、上一首/下一首、进度拖动、音量、随机、循环模式、
 * 播放队列，以及可选的 Web Audio 频谱可视化（CORS 受限时自动降级）。
 * ============================================================ */
(function (global) {
  "use strict";
  const D = global.App.DATA;
  const S = global.App.Store;

  let audio = new Audio();
  audio.preload = "metadata";

  let queue = [];        // 曲目 id 数组
  let index = -1;        // 当前索引
  let shuffle = false;
  let repeat = "off";    // off | all | one
  let shuffleOrder = []; // 随机播放顺序
  let started = false;   // 是否已经有过用户播放动作（用于自动播放策略）

  // 简易事件总线
  const listeners = {};
  function on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); }
  function emit(evt, payload) { (listeners[evt] || []).forEach((fn) => fn(payload)); }

  function currentSong() { return index >= 0 ? D.get(queue[index]) : null; }

  /* ---- Media Session（系统级媒体控制：锁屏/通知栏/灵动岛胶囊/耳机线控/蓝牙/手表） ---- */
  function makeCoverUrl(song) {
    if (!song) return null;
    if (song.coverUrl) return song.coverUrl;
    // 内置歌曲无真实封面 → 生成渐变 SVG 封面（Android/部分系统可显示）
    try {
      const from = (song.c && song.c.from) || "#7c5cff";
      const to = (song.c && song.c.to) || "#ff5c9d";
      const emoji = song.emoji || "🎵";
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">' +
        '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
        '<stop offset="0" stop-color="' + from + '"/><stop offset="1" stop-color="' + to + '"/>' +
        '</linearGradient></defs>' +
        '<rect width="512" height="512" fill="url(#g)"/>' +
        '<text x="256" y="300" font-size="180" text-anchor="middle">' + emoji + '</text></svg>';
      return "data:image/svg+xml," + encodeURIComponent(svg);
    } catch (e) { return null; }
  }
  function updateMediaSession(song) {
    if (!("mediaSession" in navigator) || !song) return;
    try {
      const ms = navigator.mediaSession;
      const meta = { title: song.title || "未知曲目", artist: song.artist || "未知歌手", album: song.album || "" };
      const cover = makeCoverUrl(song);
      if (cover) {
        meta.artwork = [
          { src: cover, sizes: "512x512", type: cover.indexOf("data:image") === 0 ? "image/svg+xml" : "image/jpeg" },
          { src: cover, sizes: "256x256", type: cover.indexOf("data:image") === 0 ? "image/svg+xml" : "image/jpeg" },
        ];
      }
      ms.metadata = new MediaMetadata(meta);
    } catch (e) { /* 忽略 metadata 设置失败 */ }
  }
  function setupMediaSession() {
    if (!("mediaSession" in navigator)) return;
    const ms = navigator.mediaSession;
    try {
      ms.setActionHandler("play", () => play());
      ms.setActionHandler("pause", () => pause());
      ms.setActionHandler("stop", () => pause());
      ms.setActionHandler("previoustrack", () => prev());
      ms.setActionHandler("nexttrack", () => next());
      ms.setActionHandler("seekto", (d) => { if (d && !isNaN(d.seekTime)) seek(d.seekTime); });
      ms.setActionHandler("seekbackward", (d) => { seek(Math.max(0, audio.currentTime - (d && d.seekOffset ? d.seekOffset : 10))); });
      ms.setActionHandler("seekforward", (d) => { seek(Math.min(audio.duration || 0, audio.currentTime + (d && d.seekOffset ? d.seekOffset : 10))); });
    } catch (e) { /* 某些平台不支持部分 handler，忽略 */ }
  }


  function loadAndPlay(songId, autoplay) {
    const song = D.get(songId);
    if (!song) return;
    // createMediaElementSource 建立后无法断开：若已开启音量增强而新歌是跨域音源，
    // 音频会被浏览器静音 → 重建干净的 audio 元素脱离增益链路
    if (boostCtx && isCrossOrigin(song.audio)) rebuildAudio();
    audio.src = song.audio;
    audio.load();
    updateMediaSession(song);
    if (autoplay) {
      audio.play().catch(() => { /* 浏览器可能拦截自动播放，等待用户手势 */ });
    }
    emit("track", { song, queue, index });
  }

  // 在给定队列中播放某首
  function playSong(songId, queueIds, opts) {
    opts = opts || {};
    queue = (queueIds && queueIds.length) ? queueIds.slice() : [songId];
    const i = queue.indexOf(songId);
    index = i >= 0 ? i : 0;
    if (shuffle) buildShuffle();
    loadAndPlay(queue[index], true);
    started = true;
    registerPlay(queue[index]);
  }

  function registerPlay(songId) {
    if (!S.isLoggedIn()) return;
    S.addHistory(songId, 1);
    S.bumpPlays(songId);
  }

  function buildShuffle() {
    shuffleOrder = queue.map((_, i) => i);
    for (let i = shuffleOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffleOrder[i], shuffleOrder[j]] = [shuffleOrder[j], shuffleOrder[i]];
    }
  }

  function effectiveIndex(delta) {
    if (shuffle && shuffleOrder.length) {
      const curPos = shuffleOrder.indexOf(index);
      let pos = curPos + delta;
      // 非循环模式到末尾：钳位到最后一首（避免越界取到 undefined）
      if (pos >= shuffleOrder.length) pos = repeat === "all" ? 0 : shuffleOrder.length - 1;
      if (pos < 0) pos = 0;
      return shuffleOrder[pos];
    }
    let ni = index + delta;
    if (ni >= queue.length) ni = repeat === "all" ? 0 : queue.length - 1; // 钳位，不越界
    if (ni < 0) ni = 0;
    return ni;
  }

  function next(auto) {
    if (index < 0) return;
    if (auto && repeat === "one") { audio.currentTime = 0; audio.play(); return; }
    const ni = effectiveIndex(1);
    if (auto && repeat !== "all" && shuffle && shuffleOrder.indexOf(index) >= shuffleOrder.length - 1) {
      // 随机且非循环：播完即停
      pause(); emit("ended"); return;
    }
    if (auto && repeat === "off" && !shuffle && index >= queue.length - 1) {
      pause(); emit("ended"); return;
    }
    index = ni;
    loadAndPlay(queue[index], true);
    registerPlay(queue[index]);
  }

  function prev() {
    if (index < 0) return;
    if (audio.currentTime > 3) { audio.currentTime = 0; return; } // 3 秒内回到上一首
    index = effectiveIndex(-1);
    loadAndPlay(queue[index], true);
    registerPlay(queue[index]);
  }

  function play() {
    if (index < 0) {
      if (queue.length === 0) {
        // 默认播放整库
        playSong(D.SONGS[0].id, D.SONGS.map((s) => s.id));
        return;
      }
      loadAndPlay(queue[index], true);
      return;
    }
    audio.play().catch(() => {});
  }

  function pause() { audio.pause(); }
  function toggle() { audio.paused ? play() : pause(); }

  function seek(t) { if (!isNaN(t)) audio.currentTime = t; }
  function setVolume(v) { audio.volume = Math.max(0, Math.min(1, v)); }
  function getVolume() { return audio.volume; }

  // ---- 音量增强（Web Audio GainNode，增益可超过 100%）----
  let boostCtx = null, boostGain = null, boostLevel = 1.0;
  function isCrossOrigin(url) {
    if (!url) return false;
    if (url.startsWith("/") || url.startsWith("api/") || url.startsWith("music/")) return false;
    try {
      const u = new URL(url, location.href);
      return u.origin !== location.origin;
    } catch (e) { return true; }
  }
  function ensureBoost() {
    if (!boostCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      boostCtx = new AC();
      const src = boostCtx.createMediaElementSource(audio);
      boostGain = boostCtx.createGain();
      src.connect(boostGain);
      boostGain.connect(boostCtx.destination);
    }
    return boostCtx;
  }
  // 音量增强：返回 {ok, level, reason}，level 可选（默认 1.5）
  function boostVolume(level) {
    const lvl = level || 1.5;
    const song = currentSong();
    const url = song ? (song.audio || "") : "";
    if (isCrossOrigin(url)) {
      // 跨域音源无法用 Web Audio 增益（会被浏览器静音），只能拉满原生音量
      audio.volume = 1.0;
      return { ok: false, level: 1.0, reason: "该音源为跨域外链，不支持增益，已设为最大原生音量" };
    }
    try {
      const ctx = ensureBoost();
      if (!ctx) { audio.volume = 1.0; return { ok: false, level: 1.0, reason: "浏览器不支持音量增强" }; }
      if (ctx.state === "suspended") ctx.resume();
      boostLevel = lvl;
      boostGain.gain.value = lvl;
      return { ok: true, level: lvl, reason: "" };
    } catch (e) {
      audio.volume = 1.0;
      return { ok: false, level: 1.0, reason: "音量增强失败：" + e.message };
    }
  }
  // 恢复正常音量（关闭增益）
  function resetBoost() {
    if (boostGain) boostGain.gain.value = 1.0;
    boostLevel = 1.0;
  }
  function getBoostLevel() { return boostLevel; }

  // ---- 节拍分析（非侵入式旁路监听，不劫持音频输出）----
  // 用 audio.captureStream() 复制一份音频流喂给 AnalyserNode 做频谱/节拍分析，
  // 原生播放路径完全不受影响；跨域音源旁路流自动静音 → UI 降级为模拟律动。
  let beatCtx = null, beatAnalyser = null, beatFreq = null;
  let beatReady = false, beatLoopId = null;
  let beatLive = false;
  let bassHistory = [];
  let lastBeat = { energy: 0, bass: 0, mid: 0, treble: 0, beat: false, live: false };

  function setupBeatTap() {
    if (beatReady) return true;
    if (!audio.captureStream) return false;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      beatCtx = new AC();
      const stream = audio.captureStream();
      const src = beatCtx.createMediaStreamSource(stream);
      beatAnalyser = beatCtx.createAnalyser();
      beatAnalyser.fftSize = 512;
      beatAnalyser.smoothingTimeConstant = 0.82;
      src.connect(beatAnalyser); // 仅观察频谱，不输出到扬声器
      beatFreq = new Uint8Array(beatAnalyser.frequencyBinCount);
      beatReady = true;
      return true;
    } catch (e) { return false; }
  }

  function computeBeat() {
    if (!beatReady || !beatAnalyser) return;
    beatAnalyser.getByteFrequencyData(beatFreq);
    const n = beatFreq.length;
    const bassEnd = Math.max(1, Math.floor(n * 0.08));
    const midEnd = Math.max(bassEnd + 1, Math.floor(n * 0.45));
    let bass = 0, mid = 0, treble = 0;
    for (let i = 0; i < n; i++) {
      const v = beatFreq[i] / 255;
      if (i < bassEnd) bass += v;
      else if (i < midEnd) mid += v;
      else treble += v;
    }
    bass /= bassEnd; mid /= (midEnd - bassEnd); treble /= Math.max(1, n - midEnd);
    const energy = Math.min(1, bass * 0.5 + mid * 0.3 + treble * 0.2);
    // 节拍检测：低频能量尖峰（相对滚动均值）
    bassHistory.push(bass);
    if (bassHistory.length > 14) bassHistory.shift();
    const avg = bassHistory.reduce((a, b) => a + b, 0) / bassHistory.length;
    const beat = bass > 0.22 && bass > avg * 1.28;
    // 信号活性：能量持续极低 → 判定为静音（跨域/无信号），UI 走模拟律动
    if (energy > 0.03) beatLive = true;
    else if (bassHistory.length >= 14 && bassHistory.every((v) => v < 0.015)) beatLive = false;
    lastBeat = { energy, bass, mid, treble, beat, live: beatLive };
    emit("beat", lastBeat);
  }

  function startBeatLoop() {
    if (beatLoopId) return;
    function tick() {
      if (audio.paused) { beatLoopId = null; return; }
      computeBeat();
      beatLoopId = requestAnimationFrame(tick);
    }
    beatLoopId = requestAnimationFrame(tick);
  }
  function stopBeatLoop() {
    if (beatLoopId) { cancelAnimationFrame(beatLoopId); beatLoopId = null; }
  }
  function isBeatLive() { return beatLive; }
  function getBeat() { return lastBeat; }

  function toggleShuffle() { shuffle = !shuffle; if (shuffle) buildShuffle(); emit("mode", getMode()); return shuffle; }
  function cycleRepeat() {
    repeat = repeat === "off" ? "all" : repeat === "all" ? "one" : "off";
    emit("mode", getMode()); return repeat;
  }
  function setShuffle(v) { shuffle = !!v; if (shuffle) buildShuffle(); emit("mode", getMode()); return shuffle; }
  function setRepeat(v) { repeat = v; emit("mode", getMode()); return repeat; }
  function getMode() { return { shuffle, repeat }; }

  function setQueue(ids, startId) { queue = ids.slice(); index = startId ? queue.indexOf(startId) : 0; }

  // 事件绑定（抽成函数：重建 audio 元素时复用）
  function bindAudioEvents(a) {
    a.addEventListener("play", () => {
      emit("state", { playing: true });
      if ("mediaSession" in navigator) {
        try { navigator.mediaSession.playbackState = "playing"; } catch (e) {}
      }
      setupBeatTap();
      startBeatLoop();
    });
    a.addEventListener("pause", () => {
      emit("state", { playing: false });
      if ("mediaSession" in navigator) {
        try { navigator.mediaSession.playbackState = "paused"; } catch (e) {}
      }
      stopBeatLoop();
    });
    a.addEventListener("timeupdate", () => {
      emit("time", { current: a.currentTime, duration: a.duration || 0 });
      syncPositionState();
    });
    a.addEventListener("loadedmetadata", () => {
      emit("time", { current: a.currentTime, duration: a.duration || 0 });
      syncPositionState();
    });
    a.addEventListener("ended", () => next(true));
    a.addEventListener("error", () => { emit("error", { message: "音频加载失败（可能是网络/CORS 限制）" }); });
  }
  bindAudioEvents(audio);

  // 重建 audio 元素：脱离已建立的 boost（createMediaElementSource）增益链路，
  // 否则跨域音源会被 AudioContext 静音且无法恢复。
  function rebuildAudio() {
    const old = audio;
    const vol = old.volume;
    old.pause();
    old.removeAttribute("src");
    try { old.load(); } catch (e) {}
    audio = new Audio();
    audio.preload = "metadata";
    audio.volume = vol;
    bindAudioEvents(audio);
    // 关闭 boost 链路（旧元素的 MediaElementSource 随旧 context 一起释放）
    if (boostCtx) { try { boostCtx.close(); } catch (e) {} }
    boostCtx = null; boostGain = null; boostLevel = 1.0;
    // 节拍旁路监听绑定的是旧元素的 captureStream，标记重建（下次 play 时重新 tap）
    if (beatCtx) { try { beatCtx.close(); } catch (e) {} }
    beatCtx = null; beatAnalyser = null; beatFreq = null;
    beatReady = false; beatLive = false; bassHistory = [];
  }

  function syncPositionState() {
    if (!("mediaSession" in navigator) || !navigator.mediaSession.setPositionState) return;
    if (!isFinite(audio.duration) || audio.duration <= 0) return;
    try {
      navigator.mediaSession.setPositionState({
        duration: audio.duration,
        playbackRate: audio.playbackRate || 1,
        position: audio.currentTime,
      });
    } catch (e) { /* 忽略 */ }
  }

  function getState() {
    const song = currentSong();
    return {
      song, queue, index,
      playing: !audio.paused,
      current: audio.currentTime,
      duration: audio.duration || (song ? song.dur : 0),
      mode: getMode(),
      volume: audio.volume,
    };
  }

  // 初始化系统级媒体控制（锁屏/通知栏/灵动岛/耳机线控）
  setupMediaSession();

  global.App.Player = {
    on, playSong, play, pause, toggle, next, prev, seek, setVolume, getVolume,
    toggleShuffle, cycleRepeat, setShuffle, setRepeat, getMode, getState, currentSong,
    setQueue, boostVolume, resetBoost, getBoostLevel,
    isBeatLive, getBeat,
  };
})(window);
