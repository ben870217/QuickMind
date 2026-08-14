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
        <ul class="mindmap-tree" role="tree">${renderNode(state.document.root, state, 1)}</ul>
        <p class="workspace-hint">目前文件已準備好，可以開始整理階層。</p>
      </article>
    </section>
  `;
}

function renderNode(node: WorkspaceState['document']['root'], state: WorkspaceState, level: number): string {
  const editing = state.editing?.nodeId === node.id;
  const content = editing
    ? `<input class="node-editor" data-node-editor data-node-id="${node.id}" value="${escapeHtml(node.text)}" maxlength="200" aria-label="編輯節點標題" />`
    : `<button class="node-card" type="button" data-node-id="${node.id}" aria-selected="${state.selectionId === node.id}">${escapeHtml(node.text)}</button>`;
  const children = node.children.length > 0
    ? `<ul class="mindmap-children" role="group">${node.children.map((child) => renderNode(child, state, level + 1)).join('')}</ul>`
    : '';

  return `<li class="mindmap-node" role="treeitem" aria-level="${level}" aria-selected="${state.selectionId === node.id}" data-node-id="${node.id}">${content}${children}</li>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
