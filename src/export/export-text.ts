import type { QuickMindDocument } from '../domain/document';

export type ExternalExportErrorCode = 'invalid-control-character';

export class ExternalExportError extends Error {
  constructor(readonly code: ExternalExportErrorCode, detail: string) {
    super(`${code}: ${detail}`);
    this.name = 'ExternalExportError';
  }
}

export function assertExternalExportTextIsXmlSafe(document: QuickMindDocument): void {
  const pending = [document.root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) {
      continue;
    }

    for (const character of Array.from(node.text)) {
      const codePoint = character.codePointAt(0) ?? 0;
      if (isForbiddenXmlCharacter(codePoint)) {
        throw new ExternalExportError(
          'invalid-control-character',
          `node title contains U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`,
        );
      }
    }
    pending.push(...node.children);
  }
}

function isForbiddenXmlCharacter(codePoint: number): boolean {
  return codePoint === 0
    || (codePoint >= 0x01 && codePoint <= 0x08)
    || codePoint === 0x0b
    || codePoint === 0x0c
    || (codePoint >= 0x0e && codePoint <= 0x1f)
    || (codePoint >= 0xd800 && codePoint <= 0xdfff)
    || codePoint === 0xfffe
    || codePoint === 0xffff;
}
