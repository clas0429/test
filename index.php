<?php
declare(strict_types=1);
// Teaching sample: use fictional data only. Credentials come from the platform.
session_start();
$_SESSION['visits'] = ($_SESSION['visits'] ?? 0) + 1;
$_SESSION['csrf'] ??= bin2hex(random_bytes(24));
function text(string $value): string { return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
try {
    $database = new PDO('mysql:host=' . getenv('DB_HOST') . ';port=' . getenv('DB_PORT') . ';dbname=' . getenv('DB_NAME') . ';charset=utf8mb4', getenv('DB_USER'), getenv('DB_PASSWORD'), [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT => 3]);
    $database->exec('CREATE TABLE IF NOT EXISTS php_notes (id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, message VARCHAR(200) NOT NULL)');
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!isset($_POST['csrf']) || !is_string($_POST['csrf']) || !hash_equals($_SESSION['csrf'], $_POST['csrf'])) { http_response_code(403); exit('表單已過期，請重新整理。'); }
        $message = $_POST['message'] ?? '';
        if (!is_string($message) || mb_strlen(trim($message)) < 1 || mb_strlen(trim($message)) > 200) { http_response_code(422); exit('請輸入 1–200 字。'); }
        if ((int)$database->query('SELECT count(*) FROM php_notes')->fetchColumn() >= 100) { http_response_code(409); exit('範例最多 100 筆。'); }
        $database->prepare('INSERT INTO php_notes(message) VALUES(?)')->execute([trim($message)]);
        header('Location: /', true, 303);
        exit;
    }
    $notes = $database->query('SELECT id,message FROM php_notes ORDER BY id DESC LIMIT 100')->fetchAll(PDO::FETCH_ASSOC);
} catch (Throwable $error) {
    http_response_code(503);
    exit('資料庫尚未就緒，請確認平台已建立個人 MariaDB，再重新部署。');
}
?>
<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>我的 PHP 與 MariaDB</title><style>body{max-width:780px;margin:40px auto;padding:24px;font:18px/1.7 system-ui;background:#f5f7fc;color:#18304c}main{background:white;padding:28px;border-radius:14px}input{width:95%;padding:12px;font:inherit}button{margin-top:14px;padding:10px 20px;border:0;border-radius:8px;background:#1f58a8;color:white;font:inherit}li{padding:12px;border-bottom:1px solid #dae2ee}small{color:#56667c}</style></head><body><main>
<h1>我的 PHP 與 MariaDB</h1><p>PHP 程式已部署，資料儲存在自己的 MariaDB。</p>
<p>Session 連續瀏覽次數：<strong><?= (int)$_SESSION['visits'] ?></strong></p>
<form method="post" action="/"><input type="hidden" name="csrf" value="<?= text($_SESSION['csrf']) ?>"><label>新增訊息 <input name="message" maxlength="200" required autocomplete="off"></label><button>儲存到 MariaDB</button></form>
<h2>已儲存的訊息</h2><ul><?php foreach ($notes as $note): ?><li><?= text($note['message']) ?></li><?php endforeach; ?></ul>
<p><small>SQL 資料可從平台的「我的 MariaDB／phpMyAdmin」管理，重新部署程式後仍保留。程式 Session 是短效預覽狀態，重開預覽或重新部署後需重新建立。</small></p>
</main></body></html>
