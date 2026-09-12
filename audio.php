<?php
/**
 * audio.php — 音频流代理
 * 
 * 用法：audio.php?file=song01     → 读取 music/song01.mp3
 *       audio.php?file=song02.mp3 → 读取 music/song02.mp3
 * 
 * 支持 HTTP Range 请求（字节范围），播放器可以拖动进度条/断点续播。
 * 适配 InfinityFree / 任意 LAMP 主机，无需额外配置。
 */

// ---- 安全校验 ----
$file = isset($_GET['file']) ? $_GET['file'] : '';
if (empty($file)) { http_response_code(400); die('Missing file parameter'); }

// 只允许字母数字、连字符、下划线、点号，防止路径穿越
if (!preg_match('/^[a-zA-Z0-9\-_\.]+$/', $file)) {
    http_response_code(403); die('Invalid filename');
}

// 自动补充扩展名
if (!str_ends_with(strtolower($file), '.mp3') && !str_ends_with(strtolower($file), '.ogg') && !str_ends_with(strtolower($file), '.wav') && !str_ends_with(strtolower($file), '.m4a') && !str_ends_with(strtolower($file), '.flac')) {
    $file .= '.mp3';
}

$path = __DIR__ . '/music/' . $file;
if (!file_exists($path)) { http_response_code(404); die('File not found'); }

// ---- 读取文件信息 ----
$size  = filesize($path);
$mime  = mime_content_type($path) ?: 'audio/mpeg';
$etag  = md5_file($path);
$fmtime = gmdate('D, d M Y H:i:s', filemtime($path)) . ' GMT';

// ---- 缓存控制 ----
header('Accept-Ranges: bytes');
header('Content-Type: ' . $mime);
header('ETag: "' . $etag . '"');
header('Last-Modified: ' . $fmtime);
header('Cache-Control: public, max-age=86400');
header('Access-Control-Allow-Origin: *');

// ---- ETag 304 检查 ----
if (isset($_SERVER['HTTP_IF_NONE_MATCH']) && trim($_SERVER['HTTP_IF_NONE_MATCH'], '"') === $etag) {
    http_response_code(304);
    exit;
}

// ---- HTTP Range (字节范围) 处理 ----
$start = 0;
$end   = $size - 1;
$isRange = false;

if (isset($_SERVER['HTTP_RANGE'])) {
    $isRange = true;
    http_response_code(206); // Partial Content
    preg_match('/bytes=(\d+)-(\d*)/', $_SERVER['HTTP_RANGE'], $matches);
    $start = intval($matches[1]);
    $end   = !empty($matches[2]) ? intval($matches[2]) : $size - 1;
    $end   = min($end, $size - 1);
    $len   = $end - $start + 1;
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $size);
    header('Content-Length: ' . $len);
} else {
    header('Content-Length: ' . $size);
}

// ---- 流式输出 ----
if ($isRange && $start > 0) {
    $fp = fopen($path, 'rb');
    fseek($fp, $start);
    $remaining = $end - $start + 1;
    while ($remaining > 0 && !feof($fp)) {
        $chunk = min($remaining, 8192);
        echo fread($fp, $chunk);
        $remaining -= $chunk;
        if (ob_get_level()) ob_flush();
        flush();
    }
    fclose($fp);
} else {
    readfile($path);
}
