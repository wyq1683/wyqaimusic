<?php
/**
 * secure.php — 共享安全防护助手（被各 API 在 config.php 之后自动加载）
 * 提供：客户端真实 IP、请求频率限制、同源校验（CSRF 防护）、CORS 安全头。
 *
 * 设计原则：
 *  - 所有函数用 function_exists 包裹，避免重复定义导致 fatal error；
 *  - 失败时要么放行（避免误杀正常请求），要么返回标准 JSON 错误；
 *  - 不依赖数据库，纯文件/KV 方式，零外部依赖。
 */

// ---------- 客户端真实 IP ----------
if (!function_exists('client_ip')) {
    function client_ip() {
        // 若站点未来接入 Cloudflare/反代，优先取其传递的真实 IP
        $cf = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? '';
        if ($cf && filter_var($cf, FILTER_VALIDATE_IP)) return $cf;
        $xf = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
        if ($xf) {
            $ip = trim(explode(',', $xf)[0]);
            if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
        }
        return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
    }
}

// ---------- 限流缓存目录 ----------
if (!function_exists('rl_cache_dir')) {
    function rl_cache_dir() {
        $dir = __DIR__ . '/cache';
        if (!is_dir($dir)) @mkdir($dir, 0755, true);
        return $dir;
    }
}

// ---------- 固定窗口限流 ----------
// 相同 $key 在 $window 秒内最多 $max 次；返回 true=放行，false=触发限制。
if (!function_exists('rate_limit')) {
    function rate_limit($key, $max = 20, $window = 60) {
        $file = rl_cache_dir() . '/rl_' . md5($key) . '.json';
        $now = time();
        $data = is_file($file) ? @json_decode(@file_get_contents($file), true) : null;
        if (!is_array($data) || ($now - (int)($data['start'] ?? 0)) >= $window) {
            @file_put_contents($file, json_encode(['start' => $now, 'count' => 1]), LOCK_EX);
            return true;
        }
        if ((int)$data['count'] >= $max) return false;
        $data['count'] = (int)$data['count'] + 1;
        @file_put_contents($file, json_encode($data), LOCK_EX);
        return true;
    }
}

// 直接用于守卫：超限即返回 429 并终止。
if (!function_exists('rate_limited')) {
    function rate_limited($key, $max = 20, $window = 60) {
        if (!rate_limit($key, $max, $window)) {
            respond(['ok' => false, 'error' => '请求过于频繁，请稍后再试'], 429);
        }
    }
}

// ---------- 同源校验（防御 CSRF） ----------
// 仅对会改变状态的请求（非 GET/HEAD/OPTIONS）校验 Origin。
// 同源请求浏览器通常不发 Origin，或发本站域名；APK WebView 可能发 null —— 均放行。
if (!function_exists('enforce_same_origin')) {
    function enforce_same_origin() {
        $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
        if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) return;
        $origin = trim($_SERVER['HTTP_ORIGIN'] ?? '');
        if ($origin === '' || $origin === 'null') return;
        $host = @parse_url($origin, PHP_URL_HOST);
        $allowed = ['wyqaimusic.wuaze.com', 'localhost', '127.0.0.1'];
        if (!$host || !in_array($host, $allowed, true)) {
            respond(['ok' => false, 'error' => '非法来源请求'], 403);
        }
    }
}

// ---------- 安全的 CORS 头 ----------
// 仅在 Origin 命中白名单时才回显，避免 * 通配导致的跨域数据泄露。
if (!function_exists('cors_headers')) {
    function cors_headers() {
        $origin = trim($_SERVER['HTTP_ORIGIN'] ?? '');
        $allowed = ['https://wyqaimusic.wuaze.com', 'http://localhost', 'http://127.0.0.1'];
        if ($origin !== '' && in_array($origin, $allowed, true)) {
            header('Access-Control-Allow-Origin: ' . $origin);
            header('Access-Control-Allow-Credentials: true');
        }
        header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Auth-Token, X-CSRF-Token');
        header('Vary: Origin');
    }
}

// ---------- 登录失败追踪（防爆破） ----------
// 同一用户名在 $window 秒内失败超过 $max 次，临时封禁。
if (!function_exists('login_fail_file')) {
    function login_fail_file($username) {
        return rl_cache_dir() . '/fail_' . md5('lf:' . $username) . '.json';
    }
}
if (!function_exists('too_many_fails')) {
    function too_many_fails($username, $max = 5, $window = 900) {
        $file = login_fail_file($username);
        if (!is_file($file)) return false;
        $data = @json_decode(@file_get_contents($file), true);
        if (!is_array($data)) return false;
        if ((time() - (int)($data['start'] ?? 0)) >= $window) return false;
        return (int)($data['count'] ?? 0) >= $max;
    }
}
if (!function_exists('register_login_fail')) {
    function register_login_fail($username) {
        $file = login_fail_file($username);
        $now = time();
        $data = is_file($file) ? @json_decode(@file_get_contents($file), true) : null;
        if (!is_array($data) || ($now - (int)($data['start'] ?? 0)) >= 900) {
            $data = ['start' => $now, 'count' => 1];
        } else {
            $data['count'] = (int)($data['count'] ?? 0) + 1;
        }
        @file_put_contents($file, json_encode($data), LOCK_EX);
    }
}
if (!function_exists('reset_login_fails')) {
    function reset_login_fails($username) {
        @unlink(login_fail_file($username));
    }
}
