<?php
/**
 * qq.php — QQ音乐代理（InfinityFree 部署）
 *
 * 用途：搜索 QQ 音乐歌曲（歌名/歌手/封面/时长/VIP标记），
 *       获取播放地址（vkey）、歌词。
 * 封面：直接用 y.gtimg.cn 官方图床 URL，无需中转。
 * 播放：本文件代理 vkey 接口，拿到真实 mp3 地址后 302 跳转（不缓存音频，
 *       因为 QQ 的流地址是可直接播放的 mp3，不占用 PHP 执行时间）。
 *
 * 用法：
 *   qq.php?action=search&keywords=周杰伦&limit=30   → 搜索
 *   qq.php?action=stream&id=SONGMID                 → 播放（302 到真实 mp3）
 *   qq.php?action=lyric&id=SONGMID                  → 歌词
 */

require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';

// ---- 简单结果缓存 ----
function qq_cache_get($key, $ttl = 600) {
    $dir = __DIR__ . '/cache';
    $file = $dir . '/qq_' . md5($key) . '.json';
    if (is_file($file) && (time() - filemtime($file)) < $ttl) {
        return json_decode(file_get_contents($file), true);
    }
    return null;
}
function qq_cache_set($key, $data) {
    $dir = __DIR__ . '/cache';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    @file_put_contents($dir . '/qq_' . md5($key) . '.json', json_encode($data, JSON_UNESCAPED_UNICODE));
}

// ---- QQ音乐公共参数（无登录态） ----
function qq_common_params() {
    return [
        'g_tk' => 1124214810,
        'loginUin' => '0',
        'hostUin' => 0,
        'inCharset' => 'utf8',
        'outCharset' => 'utf-8',
        'notice' => 0,
        'platform' => 'yqq.json',
        'needNewCode' => 0,
    ];
}

// ---- curl GET，返回 JSON 数组（自动剥离 JSONP 包装） ----
function qq_get_json($url, $referer) {
    if (!function_exists('curl_init')) return null;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 12,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Referer: ' . $referer],
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code < 200 || $code >= 300) return null;
    $data = json_decode($resp, true);
    if ($data === null) {
        // 个别接口可能返回 JSONP 包装，尝试剥离
        $resp = preg_replace('/^[^\[\{]*([\[{].*[\]}])[^\]\}]*$/s', '$1', $resp);
        $data = json_decode($resp, true);
    }
    return is_array($data) ? $data : null;
}

// ---- 封面 URL（官方图床直连） ----
function qq_cover($mid) {
    return 'https://y.gtimg.cn/music/photo_new/T002R300x300M000' . $mid . '.jpg';
}

