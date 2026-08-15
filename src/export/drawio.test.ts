import { describe, expect, it } from 'vitest';
import type { QuickMindDocument } from '../domain/document';
import { createDrawioArtifact, createDrawioSource } from './drawio';

const documentFixture: QuickMindDocument = {
  meta: {
    id: '00000000-0000-4000-8000-000000000021',
    schemaVersion: 1,
    createdAt: '2026-08-14T00:00:00.000Z',
    updatedAt: '2026-08-14T00:01:00.000Z',
  },
  root: {
    id: '00000000-0000-4000-8000-000000000022',
    text: '根節點 & <原文>',
    isCollapsed: true,
    children: [
      {
        id: '00000000-0000-4000-8000-000000000023',
        text: '可編輯「節點」',
        isCollapsed: false,
        children: [
          {
            id: '00000000-0000-4000-8000-000000000024',
            text: '第三層',
            isCollapsed: false,
            children: [],
          },
        ],
      },
    ],
  },
};

describe('draw.io external export', () => {
  it('creates one editable, uncompressed page with complete hierarchy edges', () => {
    const source = createDrawioSource(documentFixture);

    expect(source.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(source).toContain('<diagram name="根節點 &amp; &lt;原文&gt;" id="page-0">');
    expect(source).toContain('pageWidth="');
    expect(source).toContain('pageHeight="');
    expect(source.match(/vertex="1"/g)).toHaveLength(3);
    expect(source.match(/edge="1"/g)).toHaveLength(2);
    expect(source).toContain('source="node-0" target="node-1"');
    expect(source).toContain('source="node-1" target="node-2"');
    expect(source).toContain('edgeStyle=orthogonalEdgeStyle');
    expect(source).toContain('endArrow=block');
    expect(source).toContain('value="根節點 &amp; &lt;原文&gt;"');
    expect(source).toContain('value="可編輯「節點」"');
    expect(source).not.toContain(documentFixture.meta.id);
    expect(source).not.toContain(documentFixture.root.id);
    expect(source).not.toContain('compressed="true"');
    expect(source.match(/<mxCell /g)).toHaveLength(7);
  });

  it('creates a safe draw.io filename and XML artifact', () => {
    const artifact = createDrawioArtifact(documentFixture);

    expect(artifact.filename).toBe('根節點 & _原文_.drawio');
    expect(artifact.mimeType).toBe('application/xml;charset=utf-8');
    expect(artifact.source).toContain('<mxfile');
  });
});
