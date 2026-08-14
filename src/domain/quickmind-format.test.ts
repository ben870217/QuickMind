import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from './document';
import {
  createQuickMindFilename,
  MAX_QUICKMIND_NODE_COUNT,
  parseQuickMindDocument,
  QuickMindFormatError,
  serializeQuickMindDocument,
} from './quickmind-format';
import type { QuickMindDocument } from './document';

const documentFixture: QuickMindDocument = {
  meta: {
    id: '00000000-0000-4000-8000-000000000001',
    schemaVersion: CURRENT_SCHEMA_VERSION,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:01:00.000Z',
  },
  root: {
    id: '00000000-0000-4000-8000-000000000002',
    text: '根節點',
    isCollapsed: false,
    children: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        text: '第一個想法',
        isCollapsed: true,
        children: [
          {
            id: '00000000-0000-4000-8000-000000000004',
            text: '子想法',
            isCollapsed: false,
            children: [],
          },
        ],
      },
    ],
  },
};

describe('QuickMind native format', () => {
  it('round-trips document identity, order, text, timestamps, and collapse state', () => {
    const serialized = serializeQuickMindDocument(documentFixture);
    const parsed = parseQuickMindDocument(serialized);

    expect(parsed).toEqual(documentFixture);
  });

  it('rejects unknown fields, duplicate keys, unsupported versions, and invalid ids', () => {
    const withUnknownField = JSON.parse(JSON.stringify(documentFixture)) as Record<string, unknown>;
    withUnknownField.extra = true;
    expect(() => parseQuickMindDocument(JSON.stringify(withUnknownField))).toThrowError(QuickMindFormatError);
    expect(() => parseQuickMindDocument(JSON.stringify(withUnknownField))).toThrow('unknown-field at $.*');

    const duplicateKey = serializeQuickMindDocument(documentFixture).replace(
      '"schemaVersion": 1,',
      '"schemaVersion": 1,\n    "schemaVersion": 1,',
    );
    expect(() => parseQuickMindDocument(duplicateKey)).toThrow('duplicate-key at $.meta.*');

    const unsupportedVersion = serializeQuickMindDocument(documentFixture).replace('"schemaVersion": 1', '"schemaVersion": 2');
    expect(() => parseQuickMindDocument(unsupportedVersion)).toThrow('unsupported-version at $.meta.schemaVersion');

    const invalidId = serializeQuickMindDocument(documentFixture).replace(
      '00000000-0000-4000-8000-000000000002',
      'not-a-uuid',
    );
    expect(() => parseQuickMindDocument(invalidId)).toThrow('invalid-id at $.root.id');
  });

  it('rejects duplicate ids and documents over the node limit', () => {
    const duplicateId = structuredClone(documentFixture);
    duplicateId.root.children[0]!.id = duplicateId.root.id;
    expect(() => serializeQuickMindDocument(duplicateId)).toThrow('duplicate-id at $.root.children[0].id');

    const children = Array.from({ length: MAX_QUICKMIND_NODE_COUNT }, (_, index) => ({
      id: `00000000-0000-4000-8000-${(index + 10).toString(16).padStart(12, '0')}`,
      text: `節點${index}`,
      isCollapsed: false,
      children: [],
    }));
    const tooManyNodes = structuredClone(documentFixture);
    tooManyNodes.root.children = children;
    expect(() => serializeQuickMindDocument(tooManyNodes)).toThrow('node-limit at $.root');
  });

  it('creates safe lower-case filenames from root titles', () => {
    expect(createQuickMindFilename('  我的/心智圖  ')).toBe('我的_心智圖.quickmind');
    expect(createQuickMindFilename('CON')).toBe('_CON.quickmind');
    expect(createQuickMindFilename('主題.QUICKMIND')).toBe('主題.quickmind');
    expect(createQuickMindFilename('...')).toBe('未命名心智圖.quickmind');
  });
});
