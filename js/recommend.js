/* ============================================================
 * recommend.js — 推荐引擎
 * 历史画像（时间衰减）/ 收藏画像 / 兴趣流派 / 热门 / 相似歌曲
 * ============================================================ */
(function (global) {
  "use strict";

  const D = global.App.DATA;
  const S = global.App.Core;

  const W = { genre: 1.0, mood: 0.8, artist: 1.2 };

  function buildProfile() {
    const profile = { genres: {}, moods: {}, artists: {}, total: 0 };
    const data = S.isLoggedIn() ? S.getUserData() : null;
    const history = data ? data.history : [];
    const now = Date.now();
    history.forEach((h) => {
      const song = D.get(h.id);
      if (!song) return;
      const days = Math.max(0, (now - (h.last || now)) / 86400000);
      const w = (h.weight || 1) * Math.exp(-days / 30);
      profile.genres[song.genre] = (profile.genres[song.genre] || 0) + w;
      profile.moods[song.mood] = (profile.moods[song.mood] || 0) + w;
      profile.artists[song.artist] = (profile.artists[song.artist] || 0) + w;
      profile.total += w;
    });
    return profile;
  }

  function dailySeed() {
    const u = S.isLoggedIn() ? S.currentUser() : "guest";
    const d = new Date();
    const key = (u || "guest") + "|" + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
    let h = 0;
    for (let i = 0; i < key.length; i++) h = (Math.imul(31, h) + key.charCodeAt(i)) | 0;
    return h >>> 0;
  }

  function scoreSong(song, profile) {
    if (!profile || !profile.total) return 0;
    return (
      (profile.genres[song.genre] || 0) * W.genre +
      (profile.moods[song.mood] || 0) * W.mood +
      (profile.artists[song.artist] || 0) * W.artist
    ) / profile.total;
  }

  function personalized(limit, exclude) {
    exclude = new Set(exclude || []);
    const profile = buildProfile();
    const seed = dailySeed();
    const ranked = D.SONGS
      .filter((s) => !exclude.has(s.id))
      .map((s, idx) => ({
        song: s,
        score: scoreSong(s, profile) + (((seed ^ Math.imul(idx, 2654435761)) % 1000) / 100000),
      }))
      .sort((a, b) => b.score - a.score);
    if (!profile.total) return trending(limit);
    return ranked.slice(0, limit).map((r) => r.song);
  }

  function trending(limit) {
    const plays = S.getPlays();
    return D.SONGS.slice()
      .sort((a, b) => (plays[b.id] || 0) - (plays[a.id] || 0))
      .slice(0, limit);
  }

  function recent(limit) {
    const data = S.isLoggedIn() ? S.getUserData() : null;
    if (!data) return [];
    return data.history.slice()
      .sort((a, b) => (b.last || 0) - (a.last || 0))
      .slice(0, limit)
      .map((h) => D.get(h.id))
      .filter(Boolean);
  }

  function similarTo(songId, limit) {
    const base = D.get(songId);
    if (!base) return [];
    const plays = S.getPlays();
    return D.SONGS
      .filter((s) => s.id !== songId)
      .map((s) => {
        let sc = 0;
        if (s.genre === base.genre) sc += 2;
        if (s.mood === base.mood) sc += 1.5;
        if (s.artist === base.artist) sc += 3;
        return { song: s, score: sc };
      })
      .sort((a, b) => b.score - a.score || (plays[b.song.id] || 0) - (plays[a.song.id] || 0))
      .slice(0, limit)
      .map((r) => r.song);
  }

  function fromFavorites(limit) {
    const favIds = S.getFavorites();
    if (!favIds.length) return trending(limit);
    const exclude = new Set(favIds);
    const profile = { genres: {}, moods: {}, artists: {}, total: 0 };
    favIds.forEach((id) => {
      const s = D.get(id);
      if (!s) return;
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

  function fromMood(mood, limit) {
    const pool = D.SONGS.filter((s) => s.mood === mood);
    const plays = S.getPlays();
    return pool.sort((a, b) => (plays[b.id] || 0) - (plays[a.id] || 0)).slice(0, limit);
  }

  function homeSections() {
    const sections = {};
    sections.trending = trending(12);
    if (S.isLoggedIn()) {
      sections.recent = recent(12);
      sections.personalized = personalized(12);
      sections.fromFavorites = fromFavorites(12);
    } else {
      sections.personalized = personalized(12);
    }
    sections.newReleases = D.SONGS.slice().sort((a, b) => b.year - a.year).slice(0, 12);
    return sections;
  }

  global.App.Recommend = {
    buildProfile, personalized, trending, recent, similarTo,
    fromFavorites, fromMood, homeSections,
  };
})(window);
