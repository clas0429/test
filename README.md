# Node.js 完整網站範例

server.js + package.json + package-lock.json 即可部署。Node.js 26，cookie npm 套件依 lock 安裝且停用所有 lifecycle hooks；基礎環境已提供 mariadb 驅動。個人 MariaDB 保存帳號，/files/node-web 保存永久筆記；Session 位於記憶體、重新部署後重新登入。

每位學生固定 200,000,000 bytes 檔案系統容量（格式化開銷另計），Node/PHP 共用；DB 使用五個 DB_* 環境變數，FILES_DIR 固定 /files。一般框架需設定 /{學號}/ 路徑；不提供任意建置指令、私有 registry、安裝 hooks 或學生 Dockerfile。

本人 Google 登入後開啟 https://moocs.eduvator.net/{學號}/。共用來源是管理者選擇的教學測試模式，Cookie/localStorage 不提供跨學生瀏覽器隔離；Service Worker 停用。請使用虛構測試資料。
