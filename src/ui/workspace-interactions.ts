import {
  countUserVisibleCharacters,
  findNode,
  findNodeLocation,
  MAX_NODE_TITLE_LENGTH,
  normalizeNodeTitle,
  takeUserVisibleCharacters,
} from '../domain/document';
import {
  createQuickMindFilename,
  parseQuickMindDocument,
  QuickMindFormatError,
  serializeQuickMindDocument,
} from '../domain/quickmind-format';
import { createDrawioArtifact } from '../export/drawio';
import { ExternalExportError } from '../export/export-text';
import { createMermaidArtifact } from '../export/mermaid';
import { createPngArtifact, PngExportError } from '../export/png';
import { renderWorkspaceConnections } from './workspace';
import type { DocumentWorkflow, MovePosition } from '../workspace/document-workflow';

export function bindWorkspaceInteractions(
  workspace: HTMLElement,
  workflow: DocumentWorkflow,
  render: () => void,
): () => void {
  let contextMenu: HTMLElement | null = null;
  let contextMenuNodeId: string | null = null;
  let draggingNodeId: string | null = null;
  const minimumZoom = 0.5;
  const maximumZoom = 2;
  const maximumPan = 2_000;

  const focusEditor = (): void => {
    const editor = workspace.querySelector<HTMLInputElement>('[data-node-editor]');
    editor?.focus();
    editor?.select();
  };

  const focusNode = (nodeId: string | null): void => {
    if (!nodeId) {
      workspace.querySelector<HTMLElement>('[data-canvas]')?.focus();
      return;
    }

    const node = Array.from(workspace.querySelectorAll<HTMLElement>('[data-node-id]'))
      .find((candidate) => candidate.dataset.nodeId === nodeId);
    const focusTarget = node?.querySelector<HTMLElement>('[data-node-editor], .node-card') ?? node;
    focusTarget?.focus();
  };

  const getCanvas = (): HTMLElement | null => workspace.querySelector<HTMLElement>('[data-canvas]');

  const getFullscreenButton = (): HTMLButtonElement | null => (
    workspace.querySelector<HTMLButtonElement>('[data-canvas-action="fullscreen"]')
  );

  const refreshConnections = (): void => {
    renderWorkspaceConnections(workspace, workflow.getState());
  };

  const onViewportResize = (): void => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(refreshConnections);
    } else {
      refreshConnections();
    }
  };

  const updateFullscreenControl = (): void => {
    const button = getFullscreenButton();
    const canvas = getCanvas();
    if (!button || !canvas) {
      return;
    }

    const isFullscreen = document.fullscreenElement === canvas;
    const label = isFullscreen ? '退出全螢幕' : '進入全螢幕';
    const documentWorkspace = workspace.querySelector<HTMLElement>('.document-workspace');
    if (documentWorkspace) {
      documentWorkspace.toggleAttribute('data-canvas-fullscreen', isFullscreen);
    }
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
    button.textContent = isFullscreen ? '⛶ 退出全螢幕' : '⛶ 全螢幕';
  };

  const getCanvasView = (): { zoom: number; panX: number; panY: number } => ({
    zoom: clamp(Number(workspace.dataset.canvasZoom ?? 1), minimumZoom, maximumZoom),
    panX: clamp(Number(workspace.dataset.canvasPanX ?? 0), -maximumPan, maximumPan),
    panY: clamp(Number(workspace.dataset.canvasPanY ?? 0), -maximumPan, maximumPan),
  });

  const setCanvasView = (view: { zoom: number; panX: number; panY: number }): void => {
    const normalized = {
      zoom: clamp(view.zoom, minimumZoom, maximumZoom),
      panX: clamp(view.panX, -maximumPan, maximumPan),
      panY: clamp(view.panY, -maximumPan, maximumPan),
    };
    workspace.dataset.canvasZoom = String(normalized.zoom);
    workspace.dataset.canvasPanX = String(normalized.panX);
    workspace.dataset.canvasPanY = String(normalized.panY);
    const content = workspace.querySelector<HTMLElement>('[data-canvas-content]');
    if (content) {
      content.style.transform = `translate3d(${normalized.panX}px, ${normalized.panY}px, 0) scale(${normalized.zoom})`;
    }
  };

  const focusCanvasTarget = (nodeId: string | null): void => {
    const targetId = nodeId ?? workflow.getState().document.root.id;
    const target = Array.from(workspace.querySelectorAll<HTMLElement>('[data-node-id]'))
      .find((candidate) => candidate.dataset.nodeId === targetId);
    target?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' });
    (target?.querySelector<HTMLElement>('[data-node-editor], .node-card') ?? getCanvas())?.focus();
  };

  const renderFocused = (state: ReturnType<DocumentWorkflow['getState']>): void => {
    render();
    focusNode(state.selectionId);
  };

  const selectNodeInPlace = (nodeId: string | null): void => {
    const state = workflow.selectNode(nodeId);
    workspace.querySelectorAll<HTMLElement>('[data-node-id]').forEach((node) => {
      node.setAttribute('aria-selected', node.dataset.nodeId === state.selectionId ? 'true' : 'false');
    });
    refreshConnections();
    focusNode(state.selectionId);
  };

  const updateTitleCounter = (editor: HTMLInputElement): void => {
    const counter = editor.parentElement?.querySelector<HTMLElement>('[data-title-count]');
    if (counter) {
      counter.textContent = `還可輸入 ${MAX_NODE_TITLE_LENGTH - countUserVisibleCharacters(editor.value)} 個字元`;
    }
  };

  const clamp = (value: number, minimum: number, maximum: number): number => (
    Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : minimum
  );

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
    const canvasAction = target.closest<HTMLButtonElement>('[data-canvas-action]');
    if (canvasAction?.dataset.canvasAction === 'fullscreen') {
      void toggleFullscreen();
      return;
    }

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
      } else if (fileAction.dataset.fileAction === 'export-mermaid') {
        exportMermaid();
      } else if (fileAction.dataset.fileAction === 'export-drawio') {
        exportDrawio();
      } else if (fileAction.dataset.fileAction === 'export-png') {
        exportPng();
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
      renderFocused(state);
      return;
    }

    const collapseButton = target.closest<HTMLButtonElement>('[data-collapse-node]');
    if (collapseButton) {
      renderFocused(workflow.toggleCollapse(collapseButton.dataset.collapseNode ?? null));
      return;
    }

    const node = target.closest<HTMLElement>('[data-node-id]');
    if (target.closest('[data-node-editor]')) {
      return;
    }

    if (!node) {
      const canvasArea = target.closest<HTMLElement>('.document-workspace');
      if (canvasArea && !target.closest('.workspace-toolbar, [data-file-message]')) {
        renderFocused(workflow.selectNode(null));
      }
      return;
    }

    selectNodeInPlace(node.dataset.nodeId ?? null);
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

    if (workflow.getState().editing?.isNew) {
      event.preventDefault();
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

  const showFileMessage = (message: string, detail?: string, retry?: () => void): void => {
    const messageElement = workspace.querySelector<HTMLElement>('[data-file-message]');
    if (!messageElement) {
      return;
    }

    messageElement.hidden = false;
    messageElement.dataset.error = detail ? 'true' : 'false';
    messageElement.replaceChildren(document.createTextNode(message));
    if (detail || retry) {
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = '查看詳細資訊';
      details.append(summary);
      if (detail) {
        const detailText = document.createElement('span');
        detailText.textContent = detail;
        details.append(detailText);
      }
      if (retry) {
        const retryButton = document.createElement('button');
        retryButton.className = 'file-button file-message-retry';
        retryButton.type = 'button';
        retryButton.textContent = '重試匯出';
        retryButton.addEventListener('click', retry);
        details.append(retryButton);
      }
      messageElement.append(details);
    }
  };

  const showFullscreenError = (detail: string): void => {
    const messageElement = workspace.querySelector<HTMLElement>('[data-file-message]');
    showFileMessage('無法進入全螢幕模式，仍維持一般畫布。', detail);
    messageElement?.setAttribute('data-fullscreen-error', 'true');
    getFullscreenButton()?.focus();
  };

  const toggleFullscreen = async (): Promise<void> => {
    const canvas = getCanvas();
    if (!canvas) {
      return;
    }

    if (document.fullscreenElement === canvas) {
      if (typeof document.exitFullscreen !== 'function') {
        showFullscreenError('fullscreen-exit-unsupported');
        return;
      }

      try {
        await document.exitFullscreen();
      } catch {
        showFullscreenError('fullscreen-exit-failed');
      }
      return;
    }

    if (!document.fullscreenEnabled || typeof canvas.requestFullscreen !== 'function') {
      showFullscreenError('fullscreen-request-unsupported');
      return;
    }

    try {
      await canvas.requestFullscreen();
    } catch {
      showFullscreenError('fullscreen-request-failed');
    }
  };

  const describeFormatError = (error: QuickMindFormatError): string => {
    if (error.code === 'unsupported-version') {
      const requested = error.details.requestedVersion === undefined
        ? '未提供'
        : String(error.details.requestedVersion);
      return `檔案需要 schemaVersion ${requested}，目前支援 ${error.details.supportedVersion ?? 1}（${error.path}）。`;
    }
    if (error.code === 'file-size-limit') {
      return `檔案大小 ${error.details.byteLength?.toLocaleString() ?? '未知'} / ${(error.details.maxBytes ?? 10 * 1024 * 1024).toLocaleString()} bytes（${error.path}）。`;
    }
    if (error.code === 'node-limit') {
      return `節點數 ${error.details.nodeCount?.toLocaleString() ?? '未知'} / ${(error.details.maxNodes ?? 10_000).toLocaleString()}（${error.path}）。`;
    }

    return `${error.code} at ${error.path}`;
  };

  const downloadArtifact = (data: string | Blob, filename: string, mimeType: string): void => {
    if (typeof URL.createObjectURL !== 'function') {
      throw new Error('download-unsupported');
    }

    const blob = typeof data === 'string' ? new Blob([data], { type: mimeType }) : data;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    try {
      anchor.click();
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  const downloadTextFile = (source: string, filename: string, mimeType = 'application/json;charset=utf-8'): void => {
    downloadArtifact(source, filename, mimeType);
  };

  const prepareExport = (): boolean => {
    const stateBeforeEditing = workflow.getState();
    const editing = stateBeforeEditing.editing;
    if (!editing) {
      return true;
    }

    const editor = workspace.querySelector<HTMLInputElement>('[data-node-editor]');
    const normalized = editor ? normalizeNodeTitle(editor.value) : '';
    if (!editor || editor.dataset.nodeId !== editing.nodeId || !normalized || countUserVisibleCharacters(normalized) > MAX_NODE_TITLE_LENGTH) {
      showFileMessage('匯出已取消，請先完成節點標題。', 'invalid-node-title');
      editor?.focus();
      return false;
    }

    if (!workflow.commitTitle(editor.value, { preservePersistenceError: stateBeforeEditing.persistence === 'error' })) {
      showFileMessage('匯出已取消，請先完成節點標題。', 'invalid-node-title');
      editor.focus();
      return false;
    }

    render();
    return true;
  };

  const exportDocument = (): void => {
    if (!prepareExport()) {
      return;
    }

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
      const detail = error instanceof QuickMindFormatError ? describeFormatError(error) : 'export-failed';
      showFileMessage('匯出失敗，文件內容仍保留在目前工作區。', detail, exportDocument);
    }
  };

  const exportTextArtifact = (options: {
    createArtifact: () => { filename: string; mimeType: string; source: string };
    successMessage: string;
    failureMessage: string;
    failureDetail: string;
    retry: () => void;
  }): void => {
    if (!prepareExport()) {
      return;
    }

    try {
      const artifact = options.createArtifact();
      downloadTextFile(artifact.source, artifact.filename, artifact.mimeType);
      render();
      showFileMessage(options.successMessage);
    } catch (error) {
      const detail = error instanceof QuickMindFormatError
        ? describeFormatError(error)
        : error instanceof ExternalExportError ? error.code : options.failureDetail;
      showFileMessage(options.failureMessage, detail, options.retry);
    }
  };

  const exportMermaid = (): void => {
    exportTextArtifact({
      createArtifact: () => createMermaidArtifact(workflow.getState().document),
      successMessage: '已匯出 Mermaid 原始碼。',
      failureMessage: 'Mermaid 匯出失敗，文件內容仍保留在目前工作區。',
      failureDetail: 'mermaid-export-failed',
      retry: exportMermaid,
    });
  };

  const exportDrawio = (): void => {
    exportTextArtifact({
      createArtifact: () => createDrawioArtifact(workflow.getState().document),
      successMessage: '已匯出 draw.io 檔案。',
      failureMessage: 'draw.io 匯出失敗，文件內容仍保留在目前工作區。',
      failureDetail: 'drawio-export-failed',
      retry: exportDrawio,
    });
  };

  const exportPng = (): void => {
    if (!prepareExport()) {
      return;
    }

    const documentSnapshot = workflow.getState().document;
    void createPngArtifact(documentSnapshot)
      .then((artifact) => {
        downloadArtifact(artifact.data, artifact.filename, artifact.mimeType);
        render();
        showFileMessage('已匯出 PNG 圖片。');
      })
      .catch((error: unknown) => {
        const detail = error instanceof QuickMindFormatError
          ? describeFormatError(error)
          : error instanceof ExternalExportError ? error.code
            : error instanceof PngExportError ? error.code : 'png-export-failed';
        showFileMessage('PNG 匯出失敗，文件內容仍保留在目前工作區。', detail, exportPng);
      });
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
      if (changed) {
        setCanvasView({ zoom: 1, panX: 0, panY: 0 });
      }
      render();
      showFileMessage(changed ? '已匯入 QuickMind 原生檔案。' : '匯入內容與目前文件相同，未產生變更。');
    } catch (error) {
      const detail = error instanceof QuickMindFormatError ? describeFormatError(error) : 'import-failed';
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
    if (!input.matches('[data-native-file-input]')) {
      return;
    }

    const file = input.files?.[0];
    input.value = '';
    if (file) {
      void importFile(file);
    }
  };

  const onInput = (event: Event): void => {
    const editor = (event.target as HTMLElement).closest<HTMLInputElement>('[data-node-editor]');
    if (!editor) {
      return;
    }

    const truncated = takeUserVisibleCharacters(editor.value, MAX_NODE_TITLE_LENGTH);
    if (editor.value !== truncated) {
      editor.value = truncated;
    }
    updateTitleCounter(editor);
  };

  const onWheel = (event: WheelEvent): void => {
    if (!getCanvas()?.contains(event.target as Node)) {
      return;
    }

    const view = getCanvasView();
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 0.9;
      setCanvasView({ ...view, zoom: view.zoom * factor });
    } else if (event.shiftKey) {
      event.preventDefault();
      const horizontalDelta = event.deltaX === 0 ? event.deltaY : event.deltaX;
      setCanvasView({ ...view, panX: view.panX - horizontalDelta });
    } else {
      event.preventDefault();
      setCanvasView({ ...view, panY: view.panY - event.deltaY });
    }
  };

  const onFullscreenChange = (): void => {
    updateFullscreenControl();
    getFullscreenButton()?.focus();
    onViewportResize();
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
        const committed = workflow.commitTitle(editor.value);
        if (committed) {
          renderFocused(workflow.getState());
        } else if (workflow.getState().limitError) {
          render();
          focusEditor();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        const exitFullscreen = document.fullscreenElement === getCanvas();
        renderFocused(workflow.cancelEditing());
        if (exitFullscreen) {
          void toggleFullscreen();
        }
      }

      return;
    }

    if (event.key === 'Escape' && document.fullscreenElement === getCanvas()) {
      event.preventDefault();
      void toggleFullscreen();
      return;
    }

    const state = workflow.getState();
    const modifier = event.ctrlKey || event.metaKey;
    const key = event.key.toLowerCase();
    const canvasFocused = Boolean(target.closest('[data-canvas]')) || target === workspace;
    if (canvasFocused && (event.key === '+' || event.key === '=')) {
      event.preventDefault();
      const view = getCanvasView();
      setCanvasView({ ...view, zoom: view.zoom * 1.1 });
    } else if (canvasFocused && event.key === '-') {
      event.preventDefault();
      const view = getCanvasView();
      setCanvasView({ ...view, zoom: view.zoom * 0.9 });
    } else if (canvasFocused && key === '0') {
      event.preventDefault();
      setCanvasView({ zoom: 1, panX: 0, panY: 0 });
    } else if (canvasFocused && key === 'f') {
      event.preventDefault();
      focusCanvasTarget(state.selectionId);
    } else if (modifier && key === 'z') {
      event.preventDefault();
      const nextState = event.shiftKey ? workflow.redo() : workflow.undo();
      renderFocused(nextState);
    } else if (event.ctrlKey && key === 'y') {
      event.preventDefault();
      const nextState = workflow.redo();
      renderFocused(nextState);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      renderFocused(workflow.navigate('up'));
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      renderFocused(workflow.navigate('down'));
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault();
      renderFocused(workflow.navigate('left'));
    } else if (event.key === 'ArrowRight') {
      event.preventDefault();
      renderFocused(workflow.navigate('right'));
    } else if (event.key === ' ') {
      event.preventDefault();
      renderFocused(workflow.toggleCollapse(state.selectionId));
    } else if (event.key === 'Delete') {
      event.preventDefault();
      renderFocused(workflow.deleteNode(state.selectionId));
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
  workspace.addEventListener('input', onInput);
  workspace.addEventListener('wheel', onWheel, { passive: false });
  workspace.addEventListener('change', onFileInputChange);
  document.addEventListener('pointerdown', onDocumentPointerDown);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  window.addEventListener('resize', onViewportResize);
  updateFullscreenControl();

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
    workspace.removeEventListener('input', onInput);
    workspace.removeEventListener('wheel', onWheel);
    workspace.removeEventListener('change', onFileInputChange);
    document.removeEventListener('pointerdown', onDocumentPointerDown);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    window.removeEventListener('resize', onViewportResize);
  };
}
