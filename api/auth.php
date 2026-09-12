<?php
/**
 * auth.php — 认证 API（注册 / 登录二次验证 / 登出 / 当前用户）
 *
 * 请求方式：POST，Content-Type: application/json
 * 参数（JSON body）：
 *   注册：{ "action": "register", "username", "password", "email" }
 *   登录第一步：{ "action": "login", "username", "password" }
 *       → 密码正确则发验证码邮件，返回 { ok, needVerify, userId }
 *   登录第二步：{ "action": "verify", "userId", "code" }
 *       → 验证码正确则返回 { ok, token, username }
 *   登出：{ "action": "logout" }
 *   当前用户：{ "action": "me" }
 */

require_once __DIR__ . '/config.php';
require_once __DIR__ . '/mail.php';

$action = $_GET['action'] ?? '';
if (empty($action)) {
    $body = readBody();
    $action = $body['action'] ?? '';
}

// 确保 users 表包含个人资料字段（自动迁移，无需手动执行 SQL）
ensureProfileColumns();

switch ($action) {
    case 'register':      handleRegister(); break;
    case 'login':         handleLoginStep1(); break;
    case 'verify':        handleLoginStep2(); break;
    case 'logout':        handleLogout(); break;
    case 'me':            handleMe(); break;
    case 'profile':       handleMe(); break;
    case 'updateProfile': handleUpdateProfile(); break;
    default:              respond(['ok' => false, 'error' => '未知操作'], 400);
}

// ---- 自动迁移：为 users 表补充个人资料列 ----
function ensureProfileColumns() {
    $pdo = db();
    $cols = [];
    try {
        $stmt = $pdo->query('SHOW COLUMNS FROM users');
        foreach ($stmt->fetchAll() as $c) $cols[] = $c['Field'];
    } catch (Exception $e) { return; }

    $defs = [
        'uid'       => 'BIGINT UNSIGNED DEFAULT NULL',
        'nickname'  => 'VARCHAR(32) DEFAULT NULL',
        'avatar'    => 'VARCHAR(512) DEFAULT NULL',
        'gender'    => 'VARCHAR(16) DEFAULT NULL',
        'age'       => 'TINYINT UNSIGNED DEFAULT NULL',
        'hobby'     => 'VARCHAR(255) DEFAULT NULL',
        'signature' => 'VARCHAR(200) DEFAULT NULL',
        'region'    => 'VARCHAR(64) DEFAULT NULL',
        'privacy'   => 'TINYINT UNSIGNED DEFAULT 0',
        'interests' => 'VARCHAR(255) DEFAULT NULL',
        'vip'       => 'TINYINT UNSIGNED DEFAULT 0',
    ];
    foreach ($defs as $name => $def) {
        if (!in_array($name, $cols, true)) {
            try { $pdo->exec("ALTER TABLE users ADD COLUMN `$name` $def"); } catch (Exception $e) {}
        }
    }
    // 为存量用户补齐 UID（10000000 + 自增 id）
    try { $pdo->exec('UPDATE users SET uid = 10000000 + id WHERE uid IS NULL'); } catch (Exception $e) {}
}

// ---- 数据库行 → 前端资料对象 ----
function profileRow($r) {
    return [
        'id'        => (int)($r['id'] ?? 0),
        'uid'       => isset($r['uid']) && $r['uid'] ? (string)$r['uid'] : '',
        'username'  => $r['username'] ?? '',
        'email'     => !empty($r['email']) ? maskEmail($r['email']) : '',
        'nickname'  => $r['nickname'] ?? '',
        'avatar'    => $r['avatar'] ?? '',
        'gender'    => $r['gender'] ?? '',
        'age'       => isset($r['age']) && $r['age'] ? (int)$r['age'] : null,
        'hobby'     => $r['hobby'] ?? '',
        'signature' => $r['signature'] ?? '',
        'region'    => $r['region'] ?? '',
        'privacy'   => (int)($r['privacy'] ?? 0),
        'interests' => $r['interests'] ?? '',
        'vip'       => (int)($r['vip'] ?? 0),
    ];
}

// ---- 注册（绑定邮箱） ----
function handleRegister() {
    $body = readBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';
    $email    = trim($body['email'] ?? '');

    if (mb_strlen($username) < 3) respond(['ok' => false, 'error' => '用户名至少 3 个字符'], 400);
    if (strlen($password) < 4)  respond(['ok' => false, 'error' => '密码至少 4 个字符'], 400);
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) respond(['ok' => false, 'error' => '邮箱格式不正确'], 400);

    $pdo = db();
    $hash = password_hash($password, PASSWORD_BCRYPT);
    $token = bin2hex(random_bytes(32));

    try {
        $stmt = $pdo->prepare('INSERT INTO users (username, password_hash, email, token) VALUES (?, ?, ?, ?)');
        $stmt->execute([$username, $hash, $email, $token]);
        // 生成 8 位 UID（10000000 + 自增 id）
        $newId = (int)$pdo->lastInsertId();
        $uid = 10000000 + $newId;
        $pdo->prepare('UPDATE users SET uid = ? WHERE id = ?')->execute([$uid, $newId]);
    } catch (PDOException $e) {
        if ($e->getCode() == 23000) {
            respond(['ok' => false, 'error' => '该用户名已被注册'], 409);
        }
        respond(['ok' => false, 'error' => '注册失败，请稍后重试'], 500);
    }

    respond(['ok' => true, 'token' => $token, 'username' => $username, 'uid' => (string)$uid]);
}

