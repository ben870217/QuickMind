# 將內容修訂與匯出狀態留在工作區 metadata

QuickMind v1 的 `.quickmind` 原生檔案只包含必要文件 metadata（`id`、`schemaVersion`、`createdAt`、`updatedAt`）與文件內容，不公開內容修訂號、未匯出狀態、視圖狀態或瀏覽器工作區資訊；這些狀態由瀏覽器本機工作區 metadata 管理。`createdAt` 與 `updatedAt` 使用 UTC ISO 8601 字串，`updatedAt` 只在使用者造成文件內容或結構變更時更新，自動保存只持久化、不另改時間，匯出也不改變它，匯入成功時保留檔案原值，文件標題另由根節點提供。如此可讓原生格式聚焦於可攜的文件資料，避免把暫存工作流程與編輯歷史變成外部格式契約。
