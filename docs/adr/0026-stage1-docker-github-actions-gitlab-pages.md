# Stage 1 使用 Docker 與 GitHub Actions 發布至 GitLab Pages

QuickMind Stage 1 以 Docker 提供可重現的建置環境，由 GitHub Actions 執行自動化測試與發布流程，將產出的純靜態網站部署到 GitLab Pages。Pull Request 必須通過 Docker 建置、domain／unit tests 與 Chromium smoke test；`main` 合併後只有在全部檢查通過時才發布，任一失敗都阻止部署。GitLab Pages 只負責提供前端資產，不保存使用者文件；Docker 是建置與 CI 邊界，不是使用者執行 QuickMind 的必要條件。這保留 local-first、無後端與零遙測的產品邊界，同時讓建置、測試與發布可在 CI 中重複驗證。
