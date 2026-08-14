# QuickMind 初始規格草稿

> **文件定位**：這是專案初始版本的技術密集型規格草稿，保留作為產品意圖與歷史脈絡參考。現行入口是 [`README.md`](README.md)，Stage 1 的實作依據是 [`docs/stage1-v1-spec.md`](docs/stage1-v1-spec.md)，並以 [`CONTEXT.md`](CONTEXT.md) 與已接受的 [`docs/adr/`](docs/adr/) 為準。
>
> **Stage gate**：每一個 Stage 開始前，都必須重新參考本文件，整理該 Stage 的規格並與開發人員確認；只有收到明確的「接受」後，才可以開始實作、測試與 commit。本文件中的具體技術方案不會自動成為後續 Stage 的驗收契約。

以下內容保留原始草稿，未經目前 Stage 規格重新確認，不應直接視為已承諾的功能或架構。

---

# **QuickMind 原始總體系統架構規格說明書 (Master Technical Specification)**

**版本**：1.0.0  
**架構類型**：Local-First Desktop PWA (Single Page Application)  
**託管環境**：GitHub Pages (零後端 API、零自動遙測)  
**核心技術棧**：Vue 3 (Composition API) \+ Vite \+ Pinia \+ Dexie.js (IndexedDB) \+ SVG/Canvas 雙渲染引擎

## **一、 架構設計哲學 (Core Architectural Principles)**

> 1. **Local-First & Absolute Privacy**：所有心智圖資料、歷史版本與媒體附件 100% 存放於使用者本機裝置。無視訊追蹤、無數據遙測（Zero Telemetry）。  
> 2. **Desktop Native Experience**：專為桌面端 (Desktop-Only) 滑鼠與實體鍵盤優化。支援實體檔案靜默覆寫 (Ctrl+S)、OS 雙擊開啟檔案、多頁籤工作區與高解析度向量匯出。  
> 3. **Extreme Scale & Fluidity**：採用 DOM 剔除 (Pruning)、JSON Patch 增量歷史與 Web Worker 異步管線，確保數千節點圖表依然維持 60 FPS 的流暢度與 O(1) 記憶體常數控制。

## **二、 四維度核心技術規格 (Four-Dimension Specifications)**

### **領域一：資料流與存續安全 (Data Architecture & Safety)**

| 模組名稱 | 關鍵技術實作 | 運作機制與防禦邏輯 |
| :---- | :---- | :---- |
| **資料驗證層** | Zod Schema Middleware (z.safeParse()) | 載入任何 JSON 或匯入檔案前，進行結構嚴格校驗。非致命欄位損毀自動降級至預設莫蘭迪樣式；進行有向無環圖 (DAG) 拓撲走訪，攔截循環參考 (parentId)，杜絕毒性資料污染。 |
| **微觀歷史引擎** | JSON Patch (RFC 6902\) \+ 500ms Debounce | 捨棄全量深拷貝。變更時計算 Forward/Reverse Patch，記憶體僅佔用數十 Bytes；打字與拖拽觸發 500ms 防抖合併；環狀陣列限制最大 50 步 Undo。 |
| **本地時光機** | IndexedDB document\_snapshots (LRU) | 每次儲存或大範圍刪除時，背景寫入快照。單一檔案最多保留最近 15 個版本；提供側邊欄時光機預覽與一鍵還原；刪除草稿時自動觸發垃圾回收 (GC)。 |
| **跨執行緒同步** | BroadcastChannel('qm-sync-bus') | 背景 Worker 或其他分頁更新 IndexedDB 後發送廣播。主 UI 若 isDirty \=== false 則自動熱重載；若 isDirty \=== true 則阻斷覆寫並彈出衝突選單。 |
| **持久化宣告** | navigator.storage.persist() | 啟動期自動申報持久化權限，防止瀏覽器自動 Eviction；配額監控 (estimate()) 於可用的 80% 時暫停背景快照，觸發臨界點時喚醒空間清理工具。 |

### **領域二：繪圖引擎與效能極限 (Rendering Engine & Performance)**

