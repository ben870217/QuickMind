import { findNode, findNodeLocation } from '../domain/document';
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
    if (event.dataTransfer?.types.includes('Files') || !draggingNodeId) {
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
    if (event.dataTransfer?.types.includes('Files') || !draggingNodeId) {
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
    if (event.key === 'ArrowUp') {
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
    document.removeEventListener('pointerdown', onDocumentPointerDown);
  };
}
