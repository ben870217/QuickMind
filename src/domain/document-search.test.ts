import { describe, expect, it } from 'vitest';
import type { QuickMindNode } from './document';
import { findNodeTitleMatches } from './document-search';

function node(id: string, text: string, children: QuickMindNode[] = [], isCollapsed = false): QuickMindNode {
  return { id, text, children, isCollapsed };
}

describe('findNodeTitleMatches', () => {
  it('matches titles case-insensitively in document order, including collapsed descendants', () => {
    const root = node('root', 'Root', [
      node('first', 'Alpha idea', [
        node('hidden', 'ALPHABET child'),
      ], true),
      node('second', 'Another idea'),
      node('last', 'alpha conclusion'),
    ]);

    expect(findNodeTitleMatches(root, 'alpha').map((match) => match.id)).toEqual([
      'first',
      'hidden',
      'last',
    ]);
  });

  it('returns no matches for an empty query', () => {
    expect(findNodeTitleMatches(node('root', 'Root'), '')).toEqual([]);
  });
});
