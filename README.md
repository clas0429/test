# 學生 MariaDB 待辦範例

Google 登入 https://runtime.eduvator.net/ 後自動配置個人 MariaDB。貼上本 repository 網址並部署，系統會提供 mariadb 3.5.4 驅動與 DB_HOST、DB_PORT、DB_NAME、DB_USER、DB_PASSWORD。

入口 server.js，使用 PORT，提供 /healthz、/api/todos 與 HTML/JavaScript 前端。資料表由程式建立，也可從登入平台的「我的 MariaDB／phpMyAdmin」管理。SQL 資料獨立保存，重新部署不會清除；/data 仍是暫存。不要把密碼提交 GitHub。僅限測試資料，尚未完成 100 人與每人 200 MB 持久配額驗收。
