# QuickMind

QuickMind 是一個 local-first 的桌面瀏覽器心智圖工具：使用者可以在不登入、不上傳文件的前提下，把想法整理成階層結構，並將工作副本保存在瀏覽器本機。

目前正式發布目標是 GitHub Project Pages：

<https://ben870217.github.io/QuickMind/>

## 目前狀態

Stage 1／v1 已聚焦於 50 個節點以下的單一本機心智圖核心流程：

- 建立、重新命名與刪除節點
- 新增子節點與同層節點
- 拖曳調整階層與同層順序
- 展開／收合、鍵盤導覽與節點情境操作
- Undo／Redo
- 瀏覽器本機自動保存與重新開啟恢復
- QuickMind 原生 `.quickmind` 匯入／匯出
- 首次成功載入後的離線核心使用

Stage 1 不以搜尋、PWA 安裝、大規模效能或外部格式互通為完成前提。

## 本地開發

本專案的本地開發、檢查、測試、建置與預覽都透過 Docker Compose 執行；開發者不需要在主機直接安裝或執行 Node.js、npm、Vite 或 Playwright。

需求：

- Docker Desktop，或包含 Compose plugin 的 Docker Engine

啟動熱更新開發環境：

```sh
docker compose up dev
```

開啟 <http://localhost:5173/>。

執行型別檢查、domain／unit tests 與 build：

```sh
docker compose run --rm check
```

執行 Chromium E2E 測試：

```sh
docker compose run --rm e2e
```

以正式 build 的靜態產物預覽：

```sh
docker compose --profile preview up --build preview
```

開啟 <http://localhost:4173/>。停止並清理服務：

```sh
docker compose down --remove-orphans
```

本地使用根路徑 `/`；GitHub Pages build 會使用 `/QuickMind/`。可用以下環境變數調整本地埠號：

- `QUICKMIND_DEV_PORT`：預設 `5173`
- `QUICKMIND_PREVIEW_PORT`：預設 `4173`
- `VITE_BASE_PATH`：預設 `/`

## CI/CD

GitHub Actions 使用與本地相同的 Docker Compose 入口：

- Pull Request：執行 Docker 化的 check 與 Chromium E2E，並建立 Docker image。
- `main`：只有所有檢查通過後，才建立使用 `/QuickMind/` base path 的靜態產物。
- 發布：將 `dist/` 部署至 GitHub Pages，不使用後端服務，也不把使用者文件存到部署平台。

部署流程不需要 Nginx。GitHub Pages 直接提供 Vite 產出的靜態檔案；本地 preview 也使用 Docker 內的 `vite preview`。

首次啟用 repository Pages 時，請在 GitHub repository 的 `Settings → Pages → Build and deployment` 將 `Source` 設為 `GitHub Actions`；之後 `main` 的成功 workflow 會自動發布。

## 文件與 Stage 流程

- [Stage 1／v1 規格](docs/stage1-v1-spec.md)：目前可交付範圍與驗收條件。
- [領域語言與邊界](CONTEXT.md)：QuickMind 的產品術語與版本共識。
- [架構決策](docs/adr/)：已接受的設計取捨與發布決策。
- [初始規格草稿](QuickMind.md)：歷史參考，不是目前實作的唯一依據。

每個 Stage 開始前都必須：

1. 重新參考 `QuickMind.md` 的初始產品意圖。
2. 依目前程式與已接受決策整理該 Stage 規格。
3. 與開發人員確認規格，收到明確的「接受」後才開始實作。
4. 在該 Stage 完成後補上驗收、測試與發布紀錄。

目前只完整定義 Stage 1；後續 Stage 只保留方向，細節等進入對應階段時再確認：

| Stage | 方向 | 現階段邊界 |
| --- | --- | --- |
| Stage 1 | 本機單文件核心 | 50 個節點以下正常使用，不要求搜尋 |
| Stage 2 | 文件搜尋、PWA 安裝、Light／Dark 主題 | 尚未凍結介面與操作語義 |
| Stage 3 | 外部格式讀取、PNG／PDF／Mermaid／draw.io 輸出 | 尚未凍結格式與保真程度 |
| Stage 4 | 依實際需求進行大規模渲染與效能最佳化 | 不預先承諾特定效能架構 |

## 產品邊界

QuickMind v1 不提供登入、後端 API、雲端同步、團隊協作、遙測或行動瀏覽器正式支援。文件資料留在使用者瀏覽器本機；GitHub Pages 只負責提供前端資產。

更完整的行為、資料格式與驗收條件請以 Stage 1 規格、`CONTEXT.md` 及已接受的 ADR 為準。
