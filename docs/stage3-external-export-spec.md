# Stage 3：PNG、Mermaid 與 draw.io 外部格式匯出

## Problem Statement

QuickMind 目前只能匯出 QuickMind 原生 `.quickmind` 檔案。這適合完整 round-trip 備份，但不方便使用者把心智圖放進簡報、文件、程式碼文件或 diagrams.net 繼續整理。

使用者需要在不登入、不上傳、不依賴雲端服務的前提下，把目前的本機心智圖完整轉成圖片、Mermaid 原始碼或可編輯的 draw.io 檔案。匯出也不能因為目前畫布的縮放、平移、選取或收合狀態而遺漏文件內容，更不能讓外部輸出被誤認為 QuickMind 原生備份。

## Solution

在工作區工具列增加三個直接操作：「匯出 PNG」、「匯出 Mermaid」與「匯出 draw.io」。三種輸出都從目前已提交的完整文件建立獨立匯出場景，保留全部節點與 `children` 順序，不讀取目前 viewport 的裁切結果。

PNG 產生完整、乾淨的心智圖圖片；Mermaid 產生可放進 Markdown 或 Mermaid 編輯器的 `.mmd` 原始碼；draw.io 產生可由 diagrams.net 開啟並繼續編輯的未壓縮 `.drawio` XML。三種操作都可在離線狀態完成，並以瀏覽器標準下載提供檔案。

外部格式是目前文件的單向衍生表示，不是 QuickMind 原生 round-trip 備份。成功產生外部檔案不清除「尚未匯出」狀態；只有成功下載 `.quickmind` 原生檔案才清除該狀態。

## User Stories

