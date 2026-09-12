/* ============================================================
 * recommend.js — 自动化推荐引擎
 * 策略：
 *  1) 内容推荐：从收听历史构建「流派/情绪/艺人」偏好画像，
 *     对候选曲目打分（加权相似度）。
 *  2) 热门趋势：基于全局播放计数，冷启动或补齐推荐。
 *  3) 相似歌曲：基于单首曲目的流派/情绪/艺人相似度。
 * ============================================================ */
(function (global) {
  "use strict";
  const D = global.App.DATA;
  const S = global.App.Store;

  const W = { genre: 1.0, mood: 0.8, artist: 1.2 }; // 权重

  function buildProfile() {
    const profile = { genres: {}, moods: {}, artists: {}, total: 0 };
    const data = S.isLoggedIn() ? S.getUserData() : null;
    const history = data ? data.history : [];
    const now = Date.now();
    history.forEach((h) => {
      const song = D.get(h.id);
      if (!song) return;
      // 时间衰减：30 天半衰期，越早的收听权重越低
      const days = Math.max(0, (now - (h.last || now)) / 86400000);
      const w = (h.weight || 1) * Math.exp(-days / 30);
      profile.genres[song.genre] = (profile.genres[song.genre] || 0) + w;
      profile.moods[song.mood] = (profile.moods[song.mood] || 0) + w;
      profile.artists[song.artist] = (profile.artists[song.artist] || 0) + w;
      profile.total += w;
    });
    return profile;
  }

  // 每日种子：同一天结果稳定，跨天自然变化
  function dailySeed() {
    const u = S.isLoggedIn() ? S.currentUser() : "guest";
    const d = new Date();
    const key = (u || "guest") + "|" + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return h;
  }

  function scoreSong(song, profile) {
    if (!profile || profile.total === 0) return 0;
    let s = 0;
    s += (profile.genres[song.genre] || 0) * W.genre;
    s += (profile.moods[song.mood] || 0) * W.mood;
    s += (profile.artists[song.artist] || 0) * W.artist;
    return s / profile.total;
  }

  // 个性化推荐（排除已听/指定集合）
  function personalized(limit, exclude) {
    exclude = new Set(exclude || []);
    const profile = buildProfile();
    const seed = dailySeed();
    const ranked = D.SONGS
      .filter((s) => !exclude.has(s.id))
      .map((s, idx) => {
        // 每日种子微调（同一天稳定，跨天变化）
        const jitter = ((seed ^ (idx * 2654435761)) % 1000) / 100000;
        return { song: s, score: scoreSong(s, profile) + jitter };
      })
      .sort((a, b) => b.score - a.score);

    // 冷启动：无历史则回退到热门
    if (profile.total === 0) return trending(limit);
    return ranked.slice(0, limit).map((r) => r.song);
  }

  function trending(limit) {
    const plays = S.getPlays();
    return D.SONGS
      .slice()
      .sort((a, b) => (plays[b.id] || 0) - (plays[a.id] || 0))
      .slice(0, limit);
  }

  // 最近在听（按历史时间戳）
  function recent(limit) {
    const data = S.isLoggedIn() ? S.getUserData() : null;
    if (!data) return [];
    return data.history
      .slice()
      .sort((a, b) => (b.last || 0) - (a.last || 0))
      .slice(0, limit)
      .map((h) => D.get(h.id))
      .filter(Boolean);
  }

  // 相似歌曲（同流派/情绪优先，排除自身）
  function similarTo(songId, limit) {
    const base = D.get(songId);
    if (!base) return [];
    const scored = D.SONGS.filter((s) => s.id !== songId).map((s) => {
      let sc = 0;
      if (s.genre === base.genre) sc += 2;
      if (s.mood === base.mood) sc += 1.5;
      if (s.artist === base.artist) sc += 3;
      return { song: s, score: sc };
    });
    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const pa = S.getPlays()[a.song.id] || 0;
      const pb = S.getPlays()[b.song.id] || 0;
      return pb - pa;
    });
    return scored.slice(0, limit).map((r) => r.song);
  }

  // 基于收藏的「猜你喜欢」
  function fromFavorites(limit) {
    const favIds = S.getFavorites();
    const exclude = new Set(favIds);
    if (favIds.length === 0) return trending(limit);
    const profile = { genres: {}, moods: {}, artists: {}, total: 0 };
    favIds.forEach((id) => {
      const s = D.get(id); if (!s) return;
      profile.genres[s.genre] = (profile.genres[s.genre] || 0) + 1;
      profile.moods[s.mood] = (profile.moods[s.mood] || 0) + 1;
      profile.artists[s.artist] = (profile.artists[s.artist] || 0) + 1;
      profile.total += 1;
    });
    return D.SONGS.filter((s) => !exclude.has(s.id))
      .map((s) => ({ song: s, score: scoreSong(s, profile) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((r) => r.song);
  }

  // 基于用户自选兴趣流派的推荐（用户资料页「我的兴趣」）
  function fromInterests(limit) {
    const interests = S.getInterests ? S.getInterests() : [];
    if (interests.length === 0) return trending(limit);
    const profile = { genres: {}, moods: {}, artists: {}, total: 0 };
    interests.forEach((g) => { profile.genres[g] = (profile.genres[g] || 0) + 1; profile.total += 1; });
    return D.SONGS
      .filter((s) => profile.genres[s.genre])
      .map((s) => ({ song: s, score: scoreSong(s, profile) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((x) => x.song);
  }

  // 首页分区
  function homeSections() {
    const sections = {};
    sections.trending = trending(12);
    if (S.isLoggedIn()) {
      sections.recent = recent(12);
      sections.personalized = personalized(12);
      sections.fromFavorites = fromFavorites(12);
    } else {
      sections.personalized = trending(12);
    }
    sections.newReleases = D.SONGS.slice().sort((a, b) => b.year - a.year).slice(0, 12);
    return sections;
  }

  global.App.Recommend = {
    buildProfile, personalized, trending, recent, similarTo, fromFavorites, fromInterests, homeSections,
  };
})(window);
