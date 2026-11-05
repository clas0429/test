# PHP 完整網站範例

貼上此分支 GitHub tree 網址部署：PHP 8.5、Composer lock（Ramsey UUID）、自建帳號與 PHP Session、個人 MariaDB、上傳與下載永久檔案。

永久檔案使用 `FILES_DIR=/files`，每位學生共 200,000,000 bytes 原始檔案系統容量；格式化開銷會減少實際可存檔案大小。Node/PHP 共用同一位學生的檔案額度。MariaDB 使用平台注入的五個 DB_* 環境變數。帳號及檔案在重新部署後保留，預設 /data Session 暫存不保留。

網站位於 https://moocs.eduvator.net/{學號}/，須本人 Google 登入。這是管理者選擇的共用來源教學測試模式，Cookie 與 localStorage 不是跨學生安全邊界；Service Worker 停用，請使用虛構資料。程式自己的註冊/登入與平台 Google 登入分開。

Composer 安裝依據 composer.lock，停用 plugins/scripts；npm 依據 package-lock.json 停用 lifecycle hooks。未提供任意 shell 或自訂建置命令。一般框架仍需設定學號子路徑及適當 document root。
