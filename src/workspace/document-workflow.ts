import {
  createQuickMindDocument,
  countUserVisibleCharacters,
  findNode,
  findNodeLocation,
  getVisibleNodes,
  MAX_NODE_TITLE_LENGTH,
  normalizeNodeTitle,
  createQuickMindId,
  type QuickMindDocument,
  type QuickMindNode,
} from '../domain/document';
import {
  MAX_QUICKMIND_FILE_BYTES,
  MAX_QUICKMIND_NODE_COUNT,
  measureQuickMindDocument,
  type QuickMindDocumentUsage,
} from '../domain/quickmind-format';
import type { WorkspaceStore } from '../persistence/workspace-store';

export type PersistenceStatus = 'saving' | 'saved' | 'error';
export type ConnectivityStatus = 'online' | 'offline';
export type NavigationDirection = 'up' | 'down' | 'left' | 'right';
export type MovePosition = 'before' | 'inside' | 'after';
export const MAX_HISTORY_ENTRIES = 100;
export const MAX_AUTOMATIC_SAVE_RETRIES = 3;

export interface WorkspaceState {
  document: QuickMindDocument;
  persistence: PersistenceStatus;
  connectivity: ConnectivityStatus;
  restored: boolean;
  selectionId: string | null;
  editing: EditingState | null;
  hasUnexportedChanges: boolean;
  limitError: DocumentLimitError | null;
  canUndo: boolean;
  canRedo: boolean;
}

export interface DocumentLimitError extends QuickMindDocumentUsage {
  reason: 'file-size' | 'node-count';
  maxBytes: number;
  maxNodes: number;
}

export interface EditingState {
  nodeId: string;
  originalText: string;
  isNew: boolean;
}

export interface DocumentWorkflowOptions {
  createDocument?: () => QuickMindDocument;
  createId?: () => string;
  now?: () => string;
  initialConnectivity?: ConnectivityStatus;
  saveDelayMs?: number;
  saveRetryDelaysMs?: number[];
}

interface HistoryEntry {
  before: QuickMindDocument;
  after: QuickMindDocument;
  beforeHasUnexportedChanges: boolean;
  afterHasUnexportedChanges: boolean;
}

type MutableWorkspaceState = Omit<WorkspaceState, 'canUndo' | 'canRedo'>;

export class DocumentWorkflow {
  private state: MutableWorkspaceState | null = null;
  private readonly createDocument: () => QuickMindDocument;
  private readonly initialConnectivity: ConnectivityStatus;
  private readonly createId: () => string;
  private readonly now: () => string;
  private readonly saveDelayMs: number;
  private readonly saveRetryDelaysMs: number[];
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private saveRetryIndex = 0;
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  private pendingEditBefore: QuickMindDocument | null = null;
  private readonly listeners = new Set<() => void>();
  private saveInFlight: Promise<void> | null = null;
  private saveQueued = false;

  constructor(
    private readonly store: WorkspaceStore,
    options: DocumentWorkflowOptions = {},
  ) {
    this.createDocument = options.createDocument ?? (() => createQuickMindDocument());
    this.initialConnectivity = options.initialConnectivity ?? (globalThis.navigator?.onLine === false ? 'offline' : 'online');
    this.createId = options.createId ?? createQuickMindId;
    this.now = options.now ?? (() => new Date().toISOString());
    this.saveDelayMs = options.saveDelayMs ?? 500;
    this.saveRetryDelaysMs = options.saveRetryDelaysMs ?? [250, 1_000, 4_000];
  }

