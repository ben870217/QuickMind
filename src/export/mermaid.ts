import type { QuickMindDocument, QuickMindNode } from '../domain/document';
import {
  createExternalFilename,
  serializeQuickMindDocument,
} from '../domain/quickmind-format';

export interface MermaidArtifact {
  filename: string;
  mimeType: 'text/plain;charset=utf-8';
  source: string;
}

interface MermaidFrame {
  node: QuickMindNode;
  depth: number;
}

export function createMermaidSource(document: QuickMindDocument): string {
  serializeQuickMindDocument(document);

  const lines = ['mindmap'];
  const pending: MermaidFrame[] = [{ node: document.root, depth: 1 }];
  let nextSyntheticId = 0;

  while (pending.length > 0) {
    const frame = pending.pop();
    if (!frame) {
      continue;
    }

    const id = `n${nextSyntheticId}`;
    nextSyntheticId += 1;
    lines.push(`${'  '.repeat(frame.depth)}${id}["${escapeMermaidLabel(frame.node.text)}"]`);

    for (let index = frame.node.children.length - 1; index >= 0; index -= 1) {
      const child = frame.node.children[index];
      if (child) {
        pending.push({ node: child, depth: frame.depth + 1 });
      }
    }
  }

  return `${lines.join('\n')}\n`;
}

export function createMermaidArtifact(document: QuickMindDocument): MermaidArtifact {
  return {
    filename: createExternalFilename(document.root.text, 'mmd'),
    mimeType: 'text/plain;charset=utf-8',
    source: createMermaidSource(document),
  };
}

function escapeMermaidLabel(value: string): string {
  const entities: Record<string, string> = {
    '#': '#35;',
    '&': '#38;',
    '"': '#quot;',
    "'": '#39;',
    '<': '#lt;',
    '>': '#gt;',
    '[': '#91;',
    ']': '#93;',
    '(': '#40;',
    ')': '#41;',
    '{': '#123;',
    '}': '#125;',
    '|': '#124;',
    ';': '#59;',
    ':': '#58;',
    '%': '#37;',
    '`': '#96;',
    '\\': '#92;',
    '\n': '#10;',
    '\r': '#13;',
  };

  return Array.from(value, (character) => entities[character] ?? character).join('');
}
