import {
  CURRENT_SCHEMA_VERSION,
  MAX_NODE_TITLE_LENGTH,
  countUserVisibleCharacters,
  normalizeNodeTitle,
  takeUserVisibleCharacters,
  type QuickMindDocument,
  type QuickMindNode,
} from './document';

export const MAX_QUICKMIND_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_QUICKMIND_NODE_COUNT = 10_000;

export interface QuickMindDocumentUsage {
  byteLength: number;
  nodeCount: number;
}

export type QuickMindFormatErrorCode =
  | 'invalid-json'
  | 'duplicate-key'
  | 'invalid-schema'
  | 'unknown-field'
  | 'unsupported-version'
  | 'invalid-id'
  | 'duplicate-id'
  | 'invalid-time'
  | 'invalid-node'
  | 'node-limit'
  | 'file-size-limit';

export interface QuickMindFormatErrorDetails {
  requestedVersion?: unknown;
  supportedVersion?: number;
  byteLength?: number;
  maxBytes?: number;
  nodeCount?: number;
  maxNodes?: number;
}

export class QuickMindFormatError extends Error {
  constructor(
    readonly code: QuickMindFormatErrorCode,
    readonly path: string,
    readonly details: QuickMindFormatErrorDetails = {},
  ) {
    super(`${code} at ${path}`);
    this.name = 'QuickMindFormatError';
  }
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const FILENAME_EXTENSION = '.quickmind';
const KNOWN_FIELD_NAMES = new Set([
  'meta',
  'root',
  'id',
  'schemaVersion',
  'createdAt',
  'updatedAt',
  'text',
  'isCollapsed',
  'children',
]);

export function serializeQuickMindDocument(document: QuickMindDocument): string {
  const normalized = validateQuickMindDocument(document);
  const serialized = JSON.stringify(normalized, null, 2);
  assertFileSize(serialized);
  return serialized;
}

export function parseQuickMindDocument(source: string): QuickMindDocument {
  assertFileSize(source);

  let parsed: unknown;
  try {
    parsed = JSON.parse(source) as unknown;
  } catch {
    throw new QuickMindFormatError('invalid-json', '$');
  }

  assertNoDuplicateKeys(source);
  return validateQuickMindDocument(parsed);
}

export function measureQuickMindDocument(document: QuickMindDocument): QuickMindDocumentUsage {
  let nodeCount = 0;
  const pending: QuickMindNode[] = [document.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) {
      continue;
    }
    nodeCount += 1;
    pending.push(...node.children);
  }

  return {
    byteLength: new TextEncoder().encode(JSON.stringify(document, null, 2)).byteLength,
    nodeCount,
  };
}

export function validateQuickMindDocument(value: unknown): QuickMindDocument {
  if (!isRecord(value)) {
    throw new QuickMindFormatError('invalid-schema', '$');
  }

  assertExactKeys(value, ['meta', 'root'], '$');
  if (!isRecord(value.meta) || !isRecord(value.root)) {
    throw new QuickMindFormatError('invalid-schema', '$');
  }

  if (!Object.prototype.hasOwnProperty.call(value.meta, 'schemaVersion')) {
    throw new QuickMindFormatError('unsupported-version', '$.meta.schemaVersion', {
      requestedVersion: undefined,
      supportedVersion: CURRENT_SCHEMA_VERSION,
    });
  }
  assertExactKeys(value.meta, ['id', 'schemaVersion', 'createdAt', 'updatedAt'], '$.meta');
  if (value.meta.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new QuickMindFormatError('unsupported-version', '$.meta.schemaVersion', {
      requestedVersion: value.meta.schemaVersion,
      supportedVersion: CURRENT_SCHEMA_VERSION,
    });
  }

  const documentId = readUuid(value.meta.id, '$.meta.id');
  const createdAt = readUtcTime(value.meta.createdAt, '$.meta.createdAt');
  const updatedAt = readUtcTime(value.meta.updatedAt, '$.meta.updatedAt');
  const ids = new Set<string>([documentId]);
  let nodeCount = 0;

  const root = validateNode(value.root, '$.root', ids, () => {
    nodeCount += 1;
    if (nodeCount > MAX_QUICKMIND_NODE_COUNT) {
      throw new QuickMindFormatError('node-limit', '$.root', {
        nodeCount,
        maxNodes: MAX_QUICKMIND_NODE_COUNT,
      });
    }
  });

  return {
    meta: {
      id: documentId,
      schemaVersion: CURRENT_SCHEMA_VERSION,
      createdAt,
      updatedAt,
    },
    root,
  };
}

export function createQuickMindFilename(rootTitle: string): string {
  let base = rootTitle
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .trim()
    .replace(/^\.+|\.+$/g, '');

  if (base.toLowerCase().endsWith(FILENAME_EXTENSION)) {
    base = base.slice(0, -FILENAME_EXTENSION.length).replace(/\.+$/g, '');
  }

  base = takeUserVisibleCharacters(base, 100).replace(/^\.+|\.+$/g, '');
  if (!base) {
    base = '未命名心智圖';
  }

  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) {
    base = `_${base}`;
  }

  return `${base}${FILENAME_EXTENSION}`;
}