1. As a 個人桌面使用者, I want to 一鍵匯出目前整份心智圖為 PNG, so that 我可以把心智圖放進簡報、文件或訊息中。
2. As a 個人桌面使用者, I want to 一鍵匯出目前整份心智圖為 Mermaid 原始碼, so that 我可以把階層放進 Markdown 或 Mermaid 編輯器。
3. As a 個人桌面使用者, I want to 一鍵匯出目前整份心智圖為 draw.io 檔案, so that 我可以在 diagrams.net 中繼續編輯圖形。
4. As a 個人桌面使用者, I want to 在工具列直接看見三種外部匯出按鈕, so that 我不必猜測格式或先開啟隱藏選單。
5. As a 個人桌面使用者, I want to 保留既有的 QuickMind 原生匯出入口, so that 外部表示不會取代完整 round-trip 備份。
6. As a 個人桌面使用者, I want to PNG 包含文件中的根節點與所有後代節點, so that 收合分支不會讓圖片遺漏內容。
7. As a 個人桌面使用者, I want to Mermaid 包含文件中的根節點與所有後代節點, so that 原始碼能表達完整階層。
8. As a 個人桌面使用者, I want to draw.io 包含文件中的根節點與所有後代節點, so that 我在外部工具中能繼續編輯完整圖形。
9. As a 個人桌面使用者, I want to 匯出結果保留每個父節點的 `children` 順序, so that 我拖曳整理出的同層順序不會被改寫。
10. As a 個人桌面使用者, I want to 匯出結果不受目前畫布縮放影響, so that 圖片與檔案不會因我正在放大或縮小而改變內容。
11. As a 個人桌面使用者, I want to 匯出結果不受目前畫布平移影響, so that 圖片不會只包含我當下看到的角落。
12. As a 個人桌面使用者, I want to 匯出結果不受目前節點選取影響, so that 選取高亮不會變成外部檔案的永久樣式。
13. As a 個人桌面使用者, I want to 匯出結果不受目前收合視圖影響, so that 暫時收合只改變工作區視圖，不會刪除或隱藏外部輸出的內容。
14. As a 個人桌面使用者, I want to PNG 使用乾淨的輸出場景, so that 工具列、全螢幕按鈕、工作區提示與背景網格不會出現在圖片中。
15. As a 個人桌面使用者, I want to PNG 自動包住完整匯出版面, so that 節點與連線不會被 viewport 邊界裁切。
16. As a 個人桌面使用者, I want to PNG 在內容四周保留固定邊距, so that 圖形不會貼在圖片邊界上。
17. As a 個人桌面使用者, I want to PNG 使用不透明的淺色莫蘭迪背景, so that 圖片在一般檢視器、文件與簡報中可以直接閱讀。
18. As a 個人桌面使用者, I want to PNG 以高解析度輸出, so that 放入文件或簡報後文字與連線仍然清楚。
19. As a 個人桌面使用者, I want to PNG 的節點標題在固定寬度內換行, so that 長標題不會把整張圖片無限制拉寬。
20. As a 個人桌面使用者, I want to PNG 完整顯示長標題而不使用省略號, so that 外部圖片不會失去文件內容。
21. As a 個人桌面使用者, I want to Mermaid 產生 UTF-8 `.mmd` 檔案, so that 中文、emoji 與其他 Unicode 標題可以正常使用。
22. As a 個人桌面使用者, I want to Mermaid 使用 `mindmap` 階層語法, so that 原始碼能直接表達 QuickMind 的父子關係。
23. As a 個人桌面使用者, I want to Mermaid 使用穩定的合成節點 ID, so that 重複標題不會造成節點衝突，且重複匯出容易比較差異。
24. As a 個人桌面使用者, I want to Mermaid 對特殊字元做安全轉義, so that 含有引號、括號、方括號或 Mermaid 控制字元的標題仍可解析。
25. As a 個人桌面使用者, I want to Mermaid 渲染後仍顯示原始標題, so that 轉義只影響原始碼安全性，不改變使用者內容。
26. As a 個人桌面使用者, I want to Mermaid 使用穩定的 2 空白縮排, so that `.mmd` 檔案容易閱讀、編輯與進行版本控制。
27. As a 個人桌面使用者, I want to Mermaid 不加入 theme、layout、icon 或自訂 class, so that 基本原始碼能在更多 Mermaid 工具中使用。
28. As a 個人桌面使用者, I want to draw.io 產生未壓縮 XML, so that 我可以檢查、版本控制與除錯檔案內容。
29. As a 個人桌面使用者, I want to draw.io 是單一頁面, so that 完整心智圖不會被固定紙張尺寸分頁。
30. As a 個人桌面使用者, I want to draw.io 頁面邊界自動包住完整匯出版面, so that 開啟檔案時不會裁切節點或連線。
31. As a 個人桌面使用者, I want to draw.io 使用可編輯的圓角矩形節點, so that 我可以在 diagrams.net 中修改每個標題與圖形。
32. As a 個人桌面使用者, I want to draw.io 使用父節點到子節點的方向箭頭, so that 階層方向在外部工具中仍然清楚。
33. As a 個人桌面使用者, I want to draw.io 使用直角折線連線, so that 階層圖保持目前畫布的清楚閱讀方式。
34. As a 個人桌面使用者, I want to draw.io 不保存 QuickMind 文件或節點 UUID, so that 單向外部檔案不會形成未承諾的回匯契約。
35. As a 個人桌面使用者, I want to draw.io 頁面名稱使用根節點標題, so that 開啟檔案後容易辨識來源文件。
36. As a 個人桌面使用者, I want to PNG、Mermaid 與 draw.io 沿用根節點標題作為檔名, so that 同一份文件的不同輸出容易對照。
37. As a 個人桌面使用者, I want to 外部檔案使用正確的 `.png`、`.mmd` 與 `.drawio` 副檔名, so that 作業系統與外部工具能正確辨識格式。
38. As a 個人桌面使用者, I want to 外部檔名沿用安全清理與 fallback 規則, so that 特殊標題不會產生無效或空白檔名。
39. As a 個人桌面使用者, I want to 外部匯出在離線狀態可用, so that 我不必上傳私人心智圖或依賴網路服務。
40. As a 個人桌面使用者, I want to 本機保存失敗時仍可匯出外部格式, so that 我有額外的資料救援與分享路徑。
41. As a 個人桌面使用者, I want to 外部匯出成功後仍看到「尚未匯出」, so that 我知道自己尚未建立可回到 QuickMind 的原生備份。
42. As a 個人桌面使用者, I want to 外部匯出不進入 Undo／Redo, so that 產生檔案不會污染文件編輯歷史。
43. As a 個人桌面使用者, I want to 外部匯出不更新 `updatedAt`, so that 匯出時間不會被誤認為文件內容變更。
44. As a 個人桌面使用者, I want to 外部匯出不改變選取、縮放、平移或收合狀態, so that 匯出完成後可以繼續原本的整理工作。
45. As a 個人桌面使用者, I want to 編輯節點標題時點擊匯出會先提交有效輸入, so that 剛輸入的內容不會被遺漏。
46. As a 個人桌面使用者, I want to 編輯中的標題若為空白或不合法時取消匯出並保留編輯狀態, so that 我可以修正內容而不產生錯誤檔案。
47. As a 個人桌面使用者, I want to 每個匯出按鈕顯示具體成功訊息, so that 我知道哪一種檔案已經產生。
48. As a 個人桌面使用者, I want to 匯出失敗時看到可理解的格式專屬訊息, so that 我知道要重試哪一種輸出。
49. As a 個人桌面使用者, I want to 匯出失敗時可以查看詳細原因, so that 我能分辨標題內容、規模限制或瀏覽器能力問題。
50. As a 個人桌面使用者, I want to 匯出失敗不清除工作區內容, so that 我不會因一次下載失敗而失去正在整理的文件。
51. As a 個人桌面使用者, I want to 外部輸出遵守 10 MB JSON 與 10,000 節點限制, so that 輸出不會超過 QuickMind 已驗證的文件邊界。
52. As a 個人桌面使用者, I want to 瀏覽器無法安全產生檔案時整次拒絕匯出, so that 我不會拿到裁切或部分產出的檔案。
53. As a 個人桌面使用者, I want to 節點標題在所有輸出中被當作純文字, so that HTML、XML 或 Markdown 標記不會執行或改變內容。
54. As a 個人桌面使用者, I want to 在全螢幕模式退出後使用匯出工具列, so that 全螢幕畫布仍保持乾淨且不維護第二套匯出流程。
55. As a 個人桌面使用者, I want to 匯出使用目前預設的節點、文字、邊框與連線視覺, so that 外部圖片與 draw.io 初始圖形仍看起來像 QuickMind。