  async start(): Promise<WorkspaceState> {
    this.clearSaveTimer();
    this.saveRetryIndex = 0;
    this.undoStack = [];
    this.redoStack = [];
    this.pendingEditBefore = null;
    this.saveQueued = false;
    const savedSnapshot = await this.store.load();

    if (savedSnapshot) {
      const savedDocument = savedSnapshot.document;
      this.state = {
        document: savedDocument,
        persistence: 'saved',
        connectivity: this.initialConnectivity,
        restored: true,
        selectionId: null,
        editing: null,
        hasUnexportedChanges: savedSnapshot.metadata.hasUnexportedChanges,
        limitError: this.getDocumentLimitError(savedDocument),
      };

      return this.getState();
    }

    const document = this.createDocument();
    this.state = {
      document,
      persistence: 'saving',
      connectivity: this.initialConnectivity,
      restored: false,
      selectionId: document.root.id,
      editing: {
        nodeId: document.root.id,
        originalText: document.root.text,
        isNew: false,
      },
      hasUnexportedChanges: true,
      limitError: null,
    };

    try {
      await this.store.save(document, { hasUnexportedChanges: true });
      this.state.persistence = 'saved';
      this.saveRetryIndex = 0;
    } catch {
      this.state.persistence = 'saving';
      if (!this.scheduleSaveRetry()) {
        this.state.persistence = 'error';
      }
    }

    return this.getState();
  }

