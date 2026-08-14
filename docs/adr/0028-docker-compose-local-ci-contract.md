# 以 Docker Compose 作為本地與 CI 的執行契約

**Status**: accepted

QuickMind 的本地開發、型別檢查、domain／unit tests、Chromium E2E、build 與 preview 都透過 Docker Compose 執行，GitHub Actions 共用同一套 Compose 入口，以降低主機與 CI 環境差異。Compose 提供 hot-reload dev、check、e2e 與 preview 服務；preview 使用 Docker 內的 Vite preview，不引入 Nginx，因為正式靜態資產由 GitHub Pages 提供。