## Implementation Decisions

- 建立一個高於 UI 的匯出服務邊界，接收已提交的 QuickMind 文件與格式選擇，產生可下載的 artifact；UI 只負責提交編輯、觸發匯出、下載結果與顯示狀態訊息。
- 匯出服務拆分為共用完整匯出版面、PNG 產生器、Mermaid 產生器與 draw.io 產生器，但所有格式都從相同的文件快照與同層順序開始。
- 匯出版面獨立於工作區 DOM 與視圖狀態，使用根節點向右展開的完整樹；根節點在左，同層節點由上至下，父子水平間隔 40 CSS px，同層垂直間隔 12 CSS px。
- PNG 與 draw.io 使用 32 CSS px 輸出邊距、18rem（約 288 CSS px）固定節點框寬度；標題在框內換行，完整保留文字；節點文字左對齊、垂直置中，連線接在節點左右側中心。
- PNG 使用不透明淺色背景與目前預設莫蘭迪視覺方向，排除工具列、提示、網格、控制鈕與選取高亮；以三倍像素倍率產生自動包圍完整場景的圖片。
- PNG 由獨立 SVG 場景轉成瀏覽器原生 Canvas，再輸出 PNG；不使用 viewport 截圖、不使用 `html2canvas`、不依賴外部轉檔服務。必要 API 不可用或產生失敗時，不提供降級圖片。
- Mermaid 輸出 UTF-8 `.mmd`，使用基本 `mindmap` 語法、每層 2 空白縮排、每個節點一行；不加入 layout、theme、shape、icon 或 class 設定，因此只承諾階層與標題。
- Mermaid 使用不依賴標題的穩定合成 ID，依文件前序遍歷產生；標題以安全引用標籤輸出，必要的 Mermaid entity escaping 不得改變渲染後的原文。
- draw.io 輸出 UTF-8、未壓縮、單頁的原生 XML；頁面名稱使用根節點標題，頁面邊界依完整場景與 32 CSS px 邊距自動決定，不使用固定 A4 或分頁。
- draw.io 每個節點都是可編輯圓角矩形，父子關係是由父至子的方向箭頭與直角折線；內部節點／連線 ID 依前序遍歷穩定產生，不帶入 QuickMind UUID 或隱藏 metadata。
- PNG、Mermaid 與 draw.io 是單向外部格式，不提供回匯能力，也不改變 QuickMind 原生文件 Schema。
- 工具列保留原生 `.quickmind` 匯出，另提供三個直接的外部匯出按鈕；全螢幕模式沿用既有行為，工具列隱藏，退出後才能使用匯出按鈕。
- 匯出前若有正在編輯的節點標題，先提交有效輸入；空白或超出限制時保留編輯狀態並取消匯出。
- 外部匯出成功或失敗都不建立文件歷史、不更新 `updatedAt`、不觸發本機保存、不改變選取或任何畫布視圖狀態；成功外部匯出不清除「尚未匯出」。
- 保存狀態為 error 時仍允許三種外部匯出，但不解除保存警告、不解除會覆蓋工作副本的限制。
- 檔名使用根節點標題的既有安全清理規則，分別加上小寫 `.png`、`.mmd`、`.drawio`；不使用文件 UUID。
- 外部匯出沿用工作區的 10 MB JSON／10,000 節點限制；若輸出格式或瀏覽器產出能力不足，原子拒絕且不下載部分結果。
- 所有使用者標題都以純文字處理，對 HTML、XML、Mermaid 與其他控制字元做必要轉義；不得執行、格式化或截斷使用者內容。
- 外部格式產生在首次成功載入後必須離線完成，不嵌入 draw.io 編輯器、不啟動 Mermaid 執行引擎、不呼叫雲端轉換服務，也不新增外部字型資產。
- 狀態訊息使用格式專屬的成功／失敗文字，錯誤保留可展開的細節與重試入口；匯出失敗時工作區內容、未匯出狀態與本機保存狀態保持不變。

