<?php
/**
 * mail.php — SMTP 发信模块（纯 PHP 实现，无需 PHPMailer）
 * 
 * 支持 465 端口（SSL）和 587 端口（STARTTLS）。
 * 用于二次验证登录时发送验证码邮件。
 * 
 * 依赖：api/config.php 中的 SMTP_* 常量
 */

require_once __DIR__ . '/config.php';

/**
 * 发送一封 HTML 邮件
 * @param string $to      收件人邮箱
 * @param string $subject 主题
 * @param string $html    正文（HTML）
 * @return array [ok => bool, error => string]
 */
function sendMail($to, $subject, $html) {
    $host = SMTP_HOST;
    $port = SMTP_PORT;
    $user = SMTP_USER;
    $pass = SMTP_PASS;
    $fromName = SMTP_FROM_NAME;

    // 未配置 SMTP 时明确报错
    if (empty($user) || strpos($user, '@') === false || strpos($pass, '你的') === 0) {
        return ['ok' => false, 'error' => 'SMTP 邮箱未配置，请在 api/config.php 中填写发信邮箱和授权码'];
    }

    // 连接（465 用 SSL，587 用明文后 STARTTLS）
    $useSSL = ($port == 465);
    $scheme = $useSSL ? 'ssl://' : '';
    $ctx = stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);

    $fp = @stream_socket_client($scheme . $host . ':' . $port, $errno, $errstr, 15, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) {
        return ['ok' => false, 'error' => "SMTP 连接失败($errno): $errstr"];
    }
    stream_set_timeout($fp, 15);

    $read = function () use ($fp) {
        $data = '';
        while ($line = fgets($fp, 512)) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break; // "250 " 结束
        }
        return $data;
    };

    $write = function ($cmd) use ($fp) {
        fwrite($fp, $cmd . "\r\n");
    };

    try {
        $read(); // 220
        $write('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
        $read();

        // 587 端口需要 STARTTLS
        if ($port == 587) {
            $write('STARTTLS');
            $read();
            if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
                fclose($fp);
                return ['ok' => false, 'error' => 'STARTTLS 协商失败'];
            }
            $write('EHLO ' . ($_SERVER['SERVER_NAME'] ?? 'localhost'));
            $read();
        }

        // 登录认证
        $write('AUTH LOGIN');
        $read();
        $write(base64_encode($user));
        $read();
        $write(base64_encode($pass));
        $authResp = $read();
        if (strpos($authResp, '235') === false) {
            fclose($fp);
            return ['ok' => false, 'error' => 'SMTP 认证失败，请检查邮箱和授权码'];
        }

        // 发件人 / 收件人
        $write('MAIL FROM:<' . $user . '>');
        $read();
        $write('RCPT TO:<' . $to . '>');
        $read();

        // 邮件内容
        $write('DATA');
        $read();

        $headers = [
            'From: =?UTF-8?B?' . base64_encode($fromName) . '?= <' . $user . '>',
            'To: <' . $to . '>',
            'Subject: =?UTF-8?B?' . base64_encode($subject) . '?=',
            'MIME-Version: 1.0',
            'Content-Type: text/html; charset=utf-8',
            'Content-Transfer-Encoding: base64',
            'Date: ' . date('r'),
        ];
        $body = implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($html));

        $write($body);
        $write('.');
        $read();

        $write('QUIT');
        fclose($fp);
        return ['ok' => true];
    } catch (Exception $e) {
        if (is_resource($fp)) fclose($fp);
        return ['ok' => false, 'error' => 'SMTP 发送异常: ' . $e->getMessage()];
    }
}
