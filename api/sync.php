<?php
/**
 * sync.php — 用户数据同步 API（收藏 / 歌单 / 播放历史）
 *
 * 采用「全量同步」策略，简单可靠：
 *   action=load  → 拉取云端全部数据（登录后调用）
 *   action=save  → 前端把本地完整数据整体推上来，服务器事务重建（每次操作后调用）
 *
 * 请求头：X-Auth-Token: <登录返回的 token>
 */

require_once __DIR__ . '/config.php';

// 防止大歌单/大 externals 同步时被 PHP 默认 max_input_vars=1000 截断
@ini_set('max_input_vars', '5000');
@ini_set('post_max_size', '16M');

// 自动建表 + 列迁移（首次使用自迁移，无需手动执行 SQL）
function ensureTables() {
    $pdo = db();
    $pdo->exec("CREATE TABLE IF NOT EXISTS `user_externals` (
      `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
      `user_id` INT UNSIGNED NOT NULL,
      `song_id` VARCHAR(64) NOT NULL,
      `data` MEDIUMTEXT NOT NULL,
      PRIMARY KEY (`id`),
      UNIQUE KEY `uk_user_song` (`user_id`, `song_id`),
      KEY `idx_user` (`user_id`)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

    // 拓宽 song_id 列（外部歌曲 id 如 qq_ + 14位 songmid 会超过 16 字符，旧表是 VARCHAR(16)）
    try {
        $stmt = $pdo->query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'favorites' AND COLUMN_NAME = 'song_id'");
        $row = $stmt ? $stmt->fetch() : false;
        $needAlter = false;
        if ($row && preg_match('/varchar\((\d+)\)/i', $row['COLUMN_TYPE'] ?? '', $m)) {
            $needAlter = intval($m[1]) < 64;
        }
        if ($needAlter) {
            $pdo->exec("ALTER TABLE `favorites` MODIFY `song_id` VARCHAR(64) NOT NULL");
            $pdo->exec("ALTER TABLE `playlist_songs` MODIFY `song_id` VARCHAR(64) NOT NULL");
            $pdo->exec("ALTER TABLE `history` MODIFY `song_id` VARCHAR(64) NOT NULL");
        }
    } catch (Exception $e) {
        // 迁移失败不阻塞同步，沿用旧行为
    }
}
ensureTables();

$action = $_GET['action'] ?? (readBody()['action'] ?? '');

$user = authUser();
if (!$user) respond(['ok' => false, 'error' => '未登录'], 401);
$uid = $user['id'];

switch ($action) {
    case 'load': handleLoad($uid); break;
    case 'save': handleSave($uid); break;
    default:     respond(['ok' => false, 'error' => '未知操作'], 400);
}

// ---- 拉取全部数据 ----
function handleLoad($uid) {
    $pdo = db();

    // 收藏
    $favs = $pdo->prepare('SELECT song_id FROM favorites WHERE user_id = ? ORDER BY id DESC');
    $favs->execute([$uid]);
    $favorites = array_column($favs->fetchAll(), 'song_id');

    // 歌单（含歌曲）
    $pls = $pdo->prepare('SELECT id, name FROM playlists WHERE user_id = ? ORDER BY id ASC');
    $pls->execute([$uid]);
    $playlists = [];
    foreach ($pls->fetchAll() as $pl) {
        $songs = $pdo->prepare('SELECT song_id FROM playlist_songs WHERE playlist_id = ? ORDER BY position ASC');
        $songs->execute([$pl['id']]);
        $playlists[] = [
            'id' => 'pl_' . $pl['id'],
            'name' => $pl['name'],
            'songIds' => array_column($songs->fetchAll(), 'song_id'),
        ];
    }

    // 历史
    $his = $pdo->prepare('SELECT song_id, weight, UNIX_TIMESTAMP(last_played) AS last FROM history WHERE user_id = ? ORDER BY last_played DESC');
    $his->execute([$uid]);
    $history = array_map(function ($r) {
        return ['id' => $r['song_id'], 'weight' => (float)$r['weight'], 'last' => (int)$r['last'] * 1000];
    }, $his->fetchAll());

    // 外部歌曲元数据（网易云/Audius/QQ 在线歌曲的封面、音频地址等）
    $ext = $pdo->prepare('SELECT song_id, data FROM user_externals WHERE user_id = ?');
    $ext->execute([$uid]);
    $externals = [];
    foreach ($ext->fetchAll() as $r) {
        $externals[$r['song_id']] = json_decode($r['data'], true);
    }

    // 个人资料（跨设备同步）
    $pf = $pdo->prepare('SELECT nickname, avatar, gender, age, hobby, signature, region, privacy, interests, vip FROM users WHERE id = ?');
    $pf->execute([$uid]);
    $profile = $pf->fetch() ?: [];

    respond(['ok' => true, 'favorites' => $favorites, 'playlists' => $playlists, 'history' => $history, 'externals' => $externals, 'profile' => $profile]);
}

// ---- 全量保存 ----
function handleSave($uid) {
    $body = readBody();
    $favorites = $body['favorites'] ?? [];
    $playlists = $body['playlists'] ?? [];
    $history   = $body['history'] ?? [];
    $externals = $body['externals'] ?? [];
    $profile   = $body['profile'] ?? null;

    if (!is_array($favorites) || !is_array($playlists) || !is_array($history) || !is_array($externals)) {
        respond(['ok' => false, 'error' => '数据格式错误'], 400);
    }

    $pdo = db();

    try {
        $pdo->beginTransaction();

        // 清空旧数据
        $pdo->prepare('DELETE FROM favorites WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM playlist_songs WHERE playlist_id IN (SELECT id FROM playlists WHERE user_id = ?)')->execute([$uid]);
        $pdo->prepare('DELETE FROM playlists WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM history WHERE user_id = ?')->execute([$uid]);
        $pdo->prepare('DELETE FROM user_externals WHERE user_id = ?')->execute([$uid]);

        // 写入收藏
        $insFav = $pdo->prepare('INSERT INTO favorites (user_id, song_id) VALUES (?, ?)');
        foreach (array_slice($favorites, 0, 500) as $sid) {
            $insFav->execute([$uid, $sid]);
        }

        // 写入歌单
        $insPl = $pdo->prepare('INSERT INTO playlists (user_id, name) VALUES (?, ?)');
        $insPs = $pdo->prepare('INSERT INTO playlist_songs (playlist_id, song_id, position) VALUES (?, ?, ?)');
        foreach (array_slice($playlists, 0, 100) as $pl) {
            $name = mb_substr($pl['name'] ?? '我的歌单', 0, 64);
            $insPl->execute([$uid, $name]);
            $plId = $pdo->lastInsertId();
            $songs = $pl['songIds'] ?? [];
            foreach (array_slice($songs, 0, 1000) as $i => $sid) {
                $insPs->execute([$plId, $sid, $i]);
            }
        }

        // 写入历史
        $insHis = $pdo->prepare('INSERT INTO history (user_id, song_id, weight, last_played) VALUES (?, ?, ?, FROM_UNIXTIME(?))');
        foreach (array_slice($history, 0, 500) as $h) {
            $weight = (float)($h['weight'] ?? 1);
            $last = (int)(($h['last'] ?? time() * 1000) / 1000);
            $insHis->execute([$uid, $h['id'], $weight, $last]);
        }

        // 写入个人资料（只更新允许的字段）
        if (is_array($profile)) {
            $allowed = ['nickname', 'avatar', 'gender', 'age', 'hobby', 'signature', 'region', 'privacy', 'interests'];
            $sets = []; $vals = [];
            foreach ($allowed as $k) {
                if (array_key_exists($k, $profile)) { $sets[] = "`$k` = ?"; $vals[] = $profile[$k]; }
            }
            if ($sets) { $vals[] = $uid; $pdo->prepare('UPDATE users SET ' . implode(', ', $sets) . ' WHERE id = ?')->execute($vals); }
        }

        // 写入外部歌曲元数据（限制 500 首，防爆）
        $insExt = $pdo->prepare('INSERT INTO user_externals (user_id, song_id, data) VALUES (?, ?, ?)');
        $extCount = 0;
        foreach ($externals as $sid => $song) {
            if ($extCount >= 500) break;
            if (!is_string($sid) || $sid === '' || !is_array($song)) continue;
            $insExt->execute([$uid, mb_substr($sid, 0, 64), json_encode($song, JSON_UNESCAPED_UNICODE)]);
            $extCount++;
        }

        $pdo->commit();
        respond(['ok' => true]);
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(['ok' => false, 'error' => '同步失败：' . $e->getMessage()], 500);
    }
}
