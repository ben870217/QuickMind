import { describe, expect, it } from 'vitest';
import type { QuickMindDocument } from '../domain/document';
import {
  EXPORT_HORIZONTAL_GAP,
  EXPORT_NODE_WIDTH,
  createExportLayout,
} from './export-layout';

const documentFixture: QuickMindDocument = {
  meta: {
    id: '00000000-0000-4000-8000-000000000011',
    schemaVersion: 1,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:01:00.000Z',
  },
  root: {
    id: '00000000-0000-4000-8000-000000000012',
    text: '根節點',
    isCollapsed: true,
    children: [
      {
        id: '00000000-0000-4000-8000-000000000013',
        text: '第一個想法',
        isCollapsed: true,
        children: [
          {
            id: '00000000-0000-4000-8000-000000000014',
            text: '收合後仍存在的孫節點',
            isCollapsed: false,
            children: [],
          },
        ],
      },
      {
        id: '00000000-0000-4000-8000-000000000015',
        text: '第二個想法',
        isCollapsed: false,
        children: [],
      },
    ],
  },
};

describe('complete external export layout', () => {
  it('lays out every node in preorder regardless of collapse state', () => {
    const layout = createExportLayout(documentFixture);

    expect(layout.nodes.map((node) => node.text)).toEqual([
      '根節點',
      '第一個想法',
      '收合後仍存在的孫節點',
      '第二個想法',
    ]);
    expect(layout.edges.map((edge) => [edge.source.exportId, edge.target.exportId])).toEqual([
      ['node-0', 'node-1'],
      ['node-1', 'node-2'],
      ['node-0', 'node-3'],
    ]);
    expect(layout.nodes[0]?.width).toBe(EXPORT_NODE_WIDTH);
    expect(layout.nodes[1]?.x).toBe(EXPORT_NODE_WIDTH + EXPORT_HORIZONTAL_GAP);
    expect(layout.nodes[2]?.x).toBe((EXPORT_NODE_WIDTH + EXPORT_HORIZONTAL_GAP) * 2);
    expect(layout.nodes[1]?.y).toBeLessThan(layout.nodes[3]?.y ?? 0);
  });

  it('wraps long titles without losing any title characters', () => {
    const longTitle = '這是一個需要在固定寬度節點中完整換行顯示的長標題，不能被省略或截斷。'.repeat(3);
    const document = structuredClone(documentFixture);
    document.root.children[0]!.text = longTitle;

    const layout = createExportLayout(document);
    const node = layout.nodes[1];

    expect(node?.lines.length).toBeGreaterThan(1);
    expect(node?.lines.join('')).toBe(longTitle);
    expect(node?.height).toBeGreaterThan(48);
  });
});
