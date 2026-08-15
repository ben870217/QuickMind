import { describe, expect, it } from 'vitest';
import type { QuickMindDocument } from '../domain/document';
import { createMermaidArtifact, createMermaidSource } from './mermaid';

const documentFixture: QuickMindDocument = {
  meta: {
    id: '00000000-0000-4000-8000-000000000001',
    schemaVersion: 1,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:01:00.000Z',
  },
  root: {
    id: '00000000-0000-4000-8000-000000000002',
    text: '根節點',
    isCollapsed: true,
    children: [
      {
        id: '00000000-0000-4000-8000-000000000003',
        text: '重複標題',
        isCollapsed: false,
        children: [
          {
            id: '00000000-0000-4000-8000-000000000004',
            text: '重複標題',
            isCollapsed: false,
            children: [],
          },
        ],
      },
      {
        id: '00000000-0000-4000-8000-000000000005',
        text: '特殊字元：" [] () # <標籤> &',
        isCollapsed: false,
        children: [],
      },
    ],
  },
};

describe('Mermaid external export', () => {
  it('emits a complete, stable, two-space-indented mindmap independent of collapse state', () => {
    const source = createMermaidSource(documentFixture);
    const repeated = createMermaidSource(structuredClone(documentFixture));

    expect(source).toBe(`mindmap
  n0["根節點"]
    n1["重複標題"]
      n2["重複標題"]
    n3["特殊字元：#quot; #91;#93; #40;#41; #35; #lt;標籤#gt; #38;"]
`);
    expect(repeated).toBe(source);
  });

  it('creates a UTF-8 text artifact with a safe external filename', () => {
    const artifact = createMermaidArtifact({
      ...structuredClone(documentFixture),
      root: { ...documentFixture.root, text: '我的/心智圖' },
    });

    expect(artifact.filename).toBe('我的_心智圖.mmd');
    expect(artifact.mimeType).toBe('text/plain;charset=utf-8');
    expect(artifact.source).toContain('mindmap');
  });

  it('rejects XML-incompatible control characters before writing Mermaid source', () => {
    const document = structuredClone(documentFixture);
    document.root.text = '不能輸出的控制字元\u0001';

    expect(() => createMermaidSource(document)).toThrow('invalid-control-character');
  });

  it('rejects an external source over the shared 10 MB document limit', () => {
    const document = structuredClone(documentFixture);
    const wideTitle = '👨‍💻'.repeat(100);
    document.root.children = Array.from({ length: 9_999 }, (_, index) => ({
      id: `00000000-0000-4000-8000-${(100 + index).toString(16).padStart(12, '0')}`,
      text: wideTitle,
      isCollapsed: false,
      children: [],
    }));

    expect(() => createMermaidSource(document)).toThrow('file-size-limit');
  });
});