switch ($action) {

    // ============ 搜索 ============
    case 'search':
        $q = trim($_GET['keywords'] ?? $_GET['q'] ?? '');
        if ($q === '') respond(['ok' => false, 'error' => '缺少搜索关键词'], 400);
        $limit = min(50, max(1, intval($_GET['limit'] ?? 30)));

        $cacheKey = "search:{$q}:{$limit}";
        $cached = qq_cache_get($cacheKey, 600);
        if ($cached !== null) respond($cached);

        // 老格式（不带 new_json，避免返回空结果）
        $params = array_merge(qq_common_params(), [
            'w' => $q,
            'n' => $limit,
            'p' => 1,
            'catZhida' => 1,
            'remoteplace' => 'txt.yqq.song',
            'format' => 'json',
            'ct' => 24,
            'qqmusic_ver' => 1298,
            't' => 0,
            'aggr' => 1,
            'cr' => 1,
            'lossless' => 0,
            'flag_qc' => 0,
        ]);
        $url = 'https://c.y.qq.com/soso/fcgi-bin/client_search_cp?' . http_build_query($params);
        $resp = qq_get_json($url, 'https://y.qq.com/');

        $list = $resp['data']['song']['list'] ?? [];
        if (!is_array($list) || empty($list)) {
            respond(['ok' => false, 'error' => 'QQ音乐搜索无结果或服务不可用'], 502);
        }

        $data = [];
        foreach ($list as $t) {
            $mid = $t['songmid'] ?? $t['mid'] ?? '';
            if (!$mid) continue;
            $singers = [];
            if (!empty($t['singer']) && is_array($t['singer'])) {
                foreach ($t['singer'] as $s) {
                    $nm = is_array($s) ? ($s['name'] ?? '') : '';
                    if ($nm) $singers[] = $nm;
                }
            }
            // VIP 判断：pay.payplay != 0 表示需付费/版权受限
            $payplay = $t['pay']['payplay'] ?? 0;
            // 封面用专辑 mid（songmid 在 y.gtimg.cn 上 404，albummid 才是正确的）
            $albummid = $t['albummid'] ?? ($t['album']['mid'] ?? '');
            $data[] = [
                'id' => $mid,
                'title' => $t['songname'] ?? $t['name'] ?? '未知曲目',
                'artist' => implode('/', $singers) ?: '未知歌手',
                'album' => $t['albumname'] ?? ($t['album']['name'] ?? ''),
                'cover' => $albummid ? qq_cover($albummid) : '',
                'duration' => intval($t['interval'] ?? 0),
                'free' => ($payplay == 0),
                'streamUrl' => 'api/qq.php?action=stream&id=' . urlencode($mid),
                'source' => 'qq',
            ];
        }
        if (empty($data)) respond(['ok' => false, 'error' => 'QQ音乐搜索无结果'], 502);

        $result = ['ok' => true, 'query' => $q, 'data' => $data];
        qq_cache_set($cacheKey, $result);
        respond($result);

    // ============ 播放（vkey → 302 到真实 mp3） ============
    case 'stream':
        $mid = trim($_GET['id'] ?? $_GET['songmid'] ?? '');
        if ($mid === '' || !preg_match('/^[A-Za-z0-9]+$/', $mid)) {
            respond(['ok' => false, 'error' => '缺少有效歌曲 id'], 400);
        }

        $guid = (string)mt_rand(1000000000, 2147483647);

        $reqData = [
            'req_0' => [
                'module' => 'vkey.GetVkeyServer',
                'method' => 'CgiGetVkey',
                'param' => [
                    'filename' => ['M500' . $mid . $mid . '.mp3'],
                    'guid' => $guid,
                    'songmid' => [$mid],
                    'songtype' => [0],
                    'uin' => '0',
                    'loginflag' => 1,
                    'platform' => '20',
                ],
            ],
            'loginUin' => '0',
            'comm' => ['uin' => '0', 'format' => 'json', 'ct' => 24, 'cv' => 0],
        ];

        $vkeyUrl = 'https://u.y.qq.com/cgi-bin/musicu.fcg?' . http_build_query([
            'format' => 'json',
            'sign' => 'zzannc1o6o9b4i971602f3554385022046ab796512b7012',
            'data' => json_encode($reqData, JSON_UNESCAPED_UNICODE),
        ]);
        $resp = qq_get_json($vkeyUrl, 'https://y.qq.com/portal/player.html');

        $sip = $resp['req_0']['data']['sip'] ?? [];
        $midurlinfo = $resp['req_0']['data']['midurlinfo'] ?? [];

        // 优先 https 域（避免站点 HTTPS 下的混合内容拦截），其次非 ws 域，最后第一个
        $domain = '';
        foreach ((array)$sip as $d) { if (is_string($d) && strpos($d, 'https://') === 0) { $domain = $d; break; } }
        if (!$domain) { foreach ((array)$sip as $d) { if (is_string($d) && strpos($d, 'http://ws') !== 0) { $domain = $d; break; } } }
        if (!$domain) $domain = $sip[0] ?? '';

        $purl = '';
        foreach ((array)$midurlinfo as $info) {
            if (!empty($info['purl'])) { $purl = $info['purl']; break; }
        }
        if ($purl === '' || $domain === '') {
            respond(['ok' => false, 'error' => '该歌曲暂无播放链接（可能需 VIP 或版权受限）'], 404);
        }

        if (substr($domain, -1) !== '/') $domain .= '/';
        $finalUrl = $domain . ltrim($purl, '/');

        header('Access-Control-Allow-Origin: *');
        header('Location: ' . $finalUrl, true, 302);
        exit;

    // ============ 歌词 ============
    case 'lyric':
        $mid = trim($_GET['id'] ?? $_GET['songmid'] ?? '');
        if ($mid === '' || !preg_match('/^[A-Za-z0-9]+$/', $mid)) {
            respond(['ok' => false, 'error' => '缺少有效歌曲 id'], 400);
        }

        $cacheKey = "lyric:{$mid}";
        $cached = qq_cache_get($cacheKey, 3600);
        if ($cached !== null) respond($cached);

        $params = array_merge(qq_common_params(), [
            'songmid' => $mid,
            'format' => 'json',
            'pcachetime' => intval(microtime(true) * 1000),
        ]);
        $url = 'https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?' . http_build_query($params);
        $resp = qq_get_json($url, 'https://y.qq.com/');

        // 歌词字段是 base64 编码的 LRC
        $lyricB64 = $resp['lyric'] ?? '';
        $lyric = $lyricB64 ? base64_decode($lyricB64) : '';
        if ($lyric === false || trim($lyric) === '') {
            respond(['ok' => false, 'error' => '歌词加载失败'], 502);
        }

        $result = ['ok' => true, 'lyric' => $lyric];
        qq_cache_set($cacheKey, $result);
        respond($result);

    // ============ 歌单详情 ============
    case 'playlist':
        $id = trim($_GET['id'] ?? $_GET['disstid'] ?? '');
        if ($id === '' || !preg_match('/^\d+$/', $id)) {
            respond(['ok' => false, 'error' => '缺少有效歌单 id'], 400);
        }

        $cacheKey = "playlist:{$id}";
        $cached = qq_cache_get($cacheKey, 3600);
        if ($cached !== null) respond($cached);

        $params = array_merge(qq_common_params(), [
            'disstid' => $id,
            'type' => 1,
            'json' => 1,
            'utf8' => 1,
            'onlysong' => 0,
            'new_format' => 1,
            'format' => 'json',
        ]);
        $url = 'https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?' . http_build_query($params);
        $resp = qq_get_json($url, 'https://y.qq.com/');

        $cd = $resp['cdlist'][0] ?? [];
        $name = $cd['dissname'] ?? '';
        $songlist = $cd['songlist'] ?? ($cd['v_songlist'] ?? []);

        $data = [];
        foreach ((array)$songlist as $t) {
            $mid = $t['songmid'] ?? $t['mid'] ?? '';
            if (!$mid) continue;
            $singers = [];
            if (!empty($t['singer']) && is_array($t['singer'])) {
                foreach ($t['singer'] as $s) {
                    $nm = is_array($s) ? ($s['name'] ?? '') : '';
                    if ($nm) $singers[] = $nm;
                }
            }
            $albummid = $t['albummid'] ?? ($t['album']['mid'] ?? '');
            $data[] = [
                'id' => $mid,
                'title' => $t['songname'] ?? $t['name'] ?? '未知曲目',
                'artist' => implode('/', $singers) ?: '未知歌手',
                'album' => $t['albumname'] ?? ($t['album']['name'] ?? ''),
                'cover' => $albummid ? qq_cover($albummid) : '',
                'duration' => intval($t['interval'] ?? 0),
                'streamUrl' => 'api/qq.php?action=stream&id=' . urlencode($mid),
                'source' => 'qq',
            ];
        }
        if (empty($data)) respond(['ok' => false, 'error' => '歌单加载失败或歌单为空（可能为私密歌单）'], 502);

        $result = ['ok' => true, 'name' => $name, 'data' => $data];
        qq_cache_set($cacheKey, $result);
        respond($result);

    default:
        respond(['ok' => false, 'error' => '未知操作'], 400);
}