// ---- 登录第一步：验证密码 + 发送验证码 ----
function handleLoginStep1() {
    $body = readBody();
    $username = trim($body['username'] ?? '');
    $password = $body['password'] ?? '';

    $pdo = db();
    $stmt = $pdo->prepare('SELECT id, username, password_hash, email FROM users WHERE username = ?');
    $stmt->execute([$username]);
    $user = $stmt->fetch();

    if (!$user || !password_verify($password, $user['password_hash'])) {
        respond(['ok' => false, 'error' => '用户名或密码错误'], 401);
    }

    // 未绑定邮箱则无法二次验证
    if (empty($user['email'])) {
        respond(['ok' => false, 'error' => '该账号未绑定邮箱，请联系管理员'], 400);
    }

    // 生成 6 位验证码
    $code = str_pad((string)random_int(0, 999999), 6, '0', STR_PAD_LEFT);
    $expiresAt = date('Y-m-d H:i:s', time() + 300); // 5 分钟有效

    // 清除旧的验证码
    $pdo->prepare('DELETE FROM verify_codes WHERE user_id = ?')->execute([$user['id']]);
    // 保存新验证码
    $pdo->prepare('INSERT INTO verify_codes (user_id, code, expires_at) VALUES (?, ?, ?)')
        ->execute([$user['id'], $code, $expiresAt]);

    // 发送验证码邮件
    $mailBody = buildVerifyEmail($user['username'], $code);
    $sent = sendMail($user['email'], '【Wave】登录验证码 ' . $code, $mailBody);

    if (!$sent['ok']) {
        respond(['ok' => false, 'error' => '验证码发送失败：' . $sent['error']], 500);
    }

    // 不返回 token，等待第二步验证
    respond(['ok' => true, 'needVerify' => true, 'userId' => $user['id'], 'maskedEmail' => maskEmail($user['email'])]);
}

// ---- 登录第二步：验证验证码 ----
function handleLoginStep2() {
    $body = readBody();
    $userId = intval($body['userId'] ?? 0);
    $code = trim($body['code'] ?? '');

    if (!$userId || !preg_match('/^\d{6}$/', $code)) {
        respond(['ok' => false, 'error' => '验证码格式不正确'], 400);
    }

    $pdo = db();
    $stmt = $pdo->prepare('SELECT id, username FROM users WHERE id = ?');
    $stmt->execute([$userId]);
    $user = $stmt->fetch();
    if (!$user) respond(['ok' => false, 'error' => '用户不存在'], 404);

    // 验证码校验
    $vstmt = $pdo->prepare('SELECT code, expires_at FROM verify_codes WHERE user_id = ? ORDER BY id DESC LIMIT 1');
    $vstmt->execute([$userId]);
    $record = $vstmt->fetch();

    if (!$record || $record['code'] !== $code) {
        respond(['ok' => false, 'error' => '验证码错误'], 401);
    }
    if (strtotime($record['expires_at']) < time()) {
        respond(['ok' => false, 'error' => '验证码已过期，请重新获取'], 401);
    }

    // 清除已使用的验证码
    $pdo->prepare('DELETE FROM verify_codes WHERE user_id = ?')->execute([$userId]);

    // 签发 token
    $token = bin2hex(random_bytes(32));
    $pdo->prepare('UPDATE users SET token = ? WHERE id = ?')->execute([$token, $userId]);

    respond(['ok' => true, 'token' => $token, 'username' => $user['username']]);
}

// ---- 登出 ----
function handleLogout() {
    $token = getToken();
    if ($token) {
        $pdo = db();
        $pdo->prepare('UPDATE users SET token = NULL WHERE token = ?')->execute([$token]);
    }
    respond(['ok' => true]);
}

// ---- 当前用户 / 个人资料 ----
function handleMe() {
    $user = authUser();
    if (!$user) respond(['ok' => false, 'error' => '未登录'], 401);
    $pdo = db();
    $stmt = $pdo->prepare('SELECT id, username, email, uid, nickname, avatar, gender, age, hobby, signature, region, privacy, interests, vip, created_at FROM users WHERE id = ?');
    $stmt->execute([$user['id']]);
    $full = $stmt->fetch();
    if (!$full) respond(['ok' => false, 'error' => '用户不存在'], 404);
    respond(['ok' => true, 'profile' => profileRow($full)]);
}

