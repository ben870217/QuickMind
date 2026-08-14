export function renderAppShell(): string {
  return `
    <div class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">LOCAL-FIRST MIND MAPPING</p>
          <h1>QuickMind</h1>
        </div>
        <p class="app-status" data-app-status role="status">準備中</p>
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
