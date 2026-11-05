<?php
// Fixed, read-only runtime diagnostic for this teaching example; no credentials in output.
declare(strict_types=1);
header('Content-Type: application/json');
try {
    $pdo = new PDO('mysql:host='.getenv('DB_HOST').';port='.getenv('DB_PORT').';dbname='.getenv('DB_NAME'), getenv('DB_USER'), getenv('DB_PASSWORD'), [PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION, PDO::ATTR_TIMEOUT=>3]);
    $mysqli = new mysqli(getenv('DB_HOST'), getenv('DB_USER'), getenv('DB_PASSWORD'), getenv('DB_NAME'), (int)getenv('DB_PORT'));
    $correct = $pdo->query('SELECT DATABASE()')->fetchColumn() === getenv('DB_NAME');
    $correct = $correct && $mysqli->query('SELECT DATABASE()')->fetch_row()[0] === getenv('DB_NAME');
    echo json_encode(['php'=>PHP_VERSION, 'pdo_mysql'=>extension_loaded('pdo_mysql'), 'mysqli'=>extension_loaded('mysqli'), 'own_database'=>$correct, 'source_readonly'=>!is_writable(__DIR__), 'shell_disabled'=>!function_exists('shell_exec'), 'session_path'=>ini_get('session.save_path') === '/data']);
} catch (Throwable $error) { http_response_code(503); echo '{"status":"database_unavailable"}'; }
