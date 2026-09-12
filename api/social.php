<?php
/**
 * social.php — 好友 / 歌曲分享 API
 *
 * 所有操作需登录（X-Auth-Token）。
 *   action=search       搜索用户（username 或 uid）
 *   action=addFriend    添加好友（双向）
 *   action=removeFriend 删除好友（双向）
 *   action=listFriends  好友列表（含在线状态）
 *   action=share        分享歌曲给好友
 *   action=listShares   收到的分享
 *   action=heartbeat    更新最后活跃时间（在线状态心跳）
 */

require_once __DIR__ . '/config.php';

// 防止大歌单/大分享数据被默认 max_input_vars 截断
@ini_set('max_input_vars', '5000');
@ini_set('post_max_size', '16M');

function ensureSocialTables() {
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS `friends` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `user_id` INT UNSIGNED NOT NULL,
      `friend_id` INT UNSIGNED NOT NULL,
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uk_friend` (`user_id`, `friend_id`),
      KEY `idx_user` (`user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    $pdo->exec("CREATE TABLE IF NOT EXISTS `song_shares` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `from_user` INT UNSIGNED NOT NULL,
      `to_user` INT UNSIGNED NOT NULL,
      `song_id` VARCHAR(64) NOT NULL,
      `song_data` MEDIUMTEXT NOT NULL,
      `message` VARCHAR(200) DEFAULT '',
      `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (`id`),
      KEY `idx_to` (`to_user`),
      KEY `idx_from` (`from_user`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // users 表补 last_active 列
    $cols = [];
    try {
        $stmt = $pdo->query('SHOW COLUMNS FROM users');
        foreach ($stmt->fetchAll() as $c) $cols[] = $c['Field'];
    } catch (Exception $e) { return; }
    if (!in_array('last_active', $cols, true)) {
        try { $pdo->exec('ALTER TABLE users ADD COLUMN `last_active` DATETIME DEFAULT NULL'); } catch (Exception $e) {}
    }
}
ensureSocialTables();

$action = $_GET['action'] ?? (readBody()['action'] ?? '');
$user = authUser();
if (!$user) respond(['ok' => false, 'error' => '未登录'], 401);
$uid = (int)$user['id'];

switch ($action) {
    case 'search':       handleSearch($uid); break;
    case 'addFriend':    handleAddFriend($uid); break;
    case 'removeFriend': handleRemoveFriend($uid); break;
    case 'listFriends':  handleListFriends($uid); break;
    case 'share':        handleShare($uid); break;
    case 'listShares':   handleListShares($uid); break;
    case 'heartbeat':    handleHeartbeat($uid); break;
    case 'viewProfile':  handleViewProfile($uid); break;
    case 'listOnline':   handleListOnline($uid); break;
    default:             respond(['ok' => false, 'error' => '未知操作'], 400);
}

// 把用户行转成公开资料（按 privacy 过滤；full=true 时附详细资料）
function publicUser($r, $viewerId = 0, $full = false) {
    $lastActive = $r['last_active'] ?? null;
    $online = false;
    if ($lastActive) {
        $t = strtotime($lastActive);
        $online = $t && (time() - $t) < 300; // 5 分钟内视为在线
    }
    $id = (int)$r['id'];
    $privacy = (int)($r['privacy'] ?? 0);
    $isSelf = ($viewerId > 0 && $viewerId === $id);
    $isFriend = $isSelf;
    if (!$isFriend && $viewerId > 0) {
        $pdo = db();
        $f = $pdo->prepare('SELECT 1 FROM friends WHERE user_id = ? AND friend_id = ?');
        $f->execute([$viewerId, $id]);
        $isFriend = (bool)$f->fetch();
    }
    // 隐私档：0=公开，1=仅好友，2=私密
    $showUid = $isSelf || $isFriend || $privacy === 0;
    $showDetail = $isSelf || $isFriend || $privacy === 0;

    $out = [
        'id'        => $id,
        'username'  => $r['username'] ?? '',
        'nickname'  => $r['nickname'] ?? '',
        'avatar'    => $r['avatar'] ?? '',
        'lastActive'=> $lastActive ? date('Y-m-d H:i:s', strtotime($lastActive)) : '',
        'online'    => $online,
    ];
    if ($showUid) $out['uid'] = isset($r['uid']) && $r['uid'] ? (string)$r['uid'] : '';
    if ($full && $showDetail) {
        $out['gender']    = $r['gender'] ?? '';
        $out['age']       = isset($r['age']) && $r['age'] ? (int)$r['age'] : null;
        $out['hobby']     = $r['hobby'] ?? '';
        $out['signature'] = $r['signature'] ?? '';
        $out['region']    = $r['region'] ?? '';
        $out['interests'] = $r['interests'] ?? '';
    }
    return $out;
}

// ---- 在线用户列表（最近 5 分钟活跃，按隐私过滤） ----
function handleListOnline($uid) {
    $pdo = db();
    $stmt = $pdo->query('SELECT id, username, uid, nickname, avatar, privacy, last_active FROM users WHERE last_active > (NOW() - INTERVAL 5 MINUTE) ORDER BY last_active DESC LIMIT 50');
    $data = [];
    foreach ($stmt->fetchAll() as $r) $data[] = publicUser($r, $uid);
    respond(['ok' => true, 'data' => $data, 'ts' => time()]);
}

// ---- 查看他人资料（按隐私过滤） ----
function handleViewProfile($uid) {
    $body = readBody();
    $targetId = intval($body['id'] ?? $_GET['id'] ?? 0);
    $targetUid = trim((string)($body['uid'] ?? $_GET['uid'] ?? ''));
    $pdo = db();
    if ($targetId > 0) {
        $stmt = $pdo->prepare('SELECT id, username, uid, nickname, avatar, gender, age, hobby, signature, region, interests, privacy, last_active FROM users WHERE id = ?');
        $stmt->execute([$targetId]);
    } else {
        $stmt = $pdo->prepare('SELECT id, username, uid, nickname, avatar, gender, age, hobby, signature, region, interests, privacy, last_active FROM users WHERE uid = ?');
        $stmt->execute([$targetUid]);
    }
    $r = $stmt->fetch();
    if (!$r) respond(['ok' => false, 'error' => '用户不存在'], 404);
    respond(['ok' => true, 'profile' => publicUser($r, $uid, true)]);
}

// ---- 搜索用户（用户名或 UID） ----
function handleSearch($uid) {
    $q = trim((string)(readBody()['q'] ?? $_GET['q'] ?? ''));
    if ($q === '') respond(['ok' => false, 'error' => '请输入用户名或 UID'], 400);
    if (mb_strlen($q) > 32) respond(['ok' => false, 'error' => '搜索词过长'], 400);

    $pdo = db();
    $like = '%' . $q . '%';
    $stmt = $pdo->prepare('SELECT id, username, uid, nickname, avatar, privacy, last_active FROM users
        WHERE id != ? AND (username LIKE ? OR uid = ?)
        ORDER BY id ASC LIMIT 20');
    $stmt->execute([$uid, $like, $q]);
    $rows = $stmt->fetchAll();

    // 排除已是好友的
    $friendIds = [];
    $fstmt = $pdo->prepare('SELECT friend_id FROM friends WHERE user_id = ?');
    $fstmt->execute([$uid]);
    foreach ($fstmt->fetchAll() as $f) $friendIds[] = (int)$f['friend_id'];

    $data = [];
    foreach ($rows as $r) {
        $pu = publicUser($r, $uid);
        $pu['isFriend'] = in_array($pu['id'], $friendIds, true);
        $data[] = $pu;
    }
    respond(['ok' => true, 'data' => $data]);
}

// ---- 添加好友（双向） ----
function handleAddFriend($uid) {
    $body = readBody();
    $friendUid = isset($body['uid']) ? trim((string)$body['uid']) : '';
    $friendId = isset($body['id']) ? intval($body['id']) : 0;

    $pdo = db();
    if ($friendId > 0) {
        $stmt = $pdo->prepare('SELECT id FROM users WHERE id = ?');
        $stmt->execute([$friendId]);
    } else {
        $stmt = $pdo->prepare('SELECT id FROM users WHERE uid = ?');
        $stmt->execute([$friendUid]);
    }
    $fr = $stmt->fetch();
    if (!$fr) respond(['ok' => false, 'error' => '用户不存在'], 404);
    $fid = (int)$fr['id'];
    if ($fid === $uid) respond(['ok' => false, 'error' => '不能添加自己为好友'], 400);

    try {
        $ins = $pdo->prepare('INSERT IGNORE INTO friends (user_id, friend_id) VALUES (?, ?)');
        $ins->execute([$uid, $fid]);
        $ins->execute([$fid, $uid]);
    } catch (Exception $e) {
        respond(['ok' => false, 'error' => '添加失败，请重试'], 500);
    }
    respond(['ok' => true]);
}

// ---- 删除好友（双向） ----
function handleRemoveFriend($uid) {
    $body = readBody();
    $friendId = intval($body['id'] ?? 0);
    if ($friendId <= 0) respond(['ok' => false, 'error' => '缺少好友 id'], 400);

    $pdo = db();
    $pdo->prepare('DELETE FROM friends WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)')
        ->execute([$uid, $friendId, $friendId, $uid]);
    respond(['ok' => true]);
}

// ---- 好友列表（含在线状态） ----
function handleListFriends($uid) {
    $pdo = db();
    $stmt = $pdo->prepare('SELECT u.id, u.username, u.uid, u.nickname, u.avatar, u.privacy, u.last_active
        FROM friends f JOIN users u ON u.id = f.friend_id
        WHERE f.user_id = ? ORDER BY u.last_active DESC, u.id ASC');
    $stmt->execute([$uid]);
    $data = [];
    foreach ($stmt->fetchAll() as $r) $data[] = publicUser($r, $uid);
    respond(['ok' => true, 'data' => $data]);
}

// ---- 分享歌曲 ----
function handleShare($uid) {
    $body = readBody();
    $toId = intval($body['toId'] ?? 0);
    $song = $body['song'] ?? null;
    $message = mb_substr(trim((string)($body['message'] ?? '')), 0, 200);

    if ($toId <= 0) respond(['ok' => false, 'error' => '缺少好友 id'], 400);
    if (!is_array($song) || empty($song['id']) || empty($song['title'])) {
        respond(['ok' => false, 'error' => '歌曲信息不完整'], 400);
    }

    $pdo = db();
    // 校验是好友
    $fstmt = $pdo->prepare('SELECT id FROM friends WHERE user_id = ? AND friend_id = ?');
    $fstmt->execute([$uid, $toId]);
    if (!$fstmt->fetch()) respond(['ok' => false, 'error' => '只能分享给好友'], 403);

    $songId = mb_substr((string)$song['id'], 0, 64);
    $songData = json_encode($song, JSON_UNESCAPED_UNICODE);
    if ($songData === false) respond(['ok' => false, 'error' => '歌曲数据序列化失败'], 500);

    $ins = $pdo->prepare('INSERT INTO song_shares (from_user, to_user, song_id, song_data, message) VALUES (?, ?, ?, ?, ?)');
    $ins->execute([$uid, $toId, $songId, $songData, $message]);
    respond(['ok' => true]);
}

// ---- 收到的分享 ----
function handleListShares($uid) {
    $pdo = db();
    $stmt = $pdo->prepare('SELECT s.id, s.song_id, s.song_data, s.message, s.created_at, u.username, u.nickname, u.avatar
        FROM song_shares s JOIN users u ON u.id = s.from_user
        WHERE s.to_user = ? ORDER BY s.id DESC LIMIT 100');
    $stmt->execute([$uid]);
    $data = [];
    foreach ($stmt->fetchAll() as $r) {
        $song = json_decode($r['song_data'], true);
        if (!is_array($song)) $song = ['id' => $r['song_id'], 'title' => '未知歌曲'];
        $data[] = [
            'id'      => (int)$r['id'],
            'from'    => ['username' => $r['username'], 'nickname' => $r['nickname'], 'avatar' => $r['avatar']],
            'song'    => $song,
            'message' => $r['message'] ?? '',
            'time'    => $r['created_at'],
        ];
    }
    respond(['ok' => true, 'data' => $data]);
}

// ---- 心跳：更新最后活跃时间 ----
function handleHeartbeat($uid) {
    $pdo = db();
    $pdo->prepare('UPDATE users SET last_active = NOW() WHERE id = ?')->execute([$uid]);
    respond(['ok' => true]);
}
