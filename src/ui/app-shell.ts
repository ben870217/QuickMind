export function renderAppShell(): string {
  return `
    <div class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">LOCAL-FIRST MIND MAPPING</p>
          <h1>QuickMind</h1>
        </div>
        <p class="app-status" role="status">準備就緒</p>
      </header>
      <main class="workspace" aria-label="QuickMind 工作區">
        <section class="canvas-placeholder" aria-labelledby="welcome-title">
          <p class="canvas-kicker">Stage 1</p>
          <h2 id="welcome-title">把想法整理成清楚的階層</h2>
          <p>QuickMind 將在這裡提供本機、私密的心智圖工作區。</p>
        </section>
      </main>
    </div>
  `;
}
