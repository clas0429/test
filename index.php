<?php
declare(strict_types=1);
require __DIR__.'/vendor/autoload.php';
use Ramsey\Uuid\Uuid;
function html(string $s): string { return htmlspecialchars($s, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8'); }
function redirect_home(): never { header('Location: /', true, 303); exit; }
try {
    if (getenv('FILES_DIR') !== '/files' || !is_dir('/files')) { throw new RuntimeException('請重新部署以啟用永久檔案。'); }
    $directory = '/files/php-web';
    if (!is_dir($directory) && !mkdir($directory, 0700)) { throw new RuntimeException('檔案空間無法使用。'); }
    $pdo = new PDO('mysql:host='.getenv('DB_HOST').';port='.getenv('DB_PORT').';dbname='.getenv('DB_NAME'), getenv('DB_USER'), getenv('DB_PASSWORD'), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT=>3]);
    $pdo->exec('CREATE TABLE IF NOT EXISTS php_web_users (id INT PRIMARY KEY AUTO_INCREMENT, login VARCHAR(40) UNIQUE NOT NULL, password_hash VARCHAR(255) NOT NULL)');
    $pdo->exec('CREATE TABLE IF NOT EXISTS php_web_files (id CHAR(36) PRIMARY KEY, owner_id INT NOT NULL, filename VARCHAR(160) NOT NULL, bytes INT NOT NULL)');
    session_start();
    $_SESSION['csrf'] ??= bin2hex(random_bytes(24));
    $error = '';
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        if (!hash_equals($_SESSION['csrf'], (string)($_POST['csrf'] ?? ''))) { http_response_code(403); exit('表單已過期，請重新整理。'); }
        $action = (string)($_POST['action'] ?? '');
        if ($action === 'register' || $action === 'login') {
            $login = (string)($_POST['login'] ?? '');
            $password = (string)($_POST['password'] ?? '');
            if (!preg_match('/^[A-Za-z0-9_-]{3,40}$/D', $login) || strlen($password) < 8 || strlen($password) > 128) { throw new RuntimeException('帳號需為3–40個英數字，密碼至少8字元。'); }
            if ($action === 'register') {
                try { $pdo->prepare('INSERT INTO php_web_users (login,password_hash) VALUES (?,?)')->execute([$login, password_hash($password, PASSWORD_DEFAULT)]); }
                catch (PDOException $e) { throw new RuntimeException('此帳號無法註冊，請改用其他帳號。'); }
            }
            $query = $pdo->prepare('SELECT id,password_hash FROM php_web_users WHERE login=?');
            $query->execute([$login]); $user = $query->fetch(PDO::FETCH_ASSOC);
            if (!$user || !password_verify($password, $user['password_hash'])) { throw new RuntimeException('帳號或密碼不正確。'); }
            session_regenerate_id(true); $_SESSION['user'] = (int)$user['id']; $_SESSION['login'] = $login;
            redirect_home();
        }
        if ($action === 'logout') { unset($_SESSION['user'], $_SESSION['login']); session_regenerate_id(true); redirect_home(); }
        if (empty($_SESSION['user'])) { http_response_code(401); exit('請先登入。'); }
        if ($action === 'upload') {
            $file = $_FILES['attachment'] ?? null;
            if (!$file || $file['error'] !== UPLOAD_ERR_OK || $file['size'] > 7*1024*1024) { throw new RuntimeException('請選擇7 MiB以下的檔案。'); }
            $id = Uuid::uuid4()->toString();
            if (!move_uploaded_file($file['tmp_name'], $directory.'/'.$id)) { throw new RuntimeException('檔案無法儲存，可能已達配額。'); }
            $name = mb_strcut(str_replace(["\r", "\n", "\0"], '_', basename($file['name'])), 0, 80, 'UTF-8');
            $pdo->prepare('INSERT INTO php_web_files (id,owner_id,filename,bytes) VALUES (?,?,?,?)')->execute([$id, $_SESSION['user'], $name, $file['size']]);
            $_SESSION['notice'] = '檔案已永久儲存；重新部署後仍可下載。'; redirect_home();
        }
    }
    if (isset($_GET['download'])) {
        if (empty($_SESSION['user']) || !Uuid::isValid((string)$_GET['download'])) { http_response_code(403); exit; }
        $q = $pdo->prepare('SELECT id,filename FROM php_web_files WHERE id=? AND owner_id=?'); $q->execute([$_GET['download'], $_SESSION['user']]); $file = $q->fetch(PDO::FETCH_ASSOC);
        if (!$file || !is_file($directory.'/'.$file['id'])) { http_response_code(404); exit; }
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="download.bin"; filename*=UTF-8\'\''.rawurlencode($file['filename']));
        readfile($directory.'/'.$file['id']); exit;
    }
} catch (Throwable $e) { $error = $e instanceof RuntimeException && !($e instanceof PDOException) ? $e->getMessage() : '服務暫時無法使用。'; }
?><!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>PHP 完整功能測試</title><style>body{font:17px system-ui;max-width:780px;margin:32px auto;padding:20px;background:#f3f7fc;color:#17324d}section{padding:24px;background:white;border-radius:14px;margin:16px 0}input,button{font:inherit;padding:9px;margin:5px}button{background:#176b91;color:white;border:0;border-radius:6px}</style></head><body>
<h1>PHP 登入與永久檔案</h1><p>Composer UUID 套件、PHP Session、個人 MariaDB 與 200 MB 檔案空間。</p>
<?php if (!empty($error)): ?><p role="alert"><?=html($error)?></p><?php endif ?>
<?php if (!empty($_SESSION['notice'])): ?><p role="status"><?=html($_SESSION['notice'])?></p><?php unset($_SESSION['notice']); endif ?>
<?php if (empty($_SESSION['user'])): ?><section><h2>網站帳號</h2><p>這是程式自己的帳號，與平台 Google 登入分開；請使用虛構測試資料。</p><form action="/" method="post"><input type="hidden" name="csrf" value="<?=html($_SESSION['csrf'] ?? '')?>"><label>帳號 <input name="login" required autocomplete="username"></label><br><label>密碼 <input type="password" name="password" minlength="8" required autocomplete="new-password"></label><br><button name="action" value="register">註冊並登入</button><button name="action" value="login">登入</button></form></section>
<?php else: ?><section><h2>已登入：<?=html($_SESSION['login'])?></h2><form action="/" method="post"><input type="hidden" name="csrf" value="<?=html($_SESSION['csrf'])?>"><button name="action" value="logout">登出</button></form></section>
<section><h2>永久檔案</h2><form action="/" method="post" enctype="multipart/form-data"><input type="hidden" name="csrf" value="<?=html($_SESSION['csrf'])?>"><input type="hidden" name="action" value="upload"><label>選擇檔案 <input type="file" name="attachment" required></label><button>上傳並保存</button></form>
<ul><?php $q=$pdo->prepare('SELECT id,filename,bytes FROM php_web_files WHERE owner_id=? ORDER BY id');$q->execute([$_SESSION['user']]);foreach($q as $f):?><li><a href="/?download=<?=html($f['id'])?>"><?=html($f['filename'])?></a>（<?=(int)$f['bytes']?> bytes）</li><?php endforeach ?></ul></section>
<?php endif ?><p>原始碼唯讀；永久檔案放於 /files，程式 Session 預設是暫存。預覽到期後請由平台重新開啟並登入。</p><section><h2>瀏覽器功能</h2><button id="browser-test">測試 Cookie 與瀏覽器儲存</button><p id="browser-result" role="status"></p></section><script>document.querySelector('#browser-test').addEventListener('click',()=>{try{localStorage.setItem('student-web-proof','114584003');document.cookie='student_browser_test=ok;Path='+location.pathname+';Secure;SameSite=Lax';document.querySelector('#browser-result').textContent=localStorage.getItem('student-web-proof')==='114584003'&&document.cookie.includes('student_browser_test=ok')?'Cookie 與 localStorage 可正常使用':'瀏覽器儲存測試未通過';}catch(e){document.querySelector('#browser-result').textContent='瀏覽器儲存無法使用';}});</script></body></html>
