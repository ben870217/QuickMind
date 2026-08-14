export const DEFAULT_DOCUMENT_TITLE = '未命名心智圖';
export const CURRENT_SCHEMA_VERSION = 1 as const;

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