function validateNode(
  value: unknown,
  path: string,
  ids: Set<string>,
  countNode: () => void,
): QuickMindNode {
  if (!isRecord(value)) {
    throw new QuickMindFormatError('invalid-node', path);
  }

  assertExactKeys(value, ['id', 'text', 'isCollapsed', 'children'], path);
  const id = readUuid(value.id, `${path}.id`);
  if (ids.has(id)) {
    throw new QuickMindFormatError('duplicate-id', `${path}.id`);
  }
  ids.add(id);

  if (typeof value.text !== 'string' || normalizeNodeTitle(value.text) !== value.text || !value.text || countUserVisibleCharacters(value.text) > MAX_NODE_TITLE_LENGTH) {
    throw new QuickMindFormatError('invalid-node', `${path}.text`);
  }
  if (typeof value.isCollapsed !== 'boolean' || !Array.isArray(value.children)) {
    throw new QuickMindFormatError('invalid-node', path);
  }

  countNode();

  return {
    id,
    text: value.text,
    isCollapsed: value.isCollapsed,
    children: value.children.map((child, index) => validateNode(child, `${path}.children[${index}]`, ids, countNode)),
  };
}

function readUuid(value: unknown, path: string): string {
  if (typeof value !== 'string' || !UUID_V4_PATTERN.test(value)) {
    throw new QuickMindFormatError('invalid-id', path);
  }

  return value;
}

function readUtcTime(value: unknown, path: string): string {
  if (typeof value !== 'string' || !UTC_ISO_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new QuickMindFormatError('invalid-time', path);
  }

  return value;
}

function assertFileSize(source: string): void {
  const byteLength = new TextEncoder().encode(source).byteLength;
  if (byteLength > MAX_QUICKMIND_FILE_BYTES) {
    throw new QuickMindFormatError('file-size-limit', '$', {
      byteLength,
      maxBytes: MAX_QUICKMIND_FILE_BYTES,
    });
  }
}

function assertExactKeys(value: Record<string, unknown>, expected: string[], path: string): void {
  const expectedSet = new Set(expected);
  if (Object.keys(value).some((key) => !expectedSet.has(key))) {
    throw new QuickMindFormatError('unknown-field', `${path}.*`);
  }
  if (expected.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    throw new QuickMindFormatError('invalid-schema', path);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNoDuplicateKeys(source: string): void {
  let index = 0;

  const skipWhitespace = (): void => {
    while (/\s/.test(source[index] ?? '')) {
      index += 1;
    }
  };

  const readString = (): string => {
    const start = index;
    index += 1;
    while (index < source.length) {
      if (source[index] === '\\') {
        index += 2;
      } else if (source[index] === '"') {
        index += 1;
        return JSON.parse(source.slice(start, index)) as string;
      } else {
        index += 1;
      }
    }

    throw new QuickMindFormatError('invalid-json', '$');
  };

  const readValue = (path: string): void => {
    skipWhitespace();
    if (source[index] === '{') {
      readObject(path);
    } else if (source[index] === '[') {
      readArray(path);
    } else if (source[index] === '"') {
      readString();
    } else {
      while (index < source.length && !/[\s,\]}]/.test(source[index] ?? '')) {
        index += 1;
      }
    }
  };

  const readObject = (path: string): void => {
    index += 1;
    skipWhitespace();
    const keys = new Set<string>();
    if (source[index] === '}') {
      index += 1;
      return;
    }

    while (index < source.length) {
      skipWhitespace();
      if (source[index] !== '"') {
        throw new QuickMindFormatError('invalid-json', path);
      }
      const key = readString();
      if (keys.has(key)) {
        throw new QuickMindFormatError('duplicate-key', `${path}.*`);
      }
      keys.add(key);
      skipWhitespace();
      if (source[index] !== ':') {
        throw new QuickMindFormatError('invalid-json', path);
      }
      index += 1;
      readValue(KNOWN_FIELD_NAMES.has(key) ? `${path}.${key}` : `${path}.*`);
      skipWhitespace();
      if (source[index] === '}') {
        index += 1;
        return;
      }
      if (source[index] !== ',') {
        throw new QuickMindFormatError('invalid-json', path);
      }
      index += 1;
    }

    throw new QuickMindFormatError('invalid-json', path);
  };

  const readArray = (path: string): void => {
    index += 1;
    skipWhitespace();
    if (source[index] === ']') {
      index += 1;
      return;
    }

    while (index < source.length) {
      readValue(path);
      skipWhitespace();
      if (source[index] === ']') {
        index += 1;
        return;
      }
      if (source[index] !== ',') {
        throw new QuickMindFormatError('invalid-json', path);
      }
      index += 1;
    }

    throw new QuickMindFormatError('invalid-json', path);
  };

  readValue('$');
}
