<?php
/**
 * upload.php — 头像图片上传
 *
 * 请求：POST multipart/form-data，字段名 file
 * 响应：{ ok: true, url: "uploads/avatars/xxx.jpg" } 或错误
 * 限制：仅 JPG/PNG/GIF/WebP，≤2MB，需登录
 */

require_once __DIR__ . '/config.php';

// 要求登录
$user = authUser();
if (!$user) respond(['ok' => false, 'error' => '未登录'], 401);

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(['ok' => false, 'error' => '仅支持 POST 请求'], 405);
}

if (empty($_FILES['file'])) {
    respond(['ok' => false, 'error' => '未收到文件'], 400);
}

$f = $_FILES['file'];
if ($f['error'] !== UPLOAD_ERR_OK) {
    respond(['ok' => false, 'error' => '上传失败（错误码 ' . $f['error'] . '）'], 400);
}

// 大小限制 2MB
if ($f['size'] > 2 * 1024 * 1024) {
    respond(['ok' => false, 'error' => '图片不能超过 2MB'], 400);
}

// MIME 类型校验（用真实文件内容判断，不信任扩展名）
$allowed = [
    'image/jpeg' => 'jpg',
    'image/png'  => 'png',
    'image/gif'  => 'gif',
    'image/webp' => 'webp',
];
$finfo = function_exists('finfo_open') ? finfo_open(FILEINFO_MIME_TYPE) : null;
$mime = $finfo ? finfo_file($finfo, $f['tmp_name']) : ($f['type'] ?? '');
if ($finfo) finfo_close($finfo);
if (!isset($allowed[$mime])) {
    respond(['ok' => false, 'error' => '仅支持 JPG/PNG/GIF/WebP 格式图片'], 400);
}

// 保存目录（htdocs/uploads/avatars）
$dir = __DIR__ . '/../uploads/avatars';
if (!is_dir($dir)) {
    @mkdir($dir, 0755, true);
}
if (!is_dir($dir)) {
    respond(['ok' => false, 'error' => '服务器无法创建上传目录'], 500);
}

// 随机文件名（防止覆盖与路径注入）
$ext = $allowed[$mime];
$name = 'av_' . (int)$user['id'] . '_' . bin2hex(random_bytes(8)) . '.' . $ext;
$dest = $dir . '/' . $name;

if (!move_uploaded_file($f['tmp_name'], $dest)) {
    respond(['ok' => false, 'error' => '保存文件失败'], 500);
}

// 返回相对 htdocs 的 URL（前端可直接引用）
$url = 'uploads/avatars/' . $name;
respond(['ok' => true, 'url' => $url]);
