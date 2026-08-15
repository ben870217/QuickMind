import type { QuickMindDocument } from '../domain/document';
import { createExternalFilename } from '../domain/quickmind-format';
import { ExternalExportError } from './export-text';
import {
  EXPORT_LINE_HEIGHT,
  EXPORT_MARGIN,
  EXPORT_NODE_HORIZONTAL_PADDING,
  createExportLayout,
  type ExportLayout,
} from './export-layout';
import { escapeXml } from './xml';

export const PNG_PIXEL_RATIO = 3;
const PNG_BACKGROUND = '#f4ede6';
const PNG_NODE_BACKGROUND = '#fffaf4';
const PNG_NODE_BORDER = '#cbb8ab';
const PNG_TEXT_COLOR = '#453c39';
const PNG_CONNECTION_COLOR = '#776158';

export type PngExportErrorCode =
  | 'canvas-unsupported'
  | 'canvas-render-failed'
  | 'svg-render-failed'
  | 'png-encode-failed';

export class PngExportError extends Error {
  constructor(readonly code: PngExportErrorCode, detail?: string) {
    super(detail ? `${code}: ${detail}` : code);
    this.name = 'PngExportError';
  }
}

export interface PngSvgScene {
  svg: string;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
}

export interface PngArtifact {
  filename: string;
  mimeType: 'image/png';
  data: Blob;
}

export function createPngSvg(document: QuickMindDocument): PngSvgScene {
  const layout = createExportLayout(document);
  const width = layout.width + EXPORT_MARGIN * 2;
  const height = layout.height + EXPORT_MARGIN * 2;
  const edgeMarkup = layout.edges.map((edge) => renderEdge(edge.source, edge.target)).join('');
  const nodeMarkup = layout.nodes.map((node) => renderNode(node)).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0" y="0" width="${width}" height="${height}" fill="${PNG_BACKGROUND}"/>
  <defs>
    <marker id="quickmind-export-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto" markerUnits="userSpaceOnUse">
      <polygon points="0,0 7,3.5 0,7" fill="${PNG_CONNECTION_COLOR}"/>
    </marker>
  </defs>${edgeMarkup}${nodeMarkup}
</svg>
`;

  return {
    svg,
    width,
    height,
    pixelWidth: width * PNG_PIXEL_RATIO,
    pixelHeight: height * PNG_PIXEL_RATIO,
  };
}

export async function createPngArtifact(document: QuickMindDocument): Promise<PngArtifact> {
  const scene = createPngSvg(document);
  const browserDocument = globalThis.document;
  if (!browserDocument || typeof browserDocument.createElement !== 'function' || typeof Image !== 'function') {
    throw new PngExportError('canvas-unsupported');
  }
  if (typeof URL.createObjectURL !== 'function') {
    throw new PngExportError('canvas-unsupported', 'object-url');
  }

  const svgUrl = URL.createObjectURL(new Blob([scene.svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await loadSvgImage(svgUrl);
    const canvas = browserDocument.createElement('canvas');
    canvas.width = scene.pixelWidth;
    canvas.height = scene.pixelHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new PngExportError('canvas-unsupported', '2d-context');
    }

    try {
      context.setTransform(PNG_PIXEL_RATIO, 0, 0, PNG_PIXEL_RATIO, 0, 0);
      context.drawImage(image, 0, 0, scene.width, scene.height);
    } catch (error) {
      throw new PngExportError('canvas-render-failed', error instanceof Error ? error.message : 'draw-image');
    }

    const data = await canvasToBlob(canvas);
    return {
      filename: createExternalFilename(document.root.text, 'png'),
      mimeType: 'image/png',
      data,
    };
  } catch (error) {
    if (error instanceof PngExportError || error instanceof ExternalExportError) {
      throw error;
    }
    throw new PngExportError('svg-render-failed', error instanceof Error ? error.message : 'image-load');
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

function renderEdge(source: ExportLayout['nodes'][number], target: ExportLayout['nodes'][number]): string {
  const sourceRight = EXPORT_MARGIN + source.x + source.width;
  const targetLeft = EXPORT_MARGIN + target.x;
  const sourceCenterY = EXPORT_MARGIN + source.y + source.height / 2;
  const targetCenterY = EXPORT_MARGIN + target.y + target.height / 2;
  const middleX = (sourceRight + targetLeft) / 2;
  const path = [
    `M ${round(sourceRight)} ${round(sourceCenterY)}`,
    `H ${round(middleX)}`,
    `V ${round(targetCenterY)}`,
    `H ${round(targetLeft)}`,
  ].join(' ');

  return `
  <path data-export-edge="true" d="${path}" fill="none" stroke="${PNG_CONNECTION_COLOR}" stroke-width="2" marker-end="url(#quickmind-export-arrow)"/>`;
}

function renderNode(node: ExportLayout['nodes'][number]): string {
  const x = EXPORT_MARGIN + node.x;
  const y = EXPORT_MARGIN + node.y;
  const textX = x + EXPORT_NODE_HORIZONTAL_PADDING;
  const firstLineY = y + node.height / 2 - ((node.lines.length - 1) * EXPORT_LINE_HEIGHT) / 2;
  const lines = node.lines.map((line, index) => (
    `<tspan x="${round(textX)}" y="${round(firstLineY + index * EXPORT_LINE_HEIGHT)}">${escapeXml(line)}</tspan>`
  )).join('');

  return `
  <rect data-export-node="${node.exportId}" x="${round(x)}" y="${round(y)}" width="${node.width}" height="${node.height}" rx="12" fill="${PNG_NODE_BACKGROUND}" stroke="${PNG_NODE_BORDER}"/>
  <text x="${round(textX)}" y="${round(firstLineY)}" fill="${PNG_TEXT_COLOR}" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" font-size="16" text-anchor="start" dominant-baseline="middle" xml:space="preserve">${lines}</text>`;
}

function loadSvgImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new PngExportError('svg-render-failed'));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      reject(new PngExportError('canvas-unsupported', 'to-blob'));
      return;
    }

    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new PngExportError('png-encode-failed'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

function round(value: number): string {
  return (Math.round(value * 100) / 100).toString();
}
