/* ============================================================
 * data.js — 本地曲库数据集 + 外部歌曲注册表
 * 音源模式：local（music/ 目录）| remote（SoundHelix 示例）
 * ============================================================ */
(function (global) {
  "use strict";

  const C = global.App.Core;

  // ====== 音源配置（部署时修改） ======
  const AUDIO_MODE = "local"; // "remote" | "local"

  const _SH_MAP = { s01:1,s02:2,s03:3,s04:4,s05:5,s06:6,s07:7,s08:8,s09:9,s10:10,s11:11,s12:12,s13:13,s14:14,s15:15,s16:16,s17:2,s18:4,s19:6,s20:8,s21:10,s22:12,s23:1,s24:3,s25:5,s26:7,s27:9,s28:11,s29:13,s30:14,s31:15,s32:16,s33:2,s34:4,s35:6,s36:8 };
  function _audioNum(songId) { return _SH_MAP[songId] || parseInt(String(songId).slice(1)) || 1; }
  function _audioFile(songId) { return "s" + String(_audioNum(songId)).padStart(2, "0"); }
  function audioUrl(songId) {
    if (AUDIO_MODE === "remote") {
      return "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-" + _audioNum(songId) + ".mp3";
    }
    return "music/" + _audioFile(songId) + ".mp3";
  }

  const GENRES = ["Pop", "Rock", "Electronic", "Jazz", "Classical", "Hip-Hop", "Lo-Fi", "Ambient", "R&B", "Folk"];
  const MOODS = ["Happy", "Relax", "Energetic", "Sad", "Focus", "Party"];
  const MOOD_LABEL = { Happy: "欢快", Relax: "放松", Energetic: "能量", Sad: "治愈", Focus: "专注", Party: "派对" };
  const GENRE_EMOJI = {
    Pop: "🌟", Rock: "🎸", Electronic: "⚡", Jazz: "🎷", Classical: "🎻",
    "Hip-Hop": "🎤", "Lo-Fi": "☕", Ambient: "🌌", "R&B": "💜", Folk: "🌿",
  };

  function grad(a, b) { return { from: a, to: b }; }

  const SONGS = [
    { id: "s01", title: "霓虹脉搏",   artist: "Aurora Sky",    album: "Midnight City",   year: 2023, genre: "Electronic", mood: "Energetic", dur: 372, plays: 18420, c: grad("#ff6ec7", "#7873f5"), vip: true },
    { id: "s02", title: "雨后咖啡",   artist: "Lo-Fi Cat",     album: "Slow Mornings",   year: 2022, genre: "Lo-Fi",      mood: "Relax",    dur: 205, plays: 9920,  c: grad("#43cea2", "#185a9d") },
    { id: "s03", title: "山谷回声",   artist: "The Wanderers", album: "Open Road",       year: 2021, genre: "Folk",       mood: "Focus",    dur: 288, plays: 4310,  c: grad("#f7971e", "#ffd200") },
    { id: "s04", title: "午夜告白",   artist: "Velvet Moon",   album: "Heart Strings",   year: 2023, genre: "R&B",        mood: "Sad",      dur: 241, plays: 12450, c: grad("#6155a7", "#f3a183"), vip: true },
    { id: "s05", title: "电流之心",   artist: "Pulse Theory",  album: "Voltage",         year: 2024, genre: "Electronic", mood: "Party",    dur: 330, plays: 22110, c: grad("#00c6ff", "#0072ff") },
    { id: "s06", title: "蓝色钢琴",   artist: "Clara Note",    album: "Nocturnes",       year: 2020, genre: "Classical",  mood: "Relax",    dur: 312, plays: 7600,  c: grad("#4b6cb7", "#182848"), vip: true },
    { id: "s07", title: "街头节奏",   artist: "MC Breeze",     album: "Concrete Dreams", year: 2022, genre: "Hip-Hop",    mood: "Energetic",dur: 198, plays: 15330, c: grad("#ee0979", "#ff6a00") },
    { id: "s08", title: "夏日气泡",   artist: "Sunny Bloom",   album: "Glow",            year: 2023, genre: "Pop",        mood: "Happy",    dur: 226, plays: 28740, c: grad("#fddb92", "#d1fdff") },
    { id: "s09", title: "雷霆吉他",   artist: "Iron Vein",     album: "Aftershock",      year: 2021, genre: "Rock",       mood: "Energetic",dur: 264, plays: 11200, c: grad("#cb2d3e", "#ef473a") },
    { id: "s10", title: "深空漫游",   artist: "Orbit Field",   album: "Outer",           year: 2024, genre: "Ambient",    mood: "Focus",    dur: 401, plays: 5400,  c: grad("#0f2027", "#2c5364") },
    { id: "s11", title: "萨克斯夜色", artist: "Blue Note Trio",album: "After Dark",      year: 2019, genre: "Jazz",       mood: "Relax",    dur: 277, plays: 8820,  c: grad("#c31432", "#240b36"), vip: true },
    { id: "s12", title: "心跳节拍",   artist: "Aurora Sky",    album: "Midnight City",   year: 2023, genre: "Pop",        mood: "Party",    dur: 218, plays: 19900, c: grad("#ff5f6d", "#ffc371") },
    { id: "s13", title: "晨雾",       artist: "Lo-Fi Cat",     album: "Slow Mornings",   year: 2022, genre: "Lo-Fi",      mood: "Focus",    dur: 192, plays: 6710,  c: grad("#a8c0ff", "#3f2b96") },
    { id: "s14", title: "破碎星光",   artist: "Velvet Moon",   album: "Heart Strings",   year: 2023, genre: "R&B",        mood: "Sad",      dur: 253, plays: 10180, c: grad("#7b4397", "#dc2430") },
    { id: "s15", title: "极速飞驰",   artist: "Pulse Theory",  album: "Voltage",         year: 2024, genre: "Electronic", mood: "Energetic",dur: 295, plays: 17650, c: grad("#fc466b", "#3f5efb") },
    { id: "s16", title: "湖畔小调",   artist: "The Wanderers", album: "Open Road",       year: 2021, genre: "Folk",       mood: "Relax",    dur: 233, plays: 3890,  c: grad("#11998e", "#38ef7d") },
    { id: "s17", title: "星轨",       artist: "Orbit Field",   album: "Outer",           year: 2024, genre: "Ambient",    mood: "Relax",    dur: 360, plays: 4120,  c: grad("#16222a", "#3a6073"), vip: true },
    { id: "s18", title: "糖果浪潮",   artist: "Sunny Bloom",   album: "Glow",            year: 2023, genre: "Pop",        mood: "Happy",    dur: 209, plays: 25400, c: grad("#ff9a9e", "#fecfef") },
    { id: "s19", title: "烈焰独奏",   artist: "Iron Vein",     album: "Aftershock",      year: 2021, genre: "Rock",       mood: "Party",    dur: 281, plays: 9870,  c: grad("#f12711", "#f5af19") },
    { id: "s20", title: "低语爵士",   artist: "Blue Note Trio",album: "After Dark",      year: 2019, genre: "Jazz",       mood: "Focus",    dur: 245, plays: 7230,  c: grad("#355c7d", "#6c5b7b") },
    { id: "s21", title: "霓虹雨",     artist: "MC Breeze",     album: "Concrete Dreams", year: 2022, genre: "Hip-Hop",    mood: "Relax",    dur: 211, plays: 13440, c: grad("#8e2de2", "#4a00e0") },
    { id: "s22", title: "清晨第一缕", artist: "Clara Note",    album: "Nocturnes",       year: 2020, genre: "Classical",  mood: "Happy",    dur: 268, plays: 5980,  c: grad("#1d976c", "#93f9b9") },
    { id: "s23", title: "脉冲风暴",   artist: "Pulse Theory",  album: "Voltage",         year: 2024, genre: "Electronic", mood: "Party",    dur: 318, plays: 20330, c: grad("#ec008c", "#fc6767"), vip: true },
    { id: "s24", title: "旧信封",     artist: "Velvet Moon",   album: "Heart Strings",   year: 2023, genre: "R&B",        mood: "Relax",    dur: 232, plays: 9050,  c: grad("#603813", "#b29f94") },
    { id: "s25", title: "山间清风",   artist: "The Wanderers", album: "Open Road",       year: 2021, genre: "Folk",       mood: "Happy",    dur: 257, plays: 4320,  c: grad("#56ab2f", "#a8e063") },
    { id: "s26", title: "深蓝寂静",   artist: "Orbit Field",   album: "Outer",           year: 2024, genre: "Ambient",    mood: "Focus",    dur: 388, plays: 3760,  c: grad("#283048", "#859398") },
    { id: "s27", title: "柠檬汽水",   artist: "Sunny Bloom",   album: "Glow",            year: 2023, genre: "Pop",        mood: "Energetic",dur: 201, plays: 21880, c: grad("#fceabb", "#f8b500") },
    { id: "s28", title: "午夜霓虹街", artist: "Aurora Sky",    album: "Midnight City",   year: 2023, genre: "Electronic", mood: "Party",    dur: 342, plays: 16740, c: grad("#cc2b5e", "#753a88") },
    { id: "s29", title: "雨落窗台",   artist: "Lo-Fi Cat",     album: "Slow Mornings",   year: 2022, genre: "Lo-Fi",      mood: "Sad",      dur: 223, plays: 8120,  c: grad("#536976", "#292e49") },
    { id: "s30", title: "电吉他挽歌", artist: "Iron Vein",     album: "Aftershock",      year: 2021, genre: "Rock",       mood: "Sad",      dur: 299, plays: 8450,  c: grad("#870000", "#190a05"), vip: true },
    { id: "s31", title: "黄金时代",   artist: "Blue Note Trio",album: "After Dark",      year: 2019, genre: "Jazz",       mood: "Party",    dur: 259, plays: 6940,  c: grad("#e1eec3", "#f05053") },
    { id: "s32", title: "云端漫步",   artist: "Orbit Field",   album: "Outer",           year: 2024, genre: "Ambient",    mood: "Relax",    dur: 372, plays: 4510,  c: grad("#5f2c82", "#49a09d") },
    { id: "s33", title: "节拍宣言",   artist: "MC Breeze",     album: "Concrete Dreams", year: 2022, genre: "Hip-Hop",    mood: "Energetic",dur: 187, plays: 14210, c: grad("#ff512f", "#dd2476") },
    { id: "s34", title: "月光奏鸣",   artist: "Clara Note",    album: "Nocturnes",       year: 2020, genre: "Classical",  mood: "Focus",    dur: 305, plays: 7120,  c: grad("#1a2a6c", "#b21f1f") },
    { id: "s35", title: "篝火夜话",   artist: "The Wanderers", album: "Open Road",       year: 2021, genre: "Folk",       mood: "Relax",    dur: 240, plays: 4010,  c: grad("#c79081", "#dfa579") },
    { id: "s36", title: "极光舞步",   artist: "Aurora Sky",    album: "Midnight City",   year: 2023, genre: "Pop",        mood: "Party",    dur: 215, plays: 19320, c: grad("#12c2e9", "#c471ed"), vip: true },
  ];

  SONGS.forEach((s) => {
    s.themeColor = s.c.from;
    s.accentColor = s.c.to;
    s.emoji = GENRE_EMOJI[s.genre] || "🎵";
    s.durStr = C.fmtDur(s.dur);
    s.audio = audioUrl(s.id);
  });

  const BY_ID = {};
  SONGS.forEach((s) => (BY_ID[s.id] = s));

  /* ==================== 外部歌曲注册表 ==================== */
  const EXTERNAL = {};
  const K_EXTERNAL = C.K.EXTERNAL;
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
    } catch (e) { /* 忽略配额错误 */ }
  }

  function registerExternal(song) {
    if (!song || !song.id) return null;
    const isNetease = song.source === "netease";
    const isQQ = song.source === "qq";
    const prefix = isNetease ? "ne_" : (isQQ ? "qq_" : "au_");
    const c = song.cover && typeof song.cover === "object" ? song.cover : (song.c || null);
    const audioFallback = isNetease ? ("api/netease.php?action=url&id=" + song.id) : undefined;
    const full = {
      id: prefix + song.id,
      title: song.title || "未知曲目",
      artist: song.artist || "未知歌手",
      album: song.album || (isNetease ? "网易云音乐" : (isQQ ? "QQ音乐" : "Audius 在线音源")),
      year: song.year || 2026,
      genre: song.genre || "华语",
      mood: song.mood || "Relax",
      dur: song.duration || 0,
      plays: 0,
      c: { from: (c && c.from) || "#7c5cff", to: (c && c.to) || "#ff5c9d" },
      emoji: song.emoji || "🎵",
      audio: song.streamUrl || song.audio || audioFallback,
      // 注意：外部歌没有真实取色结果时不预置 themeColor，否则 applySongAccent
      // 的缓存判断会短路，封面取色永远走不到 → 强调色全是默认紫 #7c5cff。
      // 只有音源真的返回了配色对象时才带 themeColor（真实取色由 core.js 封面取色写入）。
      ...((c && c.from) ? { themeColor: c.from, accentColor: c.to || "#ff5c9d" } : {}),
      durStr: C.fmtDur(song.duration || 0),
      vip: !!(song.vip || (isNetease && song.free === false)),
      external: true,
      coverUrl: song.coverUrl || (typeof song.cover === "string" ? song.cover : null),
    };
    BY_ID[full.id] = full;
    EXTERNAL[full.id] = full;
    if (!restoringExternal) persistExternal(song);
    return full;
  }

  /* 批量注册：导入歌单一次可能上千首，逐首写盘会卡死主线程。
     这里一次写完，最后一次落盘。 */
  function registerMany(songs) {
    restoringExternal = true;
    const out = [];
    (songs || []).forEach((song) => { const f = registerExternal(song); if (f) out.push(f); });
    restoringExternal = false;
    try {
      const map = readExternalMap();
      const keys = Object.keys(map);
      if (keys.length > EXTERNAL_CAP) {
        keys.slice(0, keys.length - EXTERNAL_CAP).forEach((k) => delete map[k]);
      }
      localStorage.setItem(K_EXTERNAL, JSON.stringify(map));
    } catch (e) { /* 忽略配额错误 */ }
    return out;
  }

  function restoreExternal() {
    restoringExternal = true;
    const map = readExternalMap();
    Object.keys(map).forEach((k) => {
      if (!BY_ID[k]) registerExternal(map[k]);
    });
    restoringExternal = false;
  }

  function setExternalMap(map) {
    if (!map || typeof map !== "object") return;
    restoringExternal = true;
    try {
      Object.keys(map).forEach((k) => {
        if (!BY_ID[k] && map[k]) {
          try { registerExternal(map[k]); } catch (e) { /* 忽略坏数据 */ }
        }
      });
    } finally { restoringExternal = false; }
    if (Object.keys(map).length > 0) {
      try {
        const existing = readExternalMap();
        const merged = Object.assign({}, existing, map);
        const keys = Object.keys(merged);
        if (keys.length > EXTERNAL_CAP) keys.slice(0, keys.length - EXTERNAL_CAP).forEach((k) => delete merged[k]);
        localStorage.setItem(K_EXTERNAL, JSON.stringify(merged));
      } catch (e) { /* 忽略 */ }
    }
  }

  restoreExternal();

  /* ==================== 聚合查询 ==================== */
  function getArtist(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    const songs = SONGS.filter((s) => (s.artist || "").toLowerCase() === n);
    Object.keys(EXTERNAL).forEach((id) => {
      const s = EXTERNAL[id];
      if (s && s.artist && s.artist.toLowerCase() === n) songs.push(s);
    });
    if (!songs.length) return null;
    return { name: songs[0].artist, songs, count: songs.length };
  }

  function getAlbum(name) {
    if (!name) return null;
    const n = String(name).toLowerCase();
    const songs = SONGS.filter((s) => (s.album || "").toLowerCase() === n);
    Object.keys(EXTERNAL).forEach((id) => {
      const s = EXTERNAL[id];
      if (s && s.album && s.album.toLowerCase() === n) songs.push(s);
    });
    if (!songs.length) return null;
    return { name: songs[0].album, artist: songs[0].artist, songs, count: songs.length };
  }

  global.App.DATA = {
    GENRES, MOODS, MOOD_LABEL, GENRE_EMOJI, SONGS, BY_ID, EXTERNAL,
    AUDIO_MODE,
    get: (id) => BY_ID[id],
    registerExternal, registerMany,
    getArtist, getAlbum,
    getExternalMap: readExternalMap,
    setExternalMap,
  };
})(window);
