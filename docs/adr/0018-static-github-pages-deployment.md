# v1 發布於 GitLab Pages 純靜態環境

QuickMind v1 以 GitLab Pages 作為正式發布環境，採純靜態資產、無後端 API、無遙測，使用者文件只保存在瀏覽器本機；Stage 1 的 Docker 建置、測試與發布由 GitHub Actions 執行。這符合 local-first 與個人隱私定位，也能降低部署與營運負擔；代價是 v1 不提供雲端同步、伺服器端備份或需要後端的功能。