## Testing Decisions

- 測試以外部行為為主，不鎖定 DOM 私有結構、函式拆分或特定 XML 屬性順序；只有會影響外部檔案契約的穩定內容才驗證。
- 主要測試 seam 使用既有的 Chromium Playwright 工作區邊界：建立階層、收合節點、改變縮放／平移／選取、點擊三個匯出按鈕，從真實下載事件檢查檔名、內容與 UI 回饋。
- 次要測試 seam 是純匯出服務邊界：以文件快照驗證共同版面、節點順序、完整樹、特殊標題、穩定 ID、檔案限制與原子失敗；不讓測試依賴瀏覽器 DOM。
- PNG 測試驗證下載副檔名、PNG signature、圖片尺寸等於完整匯出版面加上 32px 邊距後乘以 3、包含長標題與所有節點，且不驗證像素顏色的脆弱逐像素差異。
- Mermaid 測試驗證 `mindmap` header、2 空白縮排、前序順序、合成 ID、UTF-8、特殊字元轉義、重複標題與收合分支仍完整輸出；使用結構性檢查，不把 Mermaid runtime 加入 QuickMind。
- draw.io 測試驗證 UTF-8 未壓縮 XML 可解析、具有單頁與標準根節點、每個文件節點有可編輯 vertex、每條父子關係有方向 edge、頁面名稱與節點標題正確，且沒有 QuickMind UUID／隱藏 metadata。
- UI 測試驗證三個按鈕使用原生可聚焦控制項、成功訊息格式正確、失敗保留工作區、外部匯出不清除「尚未匯出」、保存失敗時按鈕仍可用，以及全螢幕退出後可繼續匯出。
- 編輯邊界測試驗證匯出前有效標題會提交，空白／超限標題會取消匯出並保留編輯狀態。
- 限制與錯誤測試驗證 10 MB／10,000 節點邊界、Canvas／SVG 產生失敗、無法解析的特殊標題與瀏覽器能力不足時不會產生部分下載。
- 測試先沿用目前原生匯出 smoke flow、原生格式 round-trip tests、文件工作流限制／保存失敗 tests 與現有 Chromium E2E 的操作模式，再補上外部匯出案例。
- 完成驗證時沿用專案既有 Docker Compose 入口，執行 typecheck、unit tests、build 與 Chromium E2E；不把主機直接執行 npm／Node 視為 CI 契約。

## Out of Scope

- PDF、SVG、JPEG、WebP 或其他圖片格式。
- PNG、Mermaid 或 draw.io 的匯入與雙向 round-trip。
- 以 Mermaid 或 draw.io 作為 QuickMind 執行時的渲染引擎或編輯器依賴。
- draw.io 富文字、自由定位、多選、群組、附件、圖片節點、跨連結、分組外框或其他 QuickMind v1 未支援的資料能力。
- Mermaid custom theme、layout、icon、class、動畫、互動 callback、外部 icon pack 或 renderer-specific extensions。
- 只匯出選取節點、只匯出可見 viewport、依收合狀態省略後代、匯出工作區工具列與視圖裝飾。
- 讓外部輸出清除原生「尚未匯出」狀態、取代本機工作副本或新增外部檔案 metadata。
- File System Access API 靜默覆寫、檔案 handle 保存、OS 雙擊開啟、雲端備份、伺服器端轉檔或遙測。
- 跨裝置精確字型一致、固定色票相容性、逐像素視覺回歸與大規模效能最佳化；輸出仍受現有文件規模邊界保護。

## Further Notes

- 這是 Stage 3 外部格式輸出規格；它沿用 QuickMind 的單一文件、本機保存、離線與原生格式邊界。
- 「PNG 圖片匯出」、「Mermaid 原始碼匯出」、「draw.io 原生匯出」、「匯出版面」與「外部格式匯出」等語彙已寫入專案 glossary。
- 共用匯出版面決策記錄於 ADR 0031；外部格式作為單向表示且不清除原生備份狀態的決策記錄於 ADR 0032。
- Mermaid mindmap 目前仍是 Mermaid 官方文件所描述的實驗性語法；本規格因此只把階層與標題內容列為 QuickMind 契約，不凍結第三方 renderer 的實際排列。參考：[Mermaid mindmap syntax](https://mermaid.js.org/syntax/mindmap.html)。
- draw.io 檔案採未壓縮 XML，符合 diagrams.net 對 `.drawio` XML 與程式產生檔案的可檢查性方向。參考：[draw.io diagram generation](https://www.drawio.com/docs/reference/diagram-generation/)。
