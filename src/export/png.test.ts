import { describe, expect, it } from 'vitest';
import type { QuickMindDocument } from '../domain/document';
import {
  PNG_PIXEL_RATIO,
  createPngSvg,
} from './png';
import {
  EXPORT_MARGIN,
  createExportLayout,
} from './export-layout';

const documentFixture: QuickMindDocument = {
  meta: {
    id: '00000000-0000-4000-8000-000000000031',
    schemaVersion: 1,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:01:00.000Z',
  },
  root: {
    id: '00000000-0000-4000-8000-000000000032',
    text: '根節點',
    isCollapsed: true,
    children: [
      {
        id: '00000000-0000-4000-8000-000000000033',
        text: '第一個想法',
        isCollapsed: true,
        children: [
          {
            id: '00000000-0000-4000-8000-000000000034',
            text: '收合後仍要出現在 PNG 的後代',
            isCollapsed: false,
            children: [],
          },
        ],
      },
    ],
  },
};

describe('PNG external export scene', () => {
  it('creates a clean complete SVG scene with margin and three-times pixel dimensions', () => {
    const scene = createPngSvg(documentFixture);
    const layout = createExportLayout(documentFixture);

    expect(scene.width).toBe(layout.width + EXPORT_MARGIN * 2);
    expect(scene.height).toBe(layout.height + EXPORT_MARGIN * 2);
    expect(scene.pixelWidth).toBe(scene.width * PNG_PIXEL_RATIO);
    expect(scene.pixelHeight).toBe(scene.height * PNG_PIXEL_RATIO);
    expect(scene.svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
    expect(scene.svg).toContain('fill="#f4ede6"');
    expect(scene.svg).toContain('marker-end="url(#quickmind-export-arrow)"');
    expect(scene.svg).toContain('根節點');
    expect(scene.svg).toContain('第一個想法');
    expect(scene.svg).toContain('收合後仍要出現在 PNG 的後代');
    expect(scene.svg.match(/<rect /g)).toHaveLength(4);
    expect(scene.svg.match(/<path /g)).toHaveLength(2);
    expect(scene.svg).not.toContain('...');
    expect(scene.svg).not.toContain('data-node-id');
  });

  it('keeps long titles complete through SVG text lines', () => {
    const document = structuredClone(documentFixture);
    const longTitle = '這是一個需要完整換行的 PNG 標題，不能被省略。'.repeat(4);
    document.root.text = longTitle;

    const scene = createPngSvg(document);

    expect(scene.svg).toContain(longTitle.slice(0, 12));
    expect(scene.svg).toContain(longTitle.slice(-12));
    expect(scene.height).toBeGreaterThan(100);
  });
});
