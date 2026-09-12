/* ============================================================
 * data.js — 音库数据集与元数据字典
 * 
 * 音源模式（修改 AUDIO_MODE 切换）：
 *   "remote"  — 使用 SoundHelix 免版权示例音轨（默认，无需部署音源）
 *   "local"   — 使用 music/ 目录下的本地 MP3（需自行上传音频文件）
 *   "php"     — 通过 audio.php 流式代理（支持进度拖动，推荐）
 * 
 * 封面使用 CSS 渐变（保证离线可用，无需外部图片）。
 * ============================================================ */
(function (global) {
  "use strict";

  // ====== 音源配置（部署时修改这里） ======
  const AUDIO_MODE = "local";  // "remote" | "local" | "php"

  // SoundHelix 音轨映射（36 首歌复用 16 条音轨）
  const _SH_MAP = { s01:1,s02:2,s03:3,s04:4,s05:5,s06:6,s07:7,s08:8,s09:9,s10:10,s11:11,s12:12,s13:13,s14:14,s15:15,s16:16,s17:2,s18:4,s19:6,s20:8,s21:10,s22:12,s23:1,s24:3,s25:5,s26:7,s27:9,s28:11,s29:13,s30:14,s31:15,s32:16,s33:2,s34:4,s35:6,s36:8 };

  // 取音轨编号（带兜底）
  function _audioNum(songId) {
    return _SH_MAP[songId] || parseInt(String(songId).slice(1)) || 1;
  }
  function _audioFile(songId) {
    return "s" + String(_audioNum(songId)).padStart(2, "0");
  }

  function audioUrl(songId) {
    switch (AUDIO_MODE) {
      case "local":  return "music/" + _audioFile(songId) + ".mp3";
      case "php":    return "audio.php?file=" + _audioFile(songId);
      case "remote":
      default:       return `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${_audioNum(songId)}.mp3`;
    }
  }

  // 流派与情绪字典（用于筛选、排序与推荐）
  const GENRES = [
    "Pop", "Rock", "Electronic", "Jazz", "Classical",
    "Hip-Hop", "Lo-Fi", "Ambient", "R&B", "Folk"
  ];
  const MOODS = ["Happy", "Relax", "Energetic", "Sad", "Focus", "Party"];

  // 生成封面渐变（成对色值）
  function grad(a, b) { return { from: a, to: b }; }

  // 流派 → 默认 emoji（封面展示用）
  const GENRE_EMOJI = {
    Pop: "🌟", Rock: "🎸", Electronic: "⚡", Jazz: "🎷", Classical: "🎻",
    "Hip-Hop": "🎤", "Lo-Fi": "☕", Ambient: "🌌", "R&B": "💜", Folk: "🌿"
  };

  // 音源路由（运行时根据 AUDIO_MODE 替换）
  const SH = (n) => `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-${n}.mp3`;

  // 36 首曲目。audio 循环复用 1-16 号免版权示例音轨。
  const SONGS = [
    { id: "s01", title: "霓虹脉搏",   artist: "Aurora Sky",    album: "Midnight City",   year: 2023, genre: "Electronic", mood: "Energetic", dur: 372, plays: 18420, c: grad("#ff6ec7", "#7873f5"), audio: SH(1), vip: true },
    { id: "s02", title: "雨后咖啡",   artist: "Lo-Fi Cat",     album: "Slow Mornings",   year: 2022, genre: "Lo-Fi",      mood: "Relax",    dur: 205, plays: 9920,  c: grad("#43cea2", "#185a9d"), audio: SH(2) },
    { id: "s03", title: "山谷回声",   artist: "The Wanderers", album: "Open Road",       year: 2021, genre: "Folk",       mood: "Focus",    dur: 288, plays: 4310,  c: grad("#f7971e", "#ffd200"), audio: SH(3) },
    { id: "s04", title: "午夜告白",   artist: "Velvet Moon",   album: "Heart Strings",   year: 2023, genre: "R&B",        mood: "Sad",      dur: 241, plays: 12450, c: grad("#6155a7", "#f3a183"), audio: SH(4), vip: true },
    { id: "s05", title: "电流之心",   artist: "Pulse Theory",  album: "Voltage",         year: 2024, genre: "Electronic", mood: "Party",    dur: 330, plays: 22110, c: grad("#00c6ff", "#0072ff"), audio: SH(5) },
    { id: "s06", title: "蓝色钢琴",   artist: "Clara Note",    album: "Nocturnes",       year: 2020, genre: "Classical",  mood: "Relax",    dur: 312, plays: 7600,  c: grad("#4b6cb7", "#182848"), audio: SH(6), vip: true },
    { id: "s07", title: "街头节奏",   artist: "MC Breeze",     album: "Concrete Dreams", year: 2022, genre: "Hip-Hop",    mood: "Energetic",dur: 198, plays: 15330, c: grad("#ee0979", "#ff6a00"), audio: SH(7) },
    { id: "s08", title: "夏日气泡",   artist: "Sunny Bloom",   album: "Glow",            year: 2023, genre: "Pop",        mood: "Happy",    dur: 226, plays: 28740, c: grad("#fddb92", "#d1fdff"), audio: SH(8) },
    { id: "s09", title: "雷霆吉他",   artist: "Iron Vein",     album: "Aftershock",      year: 2021, genre: "Rock",       mood: "Energetic",dur: 264, plays: 11200, c: grad("#cb2d3e", "#ef473a"), audio: SH(9) },
    { id: "s10", title: "深空漫游",   artist: "Orbit Field",   album: "Outer",           year: 2024, genre: "Ambient",    mood: "Focus",    dur: 401, plays: 5400,  c: grad("#0f2027", "#2c5364"), audio: SH(10) },
    { id: "s11", title: "萨克斯夜色", artist: "Blue Note Trio",album: "After Dark",      year: 2019, genre: "Jazz",       mood: "Relax",    dur: 277, plays: 8820,  c: grad("#c31432", "#240b36"), audio: SH(11), vip: true },
    { id: "s12", title: "心跳节拍",   artist: "Aurora Sky",    album: "Midnight City",   year: 2023, genre: "Pop",        mood: "Party",    dur: 218, plays: 19900, c: grad("#ff5f6d", "#ffc371"), audio: SH(12) },
    { id: "s13", title: "晨雾",       artist: "Lo-Fi Cat",     album: "Slow Mornings",   year: 2022, genre: "Lo-Fi",      mood: "Focus",    dur: 192, plays: 6710,  c: grad("#a8c0ff", "#3f2b96"), audio: SH(13) },
    { id: "s14", title: "破碎星光",   artist: "Velvet Moon",   album: "Heart Strings",   year: 2023, genre: "R&B",        mood: "Sad",      dur: 253, plays: 10180, c: grad("#7b4397", "#dc2430"), audio: SH(14) },
    { id: "s15", title: "极速飞驰",   artist: "Pulse Theory",  album: "Voltage",         year: 2024, genre: "Electronic", mood: "Energetic",dur: 295, plays: 17650, c: grad("#fc466b", "#3f5efb"), audio: SH(15) },
    { id: "s16", title: "湖畔小调",   artist: "The Wanderers", album: "Open Road",       year: 2021, genre: "Folk",       mood: "Relax",    dur: 233, plays: 3890,  c: grad("#11998e", "#38ef7d"), audio: SH(16) },
    { id: "s17", title: "星轨",       artist: "Orbit Field",   album: "Outer",           year: 2024, genre: "Ambient",    mood: "Relax",    dur: 360, plays: 4120,  c: grad("#16222a", "#3a6073"), audio: SH(2), vip: true },
    { id: "s18", title: "糖果浪潮",   artist: "Sunny Bloom",   album: "Glow",            year: 2023, genre: "Pop",        mood: "Happy",    dur: 209, plays: 25400, c: grad("#ff9a9e", "#fecfef"), audio: SH(4) },
    { id: "s19", title: "烈焰独奏",   artist: "Iron Vein",     album: "Aftershock",      year: 2021, genre: "Rock",       mood: "Party",    dur: 281, plays: 9870,  c: grad("#f12711", "#f5af19"), audio: SH(6) },
    { id: "s20", title: "低语爵士",   artist: "Blue Note Trio",album: "After Dark",      year: 2019, genre: "Jazz",       mood: "Focus",    dur: 245, plays: 7230,  c: grad("#355c7d", "#6c5b7b"), audio: SH(8) },
    { id: "s21", title: "霓虹雨",     artist: "MC Breeze",     album: "Concrete Dreams", year: 2022, genre: "Hip-Hop",    mood: "Relax",    dur: 211, plays: 13440, c: grad("#8e2de2", "#4a00e0"), audio: SH(10) },
    { id: "s22", title: "清晨第一缕", artist: "Clara Note",    album: "Nocturnes",       year: 2020, genre: "Classical",  mood: "Happy",    dur: 268, plays: 5980,  c: grad("#1d976c", "#93f9b9"), audio: SH(12) },
    { id: "s23", title: "脉冲风暴",   artist: "Pulse Theory",  album: "Voltage",         year: 2024, genre: "Electronic", mood: "Party",    dur: 318, plays: 20330, c: grad("#ec008c", "#fc6767"), audio: SH(1), vip: true },
    { id: "s24", title: "旧信封",     artist: "Velvet Moon",   album: "Heart Strings",   year: 2023, genre: "R&B",        mood: "Relax",    dur: 232, plays: 9050,  c: grad("#603813", "#b29f94"), audio: SH(3) },
    { id: "s25", title: "山间清风",   artist: "The Wanderers", album: "Open Road",       year: 2021, genre: "Folk",       mood: "Happy",    dur: 257, plays: 4320,  c: grad("#56ab2f", "#a8e063"), audio: SH(5) },
    { id: "s26", title: "深蓝寂静",   artist: "Orbit Field",   album: "Outer",           year: 2024, genre: "Ambient",    mood: "Focus",    dur: 388, plays: 3760,  c: grad("#283048", "#859398"), audio: SH(7) },
    { id: "s27", title: "柠檬汽水",   artist: "Sunny Bloom",   album: "Glow",            year: 2023, genre: "Pop",        mood: "Energetic",dur: 201, plays: 21880, c: grad("#fceabb", "#f8b500"), audio: SH(9) },
    { id: "s28", title: "午夜霓虹街", artist: "Aurora Sky",    album: "Midnight City",   year: 2023, genre: "Electronic", mood: "Party",    dur: 342, plays: 16740, c: grad("#cc2b5e", "#753a88"), audio: SH(11) },
    { id: "s29", title: "雨落窗台",   artist: "Lo-Fi Cat",     album: "Slow Mornings",   year: 2022, genre: "Lo-Fi",      mood: "Sad",      dur: 223, plays: 8120,  c: grad("#536976", "#292e49"), audio: SH(13) },
    { id: "s30", title: "电吉他挽歌", artist: "Iron Vein",     album: "Aftershock",      year: 2021, genre: "Rock",       mood: "Sad",      dur: 299, plays: 8450,  c: grad("#870000", "#190a05"), audio: SH(14), vip: true },
    { id: "s31", title: "黄金时代",   artist: "Blue Note Trio",album: "After Dark",      year: 2019, genre: "Jazz",       mood: "Party",    dur: 259, plays: 6940,  c: grad("#e1eec3", "#f05053"), audio: SH(15) },
    { id: "s32", title: "云端漫步",   artist: "Orbit Field",   album: "Outer",           year: 2024, genre: "Ambient",    mood: "Relax",    dur: 372, plays: 4510,  c: grad("#5f2c82", "#49a09d"), audio: SH(16) },
    { id: "s33", title: "节拍宣言",   artist: "MC Breeze",     album: "Concrete Dreams", year: 2022, genre: "Hip-Hop",    mood: "Energetic",dur: 187, plays: 14210, c: grad("#ff512f", "#dd2476"), audio: SH(2) },
    { id: "s34", title: "月光奏鸣",   artist: "Clara Note",    album: "Nocturnes",       year: 2020, genre: "Classical",  mood: "Focus",    dur: 305, plays: 7120,  c: grad("#1a2a6c", "#b21f1f"), audio: SH(4) },
    { id: "s35", title: "篝火夜话",   artist: "The Wanderers", album: "Open Road",       year: 2021, genre: "Folk",       mood: "Relax",    dur: 240, plays: 4010,  c: grad("#c79081", "#dfa579"), audio: SH(6) },
    { id: "s36", title: "极光舞步",   artist: "Aurora Sky",    album: "Midnight City",   year: 2023, genre: "Pop",        mood: "Party",    dur: 215, plays: 19320, c: grad("#12c2e9", "#c471ed"), audio: SH(8), vip: true }
  ];

  // 注入封面取色（从渐变中提取）
  SONGS.forEach((s) => {
    s.themeColor = s.c.from;
    s.accentColor = s.c.to;
    s.emoji = GENRE_EMOJI[s.genre] || "🎵";
    s.durStr = Math.floor(s.dur / 60) + ":" + String(s.dur % 60).padStart(2, "0");
  });

  // 替换音源路径（部署时切换到 local 或 php 模式）
  if (AUDIO_MODE !== "remote") {
    SONGS.forEach((s) => { s.audio = audioUrl(s.id); });
  }

  // 便捷索引
  const BY_ID = {};
  SONGS.forEach((s) => (BY_ID[s.id] = s));

  // 外部歌曲注册表（Audius 等在线音源）
  const EXTERNAL = {};

  // ---- 外部歌曲持久化（localStorage）：刷新后收藏/歌单/历史里的在线歌曲不丢失 ----
  const K_EXTERNAL = "mp_v1_external_songs";
  const EXTERNAL_CAP = 500;
  let restoringExternal = false;
  function readExternalMap() {
    try {
      const v = localStorage.getItem(K_EXTERNAL);
      return v ? JSON.parse(v) : {};
    } catch (e) { return {}; }
  }
  function persistExternal(rawSong) {
    try {
      const map = readExternalMap();
      const prefix = rawSong.source === "netease" ? "ne_" : (rawSong.source === "qq" ? "qq_" : "au_");
      map[prefix + rawSong.id] = rawSong;
      const keys = Object.keys(map);
      if (keys.length > EXTERNAL_CAP) {
        keys.slice(0, keys.length - EXTERNAL_CAP).forEach((k) => delete map[k]);
      }
      localStorage.setItem(K_EXTERNAL, JSON.stringify(map));
    } catch (e) { /* 忽略配额/隐私模式错误 */ }
  }
  function restoreExternal() {
    restoringExternal = true;
    const map = readExternalMap();
    Object.keys(map).forEach((k) => {
      if (!BY_ID[k]) registerExternal(map[k]);
    });
    restoringExternal = false;
  }

  // 注册外部歌曲，返回完整歌曲对象（供播放器使用）
  function registerExternal(song) {
    if (!song || !song.id) return null;
    const isNetease = song.source === "netease";
    const isQQ = song.source === "qq";
    const prefix = isNetease ? "ne_" : (isQQ ? "qq_" : "au_");
    const c = song.cover || song.c || { from: "#7c5cff", to: "#ff5c9d" };
    // 网易云歌曲若无播放地址，自动补上代理地址（兼容旧数据）
    const audioFallback = isNetease ? ("api/netease.php?action=url&id=" + song.id) : undefined;
    const full = {
      id: prefix + song.id,
      title: song.title || "未知曲目",
      artist: song.artist || "未知歌手",
      album: song.album || (isNetease ? "网易云音乐" : (isQQ ? "QQ音乐" : "Audius 在线音源")),
      year: song.year || 2026,
      genre: song.genre || (isNetease ? "华语" : (isQQ ? "华语" : "Electronic")),
      mood: song.mood || "Relax",
      dur: song.duration || 0,
      plays: 0,
      c: { from: c.from || "#7c5cff", to: c.to || "#ff5c9d" },
      emoji: song.emoji || GENRE_EMOJI[song.genre] || "🎵",
      audio: song.streamUrl || song.audio || audioFallback,
      themeColor: c.from || "#7c5cff",
      accentColor: c.to || "#ff5c9d",
      durStr: fmtDur(song.duration || 0),
      vip: !!(song.vip || (isNetease && song.free === false)),
      external: true,
      coverUrl: song.cover || null,
    };
    BY_ID[full.id] = full;
    EXTERNAL[full.id] = full;
    if (!restoringExternal) persistExternal(song);
    return full;
  }

  function fmtDur(sec) {
    sec = Math.floor(sec || 0);
    return Math.floor(sec / 60) + ":" + String(sec % 60).padStart(2, "0");
  }

  // 恢复持久化的外部歌曲（收藏/歌单/历史引用的在线歌曲）
  restoreExternal();

  // 从同步数据写入外部歌曲元数据（跨设备同步用）：注册到 BY_ID + 合并写入 localStorage
  function setExternalMap(map) {
    if (!map || typeof map !== 'object') return;
    // 1) 先把 map 里的歌曲注册到 BY_ID（保证当前页面可用）
    restoringExternal = true;
    try {
      Object.keys(map).forEach(function (k) {
        if (!BY_ID[k] && map[k]) {
          try { registerExternal(map[k]); } catch (e) { /* 忽略坏数据 */ }
        }
      });
    } finally {
      restoringExternal = false;
    }
    // 2) 合并写入 localStorage（不覆盖现有数据，避免 server 返回空对象时清空本地缓存）
    if (Object.keys(map).length > 0) {
      try {
        const existing = readExternalMap();
        const merged = Object.assign({}, existing, map);
        if (Object.keys(merged).length > EXTERNAL_CAP) {
          const keys = Object.keys(merged);
          keys.slice(0, keys.length - EXTERNAL_CAP).forEach(function (k) { delete merged[k]; });
        }
        localStorage.setItem(K_EXTERNAL, JSON.stringify(merged));
      } catch (e) { /* 忽略 */ }
    }
  }

  // 按歌手名聚合（本地 + 外部，大小写不敏感）
  function getArtist(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    const songs = SONGS.filter((s) => (s.artist || "").toLowerCase() === n);
    Object.keys(EXTERNAL).forEach((id) => {
      const s = EXTERNAL[id];
      if (s && s.artist && s.artist.toLowerCase() === n) songs.push(s);
    });
    if (songs.length === 0) return null;
    const genres = {}; let totalPlays = 0;
    songs.forEach((s) => { genres[s.genre] = (genres[s.genre] || 0) + 1; totalPlays += s.plays || 0; });
    return { name: songs[0].artist, songs, count: songs.length, totalPlays, genres };
  }

  // 按专辑名聚合（本地 + 外部，大小写不敏感）
  function getAlbum(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    const songs = SONGS.filter((s) => (s.album || "").toLowerCase() === n);
    Object.keys(EXTERNAL).forEach((id) => {
      const s = EXTERNAL[id];
      if (s && s.album && s.album.toLowerCase() === n) songs.push(s);
    });
    if (songs.length === 0) return null;
    const genres = {}; let totalPlays = 0;
    songs.forEach((s) => { genres[s.genre] = (genres[s.genre] || 0) + 1; totalPlays += s.plays || 0; });
    return { name: songs[0].album, artist: songs[0].artist, songs, count: songs.length, totalPlays, genres };
  }

  global.App = global.App || {};
  global.App.DATA = {
    GENRES,
    MOODS,
    SONGS,
    BY_ID,
    EXTERNAL,
    AUDIO_MODE,
    get: (id) => BY_ID[id],
    registerExternal,
    getArtist,
    getAlbum,
    getExternalMap: readExternalMap,
    setExternalMap,
  };
})(window);
