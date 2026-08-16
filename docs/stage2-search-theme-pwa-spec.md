# QuickMind Stage 2：搜尋、主題與 PWA 安裝

> 狀態：已接受並完成實作；驗收結果見 [Stage 2 驗收與發布紀錄](stage2-acceptance.md)。

## Problem Statement

在 Stage 2 規劃前，QuickMind 已具備單一本機文件的階層編輯、離線核心、原生 `.quickmind` 保存與 Stage 3 外部格式匯出，但缺少文件搜尋、Dark 顯示與可安裝的 PWA app shell。文件節點增加後，使用者只能靠畫布與鍵盤逐一尋找節點；介面固定為 Light 外觀，長時間使用或低光環境下缺少 Dark 選項；Service Worker 已存在，但應用程式尚未提供可安裝的 PWA app shell。

這些缺口不能以改變 QuickMind 原生文件格式、增加雲端服務或破壞 local-first 邊界來解決。搜尋、主題與 PWA 必須維持單一文件、瀏覽器本機資料、離線核心與既有原生匯入／匯出契約。

## Solution

交付 Stage 2 的三項能力，實作順序為「搜尋 → Light／Dark 主題 → PWA 安裝」：

- 在目前單一文件中搜尋所有節點標題，提供 `Ctrl+F`／`⌘F` 與可見的「搜尋」按鈕，並以可存取的非遮罩浮層處理結果導覽、暫時展開與焦點。
- 在應用程式標題列提供「跟隨系統／Light／Dark」主題選單；主題只影響介面，首屏即套用並持久保存，不寫入文件。
- 提供符合 GitHub Pages base path 的 PWA manifest 與原生安裝提示入口；安裝後使用 `standalone` 視窗，沿用同一來源與本機工作副本。

三項能力都不建立文件歷史、不更新 `updatedAt`，也不改變原生 `.quickmind` Schema。搜尋是第一個可獨立驗收的垂直切片，主題與 PWA 依序接續。

## User Stories

