<?php
/**
 * config.example.php — 数据库连接配置模板
 *
 * 使用方法：
 *   1. 复制本文件为 config.php：  cp config.example.php config.php
 *   2. 填写下方你自己的数据库与邮箱信息。
 *   3. config.php 已被 .gitignore 排除，不会被提交到仓库。
 *
 * ⚠️ 请勿把真实的 config.php 提交到公开仓库，以免泄露数据库密码。
 */

// ---- 数据库配置（改成你自己的 InfinityFree 数据库信息）----
define('DB_HOST', 'sqlXXX.infinityfree.com');
define('DB_NAME', 'your_db_name');
define('DB_USER', 'your_db_user');
define('DB_PASS', 'your_db_password');

// ---- SMTP 邮箱配置（二次验证发信用）----
define('SMTP_HOST', 'smtp.qq.com');
define('SMTP_PORT', 465);
define('SMTP_USER', 'your_email@qq.com');
define('SMTP_PASS', 'your_smtp_authorization_code');
define('SMTP_FROM_NAME', 'Wave 音乐播放器');

// ---- 通用配置 ----
define('SESSION_NAME', 'wave_session');
define('API_VERSION', '1.0');

// 允许跨域（同源部署可去掉，保留也无害）
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
// 统一 JSON 输出
header('Content-Type: application/json; charset=utf-8');

// ---- 数据库连接（PDO，异常模式）----
function db() {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = 'mysql:host=' . DB_HOST . ';dbname=' . DB_NAME . ';charset=utf8mb4';
        try {
            $pdo = new PDO($dsn, DB_USER, DB_PASS, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => false,
            ]);
        } catch (PDOException $e) {
            respond(['ok' => false, 'error' => '数据库连接失败：请检查 api/config.php 配置'], 500);
        }
    }
    return $pdo;
}

// ---- 统一响应 ----
function respond($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// ---- 读取 JSON 请求体 ----
function readBody() {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true);
    return is_array($data) ? $data : [];
}

// ---- 提取认证 token ----
function getToken() {
    $headers = function_exists('getallheaders') ? getallheaders() : [];
    $h = [];
    foreach ($headers as $k => $v) $h[strtolower($k)] = $v;
    return $h['x-auth-token'] ?? ($_SERVER['HTTP_X_AUTH_TOKEN'] ?? '');
}

// ---- 根据 token 获取当前用户（未登录返回 null）----
function authUser() {
    $token = getToken();
    if (!$token) return null;
    $pdo = db();
    $stmt = $pdo->prepare('SELECT id, username FROM users WHERE token = ?');
    $stmt->execute([$token]);
    return $stmt->fetch() ?: null;
}