// ---- 更新个人资料 ----
function handleUpdateProfile() {
    $user = authUser();
    if (!$user) respond(['ok' => false, 'error' => '未登录'], 401);

    $body = readBody();
    $fields = ['nickname', 'avatar', 'gender', 'age', 'hobby', 'signature', 'region', 'privacy', 'interests'];
    $sets = [];
    $vals = [];

    // 校验并收集可更新字段
    if (array_key_exists('nickname', $body)) {
        $v = trim((string)($body['nickname'] ?? ''));
        if (mb_strlen($v) > 32) respond(['ok' => false, 'error' => '昵称最多 32 个字符'], 400);
        $sets[] = 'nickname = ?'; $vals[] = $v;
    }
    if (array_key_exists('avatar', $body)) {
        $v = trim((string)($body['avatar'] ?? ''));
        if (mb_strlen($v) > 512) respond(['ok' => false, 'error' => '头像地址过长'], 400);
        $sets[] = 'avatar = ?'; $vals[] = $v;
    }
    if (array_key_exists('gender', $body)) {
        $v = trim((string)($body['gender'] ?? ''));
        if (!in_array($v, ['male', 'female', 'secret', ''], true)) respond(['ok' => false, 'error' => '性别取值不合法'], 400);
        $sets[] = 'gender = ?'; $vals[] = $v;
    }
    if (array_key_exists('age', $body)) {
        $v = $body['age'];
        if ($v === null || $v === '') { $sets[] = 'age = NULL'; }
        else {
            $n = intval($v);
            if ($n < 1 || $n > 150) respond(['ok' => false, 'error' => '年龄需在 1~150 之间'], 400);
            $sets[] = 'age = ?'; $vals[] = $n;
        }
    }
    if (array_key_exists('hobby', $body)) {
        $v = trim((string)($body['hobby'] ?? ''));
        if (mb_strlen($v) > 255) respond(['ok' => false, 'error' => '爱好描述过长'], 400);
        $sets[] = 'hobby = ?'; $vals[] = $v;
    }
    if (array_key_exists('signature', $body)) {
        $v = trim((string)($body['signature'] ?? ''));
        if (mb_strlen($v) > 200) respond(['ok' => false, 'error' => '个性签名最多 200 个字符'], 400);
        $sets[] = 'signature = ?'; $vals[] = $v;
    }
    if (array_key_exists('region', $body)) {
        $v = trim((string)($body['region'] ?? ''));
        if (mb_strlen($v) > 64) respond(['ok' => false, 'error' => '地区最多 64 个字符'], 400);
        $sets[] = 'region = ?'; $vals[] = $v;
    }
    if (array_key_exists('privacy', $body)) {
        $v = intval($body['privacy'] ?? 0);
        if (!in_array($v, [0, 1, 2], true)) respond(['ok' => false, 'error' => '隐私档位不合法'], 400);
        $sets[] = 'privacy = ?'; $vals[] = $v;
    }
    if (array_key_exists('interests', $body)) {
        $v = trim((string)($body['interests'] ?? ''));
        if (mb_strlen($v) > 255) respond(['ok' => false, 'error' => '兴趣标签过长'], 400);
        $sets[] = 'interests = ?'; $vals[] = $v;
    }

    if (empty($sets)) respond(['ok' => false, 'error' => '没有可更新的字段'], 400);

    $vals[] = $user['id'];
    $pdo = db();
    $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($vals);

    respond(['ok' => true]);
}

// ---- 工具：邮箱打码 ----
function maskEmail($email) {
    $parts = explode('@', $email);
    if (count($parts) !== 2) return $email;
    $name = $parts[0];
    $domain = $parts[1];
    if (mb_strlen($name) <= 2) return substr($name, 0, 1) . '***@' . $domain;
    return substr($name, 0, 2) . '***@' . $domain;
}

// ---- 工具：验证码邮件模板 ----
function buildVerifyEmail($username, $code) {
    $html = '<div style="max-width:480px;margin:0 auto;font-family:-apple-system,Segoe UI,PingFang SC,sans-serif;background:#0f1115;color:#e8eaf0;border-radius:16px;padding:32px;text-align:center;">'
          . '<div style="font-size:40px;margin-bottom:16px;">🎵</div>'
          . '<h2 style="margin:0 0 8px;font-size:22px;">Wave 登录验证码</h2>'
          . '<p style="color:#a0a4b2;font-size:14px;margin:0 0 24px;">你好，' . htmlspecialchars($username, ENT_QUOTES, 'UTF-8') . '，你正在进行二次验证登录</p>'
          . '<div style="font-size:36px;font-weight:800;letter-spacing:8px;color:#1DB954;background:#1a1d26;border-radius:12px;padding:20px;margin:0 0 24px;">' . $code . '</div>'
          . '<p style="color:#6b7080;font-size:12px;margin:0;">验证码 5 分钟内有效，请勿泄露给他人。</p>'
          . '</div>';
    return $html;
}
