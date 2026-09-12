<?php
/**
 * audius.php — Audius 免费音源代理（InfinityFree 适配版）
 *
 * 由于 InfinityFree 免费主机的 PHP 脚本最长只能运行约 30 秒，
 * 无法长时间流式转发音频。因此本代理采用「先缓存到服务器，再 302 重定向到缓存文件」
 * 的策略：
 *   1. 浏览器请求 stream → PHP 检查 cache/audio/{id}.mp3 是否存在
 *   2. 存在 → 302 重定向到静态缓存文件（服务器直接提供，不占用 PHP 执行时间）
 *   3. 不存在 → PHP 在 25 秒内把音频下载到缓存目录，完成后 302 重定向
 *   4. 下载失败/超时 → 返回 502/503，前端提示用户稍后重试
 *
 * 用法：
 *   audius.php?action=search&q=关键词&limit=30     → 搜索
 *   audius.php?action=trending&limit=30            → 热门
 *   audius.php?action=stream&id=TRACK_ID           → 播放（缓存优先 + 302）
 *   audius.php?action=cover&url=COVER_URL          → 封面（缓存优先 + 302）
 */

require_once __DIR__ . '/config.php';

$action = $_GET['action'] ?? '';
$AUDIUS = 'https://api.audius.co/v1';

// 缓存目录（必须能被 Web 访问到）
$CACHE_DIR = __DIR__ . '/cache';
$AUDIO_CACHE = $CACHE_DIR . '/audio';
$COVER_CACHE = $CACHE_DIR . '/cover';
ensureDir($AUDIO_CACHE);
ensureDir($COVER_CACHE);

function ensureDir($dir) {
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
}

// 简单结果缓存（10 分钟）
function cache_get($key) {
    $dir = __DIR__ . '/cache';
    $file = $dir . '/' . md5($key) . '.json';
    if (is_file($file) && (time() - filemtime($file)) < 600) {
        return json_decode(file_get_contents($file), true);
    }
    return null;
}
function cache_set($key, $data) {
    $dir = __DIR__ . '/cache';
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    @file_put_contents($dir . '/' . md5($key) . '.json', json_encode($data));
}

// Audius 可用网关列表（search/trending 做 fallback）
// 注意：InfinityFree 的 PHP 脚本最长约 30 秒，因此只保留 2 个网关、
// 单次超时 8 秒，避免累计超时被服务器强制中断。
$AUDIUS_GATEWAYS = [
    'https://api.audius.co',
    'https://audius-metadata-1.figment.io',
];

// 使用 curl 请求 Audius API（JSON 接口）
function audius_get($path, $gateways = null) {
    global $AUDIUS_GATEWAYS;
    if ($gateways === null) $gateways = $AUDIUS_GATEWAYS;

    foreach ($gateways as $base) {
        $url = rtrim($base, '/') . '/v1' . $path;
        $resp = curl_json($url);
        if ($resp !== null && isset($resp['data'])) return $resp;
    }
    return null;
}

function curl_json($url) {
    if (!function_exists('curl_init')) return null;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'WaveMusicPlayer/1.0',
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
    ]);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($resp === false || $code < 200 || $code >= 300) return null;
    return json_decode($resp, true);
}

// 统一音轨格式
function map_track($t) {
    $artwork = $t['artwork'] ?? [];
    $coverRaw = $artwork['480x480'] ?? ($artwork['150x150'] ?? '');
    $id = $t['id'] ?? '';
    // 注意：必须带 api/ 前缀，因为 audius.php 位于 /api/ 目录下，
    // 前端页面在站点根目录，相对路径要写全，否则会 404。
    return [
        'id' => $id,
        'title' => $t['title'] ?? '未知曲目',
        'artist' => $t['user']['name'] ?? '未知歌手',
        // 封面走本代理
        'cover' => $coverRaw ? ('api/audius.php?action=cover&url=' . urlencode($coverRaw)) : '',
        'genre' => $t['genre'] ?? '',
        'mood' => $t['mood'] ?? '',
        'duration' => intval($t['duration'] ?? 0),
        // 流媒体走本代理
        'streamUrl' => 'api/audius.php?action=stream&id=' . urlencode($id),
        'source' => 'audius',
    ];
}

switch ($action) {
    case 'search':
        $q = trim($_GET['q'] ?? '');
        if ($q === '') respond(['ok' => false, 'error' => '缺少搜索词'], 400);
        $limit = min(50, max(1, intval($_GET['limit'] ?? 30)));

        $cacheKey = "search:{$q}:{$limit}";
        $cached = cache_get($cacheKey);
        if ($cached !== null) { respond($cached); }

        $raw = audius_get('/tracks/search?query=' . urlencode($q) . '&limit=' . $limit);
        if ($raw === null || !isset($raw['data'])) {
            respond(['ok' => false, 'error' => 'Audius 服务暂时不可用，请稍后重试'], 502);
        }
        $data = ['ok' => true, 'query' => $q, 'data' => array_map('map_track', $raw['data'])];
        cache_set($cacheKey, $data);
        respond($data);

    case 'trending':
        $limit = min(50, max(1, intval($_GET['limit'] ?? 30)));

        $cacheKey = "trending:{$limit}";
        $cached = cache_get($cacheKey);
        if ($cached !== null) { respond($cached); }

        $raw = audius_get('/tracks/trending?limit=' . $limit);
        if ($raw === null || !isset($raw['data'])) {
            respond(['ok' => false, 'error' => 'Audius 服务暂时不可用，请稍后重试'], 502);
        }
        $data = ['ok' => true, 'data' => array_map('map_track', $raw['data'])];
        cache_set($cacheKey, $data);
        respond($data);

    case 'stream':
        proxy_stream($_GET['id'] ?? '');
        break;

    case 'cover':
        proxy_cover($_GET['url'] ?? '');
        break;

    default:
        respond(['ok' => false, 'error' => '未知操作'], 400);
}

