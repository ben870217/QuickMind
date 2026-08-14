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

export function createQuickMindId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  if (!globalThis.crypto?.getRandomValues) {
    throw new Error('UUID generation is not available in this environment');
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}

export function createQuickMindDocument(options: DocumentFactoryOptions = {}): QuickMindDocument {
  const nextId = options.createId ?? createQuickMindId;
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

export function countUserVisibleCharacters(value: string): number {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)).length;
  }

  return Array.from(value).length;
}

export function takeUserVisibleCharacters(value: string, maximum: number): string {
  if (countUserVisibleCharacters(value) <= maximum) {
    return value;
  }

  if (typeof Intl.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value))
      .slice(0, maximum)
      .map((segment) => segment.segment)
      .join('');
  }

  return Array.from(value).slice(0, maximum).join('');
}

export function getVisibleNodes(root: QuickMindNode): QuickMindNode[] {
  const visible: QuickMindNode[] = [];

  const visit = (node: QuickMindNode): void => {
    visible.push(node);
    if (!node.isCollapsed) {
      node.children.forEach(visit);
    }
  };

  visit(root);
  return visible;
}
