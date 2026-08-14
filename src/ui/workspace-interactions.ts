import { findNode, findNodeLocation } from '../domain/document';
import {
  createQuickMindFilename,
  parseQuickMindDocument,
  QuickMindFormatError,
  serializeQuickMindDocument,
} from '../domain/quickmind-format';
import type { DocumentWorkflow, MovePosition } from '../workspace/document-workflow';

export function bindWorkspaceInteractions(
  workspace: HTMLElement,
  workflow: DocumentWorkflow,
  render: () => void,
): () => void {
  let contextMenu: HTMLElement | null = null;
  let contextMenuNodeId: string | null = null;
  let draggingNodeId: string | null = null;

  const focusEditor = (): void => {
    const editor = workspace.querySelector<HTMLInputElement>('[data-node-editor]');
    editor?.focus();
    editor?.select();
  };

  const focusNode = (nodeId: string | null): void => {
    if (!nodeId) {
      return;
    }

    const node = Array.from(workspace.querySelectorAll<HTMLElement>('[data-node-id]'))
      .find((candidate) => candidate.dataset.nodeId === nodeId);
    const focusTarget = node?.querySelector<HTMLElement>('[data-node-editor], .node-card') ?? node;
    focusTarget?.focus();
  };

  const closeContextMenu = (restoreFocus: boolean): void => {
    const nodeId = contextMenuNodeId;
    contextMenu?.remove();
    contextMenu = null;
    contextMenuNodeId = null;

    if (restoreFocus) {
      focusNode(nodeId);
    }
  };

  const executeContextAction = (action: string, nodeId: string): void => {
    closeContextMenu(false);

    if (action === 'add-child') {
      workflow.addChild(nodeId);
      render();
      focusEditor();
    } else if (action === 'add-sibling') {
      workflow.addSibling(nodeId);
      render();
      focusEditor();
    } else if (action === 'rename') {
      workflow.beginEditing(nodeId);
      render();
      focusEditor();
    } else if (action === 'delete') {
      workflow.deleteNode(nodeId);
      render();
      focusNode(workflow.getState().selectionId);
    } else if (action === 'collapse') {
      workflow.toggleCollapse(nodeId);
      render();
      focusNode(nodeId);
    }
  };

  const onContextMenuKeyDown = (event: KeyboardEvent): void => {
    if (!contextMenu) {
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      closeContextMenu(true);
      return;
    }

    const items = Array.from(contextMenu.querySelectorAll<HTMLButtonElement>('[data-context-action]:not(:disabled)'));
    if (items.length === 0) {
      return;
    }

    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const offset = event.key === 'ArrowDown' ? 1 : -1;
      const nextIndex = (currentIndex + offset + items.length) % items.length;
      items[nextIndex]?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      items[currentIndex >= 0 ? currentIndex : 0]?.click();
    }
  };

  const openContextMenu = (nodeId: string, clientX: number, clientY: number): void => {
    closeContextMenu(false);

    const state = workflow.getState();
    const node = findNode(state.document.root, nodeId);
    if (!node) {
      return;
    }

    const hasParent = Boolean(findNodeLocation(state.document.root, nodeId)?.parent);
    contextMenuNodeId = nodeId;
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    contextMenu.dataset.contextMenu = 'true';
    contextMenu.setAttribute('role', 'menu');
    contextMenu.setAttribute('aria-label', '節點操作');
    contextMenu.style.left = `${Math.max(8, clientX)}px`;
    contextMenu.style.top = `${Math.max(8, clientY)}px`;
    contextMenu.innerHTML = [
      ['add-child', '新增子節點', false],
      ['add-sibling', '新增同層節點', !hasParent],
      ['rename', '重新命名', false],
      ['delete', '刪除節點', !hasParent],
      ['collapse', node.children.length > 0 && !node.isCollapsed ? '收合子節點' : '展開子節點', node.children.length === 0],
    ].map(([action, label, disabled]) => `
      <button class="context-menu-item" type="button" role="menuitem" data-context-action="${action}"${disabled ? ' disabled' : ''}>${label}</button>
    `).join('');

    contextMenu.addEventListener('keydown', onContextMenuKeyDown);
    contextMenu.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      const item = target.closest<HTMLButtonElement>('[data-context-action]');
      if (!item || item.disabled || !contextMenuNodeId) {
        return;
      }

      executeContextAction(item.dataset.contextAction ?? '', contextMenuNodeId);
    });
    document.body.append(contextMenu);
    contextMenu.querySelector<HTMLButtonElement>('[data-context-action]:not(:disabled)')?.focus();
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const persistenceAction = target.closest<HTMLButtonElement>('[data-persistence-action]');
    if (persistenceAction?.dataset.persistenceAction === 'retry') {
      workflow.retrySave();
      render();
      showFileMessage('正在重試保存本機工作副本。');
      return;
    }

    const fileAction = target.closest<HTMLButtonElement>('[data-file-action]');
    if (fileAction) {
      if (fileAction.dataset.fileAction === 'import') {
        workspace.querySelector<HTMLInputElement>('[data-native-file-input]')?.click();
      } else if (fileAction.dataset.fileAction === 'export') {
        exportDocument();
      } else if (fileAction.dataset.fileAction === 'clear') {
        const state = workflow.getState();
        const confirmation = state.hasUnexportedChanges
          ? '目前有尚未匯出的變更，確定要清除本機工作副本並建立新文件嗎？'
          : '確定要清除本機工作副本並建立新文件嗎？';
        if (!window.confirm(confirmation)) {
          showFileMessage('已取消清除，原文件未變更。');
          return;
        }

        void workflow.clearDocument().then((nextState) => {
          render();
          showFileMessage(
            nextState.persistence === 'error' ? '清除後的新文件未保存到本機。' : '已清除並建立新的本機文件。',
            nextState.persistence === 'error' ? 'save-failed' : undefined,
          );
        });
      }
      return;
    }

    const historyButton = target.closest<HTMLButtonElement>('[data-history-action]');
    if (historyButton && !historyButton.disabled) {
      const state = historyButton.dataset.historyAction === 'undo'
        ? workflow.undo()
        : workflow.redo();
      render();
      focusNode(state.selectionId);
      return;
    }

    const collapseButton = target.closest<HTMLButtonElement>('[data-collapse-node]');
    if (collapseButton) {
      workflow.toggleCollapse(collapseButton.dataset.collapseNode ?? null);
      render();
      return;
    }

    const node = target.closest<HTMLElement>('[data-node-id]');
    if (!node || target.closest('[data-node-editor]')) {
      return;
    }

    workflow.selectNode(node.dataset.nodeId ?? null);
    render();
  };

  const onDoubleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLElement>('[data-node-id]');
    if (!node || target.closest('[data-node-editor]')) {
      return;
    }

    workflow.beginEditing(node.dataset.nodeId ?? '');
    render();
    focusEditor();
  };

  const onContextMenu = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('.node-row');
    const node = row?.closest<HTMLElement>('[data-node-id]');
    const nodeId = node?.dataset.nodeId;

    if (!row || !nodeId || !workspace.contains(row)) {
      return;
    }

    event.preventDefault();
    workflow.selectNode(nodeId);
    render();
    openContextMenu(nodeId, event.clientX, event.clientY);
  };

  const onDocumentPointerDown = (event: PointerEvent): void => {
    if (contextMenu && !contextMenu.contains(event.target as Node)) {
      closeContextMenu(true);
    }
  };

  const showFileMessage = (message: string, detail?: string): void => {
    const messageElement = workspace.querySelector<HTMLElement>('[data-file-message]');
    if (!messageElement) {
      return;
    }

    messageElement.hidden = false;
    messageElement.dataset.error = detail ? 'true' : 'false';
    messageElement.replaceChildren(document.createTextNode(message));
    if (detail) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '查看驗證位置';
      const detailText = document.createElement('span');
      detailText.textContent = detail;
      details.append(summary, detailText);
      messageElement.append(details);
    }
  };

  const downloadTextFile = (source: string, filename: string): void => {
    const url = URL.createObjectURL(new Blob([source], { type: 'application/json;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const exportDocument = (): void => {
    try {
      const state = workflow.getState();
      const rescue = state.persistence === 'error';
      const source = serializeQuickMindDocument(state.document);
      downloadTextFile(source, createQuickMindFilename(state.document.root.text));
      if (!rescue) {
        workflow.markExported();
      }
      render();
      showFileMessage(rescue ? '已匯出救援檔案；本機保存警告仍然存在。' : '已匯出 QuickMind 原生檔案。');
    } catch (error) {
      const detail = error instanceof QuickMindFormatError ? `${error.code} at ${error.path}` : 'export-failed';
      showFileMessage('匯出失敗，文件內容仍保留在目前工作區。', detail);
    }
  };

  const importFile = async (file: File): Promise<void> => {
    if (workflow.getState().persistence === 'error') {
      showFileMessage('目前未保存到本機，請先重試保存或匯出救援檔案；原文件未變更。', 'save-failed');
      return;
    }

    if (!file.name.toLowerCase().endsWith('.quickmind')) {
      showFileMessage('匯入失敗：只接受 .quickmind 檔案。', 'invalid-file-extension');
      return;
    }

    if (workflow.getState().hasUnexportedChanges && !window.confirm('目前有尚未匯出的變更，確定要以匯入文件取代嗎？')) {
      showFileMessage('已取消匯入，原文件未變更。');
      return;
    }

    try {
      const document = parseQuickMindDocument(await file.text());
      const changed = workflow.replaceDocument(document);
      render();
      showFileMessage(changed ? '已匯入 QuickMind 原生檔案。' : '匯入內容與目前文件相同，未產生變更。');
    } catch (error) {
      const detail = error instanceof QuickMindFormatError ? `${error.code} at ${error.path}` : 'import-failed';
      showFileMessage('匯入失敗，原文件未變更。', detail);
    }
  };

  const clearDropIndicator = (): void => {
    workspace.querySelectorAll<HTMLElement>('[data-drop-target]').forEach((row) => {
      row.classList.remove('drop-before', 'drop-inside', 'drop-after');
    });
  };

  const getDropPosition = (event: DragEvent, row: HTMLElement): MovePosition => {
    const bounds = row.getBoundingClientRect();
    const ratio = bounds.height > 0 ? (event.clientY - bounds.top) / bounds.height : 0.5;
    return ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
  };

  const onDragStart = (event: DragEvent): void => {
    const target = event.target as HTMLElement;
    const draggable = target.closest<HTMLElement>('[data-drag-node]');
    const nodeId = draggable?.dataset.dragNode;
    if (!draggable || !nodeId) {
      return;
    }

    draggingNodeId = nodeId;
    draggable.classList.add('is-dragging');
    draggable.setAttribute('aria-grabbed', 'true');
    event.dataTransfer?.setData('application/x-quickmind-node', nodeId);
    event.dataTransfer?.setData('text/plain', nodeId);
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
    }
  };

  const onDragOver = (event: DragEvent): void => {
    if (event.dataTransfer?.types.includes('Files')) {
      event.preventDefault();
      clearDropIndicator();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = 'copy';
      }
      return;
    }

    if (!draggingNodeId) {
      return;
    }

    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-drop-target]');
    const targetId = row?.dataset.dropTarget;
    const position = row ? getDropPosition(event, row) : null;
    if (!row || !targetId || !position || !workspace.contains(row) || !workflow.canMoveNode(draggingNodeId, targetId, position)) {
      clearDropIndicator();
      return;
    }

    event.preventDefault();
    clearDropIndicator();
    row.classList.add(`drop-${position}`);
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'move';
    }
  };

  const onDragLeave = (event: DragEvent): void => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-drop-target]');
    if (row && !row.contains(event.relatedTarget as Node | null)) {
      row.classList.remove('drop-before', 'drop-inside', 'drop-after');
    }
  };

  const onDrop = (event: DragEvent): void => {
    const file = event.dataTransfer?.files[0];
    if (file) {
      event.preventDefault();
      void importFile(file);
      clearDropIndicator();
      return;
    }

    if (!draggingNodeId) {
      return;
    }

    const target = event.target as HTMLElement;
    const row = target.closest<HTMLElement>('[data-drop-target]');
    const targetId = row?.dataset.dropTarget;
    const position = row ? getDropPosition(event, row) : null;
    if (!row || !targetId || !position || !workspace.contains(row) || !workflow.canMoveNode(draggingNodeId, targetId, position)) {
      clearDropIndicator();
      return;
    }

    event.preventDefault();
    const movedNodeId = draggingNodeId;
    workflow.moveNode(movedNodeId, targetId, position);
    clearDropIndicator();
    render();
    focusNode(movedNodeId);
  };

  const onFileInputChange = (event: Event): void => {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void importFile(file);
    }
  };

  const onDragEnd = (): void => {
    const dragged = draggingNodeId
      ? Array.from(workspace.querySelectorAll<HTMLElement>('[data-drag-node]'))
        .find((candidate) => candidate.dataset.dragNode === draggingNodeId)
      : null;
    dragged?.classList.remove('is-dragging');
    dragged?.setAttribute('aria-grabbed', 'false');
    draggingNodeId = null;
    clearDropIndicator();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    const editor = target.closest<HTMLInputElement>('[data-node-editor]');

    if (editor) {
      if (event.isComposing) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (workflow.commitTitle(editor.value)) {
          render();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        workflow.cancelEditing();
        render();
      }

      return;
    }

    const state = workflow.getState();
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    if (modifier && key === 'z') {
      event.preventDefault();
      const nextState = event.shiftKey ? workflow.redo() : workflow.undo();
      render();
      focusNode(nextState.selectionId);
    } else if (event.ctrlKey && key === 'y') {
      event.preventDefault();
      const nextState = workflow.redo();
      render();
      focusNode(nextState.selectionId);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      workflow.navigate('up');
      render();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      workflow.navigate('down');
      render();
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      workflow.navigate('left');
      render();
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      workflow.navigate('right');
      render();
    } else if (event.key === ' ') {
      event.preventDefault();
      workflow.toggleCollapse(state.selectionId);
      render();
    } else if (event.key === 'Delete') {
      event.preventDefault();
      workflow.deleteNode(state.selectionId);
      render();
    } else if (!state.selectionId) {
      return;
    } else if (event.key === 'Enter') {
      event.preventDefault();
      workflow.addSibling(state.selectionId);
      render();
      focusEditor();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      workflow.addChild(state.selectionId);
      render();
      focusEditor();
    } else if (event.key === 'F2') {
      event.preventDefault();
      workflow.beginEditing(state.selectionId);
      render();
      focusEditor();
    }
  };

  workspace.addEventListener('click', onClick);
  workspace.addEventListener('dblclick', onDoubleClick);
  workspace.addEventListener('contextmenu', onContextMenu);
  workspace.addEventListener('keydown', onKeyDown);
  workspace.addEventListener('dragstart', onDragStart);
  workspace.addEventListener('dragover', onDragOver);
  workspace.addEventListener('dragleave', onDragLeave);
  workspace.addEventListener('drop', onDrop);
  workspace.addEventListener('dragend', onDragEnd);
  workspace.addEventListener('change', onFileInputChange);
  document.addEventListener('pointerdown', onDocumentPointerDown);

  return () => {
    closeContextMenu(false);
    workspace.removeEventListener('click', onClick);
    workspace.removeEventListener('dblclick', onDoubleClick);
    workspace.removeEventListener('contextmenu', onContextMenu);
    workspace.removeEventListener('keydown', onKeyDown);
    workspace.removeEventListener('dragstart', onDragStart);
    workspace.removeEventListener('dragover', onDragOver);
    workspace.removeEventListener('dragleave', onDragLeave);
    workspace.removeEventListener('drop', onDrop);
    workspace.removeEventListener('dragend', onDragEnd);
    workspace.removeEventListener('change', onFileInputChange);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
  };
}
