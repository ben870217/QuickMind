export function renderAppShell(): string {
  return `
    <div class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">LOCAL-FIRST MIND MAPPING</p>
          <h1>QuickMind</h1>
        </div>
        <div class="app-header-tools">
          <label class="theme-control" for="theme-select">介面主題
            <select id="theme-select" data-theme-select>
              <option value="system">跟隨系統</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <button class="file-button install-button" type="button" data-install-action="prompt" hidden>安裝 QuickMind</button>
          <p class="app-status" data-app-status role="status">準備中</p>
        </div>
      </header>
      <main class="workspace" data-workspace tabindex="0" aria-label="QuickMind 工作區">
        <section class="canvas-placeholder" aria-labelledby="welcome-title">
          <p class="canvas-kicker">Stage 1</p>
          <h2 id="welcome-title">正在載入本機文件</h2>
          <p>QuickMind 會從瀏覽器本機恢復你的工作副本。</p>
        </section>
      </main>
    </div>
  `;
}
