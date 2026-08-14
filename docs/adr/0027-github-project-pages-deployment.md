# 使用 GitHub Project Pages 作為正式發布環境

**Status**: accepted

QuickMind Stage 1 以 `https://ben870217.github.io/QuickMind/` 作為正式發布網址，使用 GitHub Actions 在 `main` 通過完整驗證後部署 Vite 的純靜態產物到 GitHub Project Pages。部署平台只提供前端資產，不保存使用者文件；Vite 在 GitHub Pages build 使用 `/QuickMind/` base path，本地開發仍使用 `/`。這取代原本的 GitLab Pages 發布方案，保留 local-first、無後端與零遙測邊界。