1. As a 個人桌面使用者, I want to 搜尋目前單一文件的節點標題, so that 我可以快速找到想法而不必逐一瀏覽畫布。
2. As a 個人桌面使用者, I want to 用 `Ctrl+F` 或 `⌘F` 開啟 QuickMind 搜尋, so that 我可以用熟悉的快捷鍵開始尋找。
3. As a 個人桌面使用者, I want to 從文件工具列按下「搜尋」, so that 我不熟悉快捷鍵時仍能發現這項能力。
4. As a 鍵盤使用者, I want to 搜尋開啟後輸入框立即取得焦點, so that 我不必再用滑鼠點擊才能輸入查詢。
5. As a 個人桌面使用者, I want to 搜尋採不分大小寫的子字串比對, so that 部分標題也能找到完整節點。
6. As a 個人桌面使用者, I want to 搜尋包含收合分支中的全部節點, so that 暫時不可見的想法不會被漏掉。
7. As a 個人桌面使用者, I want to 搜尋只比對節點標題, so that 備註內容不會產生意外結果。
8. As a 個人桌面使用者, I want to 搜尋不支援正規表示式與文字取代, so that 搜尋行為保持簡單且可預期。
9. As a 個人桌面使用者, I want to 搜尋結果依文件樹前序與同層順序排列, so that 結果順序符合我閱讀心智圖的方式。
10. As a 個人桌面使用者, I want to 看到目前結果與總數, so that 我知道自己位於結果集合中的哪個位置。
11. As a 個人桌面使用者, I want to 看到查無結果時的 `0 / 0` 與清楚訊息, so that 我知道查詢沒有命中節點。
12. As a 個人桌面使用者, I want to 輸入非空查詢後立即選取第一筆結果, so that 我不必再按一次 Enter 才能看到第一個命中。
13. As a 鍵盤使用者, I want to 用 `Enter` 或 `ArrowDown` 前往下一筆, so that 我可以不中斷輸入流程導覽結果。
14. As a 鍵盤使用者, I want to 用 `Shift+Enter` 或 `ArrowUp` 前往上一筆, so that 我可以反向檢查結果。
15. As a 個人桌面使用者, I want to 結果到最後一筆後循環回第一筆, so that 導覽不會在邊界停止。
16. As a 個人桌面使用者, I want to 選取收合分支內的結果時自動暫時展開祖先, so that 我能直接看見並聚焦找到的節點。
17. As a 個人桌面使用者, I want to 搜尋造成的展開不算文件變更, so that 找節點不會污染 Undo／Redo 或 `updatedAt`。
18. As a 個人桌面使用者, I want to 關閉搜尋後保留搜尋造成的暫時展開, so that 我可以繼續處理剛找到的節點。
19. As a 個人桌面使用者, I want to 重新開啟或匯入文件時清除暫時展開, so that 文件只恢復 `.quickmind` 中真正保存的收合狀態。
20. As a 個人桌面使用者, I want to 搜尋開啟期間文件標題變更時結果即時更新, so that 結果不會停留在過期內容。
21. As a 個人桌面使用者, I want to 刪除目前搜尋結果後自動前往下一筆或上一筆, so that 導覽不會落到不存在的節點。
22. As a 個人桌面使用者, I want to 拖曳節點後搜尋結果重新計算, so that 結果順序與目前文件一致。
23. As a 節點編輯者, I want to 編輯標題時暫停搜尋結果導覽但保留查詢, so that 輸入文字時結果焦點不會搶走編輯器。
24. As a 節點編輯者, I want to 在編輯期間使用搜尋快捷鍵而保留未提交文字, so that 開啟搜尋不會丟失正在編輯的內容。
25. As a 節點編輯者, I want to 搜尋只使用已提交的標題內容, so that 未完成輸入不會被誤當成文件結果。
26. As a 鍵盤使用者, I want to 搜尋浮層內的 Tab 焦點循環不逸出, so that 我可以只用鍵盤操作搜尋控制項。
27. As a 螢幕閱讀器使用者, I want to 搜尋浮層具有可讀標題與 `role="dialog"`, so that 我能理解目前進入的是搜尋工作階段。
28. As a 個人桌面使用者, I want to 搜尋浮層不遮罩畫布, so that 我可以持續看到節點與結果之間的關係。
29. As a 個人桌面使用者, I want to 搜尋浮層只提供輸入框、計數、上一筆、下一筆與關閉, so that 操作介面保持聚焦而不重複列出畫布內容。
30. As a 個人桌面使用者, I want to 清空查詢時清除結果但保留目前選取, so that 回到中性搜尋狀態時不會失去工作上下文。
31. As a 個人桌面使用者, I want to 非空查詢查無結果時清除節點選取, so that 畫面不會保留與目前查詢無關的舊結果。
32. As a 個人桌面使用者, I want to 有結果時關閉搜尋仍保留最後結果的選取與焦點, so that 我可以直接繼續編輯或操作找到的節點。
33. As a 鍵盤使用者, I want to 查無結果時關閉搜尋回到實際觸發搜尋的元素, so that 我不會在關閉浮層後失去鍵盤位置。
34. As a 個人桌面使用者, I want to 下次開啟搜尋時查詢為空, so that 上一次搜尋不會意外套用到新工作。
35. As a 個人桌面使用者, I want to 選擇「跟隨系統」、Light 或 Dark, so that 我可以依環境與偏好閱讀 QuickMind。
36. As a 個人桌面使用者, I want to 第一次載入時預設跟隨系統外觀, so that QuickMind 能符合我目前的桌面偏好。
37. As a 個人桌面使用者, I want to 在標題列使用原生「介面主題」選單, so that 我能以滑鼠或鍵盤明確切換主題。
38. As a 個人桌面使用者, I want to 明確選擇的主題在重新載入後保留, so that 我不必每次開啟 QuickMind 都重新設定。
39. As a 個人桌面使用者, I want to 跟隨系統只在載入時讀取作業系統外觀, so that QuickMind 工作階段中不會因系統變更突然改變介面。
40. As a 個人桌面使用者, I want to 主題選擇只影響介面而不寫入文件, so that 同一份心智圖不會因顯示偏好而產生內容差異。
41. As a 個人桌面使用者, I want to 主題切換不進 Undo／Redo 且不更新 `updatedAt`, so that 視覺偏好不會被當成文件編輯。
42. As a 個人桌面使用者, I want to Light 與 Dark 都保持莫蘭迪方向與基本可讀對比, so that 顏色改變不會犧牲文字、焦點或錯誤訊息的理解。
43. As a 鍵盤使用者, I want to 主題切換後焦點指示仍清楚, so that 我不必依賴滑鼠或顏色才能知道目前位置。
44. As a 個人桌面使用者, I want to 瀏覽器 `theme-color` 隨初始主題與明確切換同步, so that 瀏覽器外框與 QuickMind 介面一致。
45. As a 個人桌面使用者, I want to 首次顯示時就套用正確主題, so that 我不會看到 Light→Dark 的白屏閃爍。
46. As a 個人桌面使用者, I want to 主題無法保存時仍能在當次工作階段使用, so that 瀏覽器儲存限制不會阻斷文件工作。
47. As a 個人桌面使用者, I want to 看到標題列的「安裝 QuickMind」入口, so that 我能將常用工具安裝成桌面應用程式。
48. As a 個人桌面使用者, I want to 安裝入口只在瀏覽器提供原生安裝提示時出現, so that 我不會點到無法工作的假按鈕。
49. As a 個人桌面使用者, I want to 安裝入口呼叫瀏覽器原生提示, so that 安裝流程符合瀏覽器安全模型。
50. As a 個人桌面使用者, I want to 瀏覽器不支援原生提示時仍可使用分頁版 QuickMind, so that PWA 能力不是文件功能的前提。
51. As a 個人桌面使用者, I want to 安裝完成後隱藏安裝入口, so that 工具列不保留已無作用的操作。
52. As a 個人桌面使用者, I want to 安裝完成後不顯示常駐「已安裝」徽章, so that 應用程式介面保持簡潔。
53. As a 個人桌面使用者, I want to 安裝後以獨立視窗開啟, so that QuickMind 更接近桌面工具的使用體驗。
54. As a 個人桌面使用者, I want to 已安裝的 QuickMind 沿用相同來源與本機工作副本, so that 我不會得到第二份或遺失原有文件資料。
55. As a 離線使用者, I want to 安裝與否不影響首次成功載入後的離線核心, so that 我可以依需求選擇是否安裝。
56. As a GitHub Pages 使用者, I want to PWA manifest、啟動網址與 scope 遵守 `/QuickMind/` base path, so that 安裝後不會導向錯誤頁面。
57. As a 專案維護者, I want to Stage 2 仍通過既有 Docker Compose 檢查與 Chromium E2E, so that 新能力不會降低既有資料安全與發布信心。

