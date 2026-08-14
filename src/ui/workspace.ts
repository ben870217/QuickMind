import type { WorkspaceState } from '../workspace/document-workflow';

export function renderWorkspace(container: HTMLElement, state: WorkspaceState): void {
  const connectivityLabel = state.connectivity === 'offline' ? '離線模式' : '線上模式';
  const persistenceLabel = state.persistence === 'saved' ? '已保存到本機' : '保存中';

  container.innerHTML = `
    <section class="document-workspace" aria-labelledby="document-title">
      <div class="workspace-toolbar">
        <span class="workspace-badge">${connectivityLabel}</span>
        <span class="workspace-badge">${persistenceLabel}</span>
      </div>
      <article class="root-node" data-node-id="${state.document.root.id}">
        <p class="node-kicker">根節點</p>
        <h2 id="document-title">${escapeHtml(state.document.root.text)}</h2>
        <p class="workspace-hint">目前文件已準備好，可以開始整理階層。</p>
      </article>
    </section>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