| 模組名稱 | 關鍵技術實作 | 運作機制與防禦邏輯 |
| :---- | :---- | :---- |
| **DOM 剔除引擎** | Depth Collapse \+ Off-screen Culling | 超過 500 節點自動折疊深層分支。 Vue computed 產生 VisibleNodeList，折疊分支與視口外節點直接自 SVG DOM 樹中銷毀，非僅 CSS 隱藏。 |
| **非階層圖層** | Isolated Overlay Layers (\#qm-relationships) | 關聯線與分組外框於根目錄採用扁平化陣列儲存。佈局引擎發佈 NodeBoundingBoxMap，關聯線透過 requestAnimationFrame 被動訂閱座標矩陣重繪，不破壞樹狀 JSON。 |
| **拖放判定 (DnD)** | Hitbox Partitioning \+ Overlay Indicator | 游標進入節點矩形時進行三等分判定（頂 25% 上同級、中 50% 子節點、底 25% 下同級）。於獨立指示圖層渲染莫蘭迪極細輔助線或外框，放開後觸發 FLIP 位移動畫。 |
| **微縮圖 (Minimap)** | Low-Fidelity 2D Canvas \+ requestIdleCallback | 拒絕複製 SVG DOM。利用 NodeBoundingBoxMap 於主執行緒閒置時，以 ctx.fillRect() 在小 Canvas 繪製色塊；半透明視口框與主畫布進行雙向矩陣變換綁定。 |
| **效能打包** | Vite manualChunks \+ Service Worker Precache | 核心畫布控制在 300KB 內；重型套件 (jspdf, JSZip) 採用動態 import() 切分，背景由 SW 預先快取，確保斷網時喚醒零延遲。 |

### **領域三：桌面原生整合與 PWA (OS Integration & Desktop PWA)**

| 模組名稱 | 關鍵技術實作 | 運作機制與防禦邏輯 |
| :---- | :---- | :---- |
| **原生檔案存取** | File System Access API | 捨棄下載模式。保存 FileSystemFileHandle，Ctrl+S 觸發 FileSystemWritableFileStream 靜默覆寫本機檔案；Manifest 註冊 file\_handlers 支援 OS 雙擊開啟。 |
| **智慧剪貼簿** | Smart Clipboard Router | 攔截 paste 事件。識別 QuickMind JSON 直接掛載子樹；識別 image/\* 自動寫入 attachments DB 並插入圖片；識別 Tab 縮排文字自動解析為階層分支。 |
| **高解析匯出** | Scaled Canvas \+ Base64 Font Inlining | 匯出 PNG 採用 Offscreen Canvas 強制放大 3 至 4 倍；匯出前將 Web Font 轉 Base64 注入 SVG \<defs\>\<style\>；PDF 採用 jspdf \+ svg2pdf.js 產出純向量可選取文字檔。 |
| **主題與 FOUC 防禦** | CSS Variables \+ \<head\> Render-Blocking Script | 全域顏色綁定 CSS 變數。\<head\> 頂端注入原生腳本，在 \<body\> 渲染前同步讀取 localStorage 或 matchMedia 設定 data-theme，100% 消滅深色模式白屏閃爍。 |
| **快捷鍵與 IME** | Priority Context Stack \+ CJK Composition Lock | 鍵盤事件由優先級佇列分發（Modal \> Text Editing \> Navigation）。監聽 compositionstart/end 與 keyCode \=== 229，組字期間徹底放行 Enter/Space 給原生輸入法。 |

### **領域四：極端容錯與品質驗證 (Fault Tolerance & QA)**

| 模組名稱 | 關鍵技術實作 | 運作機制與防禦邏輯 |
| :---- | :---- | :---- |
| **無障礙 (a11y)** | Visually Hidden Semantic Tree \+ ARIA Sync | SVG 旁渲染 .sr-only 的 \<ul role="tree"\> HTML 結構。焦點留在畫布，動態更新 aria-activedescendant 導向隱藏樹節點，即時同步 aria-level 與 aria-expanded。 |
| **安全模式** | Ring-Buffer Logger \+ Safe Mode Dashboard | 全域錯誤記錄至 200 筆上限的環形日誌，自動塗銷節點文字 (PII Scrubbing)。10 秒內閃退 3 次自動降級至 Safe Mode，提供 JSON 裸資料救回與去敏化診斷檔匯出。 |
| **CI/CD 自動化** | Playwright Custom Fixtures \+ Visual Regression | GitHub Actions 執行 Playwright 測試。注入 Chromium Launch Flags 繞過 File System 選擇器；模擬 context.setOffline(true) 測試離線；設定 threshold: 0.2 進行畫布 Snapshot 比對。 |

## **三、 Vue 3 \+ Vite 專案目錄結構對照 (Directory Mapping)**

quickmind/  
├── .github/  
│   └── workflows/  
│       └── ci-cd.yml                 \# Playwright E2E 測試與 GitHub Pages 自動部署管線  
├── public/  
│   ├── favicon.ico  
│   └── manifest.json                 \# PWA 定義檔 (包含 file\_handlers: \[.quickmind, .xmind\])  
├── src/  
│   ├── assets/  
│   │   └── styles/  
│   │       ├── variables.css         \# Morandi 主題 CSS 變數 (Light/Dark)  
│   │       └── main.css              \# 全域 Reset 與 .sr-only 語義樣式  
│   ├── components/  
│   │   ├── canvas/  
│   │   │   ├── SvgCanvas.vue         \# 單一 SVG 畫布核心渲染視圖  
│   │   │   ├── NodeElement.vue       \# 節點 DOM (含 SVG Text/tspan 與 inline editor)  
│   │   │   ├── OverlayIndicators.vue \# DnD 莫蘭迪輔助線與分組外框獨立圖層  
│   │   │   └── MinimapCanvas.vue     \# 低保真 2D Canvas 微縮導航圖  
│   │   ├── workspace/  
│   │   │   ├── TabBar.vue            \# 多草稿頁籤列與狀態切換  
│   │   │   ├── ContextMenu.vue       \# 視口邊界碰撞防禦自訂右鍵選單  
│   │   │   ├── SearchModal.vue       \# Ctrl+F 畫布內與跨草稿全量搜尋浮層  
│   │   │   └── TimeMachineDrawer.vue \# 本地歷史快照版本還原側邊欄  
│   │   └── modals/  
│   │       ├── SafeModeDashboard.vue \# 崩潰防禦與救回面板  
│   │       └── StorageManagerModal.vue\# 磁碟配額清理管理員  
│   ├── engine/  
│   │   ├── dnd/  
│   │   │   └── HitboxPartition.ts    \# 三等分空間判定與 Drop Indicator 導出  
│   │   ├── export/  
│   │   │   ├── ImageExporter.ts      \# 高 DPI Canvas 縮放與 Base64 字型內聯注入  
│   │   │   └── PdfExporter.ts        \# jspdf \+ svg2pdf.js 純向量 PDF 轉譯器  
│   │   ├── keyboard/  
│   │   │   └── ShortcutDispatcher.ts \# 優先級上下文佇列與 CJK IME 組字鎖  
│   │   └── layout/  
│   │       └── LayoutEngine.ts       \# 樹狀座標計算與 NodeBoundingBoxMap 算子  
│   ├── services/  
│   │   ├── db/  
│   │   │   ├── schema.ts             \# Dexie.js 漸進式 Migration 與資料表定義  
│   │   │   ├── SnapshotManager.ts    \# Rolling Snapshots 歷史快照控制  
│   │   │   └── AttachmentStore.ts    \# 圖片 Blob 寫入與 qm-att:// 轉換  
│   │   ├── file/  
│   │   │   ├── NativeFileSystem.ts   \# File System Access API 靜默覆寫與代碼保存  
│   │   │   └── SmartClipboard.ts     \# 智慧型剪貼簿路由管線 (JSON/Image/Tab-text)  
│   │   └── sync/  
│   │       └── BroadcastService.ts   \# BroadcastChannel 跨執行緒與分頁訊息匯流排  
│   ├── stores/  
│   │   ├── workspaceStore.ts         \# 多頁籤管理與 Cold Storage 記憶體凍結  
│   │   ├── activeTreeStore.ts        \# 當前草稿 Pinia 狀態機與 JSON Patch Undo 堆疊  
│   │   └── themeStore.ts             \# 深淺色模式與 localStorage 同步  
│   ├── utils/  
│   │   ├── validator.ts              \# Zod Schema 驗證與 DAG 拓撲檢測  
│   │   ├── jsonPatch.ts              \# fast-json-patch 封裝與 500ms Debounce  
│   │   └── logger.ts                 \# 環形記憶體日誌與 PII 去敏化算子  
│   ├── workers/  
│   │   └── io.worker.ts              \# XMind/OPML 重型解壓與背景解析 Web Worker  
│   ├── App.vue                       \# 系統 Shell、beforeunload 防護與 Safe Mode 門控  
│   └── main.ts                       \# App 初始化與 Register SW 門控  
├── tests/  
│   ├── e2e/  
│   │   ├── fixtures.ts               \# Playwright Custom Fixtures (Mock FSA API)  
│   │   ├── offline.spec.ts           \# Service Worker 離線與快取斷言  
│   │   └── visual.spec.ts            \# SVG 畫布渲染視覺回歸測試 (Threshold 0.2)  
├── index.html                        \# 包含 \<head\> 頂端 FOUC 阻塞腳本  
├── vite.config.ts                    \# Rollup manualChunks 與 PWA Plugin 配置  
└── tsconfig.json

## **四、 核心資料結構 TypeScript 定義 (Master Schema)**

TypeScript  
*// 核心心智圖文件 JSON 結構*  
export interface QuickMindDocument {  
  meta: {  
    id: string;                      *// 草稿 UUID*  
    version: number;                 *// Schema 版本號 (用於 Dexie 遷移)*  
    title: string;                   *// 心智圖標題*  
    createdAt: number;  
    updatedAt: number;  
    theme: string;                   *// 莫蘭迪配色主題 ID*  
  };  
  root: QuickMindNode;               *// 樹狀主幹根節點*  
  relationships: CrossLink\[\];        *// 根層級獨立非階層關聯線*  
  boundaries: GroupBoundary\[\];       *// 根層級獨立分組外框*  
}

*// 節點模型 (純有向無環樹)*  
export interface QuickMindNode {  
  id: string;  
  text: string;  
  isCollapsed?: boolean;  
  notes?: string;                    *// Markdown 備註*  
  attachmentUrl?: string;            *// 圖片 URI: "qm-att://\[uuid\]"*  
  style?: {  
    color?: string;  
    fontSize?: number;  
    backgroundColor?: string;  
  };  
  children: QuickMindNode\[\];  
}

*// 非階層關聯線 (Detached)*  
export interface CrossLink {  
  id: string;  
  sourceId: string;  
  targetId: string;  
  label?: string;  
  style?: {  
    lineStyle: 'dashed' | 'solid';  
    color: string;  
  };  
}

*// 分組總結外框 (Detached)*  
export interface GroupBoundary {  
  id: string;  
  nodeIds: string\[\];                 *// 被包裹的節點 ID 清單*  
  title?: string;  
  fillColor: string;                 *// 半透明莫蘭迪填滿色*  
}

*// 歷史 Patch 紀錄*  
export interface HistoryPatch {  
  timestamp: number;  
  forwardPatch: Array\<{ op: string; path: string; value?: any }\>;  
  reversePatch: Array\<{ op: string; path: string; value?: any }\>;  
}

## **五、 開發實作里程碑 (Implementation Roadmap)**

> 1. **階段一：基礎建設與資料安全 (M1)**  
   * 建立 Vite \+ Vue 3 專案，設定 \<head\> FOUC 防禦腳本。  
   * 實作 Dexie.js Schema、Zod 驗證層與 File System Access API 靜默覆寫控制。  
   * 完成 JSON Patch 歷史堆疊與 document\_snapshots 本地時光機。  
> 2. **階段二：繪圖引擎與互動細節 (M2)**  
   * 搭建單一 SVG 畫布與 VisibleNodeList DOM 剔除邏輯。  
   * 實作 Hitbox Partitioning 三等分 Drag & Drop 判定與獨立指示圖層。  
   * 整合 CSS 變數莫蘭迪主題切換、a11y 隱藏語義樹與 CJK IME 快捷鍵調度器。  
> 3. **階段三：桌面高級整合與生態系 (M3)**  
   * 實作 io.worker.js，支援 .xmind 檔解析與串流圖片寫入 attachments DB。  
   * 整合 Smart Clipboard Router、高 DPI Canvas 圖檔與向量 PDF 匯出。  
   * 實作低保真 Canvas Minimap 與多草稿頁籤 Cold Storage 凍結機制。  
> 4. **階段四：極端防禦與品質交付 (M4)**  
   * 實作持久化宣告 (navigator.storage.persist()) 與配額降級控制。  
   * 建立無遙測環形日誌、崩潰迴圈偵測與 Safe Mode 主控台。  
   * 配置 Playwright E2E 視覺回歸測試與 GitHub Actions CI/CD 自動部署。
