export const DEFAULT_DOCUMENT_TITLE = '未命名心智圖';
export const CURRENT_SCHEMA_VERSION = 1 as const;
export const MAX_NODE_TITLE_LENGTH = 200;

export interface QuickMindNode {
  id: string;
  text: string;
  isCollapsed: boolean;
  children: QuickMindNode[];
}

export interface QuickMindDocumentMetadata {
  id: string;
  schemaVersion: typeof CURRENT_SCHEMA_VERSION;
  createdAt: string;
  updatedAt: string;
}

export interface QuickMindDocument {
  meta: QuickMindDocumentMetadata;
  root: QuickMindNode;
}

export interface DocumentFactoryOptions {
  createId?: () => string;
  now?: () => string;
}

function createId(): string {
  if (!globalThis.crypto?.randomUUID) {
    throw new Error('UUID generation is not available in this environment');
  }

  return globalThis.crypto.randomUUID();
}

export function createQuickMindDocument(options: DocumentFactoryOptions = {}): QuickMindDocument {
  const nextId = options.createId ?? createId;
  const now = options.now ?? (() => new Date().toISOString());
  const documentId = nextId();

  return {
    meta: {
      id: documentId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt: now(),
      updatedAt: now(),
    },
    root: {
      id: nextId(),
      text: DEFAULT_DOCUMENT_TITLE,
      isCollapsed: false,
      children: [],
    },
  };
}

export interface NodeLocation {
  node: QuickMindNode;
  parent: QuickMindNode | null;
  index: number;
}

export function findNode(root: QuickMindNode, nodeId: string): QuickMindNode | null {
  if (root.id === nodeId) {
    return root;
  }

  for (const child of root.children) {
    const found = findNode(child, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

export function findNodeLocation(root: QuickMindNode, nodeId: string): NodeLocation | null {
  if (root.id === nodeId) {
    return { node: root, parent: null, index: 0 };
  }

  for (let index = 0; index < root.children.length; index += 1) {
    const child = root.children[index];
    if (child.id === nodeId) {
      return { node: child, parent: root, index };
    }

    const found = findNodeLocation(child, nodeId);
    if (found) {
      return found;
    }
  }

  return null;
}

export function normalizeNodeTitle(value: string): string {
  return value.trim();
}
