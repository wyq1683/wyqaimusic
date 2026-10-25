<?php
/**
 * cover.php — 同源封面代理（前端 Canvas 取色用，规避跨域污染）
 *
 * 前端要把封面图画到 canvas 采样主色，但网易云/QQ 封面是跨域 CDN 图，
 * 直连会被 canvas 污染（getImageData 抛 SecurityError）。本文件把封面
 * 经同源 PHP 转发，前端拿到的就是同域图片，canvas 不再污染，可取色。
 *
 * 安全：仅放行音源封面域名白名单 + 解析 IP 拒绝内网（防 SSRF）+ 限制 2MB。
 *
 * 用法：cover.php?u=<urlencode 后的封面 URL>
 */

function cov_allow_host($host) {
    $host = strtolower($host);
    $allowed = [
        'music.126.net','p1.music.126.net','p2.music.126.net','p3.music.126.net','p4.music.126.net','ncmcdn.com',
        'gtimg.cn','y.gtimg.cn','i.gtimg.cn','gtimg.qq.com','y.qq.com','qq.com','qiniucdn.com',
        'audius.co','creatornode.net','audius.simplecastcdn.com',
    ];
    foreach ($allowed as $d) {
        if ($host === $d || substr($host, -strlen('.' . $d)) === '.' . $d) return true;
    }
    return false;
}

$raw = $_GET['u'] ?? '';
if (!$raw) { http_response_code(400); exit('missing u'); }

$u = filter_var($raw, FILTER_VALIDATE_URL);
$scheme = strtolower(parse_url($u, PHP_URL_SCHEME) ?: '');
$host = strtolower(parse_url($u, PHP_URL_HOST) ?: '');
if (!$u || ($scheme !== 'http' && $scheme !== 'https') || !cov_allow_host($host)) {
    http_response_code(403);
    exit('host not allowed');
}

// 防 SSRF：解析所有 IP，拒绝私有/回环/链路本地
$ips = @gethostbynamel($host);
if (!$ips) { http_response_code(502); exit('dns failed'); }
foreach ($ips as $ip) {
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        if (preg_match('/^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/', $ip)) {
            http_response_code(403); exit('ssrf blocked');
        }
    } elseif (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        if (strpos($ip, '::1') === 0 || strpos($ip, 'fe80') === 0 || strpos($ip, 'fc') === 0 || strpos($ip, 'fd') === 0) {
            http_response_code(403); exit('ssrf blocked');
        }
    }
}

// 文件缓存（与 netease.php 共用 cache 目录）
$dir = __DIR__ . '/cache';
if (!is_dir($dir)) @mkdir($dir, 0755, true);
$cacheFile = $dir . '/cov_' . md5($u);

if (is_file($cacheFile) && (time() - filemtime($cacheFile)) < 86400) {
    $data = file_get_contents($cacheFile);
} else {
    $ch = curl_init($u);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_RANGE => '0-2097151', // 限 2MB
        CURLOPT_USERAGENT => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        CURLOPT_HTTPHEADER => ['Referer: https://music.163.com/', 'Accept: image/*'],
    ]);
    $data = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $size = curl_getinfo($ch, CURLINFO_SIZE_DOWNLOAD);
    curl_close($ch);
    if ($code !== 200 || !$data || $size > 2097152) {
        http_response_code(502);
        exit('fetch failed');
    }
    @file_put_contents($cacheFile, $data);
}

// 探测真实 MIME，只放行图片
if (function_exists('finfo_open')) {
    $finfo = finfo_open(FILEINFO_MIME_TYPE);
    $mime = $finfo ? finfo_buffer($finfo, $data) : 'image/jpeg';
} else {
    $mime = 'image/jpeg';
}
if (!preg_match('#^image/#', $mime)) {
    http_response_code(415);
    exit('not image');
}

header('Content-Type: ' . $mime);
header('Cache-Control: public, max-age=86400');
header('Access-Control-Allow-Origin: *');
echo $data;
