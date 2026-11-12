# 我的待辦清單

待辦清單可部署到 GitHub Pages。未登入時，待辦保存在目前瀏覽器；使用 Google 登入後，待辦清單會透過 Firebase Authentication 與 Cloud Firestore 同步。

線上 Firebase 專案為 **Daymark**（專案 ID：`daymark-ef86c`）。

## Firebase 與 Google 登入設定

此專案使用 Firebase 網頁 SDK。Web App 設定會公開在靜態網站程式中，請勿把 Firebase Admin 私鑰放入前端；資料存取由 Firestore 安全性規則保護。設定步驟：

1. 在 Firebase Console 建立或選取專案，新增 Web App，取得 `apiKey`、`authDomain`、`projectId`、`appId`；如已登入 Firebase Console，可從專案設定 **Your apps → SDK setup and configuration → Config** 複製這四個欄位。
2. 在 **Authentication → Sign-in method** 啟用 **Google**；到 **Authentication → Settings → Authorized domains** 加入 `clas0429.github.io`，本機測試則加入 `localhost`。
3. 建立 Cloud Firestore database，將本目錄的 `firestore.rules` 發佈為 Firestore Rules。
4. 本機測試：複製 `firebase-config.example.json` 為未納入 Git 的 `firebase-config.json`，再填入 Firebase Web App 設定。GitHub Pages 部署則在儲存庫 **Settings → Secrets and variables → Actions → Variables** 新增以下 Repository variables（不是 Secrets）：
   - `FIREBASE_API_KEY`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_APP_ID`
5. 在 Firebase 的 **Authentication → Settings → Authorized domains** 加入 `localhost` 和 `clas0429.github.io`。將 `firestore.rules` 發佈至 Firestore Rules。設定上述 GitHub Variables 後，將變更推送至 `main`，等待 `Deploy to GitHub Pages` 成功，再到網站測試登入。

未登入時沿用本機清單。第一次登入若該帳號的雲端清單是空的，會將本機清單匯入該帳號；若雲端已有清單，雲端資料優先，本機舊清單不會覆蓋雲端資料。Firebase Auth 使用彈出式 Google 登入；請在 HTTPS 網站或 `localhost` 使用，不支援直接用 `file://` 開啟登入。本機設定檔缺少時，網站仍可用本機待辦，但登入功能無法連線；GitHub Variables 缺少時部署工作會明確失敗，避免發布一個看似已更新、實際沒有登入設定的網站。

## 本機預覽

直接用瀏覽器開啟 `index.html`，或在此目錄執行：

```sh
python -m http.server 8000
```

再瀏覽 <http://localhost:8000>。

## GitHub Pages 部署

已加入 `.github/workflows/pages.yml`，將靜態檔案部署到 Pages，並在部署時帶入 Firebase Actions variables。將變更推送到 `main` 後：

1. 開啟 GitHub 儲存庫的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
3. 等待 **Actions** 頁面的 `Deploy to GitHub Pages` 工作流程成功。

專案網站網址格式為 `https://clas0429.github.io/test/`。首次啟用 Pages 後，GitHub 會在 Actions 工作流程完成時提供實際網址。

## 資料注意事項

- 未登入時資料只在同一個瀏覽器、同一個網站來源內保存；登入後待辦同步至 Firestore。
- 清除瀏覽器網站資料，或使用無痕模式後關閉視窗，可能使待辦資料消失。
- Firebase Web 設定不等同伺服器密鑰；仍須正確發佈 `firestore.rules`，不可使用允許所有人讀寫的測試規則。
