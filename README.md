# 我的待辦清單

純前端待辦清單，可部署到 GitHub Pages。HTML、CSS 與 JavaScript 由 GitHub Pages 靜態提供；待辦事項保存在目前瀏覽器的 `localStorage`，不會送到伺服器。

## 本機預覽

直接用瀏覽器開啟 `index.html`，或在此目錄執行：

```sh
python -m http.server 8000
```

再瀏覽 <http://localhost:8000>。

## GitHub Pages 部署

已加入 `.github/workflows/pages.yml`，它只會把 `site/` 內的靜態檔案部署到 Pages。將變更推送到 `main` 後：

1. 開啟 GitHub 儲存庫的 **Settings → Pages**。
2. 在 **Build and deployment → Source** 選擇 **GitHub Actions**。
3. 等待 **Actions** 頁面的 `Deploy to GitHub Pages` 工作流程成功。

專案網站網址格式為 `https://clas0429.github.io/test/`。首次啟用 Pages 後，GitHub 會在 Actions 工作流程完成時提供實際網址。

## 資料注意事項

- 資料只在同一個瀏覽器、同一個網站來源內保存；不會自動同步其他裝置或瀏覽器。
- 清除瀏覽器網站資料，或使用無痕模式後關閉視窗，可能使待辦資料消失。
- 這是無登入的公開靜態範例，請勿輸入個人、機密或敏感資訊。
