# PHP + MariaDB 教學範例

公開 GitHub 儲存庫的 main 分支，根目錄放 index.php，或只在 public/index.php 放入口。登入平台後貼上網址即可自動辨識 PHP。不能同時保留 server.js 與 PHP 入口，也不能同時有兩個 PHP 入口。

PDO、pdo_mysql、mysqli、Session 已提供。連線請使用 getenv('DB_HOST')、DB_PORT、DB_NAME、DB_USER、DB_PASSWORD，密碼不要提交 GitHub。資料庫由平台建立並供自己的 phpMyAdmin 管理，SQL 資料跨部署保留。

目前不執行 Composer、npm、自訂 Dockerfile、.htaccess 或安裝腳本。來源與程式碼唯讀；可寫 /data 為64 MiB暫存，重部署清空。預覽的 Session 由伺服器保管PHPSESSID，不寫入瀏覽器Cookie，短效預覽到期後需重開。外部網站、資源與其他學生的資料庫不開放。

此範例沒有對外登入權限設計，只能使用虛構測試資料；尚未完成每人200 MB硬配額與100人驗收。
