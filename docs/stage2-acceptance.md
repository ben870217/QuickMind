# Stage 2 驗收與發布紀錄

## 狀態

Stage 2「搜尋、主題與 PWA 安裝」已於 2026-08-16 在 `stage4` 分支完成驗收。實作範圍對應 issues #26–#30；#31 本文件記錄全量檢查與發布前結果。

## 已交付

- #26：目前單一文件的節點標題搜尋、結果循環、空查詢與查無結果狀態。
- #27：收合分支的搜尋暫時展開、關閉後保留、文件標題／刪除／拖曳變更後即時重算。
- #28：搜尋焦點循環、`Ctrl+F`／`⌘F` 編輯交界、查詢與未提交標題保留、關閉後焦點恢復。
- #29：跟隨系統／Light／Dark 原生主題選單、首屏防閃爍、持久化降級與 `theme-color` 同步。
- #30：GitHub Pages base path 相容的 standalone manifest、icon 與原生 `beforeinstallprompt` 安裝入口。

搜尋、主題與安裝狀態都維持在工作區／瀏覽器視圖層，不寫入 `QuickMindDocument`、Undo／Redo、`updatedAt` 或 `.quickmind` 格式。

## 驗證結果

以下命令均在 Docker Compose 容器內執行：

| 檢查 | 結果 |
| --- | --- |
| `docker compose run --rm check` | 通過；typecheck、10 個 unit test files／50 tests、Vite production build 通過 |
| `docker compose run --rm e2e` | 通過；20 個 Chromium E2E tests |
| `VITE_BASE_PATH=/QuickMind/ docker compose run --rm check npm run build` | 通過；輸出使用 `/QuickMind/` asset path，manifest link 為 `/QuickMind/manifest.webmanifest` |

完整 E2E 保留 Stage 1 local-first／離線／原生檔案流程與 Stage 3 Mermaid、draw.io、PNG 匯出驗收；新增 Stage 2 搜尋、主題與 PWA 測試未取代既有資料安全測試。

## 發布注意事項

- GitHub Pages 部署使用 `VITE_BASE_PATH=/QuickMind/`；manifest 以相對 `start_url` 與 `scope` 解析到同一部署目錄。
- PWA 安裝入口只在瀏覽器派送 `beforeinstallprompt` 時顯示；不支援原生提示時仍可直接使用分頁版與既有離線核心。
- 本文件記錄的是 Stage 2 發布前驗收，不代表新增雲端同步、登入、跨文件搜尋或行動瀏覽器正式支援。
