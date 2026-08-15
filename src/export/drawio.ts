import type { QuickMindDocument } from '../domain/document';
import { createExternalFilename } from '../domain/quickmind-format';
import {
  EXPORT_MARGIN,
  createExportLayout,
  type ExportLayout,
} from './export-layout';
import { escapeXml } from './xml';

export interface DrawioArtifact {
  filename: string;
  mimeType: 'application/xml;charset=utf-8';
  source: string;
}

export function createDrawioSource(document: QuickMindDocument): string {
  const layout = createExportLayout(document);
  return renderDrawioXml(layout, document.root.text);
}

export function createDrawioArtifact(document: QuickMindDocument): DrawioArtifact {
  return {
    filename: createExternalFilename(document.root.text, 'drawio'),
    mimeType: 'application/xml;charset=utf-8',
    source: createDrawioSource(document),
  };
}

function renderDrawioXml(layout: ExportLayout, pageName: string): string {
  const pageWidth = layout.width + EXPORT_MARGIN * 2;
  const pageHeight = layout.height + EXPORT_MARGIN * 2;
  const nodeCells = layout.nodes.map((node) => `
        <mxCell id="${node.exportId}" value="${escapeXml(node.text)}" style="rounded=1;whiteSpace=wrap;html=0;fillColor=#fffaf4;strokeColor=#cbb8ab;fontColor=#453c39;fontSize=16;align=left;verticalAlign=middle;spacingLeft=16;spacingRight=16;" vertex="1" parent="1">
          <mxGeometry x="${node.x + EXPORT_MARGIN}" y="${node.y + EXPORT_MARGIN}" width="${node.width}" height="${node.height}" as="geometry"/>
        </mxCell>`).join('');
  const edgeCells = layout.edges.map((edge) => `
        <mxCell id="${edge.exportId}" style="edgeStyle=orthogonalEdgeStyle;rounded=0;orthogonalLoop=1;jettySize=auto;html=0;endArrow=block;endFill=1;" edge="1" parent="1" source="${edge.source.exportId}" target="${edge.target.exportId}">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>`).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<mxfile host="app.diagrams.net">
  <diagram name="${escapeXml(pageName)}" id="page-0">
    <mxGraphModel dx="${pageWidth}" dy="${pageHeight}" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>${nodeCells}${edgeCells}
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;
}