  setConnectivity(connectivity: ConnectivityStatus): WorkspaceState {
    this.requireState().connectivity = connectivity;

    return this.getState();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  replaceDocument(document: QuickMindDocument): boolean {
    const state = this.requireState();
    if (state.persistence === 'error' || this.getDocumentLimitError(document)) {
      state.limitError = this.getDocumentLimitError(document);
      return false;
    }

    if (state.editing?.isNew) {
      this.removePendingNode(state.editing.nodeId);
      state.editing = null;
      this.pendingEditBefore = null;
    }

    if (JSON.stringify(state.document) === JSON.stringify(document)) {
      return false;
    }

    const beforeDocument = structuredClone(state.document);
    const beforeHasUnexportedChanges = state.hasUnexportedChanges;
    state.document = structuredClone(document);
    state.selectionId = null;
    state.editing = null;
    this.pendingEditBefore = null;
    state.hasUnexportedChanges = false;
    state.limitError = null;
    state.persistence = 'saving';
    this.recordHistory(beforeDocument, beforeHasUnexportedChanges);
    this.saveImmediately();

    return true;
  }

  markExported(): WorkspaceState {
    const state = this.requireState();
    state.hasUnexportedChanges = false;
    state.persistence = 'saving';
    this.clearSaveTimer();
    this.saveRetryIndex = 0;
    void this.persistCurrentDocument();

    return this.getState();
  }

  async flushSave(): Promise<WorkspaceState> {
    const state = this.requireState();
    this.clearSaveTimer();

    if (state.persistence === 'saving') {
      this.saveRetryIndex = 0;
      void this.persistCurrentDocument();
    }

    while (this.saveInFlight) {
      await this.saveInFlight;
    }

    return this.getState();
  }

  retrySave(): WorkspaceState {
    const state = this.requireState();
    if (state.persistence !== 'error') {
      return this.getState();
    }

    this.clearSaveTimer();
    this.saveRetryIndex = 0;
    state.persistence = 'saving';
    void this.persistCurrentDocument();

    return this.getState();
  }

  async clearDocument(): Promise<WorkspaceState> {
    const state = this.requireState();
    if (state.persistence === 'error') {
      return this.getState();
    }

    this.clearSaveTimer();
    try {
      await this.store.clear();
    } catch {
      state.persistence = 'error';
      return this.getState();
    }

    const document = this.createDocument();
    this.undoStack = [];
    this.redoStack = [];
    this.pendingEditBefore = null;
    state.document = document;
    state.persistence = 'saving';
    state.connectivity = this.initialConnectivity;
    state.restored = false;
    state.selectionId = document.root.id;
    state.editing = {
      nodeId: document.root.id,
      originalText: document.root.text,
      isNew: false,
    };
    state.hasUnexportedChanges = true;
    state.limitError = null;
    this.saveRetryIndex = 0;

    try {
      await this.store.save(document, { hasUnexportedChanges: true });
      state.persistence = 'saved';
      this.saveRetryIndex = 0;
    } catch {
      state.persistence = 'saving';
      if (!this.scheduleSaveRetry()) {
        state.persistence = 'error';
      }
    }

    return this.getState();
  }

  selectNode(nodeId: string | null): WorkspaceState {
    const state = this.requireState();

    if (state.editing?.isNew && nodeId !== state.editing.nodeId) {
      this.removePendingNode(state.editing.nodeId);
      state.editing = null;
      this.pendingEditBefore = null;
    }

    if (nodeId !== null && !findNode(state.document.root, nodeId)) {
      throw new Error(`Node ${nodeId} does not exist`);
    }

    state.selectionId = nodeId;

    return this.getState();
  }

  beginEditing(nodeId: string): WorkspaceState {
    const state = this.requireState();
    const node = findNode(state.document.root, nodeId);

    if (!node) {
      throw new Error(`Node ${nodeId} does not exist`);
    }

    state.selectionId = nodeId;
    state.editing = {
      nodeId,
      originalText: node.text,
      isNew: false,
    };

    return this.getState();
  }

  addChild(parentId: string): WorkspaceState {
    const state = this.requireState();
    if (state.editing?.isNew) {
      return this.getState();
    }
    const parent = findNode(state.document.root, parentId);

    if (!parent) {
      throw new Error(`Node ${parentId} does not exist`);
    }

    const node = this.createEmptyNode();
    const candidate = structuredClone(state.document);
    const candidateParent = findNode(candidate.root, parentId);
    if (!candidateParent) {
      throw new Error(`Node ${parentId} does not exist`);
    }
    candidateParent.children.push(structuredClone(node));
    if (!this.acceptDocumentCandidate(candidate)) {
      return this.getState();
    }

    this.pendingEditBefore = structuredClone(state.document);
    parent.children.push(node);
    state.selectionId = node.id;
    state.editing = {
      nodeId: node.id,
      originalText: '',
      isNew: true,
    };

    return this.getState();
  }

  addSibling(nodeId: string): WorkspaceState {
    const state = this.requireState();
    if (state.editing?.isNew) {
      return this.getState();
    }
    const location = findNodeLocation(state.document.root, nodeId);

    if (!location?.parent) {
      return this.getState();
    }

    const node = this.createEmptyNode();
    const candidate = structuredClone(state.document);
    const candidateParent = findNode(candidate.root, location.parent.id);
    if (!candidateParent) {
      throw new Error(`Node ${location.parent.id} does not exist`);
    }
    candidateParent.children.splice(location.index + 1, 0, structuredClone(node));
    if (!this.acceptDocumentCandidate(candidate)) {
      return this.getState();
    }

    this.pendingEditBefore = structuredClone(state.document);
    location.parent.children.splice(location.index + 1, 0, node);
    state.selectionId = node.id;
    state.editing = {
      nodeId: node.id,
      originalText: '',
      isNew: true,
    };

    return this.getState();
  }

  commitTitle(value: string): boolean {
    const state = this.requireState();
    const editing = state.editing;

    if (!editing) {
      return false;
    }

    const normalized = normalizeNodeTitle(value);
    if (countUserVisibleCharacters(normalized) > MAX_NODE_TITLE_LENGTH) {
      return false;
    }

    if (!normalized) {
      if (editing.isNew) {
        this.removePendingNode(editing.nodeId);
        state.editing = null;
        this.pendingEditBefore = null;
        return true;
      }

      return false;
    }

    const node = findNode(state.document.root, editing.nodeId);
    if (!node) {
      throw new Error(`Node ${editing.nodeId} does not exist`);
    }

    const changed = node.text !== normalized;
    if (changed) {
      const candidate = structuredClone(state.document);
      const candidateNode = findNode(candidate.root, editing.nodeId);
      if (!candidateNode) {
        throw new Error(`Node ${editing.nodeId} does not exist`);
      }
      candidateNode.text = normalized;
      if (!this.acceptDocumentCandidate(candidate)) {
        return false;
      }
    }

    const beforeDocument = editing.isNew
      ? this.pendingEditBefore ?? structuredClone(state.document)
      : structuredClone(state.document);
    node.text = normalized;
    state.editing = null;
    this.pendingEditBefore = null;

    if (changed) {
      this.markChanged(beforeDocument, editing.isNew);
    }

    return true;
  }

  cancelEditing(): WorkspaceState {
    const state = this.requireState();
    const editing = state.editing;

    if (!editing) {
      return this.getState();
    }

    if (editing.isNew) {
      this.removePendingNode(editing.nodeId);
      this.pendingEditBefore = null;
    }

    state.editing = null;

    return this.getState();
  }

  deleteNode(nodeId: string | null = this.requireState().selectionId): WorkspaceState {
    const state = this.requireState();

    if (state.editing?.isNew) {
      return this.getState();
    }

    if (!nodeId) {
      return this.getState();
    }

    const location = findNodeLocation(state.document.root, nodeId);
    if (!location?.parent) {
      return this.getState();
    }

    const beforeDocument = structuredClone(state.document);
    const parent = location.parent;
    parent.children.splice(location.index, 1);
    const fallback = parent.children[location.index - 1] ?? parent.children[location.index] ?? parent;
    state.selectionId = fallback.id;
    state.editing = null;
    this.markChanged(beforeDocument, true);

    return this.getState();
  }

  toggleCollapse(nodeId: string | null = this.requireState().selectionId): WorkspaceState {
    const state = this.requireState();

    if (state.editing?.isNew) {
      return this.getState();
    }

    if (!nodeId) {
      return this.getState();
    }

    const node = findNode(state.document.root, nodeId);
    if (!node || node.children.length === 0) {
      return this.getState();
    }

    const candidate = structuredClone(state.document);
    const candidateNode = findNode(candidate.root, nodeId);
    if (!candidateNode) {
      throw new Error(`Node ${nodeId} does not exist`);
    }
    candidateNode.isCollapsed = !candidateNode.isCollapsed;
    if (!this.acceptDocumentCandidate(candidate)) {
      return this.getState();
    }

    const beforeDocument = structuredClone(state.document);
    node.isCollapsed = !node.isCollapsed;
    state.selectionId = node.id;
    this.markChanged(beforeDocument);

    return this.getState();
  }

  canMoveNode(nodeId: string, targetId: string, position: MovePosition = 'inside'): boolean {
    const state = this.requireState();
    if (state.editing?.isNew) {
      return false;
    }
    const sourceLocation = findNodeLocation(state.document.root, nodeId);
    const targetLocation = findNodeLocation(state.document.root, targetId);

    if (!sourceLocation?.parent || !targetLocation || nodeId === targetId) {
      return false;
    }

    if (position !== 'inside' && !targetLocation.parent) {
      return false;
    }

    return !findNode(sourceLocation.node, targetId);
  }

  moveNode(nodeId: string, targetId: string, position: MovePosition): WorkspaceState {
    const state = this.requireState();
    if (state.editing?.isNew) {
      return this.getState();
    }
    if (!this.canMoveNode(nodeId, targetId, position)) {
      return this.getState();
    }

    const sourceLocation = findNodeLocation(state.document.root, nodeId);
    if (!sourceLocation?.parent) {
      return this.getState();
    }

    const beforeDocument = structuredClone(state.document);
    const candidate = structuredClone(state.document);
    this.moveNodeInDocument(candidate, nodeId, targetId, position);
    if (!this.acceptDocumentCandidate(candidate)) {
      return this.getState();
    }

    this.moveNodeInDocument(state.document, nodeId, targetId, position);
    state.selectionId = nodeId;
    state.editing = null;
    this.markChanged(beforeDocument, true);

    return this.getState();
  }

  navigate(direction: NavigationDirection): WorkspaceState {
    const state = this.requireState();

    if (state.editing?.isNew) {
      return this.getState();
    }

    if (!state.selectionId) {
      state.selectionId = state.document.root.id;
      return this.getState();
    }

    const current = findNode(state.document.root, state.selectionId);
    if (!current) {
      state.selectionId = state.document.root.id;
      return this.getState();
    }

    if (direction === 'up' || direction === 'down') {
      const visible = getVisibleNodes(state.document.root);
      const currentIndex = visible.findIndex((node) => node.id === current.id);
      const nextIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
      const next = visible[nextIndex];
      if (next) {
        state.selectionId = next.id;
      }
      return this.getState();
    }

    if (direction === 'left') {
      if (current.children.length > 0 && !current.isCollapsed) {
        const candidate = structuredClone(state.document);
        const candidateNode = findNode(candidate.root, current.id);
        if (!candidateNode) {
          throw new Error(`Node ${current.id} does not exist`);
        }
        candidateNode.isCollapsed = true;
        if (!this.acceptDocumentCandidate(candidate)) {
          return this.getState();
        }

        const beforeDocument = structuredClone(state.document);
        current.isCollapsed = true;
        this.markChanged(beforeDocument);
        return this.getState();
      }

      const location = findNodeLocation(state.document.root, current.id);
      if (location?.parent) {
        state.selectionId = location.parent.id;
      }
      return this.getState();
    }

    if (current.children.length > 0 && current.isCollapsed) {
      const candidate = structuredClone(state.document);
      const candidateNode = findNode(candidate.root, current.id);
      if (!candidateNode) {
        throw new Error(`Node ${current.id} does not exist`);
      }
      candidateNode.isCollapsed = false;
      if (!this.acceptDocumentCandidate(candidate)) {
        return this.getState();
      }

      const beforeDocument = structuredClone(state.document);
      current.isCollapsed = false;
      this.markChanged(beforeDocument);
      return this.getState();
    }

    const firstChild = current.children[0];
    if (firstChild) {
      state.selectionId = firstChild.id;
    }

    return this.getState();
  }

  undo(): WorkspaceState {
    const state = this.requireState();
    const entry = this.undoStack.pop();

    if (!entry || state.editing) {
      if (entry) {
        this.undoStack.push(entry);
      }
      return this.getState();
    }

    this.redoStack.push(entry);
    state.document = structuredClone(entry.before);
    state.selectionId = this.restoreSelection(state.selectionId);
    state.editing = null;
    state.hasUnexportedChanges = entry.beforeHasUnexportedChanges;
    this.pendingEditBefore = null;
    this.saveImmediately();

    return this.getState();
  }

  redo(): WorkspaceState {
    const state = this.requireState();
    const entry = this.redoStack.pop();

    if (!entry || state.editing) {
      if (entry) {
        this.redoStack.push(entry);
      }
      return this.getState();
    }

    this.undoStack.push(entry);
    state.document = structuredClone(entry.after);
    state.selectionId = this.restoreSelection(state.selectionId);
    state.editing = null;
    state.hasUnexportedChanges = entry.afterHasUnexportedChanges;
    this.pendingEditBefore = null;
    this.saveImmediately();

    return this.getState();
  }

  getState(): WorkspaceState {
    const state = this.requireState();

    return {
      ...state,
      document: structuredClone(state.document),
      canUndo: this.undoStack.length > 0 && !state.editing,
      canRedo: this.redoStack.length > 0 && !state.editing,
    };
  }

  private requireState(): MutableWorkspaceState {
    if (!this.state) {
      throw new Error('Document workflow has not started');
    }

    return this.state;
  }

  private createEmptyNode(): QuickMindNode {
    return {
      id: this.createId(),
      text: '',
      isCollapsed: false,
      children: [],
    };
  }

  private moveNodeInDocument(document: QuickMindDocument, nodeId: string, targetId: string, position: MovePosition): void {
    const sourceLocation = findNodeLocation(document.root, nodeId);
    if (!sourceLocation?.parent) {
      throw new Error(`Node ${nodeId} cannot be moved`);
    }

    const source = sourceLocation.node;
    sourceLocation.parent.children.splice(sourceLocation.index, 1);

    if (position === 'inside') {
      const target = findNode(document.root, targetId);
      if (!target) {
        throw new Error(`Node ${targetId} does not exist`);
      }
      target.children.push(source);
      return;
    }

    const targetLocation = findNodeLocation(document.root, targetId);
    if (!targetLocation?.parent) {
      throw new Error(`Node ${targetId} cannot be a sibling target`);
    }

    const insertionIndex = targetLocation.index + (position === 'after' ? 1 : 0);
    targetLocation.parent.children.splice(insertionIndex, 0, source);
  }

  private removePendingNode(nodeId: string): void {
    const state = this.requireState();
    const location = findNodeLocation(state.document.root, nodeId);

    if (!location?.parent) {
      throw new Error('The root node cannot be removed as a pending node');
    }

    location.parent.children.splice(location.index, 1);
    state.selectionId = location.parent.id;
  }

  private restoreSelection(selectionId: string | null): string | null {
    const state = this.requireState();
    if (selectionId && findNode(state.document.root, selectionId)) {
      return selectionId;
    }

    return state.document.root.id;
  }

  private getDocumentLimitError(document: QuickMindDocument): DocumentLimitError | null {
    const usage = measureQuickMindDocument(document);
    if (usage.nodeCount > MAX_QUICKMIND_NODE_COUNT) {
      return {
        ...usage,
        reason: 'node-count',
        maxBytes: MAX_QUICKMIND_FILE_BYTES,
        maxNodes: MAX_QUICKMIND_NODE_COUNT,
      };
    }
    if (usage.byteLength > MAX_QUICKMIND_FILE_BYTES) {
      return {
        ...usage,
        reason: 'file-size',
        maxBytes: MAX_QUICKMIND_FILE_BYTES,
        maxNodes: MAX_QUICKMIND_NODE_COUNT,
      };
    }

    return null;
  }

  private acceptDocumentCandidate(candidate: QuickMindDocument): boolean {
    const state = this.requireState();
    const limitError = this.getDocumentLimitError(candidate);
    state.limitError = limitError;
    return limitError === null;
  }

  private markChanged(beforeDocument: QuickMindDocument, saveImmediately = false): void {
    const state = this.requireState();
    const beforeHasUnexportedChanges = state.hasUnexportedChanges;
    state.document.meta.updatedAt = this.now();
    state.hasUnexportedChanges = true;
    state.limitError = null;
    state.persistence = 'saving';
    this.recordHistory(beforeDocument, beforeHasUnexportedChanges);
    if (saveImmediately) {
      this.saveImmediately();
    } else {
      this.scheduleSave();
    }
  }

  private recordHistory(beforeDocument: QuickMindDocument, beforeHasUnexportedChanges: boolean): void {
    const state = this.requireState();
    this.undoStack.push({
      before: structuredClone(beforeDocument),
      after: structuredClone(state.document),
      beforeHasUnexportedChanges,
      afterHasUnexportedChanges: state.hasUnexportedChanges,
    });
    if (this.undoStack.length > MAX_HISTORY_ENTRIES) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  private scheduleSave(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
    }

    this.saveRetryIndex = 0;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistCurrentDocument();
    }, this.saveDelayMs);
  }

  private saveImmediately(): void {
    this.clearSaveTimer();
    this.saveRetryIndex = 0;

    const state = this.requireState();
    state.persistence = 'saving';
    void this.persistCurrentDocument();
  }

  private scheduleSaveRetry(): boolean {
    const delay = this.saveRetryDelaysMs[this.saveRetryIndex];
    if (delay === undefined) {
      return false;
    }

    this.saveRetryIndex += 1;
    this.clearSaveTimer();
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistCurrentDocument();
    }, delay);
    return true;
  }

  private clearSaveTimer(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
  }

  private persistCurrentDocument(): Promise<void> {
    if (this.saveInFlight) {
      this.saveQueued = true;
      return this.saveInFlight;
    }

    const operation = this.persistCurrentDocumentInternal();
    this.saveInFlight = operation;
    void operation.finally(() => {
      if (this.saveInFlight === operation) {
        this.saveInFlight = null;
        if (this.saveQueued) {
          this.saveQueued = false;
          void this.persistCurrentDocument();
        }
      }
    });
    return operation;
  }

  private async persistCurrentDocumentInternal(): Promise<void> {
    const state = this.requireState();

    try {
      await this.store.save(state.document, { hasUnexportedChanges: state.hasUnexportedChanges });
      state.persistence = 'saved';
      this.saveRetryIndex = 0;
      this.notify();
    } catch {
      state.persistence = 'saving';
      if (!this.scheduleSaveRetry()) {
        state.persistence = 'error';
        this.notify();
      }
    }
  }

  private notify(): void {
    this.listeners.forEach((listener) => listener());
  }
}
