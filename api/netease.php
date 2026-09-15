<?php
/**
 * netease.php — 网易云音乐中文曲库代理（InfinityFree 部署）
 *
 * 用途：搜索中文歌曲（歌名/歌手/封面/时长/免费标记）。
 * 播放：由前端直接调用网易云公开接口 song/media/outer/url（用户手机在国内可直连），
 *       本文件不负责转发音频。
 *
 * 用法：
 *   netease.php?action=search&keywords=周杰伦&limit=30
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/secure.php';

$action = $_GET['action'] ?? '';
$NCM_API = 'https://vercel-netease-cloud-music-api-nine.vercel.app';

// 简单结果缓存
function nc_cache_get($key, $ttl = 600) {
    $dir = __DIR__ . '/cache';
    $file = $dir . '/nc_' . md5($key) . '.json';
    if (is_file($file) && (time() - filemtime($file)) < $ttl) {
        return json_decode(file_get_contents($file), true);
    }
    return null;
}
function nc_cache_set($key, $data) {
    $dir = __DIR__ . '/cache';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    @file_put_contents($dir . '/nc_' . md5($key) . '.json', json_encode($data, JSON_UNESCAPED_UNICODE));
}

// 请求 Vercel 网易云 API（JSON 接口）
function ncm_get($path) {
    global $NCM_API;
    $url = $NCM_API . $path;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'WaveMusicPlayer/1.0',
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code < 200 || $code >= 300) return null;
    return json_decode($resp, true);
}

switch ($action) {
    case 'search':
        $q = trim($_GET['keywords'] ?? $_GET['q'] ?? '');
        if ($q === '') respond(['ok' => false, 'error' => '缺少搜索关键词'], 400);
        $limit = min(50, max(1, intval($_GET['limit'] ?? 30)));
        rate_limited('ncsearch:' . client_ip(), 40, 60);

        $cacheKey = "search:{$q}:{$limit}";
        $cached = nc_cache_get($cacheKey, 600);
        if ($cached !== null) { respond($cached); }

        // 1. 搜索
        $s = ncm_get('/search?keywords=' . urlencode($q) . '&limit=' . $limit);
        if (!$s || !isset($s['result']['songs']) || empty($s['result']['songs'])) {
            respond(['ok' => false, 'error' => '网易云搜索无结果或服务不可用'], 502);
        }
        $songs = $s['result']['songs'];

        // 2. 批量获取详情（封面 + 时长 + 真实免费标记 privileges.fee）
        $ids = array_map(function ($x) { return $x['id']; }, $songs);
        $detail = ncm_get('/song/detail?ids=' . urlencode(implode(',', $ids)));

        $detailMap = [];
        $privMap = [];
        if ($detail && isset($detail['songs'])) {
            foreach ($detail['songs'] as $d) $detailMap[$d['id']] = $d;
        }
        if ($detail && isset($detail['privileges'])) {
            foreach ($detail['privileges'] as $p) $privMap[$p['id']] = $p;
        }

        // 3. 转换统一格式
        $data = [];
        foreach ($songs as $t) {
            $id = $t['id'];
            $d = $detailMap[$id] ?? null;
            $priv = $privMap[$id] ?? null;
            $cover = ($d['al']['picUrl'] ?? '') ?: ($t['album']['picUrl'] ?? '');
            $data[] = [
                'id' => $id,
                'title' => $t['name'] ?? '未知曲目',
                'artist' => ($t['artists'][0]['name'] ?? '') ?: ($d['ar'][0]['name'] ?? '未知歌手'),
                'album' => $t['album']['name'] ?? '',
                'cover' => $cover,
                'duration' => intval(($d['dt'] ?? $t['duration'] ?? 0) / 1000),
                'free' => $priv ? ($priv['fee'] === 0) : true,
                'source' => 'netease',
            ];
        }

        $result = ['ok' => true, 'query' => $q, 'data' => $data];
        nc_cache_set($cacheKey, $result);
        respond($result);

    case 'hot':
        $limit = min(50, max(1, intval($_GET['limit'] ?? 30)));
        rate_limited('nchot:' . client_ip(), 20, 60);

        $cacheKey = "hot:{$limit}";
        $cached = nc_cache_get($cacheKey, 600);
        if ($cached !== null) { respond($cached); }

        // 推荐新歌
        $r = ncm_get('/personalized/newsong?limit=' . $limit);
        if (!$r || !isset($r['result']) || empty($r['result'])) {
            respond(['ok' => false, 'error' => '网易云热门加载失败'], 502);
        }
        $items = $r['result'];

        // 批量详情拿 privileges（真实免费标记）
        $ids = array_map(function ($x) { return $x['id']; }, $items);
        $detail = ncm_get('/song/detail?ids=' . urlencode(implode(',', $ids)));
        $privMap = [];
        if ($detail && isset($detail['privileges'])) {
            foreach ($detail['privileges'] as $p) $privMap[$p['id']] = $p;
        }

        $data = [];
        foreach ($items as $t) {
            $id = $t['id'];
            $priv = $privMap[$id] ?? null;
            // 时长多来源兜底：顶层 duration → song.hMusic.playTime → song.lMusic.playTime
            $dur = intval($t['duration'] ?? 0);
            if (!$dur && isset($t['song']['hMusic']['playTime'])) $dur = intval($t['song']['hMusic']['playTime']);
            if (!$dur && isset($t['song']['lMusic']['playTime'])) $dur = intval($t['song']['lMusic']['playTime']);
            $data[] = [
                'id' => $id,
                'title' => $t['name'] ?? '未知曲目',
                'artist' => ($t['song']['artists'][0]['name'] ?? '') ?: '未知歌手',
                'album' => $t['song']['album']['name'] ?? '',
                'cover' => ($t['picUrl'] ?? '') ?: ($t['song']['album']['picUrl'] ?? ''),
                'duration' => intval($dur / 1000),
                'free' => $priv ? ($priv['fee'] === 0) : true,
                'source' => 'netease',
            ];
        }

        $result = ['ok' => true, 'data' => $data];
        nc_cache_set($cacheKey, $result);
        respond($result);

    case 'lyric':
        $id = trim($_GET['id'] ?? '');
        if ($id === '') respond(['ok' => false, 'error' => '缺少歌曲 id'], 400);
        rate_limited('ncline:' . client_ip(), 30, 60);

        $cacheKey = "lyric:{$id}";
        $cached = nc_cache_get($cacheKey, 3600);
        if ($cached !== null) { respond($cached); }

        $r = ncm_get('/lyric?id=' . urlencode($id));
        if (!$r || !isset($r['lrc']['lyric'])) {
            respond(['ok' => false, 'error' => '歌词加载失败'], 502);
        }
        $result = [
            'ok' => true,
            'lyric' => $r['lrc']['lyric'] ?? '',
            'tlyric' => $r['tlyric']['lyric'] ?? '',
        ];
        nc_cache_set($cacheKey, $result);
        respond($result);

    case 'playlist':
        $id = trim($_GET['id'] ?? '');
        if ($id === '' || !preg_match('/^\d+$/', $id)) respond(['ok' => false, 'error' => '缺少有效歌单 id'], 400);
        $limit = min(500, max(1, intval($_GET['limit'] ?? 300)));
        rate_limited('ncpl:' . client_ip(), 30, 60);

        $cacheKey = "playlist:{$id}:{$limit}";
        $cached = nc_cache_get($cacheKey, 3600);
        if ($cached !== null) { respond($cached); }

        $r = ncm_get('/playlist/track/all?id=' . urlencode($id) . '&limit=' . $limit);
        if (!$r || !isset($r['songs'])) {
            respond(['ok' => false, 'error' => '歌单加载失败（可能为私密歌单或不存在）'], 502);
        }

        // 顺带获取歌单名称（失败则用空，前端兜底）
        $name = '';
        $detail = ncm_get('/playlist/detail?id=' . urlencode($id));
        if ($detail && isset($detail['playlist']['name'])) {
            $name = $detail['playlist']['name'];
        }

        $songs = $r['songs'];
        $privMap = [];
        if (isset($r['privileges'])) {
            foreach ($r['privileges'] as $p) $privMap[$p['id']] = $p;
        }

        $data = [];
        foreach ($songs as $t) {
            $priv = $privMap[$t['id']] ?? null;
            $data[] = [
                'id' => $t['id'],
                'title' => $t['name'] ?? '未知曲目',
                'artist' => ($t['ar'][0]['name'] ?? '') ?: '未知歌手',
                'album' => $t['al']['name'] ?? '',
                'cover' => $t['al']['picUrl'] ?? '',
                'duration' => intval(($t['dt'] ?? 0) / 1000),
                'free' => $priv ? ($priv['fee'] === 0) : true,
                'source' => 'netease',
            ];
        }
        if (empty($data)) respond(['ok' => false, 'error' => '歌单为空'], 502);

        $result = ['ok' => true, 'name' => $name, 'data' => $data];
        nc_cache_set($cacheKey, $result);
        respond($result);

    case 'url':
        // 获取网易云歌曲播放地址（302 跳转到真实 CDN 直链）
        $id = trim($_GET['id'] ?? '');
        if ($id === '' || !preg_match('/^\d+$/', $id)) respond(['ok' => false, 'error' => '缺少有效歌曲 id'], 400);
        rate_limited('ncurl:' . client_ip(), 60, 60); // 防音频热链刷爆上游

        $audioUrl = null;

        // 方案 A：gdstudio API（带登录态，能拿到真实播放地址）
        $ch = curl_init('https://music-api.gdstudio.xyz/api.php?types=url&id=' . $id . '&br=128');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        ]);
        $resp = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($httpCode === 200 && $resp) {
            $j = json_decode($resp, true);
            if (!empty($j['url'])) $audioUrl = $j['url'];
        }

        // 方案 B：Vercel /song/url（备用）
        if (!$audioUrl) {
            $r = ncm_get('/song/url?id=' . $id . '&br=128');
            if ($r && isset($r['data'][0]['url']) && $r['data'][0]['url']) {
                $audioUrl = $r['data'][0]['url'];
            }
        }

        // 方案 C：outer URL（终极兜底，带 Referer 跟随重定向）
        if (!$audioUrl) {
            $ch = curl_init('https://music.163.com/song/media/outer/url?id=' . $id . '.mp3');
            curl_setopt_array($ch, [
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS => 5,
                CURLOPT_TIMEOUT => 15,
                CURLOPT_HTTPHEADER => ['Referer: https://music.163.com/'],
                CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
                CURLOPT_SSL_VERIFYPEER => false,
            ]);
            curl_exec($ch);
            $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
            $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
            if ($code === 200 && $effectiveUrl && strpos($effectiveUrl, 'music.163.com') === false) {
                $audioUrl = $effectiveUrl;
            }
        }

        // 拿到直链后 302 跳转（浏览器直接播放 CDN 音频）
        if ($audioUrl) {
            header('Location: ' . $audioUrl, true, 302);
            exit;
        }

        // 全部失败：最后兜底到 outer URL（浏览器自己处理）
        header('Location: https://music.163.com/song/media/outer/url?id=' . $id . '.mp3', true, 302);
        exit;

    default:
        respond(['ok' => false, 'error' => '未知操作'], 400);
}