## Implementation Decisions

- Stage 2 的能力順序固定為搜尋、主題、PWA；搜尋先形成可獨立展示與驗收的垂直切片。
- 搜尋的狀態屬於工作區視圖狀態，不新增 QuickMind 原生文件欄位；搜尋結果透過既有文件工作流的選取、畫布聚焦與暫時展開能力呈現。
- 搜尋結果計算使用文件樹的前序遍歷與既有 `children` 順序；匹配只接受節點標題的不分大小寫子字串。
- 搜尋浮層使用原生可聚焦控制項、可讀對話框語義與焦點循環；浮層由工作區 UI 管理，不以外部搜尋套件或瀏覽器原生頁面搜尋取代 QuickMind 搜尋。
- 搜尋開啟、關閉、查詢、結果索引與暫時展開不觸發保存、Undo／Redo 或 `updatedAt` 更新；文件變更仍沿用既有 `DocumentWorkflow` 流程。
- 搜尋快捷鍵是全域工作區行為；節點標題編輯器仍保留未提交輸入，搜尋只看已提交文件內容，關閉搜尋後恢復編輯狀態。
- 搜尋按鈕與搜尋浮層使用原生 HTML 控制項；搜尋浮層位於文件工作區右上方工具列下方，不遮罩畫布、不隨畫布平移或縮放。
- 主題由三種介面模式組成：跟隨系統、Light、Dark；預設為跟隨系統，明確選擇的模式持久保留在瀏覽器本機。
- 跟隨系統只在 QuickMind 載入時讀取當下系統偏好；不在工作階段中監聽作業系統外觀變更。主題持久化失敗時只在記憶體中套用當次選擇，重新載入後回到跟隨系統。
- 主題使用 CSS 變數提供 Light／Dark 色階，保留目前莫蘭迪方向並要求基本可讀對比；精確色票不是文件或介面相容性契約。
- 主題選單位於應用程式標題列，使用原生選單並標示「介面主題」；主題不寫入 `.quickmind`、文件歷史或 `updatedAt`。
- 首屏主題初始化在應用程式內容繪製前完成，優先讀取已保存選擇，沒有明確選擇時讀取當下系統偏好；初始化不等待文件載入或 Service Worker。
- 初始主題與主題切換同步更新瀏覽器 `theme-color`；該值只屬於應用程式外觀。
- PWA 使用符合目前部署 base path 的 manifest，採 `standalone` 顯示模式、相同來源與既有本機工作副本；不新增帳戶、同步或資料搬移。
- PWA 安裝入口位於應用程式標題列，只有瀏覽器提供原生安裝提示時才顯示；入口呼叫原生提示，不自行模擬不支援的瀏覽器安裝流程。
- 原生安裝完成後隱藏安裝入口，不顯示常駐「已安裝」徽章；安裝狀態不改變文件能力。
- 既有 Service Worker 離線策略與首次成功載入後的離線核心保持不變；PWA 安裝不是離線使用前提。
- 不修改 QuickMindDocument Schema、原生匯入／匯出格式、外部格式匯出契約或保存狀態語義。

