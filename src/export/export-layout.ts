import type { QuickMindDocument, QuickMindNode } from '../domain/document';
import { serializeQuickMindDocument } from '../domain/quickmind-format';

export const EXPORT_NODE_WIDTH = 288;
export const EXPORT_HORIZONTAL_GAP = 40;
export const EXPORT_VERTICAL_GAP = 12;
export const EXPORT_NODE_HORIZONTAL_PADDING = 16;
export const EXPORT_NODE_VERTICAL_PADDING = 12;
export const EXPORT_LINE_HEIGHT = 24;
export const EXPORT_MARGIN = 32;

const EXPORT_TEXT_WIDTH = EXPORT_NODE_WIDTH - EXPORT_NODE_HORIZONTAL_PADDING * 2;
const EXPORT_FONT_SIZE = 16;

export interface ExportLayoutNode {
  exportId: string;
  documentNodeId: string;
  parentExportId: string | null;
  depth: number;
  text: string;
  lines: string[];
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportLayoutEdge {
  exportId: string;
  source: ExportLayoutNode;
  target: ExportLayoutNode;
}

export interface ExportLayout {
  width: number;
  height: number;
  nodes: ExportLayoutNode[];
  edges: ExportLayoutEdge[];
}

interface LayoutNode extends ExportLayoutNode {
  childIndexes: number[];
  subtreeHeight: number;
}

interface LayoutFrame {
  node: QuickMindNode;
  parentIndex: number | null;
  depth: number;
}

interface PlacementFrame {
  index: number;
  top: number;
}

export function createExportLayout(document: QuickMindDocument): ExportLayout {
  serializeQuickMindDocument(document);

  const internalNodes: LayoutNode[] = [];
  const pending: LayoutFrame[] = [{ node: document.root, parentIndex: null, depth: 0 }];

  while (pending.length > 0) {
    const frame = pending.pop();
    if (!frame) {
      continue;
    }

    const index = internalNodes.length;
    const lines = wrapExportTitle(frame.node.text);
    const node: LayoutNode = {
      exportId: `node-${index}`,
      documentNodeId: frame.node.id,
      parentExportId: frame.parentIndex === null ? null : `node-${frame.parentIndex}`,
      depth: frame.depth,
      text: frame.node.text,
      lines,
      x: 0,
      y: 0,
      width: EXPORT_NODE_WIDTH,
      height: Math.max(48, EXPORT_NODE_VERTICAL_PADDING * 2 + lines.length * EXPORT_LINE_HEIGHT),
      childIndexes: [],
      subtreeHeight: 0,
    };
    internalNodes.push(node);

    if (frame.parentIndex !== null) {
      internalNodes[frame.parentIndex]?.childIndexes.push(index);
    }

    for (let childIndex = frame.node.children.length - 1; childIndex >= 0; childIndex -= 1) {
      const child = frame.node.children[childIndex];
      if (child) {
        pending.push({ node: child, parentIndex: index, depth: frame.depth + 1 });
      }
    }
  }

  for (let index = internalNodes.length - 1; index >= 0; index -= 1) {
    const node = internalNodes[index];
    if (!node) {
      continue;
    }

    const childrenHeight = node.childIndexes.reduce((total, childIndex, childOrder) => {
      const child = internalNodes[childIndex];
      return total + (child?.subtreeHeight ?? 0) + (childOrder > 0 ? EXPORT_VERTICAL_GAP : 0);
    }, 0);
    node.subtreeHeight = Math.max(node.height, childrenHeight);
  }

  const placement: PlacementFrame[] = [{ index: 0, top: 0 }];
  while (placement.length > 0) {
    const frame = placement.pop();
    if (!frame) {
      continue;
    }

    const node = internalNodes[frame.index];
    if (!node) {
      continue;
    }

    node.x = node.depth * (EXPORT_NODE_WIDTH + EXPORT_HORIZONTAL_GAP);
    node.y = frame.top + (node.subtreeHeight - node.height) / 2;

    const childrenHeight = node.childIndexes.reduce((total, childIndex, childOrder) => {
      const child = internalNodes[childIndex];
      return total + (child?.subtreeHeight ?? 0) + (childOrder > 0 ? EXPORT_VERTICAL_GAP : 0);
    }, 0);
    let childTop = frame.top + (node.subtreeHeight - childrenHeight) / 2;
    const childFrames: PlacementFrame[] = [];
    node.childIndexes.forEach((childIndex) => {
      const child = internalNodes[childIndex];
      if (!child) {
        return;
      }
      childFrames.push({ index: childIndex, top: childTop });
      childTop += child.subtreeHeight + EXPORT_VERTICAL_GAP;
    });
    for (let childIndex = childFrames.length - 1; childIndex >= 0; childIndex -= 1) {
      const childFrame = childFrames[childIndex];
      if (childFrame) {
        placement.push(childFrame);
      }
    }
  }

  const nodes = internalNodes.map(({ childIndexes: _childIndexes, subtreeHeight: _subtreeHeight, ...node }) => node);
  const edges = nodes.flatMap((target) => {
    if (!target.parentExportId) {
      return [];
    }

    const source = nodes.find((candidate) => candidate.exportId === target.parentExportId);
    if (!source) {
      throw new Error('Export layout edge references a missing node');
    }

    return [{
      exportId: `edge-${target.exportId}`,
      source,
      target,
    }];
  });

  return {
    width: Math.max(...nodes.map((node) => node.x + node.width), 1),
    height: Math.max(...nodes.map((node) => node.y + node.height), 1),
    nodes,
    edges,
  };
}

export function wrapExportTitle(title: string): string[] {
  const paragraphs = title.replace(/\r\n?/g, '\n').split('\n');
  const lines: string[] = [];

  paragraphs.forEach((paragraph) => {
    if (!paragraph) {
      lines.push('');
      return;
    }

    let line = '';
    let lineWidth = 0;
    segmentGraphemes(paragraph).forEach((segment) => {
      const segmentWidth = estimateCharacterWidth(segment);
      if (line && lineWidth + segmentWidth > EXPORT_TEXT_WIDTH) {
        lines.push(line);
        line = '';
        lineWidth = 0;
      }
      line += segment;
      lineWidth += segmentWidth;
    });
    lines.push(line);
  });

  return lines.length > 0 ? lines : [''];
}

function segmentGraphemes(value: string): string[] {
  if (typeof Intl.Segmenter === 'function') {
    return Array.from(
      new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value),
      (segment) => segment.segment,
    );
  }

  return Array.from(value);
}

function estimateCharacterWidth(segment: string): number {
  if (/\s/u.test(segment)) {
    return segment === '\t' ? EXPORT_FONT_SIZE * 2 : EXPORT_FONT_SIZE / 2;
  }
  if (/^[\u1100-\u11ff\u2e80-\u9fff\uac00-\ud7ff\uf900-\ufaff\u{1f000}-\u{1ffff}]$/u.test(segment)) {
    return EXPORT_FONT_SIZE;
  }

  return EXPORT_FONT_SIZE / 2;
}
