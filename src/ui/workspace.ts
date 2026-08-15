import { countUserVisibleCharacters, MAX_NODE_TITLE_LENGTH } from '../domain/document';
import type { WorkspaceState } from '../workspace/document-workflow';

export function renderWorkspace(container: HTMLElement, state: WorkspaceState): void {
  const documentChanged = container.dataset.canvasDocumentId !== undefined
    && container.dataset.canvasDocumentId !== state.document.meta.id;
  const zoom = documentChanged ? 1 : clamp(Number(container.dataset.canvasZoom ?? 1), 0.5, 2);
  const panX = documentChanged ? 0 : finiteNumber(container.dataset.canvasPanX);
  const panY = documentChanged ? 0 : finiteNumber(container.dataset.canvasPanY);
  container.dataset.canvasDocumentId = state.document.meta.id;
  container.dataset.canvasZoom = String(zoom);
  container.dataset.canvasPanX = String(panX);
  container.dataset.canvasPanY = String(panY);

  const connectivityLabel = state.connectivity === 'offline' ? '離線模式' : '線上模式';
  const persistenceLabel = state.persistence === 'saved'
    ? '已保存到本機'
    : state.persistence === 'error' ? '未保存到本機' : '保存中';
  const exportLabel = state.hasUnexportedChanges ? '尚未匯出' : '已匯出原生檔';
  const importLocked = state.persistence === 'error';
  const exportButtonLabel = importLocked ? '匯出救援檔案' : '匯出 .quickmind';
  const limitMessage = state.limitError
    ? `操作已拒絕：目前 ${state.limitError.nodeCount.toLocaleString()} / ${state.limitError.maxNodes.toLocaleString()} 個節點、${state.limitError.byteLength.toLocaleString()} / ${state.limitError.maxBytes.toLocaleString()} bytes。`
    : '';

  container.innerHTML = `
    <section class="document-workspace" aria-labelledby="document-title">
      <div class="workspace-toolbar">
        <button class="history-button" type="button" data-history-action="undo" aria-label="復原（Ctrl／⌘+Z）" aria-keyshortcuts="Control+Z Meta+Z" title="復原（Ctrl／⌘+Z）"${state.canUndo ? '' : ' disabled'}>↶ 復原</button>
        <button class="history-button" type="button" data-history-action="redo" aria-label="重做（Ctrl／⌘+Shift+Z）" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z" title="重做（Ctrl／⌘+Shift+Z）"${state.canRedo ? '' : ' disabled'}>↷ 重做</button>
        <button class="file-button" type="button" data-file-action="import" title="匯入 QuickMind 原生檔案"${importLocked ? ' disabled' : ''}>匯入 .quickmind</button>
        <button class="file-button" type="button" data-file-action="export" title="${importLocked ? '匯出救援檔案' : '匯出 QuickMind 原生檔案'}">${exportButtonLabel}</button>
        ${importLocked ? '<button class="file-button" type="button" data-persistence-action="retry">立即重試保存</button>' : ''}
        <button class="file-button file-button-danger" type="button" data-file-action="clear" title="清除本機工作副本"${importLocked ? ' disabled' : ''}>清除本機</button>
        <input class="native-file-input" type="file" data-native-file-input accept=".quickmind" aria-label="選擇 QuickMind 原生檔案" />
        <span class="workspace-badge" data-status-badge="connectivity">${connectivityLabel}</span>
        <span class="workspace-badge" data-status-badge="persistence">${persistenceLabel}</span>
        <span class="workspace-badge" data-status-badge="export">${exportLabel}</span>
      </div>
      <p class="file-message" data-file-message${limitMessage ? '' : ' hidden'}${importLocked ? ' data-error="true"' : ''} role="status">${limitMessage}</p>
      <section class="canvas-viewport" data-canvas tabindex="0" aria-label="心智圖畫布">
        <button class="canvas-fullscreen-control" type="button" data-canvas-action="fullscreen" aria-label="進入全螢幕" title="進入全螢幕">⛶ 全螢幕</button>
        <div class="canvas-content" data-canvas-content style="transform: translate3d(${panX}px, ${panY}px, 0) scale(${zoom});">
          <article class="root-node">
            <p class="node-kicker">根節點</p>
            <ul class="mindmap-tree" role="tree">${renderNode(state.document.root, state, 1)}</ul>
            <p class="workspace-hint">目前文件已準備好，可以開始整理階層。</p>
          </article>
        </div>
      </section>
    </section>
  `;
}

function renderNode(node: WorkspaceState['document']['root'], state: WorkspaceState, level: number): string {
  const editing = state.editing?.nodeId === node.id;
  const toggle = node.children.length > 0
    ? `<button class="node-toggle" type="button" data-collapse-node="${node.id}" aria-label="${node.isCollapsed ? '展開' : '收合'} ${escapeHtml(node.text)}">${node.isCollapsed ? '▸' : '▾'}</button>`
    : '<span class="node-toggle-placeholder" aria-hidden="true"></span>';
  const titleCount = countUserVisibleCharacters(node.text);
  const titleCountId = `title-count-${node.id}`;
  const content = editing
    ? `<div class="node-editor-wrap"><input class="node-editor" data-node-editor data-node-id="${node.id}" value="${escapeHtml(node.text)}" aria-describedby="${titleCountId}" aria-label="編輯節點標題" /><span class="title-counter" id="${titleCountId}" data-title-count>還可輸入 ${MAX_NODE_TITLE_LENGTH - titleCount} 個字元</span></div>`
    : `<button class="node-card" type="button" data-node-id="${node.id}" data-drag-node="${node.id}" draggable="${level > 1}" aria-grabbed="false" aria-selected="${state.selectionId === node.id}">${escapeHtml(node.text)}</button>`;
  const children = node.children.length > 0 && !node.isCollapsed
    ? `<ul class="mindmap-children" role="group">${node.children.map((child) => renderNode(child, state, level + 1)).join('')}</ul>`
    : '';

  return `<li class="mindmap-node" role="treeitem" aria-level="${level}" aria-expanded="${node.children.length > 0 ? !node.isCollapsed : 'false'}" aria-selected="${state.selectionId === node.id}" data-node-id="${node.id}"><div class="node-row" data-drop-target="${node.id}">${toggle}${content}</div>${children}</li>`;
}

function finiteNumber(value: string | undefined): number {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