## Testing Decisions

- 測試以使用者可觀察的外部行為為主，不鎖定私有 DOM 結構、特定函式拆分、CSS 色碼或瀏覽器內部安裝實作。
- 主要測試 seam 使用既有 Chromium Playwright 工作區邊界，從實際畫面操作搜尋、主題選單、快捷鍵與模擬原生安裝提示，驗證焦點、選取、畫布狀態、文件副作用與下載／重載後狀態。
- 次要測試 seam 只保留給純決定性行為：以既有 domain／unit test 風格驗證樹狀前序搜尋、大小寫子字串、循環索引、暫時展開邊界與主題模式解析；不建立平行的 UI 狀態測試框架。
- 搜尋 E2E 應覆蓋快捷鍵與按鈕入口、輸入焦點、結果計數、第一筆自動選取、上一筆／下一筆循環、收合分支、空查詢、查無結果、Esc 關閉、觸發焦點回復、編輯交界與文件變更即時更新。
- 搜尋測試應斷言搜尋不進 Undo／Redo、不改 `updatedAt`、不觸發本機保存，不以快照鎖定整份工作區 HTML。
- 主題 E2E 應覆蓋三種模式、重新載入持久化、工作階段儲存失敗降級、首屏主題、`theme-color` 同步、原生選單鍵盤操作與主題不改變文件狀態。
- PWA 測試應驗證 manifest 的名稱、顯示模式、啟動網址與 scope 遵守部署 base path，並在瀏覽器測試中模擬 `beforeinstallprompt` 與安裝完成事件，驗證入口顯示、呼叫、隱藏與同源工作副本保留。
- 無障礙驗收沿用既有 Chromium 操作模式，檢查原生控制項名稱、對話框語義、焦點循環、可見焦點、非顏色狀態提示與搜尋關閉後焦點位置。
- 保留既有 Stage 1 local-first smoke、離線核心、原生 `.quickmind` round-trip、保存失敗與 Stage 3 外部匯出測試；新測試不得以主題、搜尋或 PWA 狀態取代文件安全驗收。
- 完成驗證沿用 Docker Compose 入口，執行 typecheck、domain／unit tests、build 與 Chromium E2E；不把主機直接執行 Node、npm 或 Playwright 視為 CI 契約。

## Out of Scope

- 跨文件搜尋、多草稿頁籤、備註搜尋、正規表示式、文字取代、搜尋結果完整清單與跨裝置搜尋。
- 工作階段中即時監聽作業系統外觀變更並自動切換主題。
- 將搜尋查詢、搜尋結果、暫時展開或主題模式寫入 `.quickmind`、Undo／Redo 或 `updatedAt`。
- 固定色票相容性、逐像素視覺回歸、完整跨瀏覽器主題矩陣與自訂高對比主題。
- 自訂 PWA 安裝流程、瀏覽器不支援原生提示時的教學流程、行動瀏覽器正式支援、原生桌面封裝與應用程式商店發布。
- 雲端同步、登入、遙測、文件資料搬移、外部帳戶整合與遠端通知。
- 大規模文件的虛擬化、Web Worker、Minimap、固定 60 FPS、記憶體最佳化與其他 Stage 4 效能承諾。
- 修改 QuickMind 原生 Schema、外部格式匯出／匯入、PNG／Mermaid／draw.io 契約或本機保存錯誤處理。

## Further Notes

- 本規格使用 `CONTEXT.md` 中的「單一文件工作區」、「搜尋」、「主題模式」、「PWA 安裝能力」、「暫時展開」與「本機工作副本」等既有領域語言。
- Stage 2 的規劃順序沿用已接受的 Stage gate；本規格已完成確認、實作與發布前驗收。
- 目前分支已包含 Stage 3 外部格式匯出實作；本規格補的是 Stage 2 能力，不回退或重寫 Stage 3。
- 2026-08-16 的完整 typecheck、unit、build、`/QuickMind/` base-path build 與 Chromium E2E 結果記錄於 `docs/stage2-acceptance.md`。
- Stage 4 仍保留給實際需求驅動的大規模渲染與效能最佳化，不因本次 PWA 或搜尋工作提前凍結效能架構。