/**
 * 流媒体代理（InfinityFree 适配）：缓存到文件 + 302 重定向
 */
function proxy_stream($id) {
    global $AUDIO_CACHE;

    if (!preg_match('/^[A-Za-z0-9]+$/', $id)) { http_response_code(400); exit; }

    $cacheFile = $AUDIO_CACHE . '/' . $id . '.mp3';
    $tmpFile = $cacheFile . '.tmp';

    // 已有缓存：直接 302 到静态文件（最稳，不占用 PHP 执行时间）
    if (is_file($cacheFile) && filesize($cacheFile) > 1024) {
        redirectToCache('audio/' . $id . '.mp3');
    }

    // 正在下载中（临时文件存在且很新）：让前端稍后重试
    if (is_file($tmpFile) && (time() - filemtime($tmpFile)) < 60) {
        http_response_code(503);
        header('Retry-After: 5');
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => '音频正在缓冲，请 5 秒后重试']);
        exit;
    }

    // 删除旧临时文件
    @unlink($tmpFile);

    $streamUrl = 'https://api.audius.co/v1/tracks/' . $id . '/stream';

    // 用 curl 下载到临时文件（限制 25 秒，避免触发 InfinityFree 30 秒执行限制）
    $fp = @fopen($tmpFile, 'wb');
    if (!$fp) {
        respond(['ok' => false, 'error' => '无法创建缓存文件'], 500);
    }

    $ch = curl_init($streamUrl);
    curl_setopt_array($ch, [
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 5,
        CURLOPT_FILE => $fp,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'WaveMusicPlayer/1.0',
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 25,
    ]);

    // 转发 Range 请求头，支持进度条
    if (!empty($_SERVER['HTTP_RANGE'])) {
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Range: ' . $_SERVER['HTTP_RANGE']]);
    }

    curl_exec($ch);
    $errno = curl_errno($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);

    clearstatcache();
    $downloaded = is_file($tmpFile) ? filesize($tmpFile) : 0;

    // 下载成功或已下载到部分内容（超时时可能仍有部分数据）
    if ($downloaded > 1024 && ($code >= 200 && $code < 400)) {
        @rename($tmpFile, $cacheFile);
        redirectToCache('audio/' . $id . '.mp3');
    }

    // 超时但已有部分数据：也当作可用（至少能播已下载部分）
    if ($errno === 28 && $downloaded > 50 * 1024) {
        @rename($tmpFile, $cacheFile);
        redirectToCache('audio/' . $id . '.mp3');
    }

    @unlink($tmpFile);
    http_response_code(502);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => false, 'error' => '音频下载失败（Audius CDN 不可达或文件过大）']);
    exit;
}

/**
 * 封面代理：缓存到文件 + 302 重定向
 */
function proxy_cover($url) {
    global $COVER_CACHE;

    if (!$url || strpos($url, 'http') !== 0) { http_response_code(400); exit; }

    $hash = md5($url);
    $cacheFile = $COVER_CACHE . '/' . $hash . '.jpg';
    $tmpFile = $cacheFile . '.tmp';

    if (is_file($cacheFile) && filesize($cacheFile) > 100) {
        redirectToCache('cover/' . $hash . '.jpg');
    }

    if (is_file($tmpFile) && (time() - filemtime($tmpFile)) < 60) {
        http_response_code(503);
        header('Retry-After: 2');
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'error' => '封面正在缓冲']);
        exit;
    }

    @unlink($tmpFile);

    $fp = @fopen($tmpFile, 'wb');
    if (!$fp) { http_response_code(500); exit; }

    $ch = curl_init(urldecode($url));
    curl_setopt_array($ch, [
        CURLOPT_FILE => $fp,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_TIMEOUT => 15,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_USERAGENT => 'WaveMusicPlayer/1.0',
    ]);
    curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    fclose($fp);

    $downloaded = is_file($tmpFile) ? filesize($tmpFile) : 0;
    if ($downloaded > 100 && $code >= 200 && $code < 300) {
        @rename($tmpFile, $cacheFile);
        redirectToCache('cover/' . $hash . '.jpg');
    }

    @unlink($tmpFile);
    http_response_code(502);
    exit;
}

/**
 * 302 重定向到缓存静态文件
 */
function redirectToCache($relativePath) {
    // 计算相对于站点根的 URL
    $scriptPath = $_SERVER['SCRIPT_NAME'] ?? '/api/audius.php';
    $base = dirname($scriptPath); // /api
    $url = $base . '/cache/' . $relativePath;
    header('Access-Control-Allow-Origin: *');
    header('Location: ' . $url, true, 302);
    exit;
}
