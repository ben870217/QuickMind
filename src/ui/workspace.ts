import type { WorkspaceState } from '../workspace/document-workflow';

export function renderWorkspace(container: HTMLElement, state: WorkspaceState): void {
  const connectivityLabel = state.connectivity === 'offline' ? '離線模式' : '線上模式';
  const persistenceLabel = state.persistence === 'saved' ? '已保存到本機' : '保存中';
  const exportLabel = state.hasUnexportedChanges ? '尚未匯出' : '已匯出原生檔';

  container.innerHTML = `
    <section class="document-workspace" aria-labelledby="document-title">
      <div class="workspace-toolbar">
        <button class="history-button" type="button" data-history-action="undo" aria-label="復原（Ctrl／⌘+Z）" aria-keyshortcuts="Control+Z Meta+Z" title="復原（Ctrl／⌘+Z）"${state.canUndo ? '' : ' disabled'}>↶ 復原</button>
        <button class="history-button" type="button" data-history-action="redo" aria-label="重做（Ctrl／⌘+Shift+Z）" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" title="重做（Ctrl／⌘+Shift+Z）"${state.canRedo ? '' : ' disabled'}>↷ 重做</button>
        <button class="file-button" type="button" data-file-action="import" title="匯入 QuickMind 原生檔案">匯入 .quickmind</button>
        <button class="file-button" type="button" data-file-action="export" title="匯出 QuickMind 原生檔案">匯出 .quickmind</button>
        <input class="native-file-input" type="file" data-native-file-input accept=".quickmind" aria-label="選擇 QuickMind 原生檔案" />
        <span class="workspace-badge">${connectivityLabel}</span>
        <span class="workspace-badge">${persistenceLabel}</span>
        <span class="workspace-badge">${exportLabel}</span>
      </div>
      <p class="file-message" data-file-message hidden role="status"></p>
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
  const toggle = node.children.length > 0
    ? `<button class="node-toggle" type="button" data-collapse-node="${node.id}" aria-label="${node.isCollapsed ? '展開' : '收合'} ${escapeHtml(node.text)}">${node.isCollapsed ? '▸' : '▾'}</button>`
    : '<span class="node-toggle-placeholder" aria-hidden="true"></span>';
  const content = editing
    ? `<input class="node-editor" data-node-editor data-node-id="${node.id}" value="${escapeHtml(node.text)}" maxlength="200" aria-label="編輯節點標題" />`
    : `<button class="node-card" type="button" data-node-id="${node.id}" data-drag-node="${node.id}" draggable="${level > 1}" aria-grabbed="false" aria-selected="${state.selectionId === node.id}">${escapeHtml(node.text)}</button>`;
  const children = node.children.length > 0 && !node.isCollapsed
    ? `<ul class="mindmap-children" role="group">${node.children.map((child) => renderNode(child, state, level + 1)).join('')}</ul>`
    : '';

  return `<li class="mindmap-node" role="treeitem" aria-level="${level}" aria-expanded="${node.children.length > 0 ? !node.isCollapsed : 'false'}" aria-selected="${state.selectionId === node.id}" data-node-id="${node.id}"><div class="node-row" data-drop-target="${node.id}">${toggle}${content}</div>${children}</li>`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
