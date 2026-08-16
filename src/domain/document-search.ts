import type { QuickMindNode } from './document';

export function findNodeTitleMatches(root: QuickMindNode, query: string): QuickMindNode[] {
  if (!query) {
    return [];
  }

  const normalizedQuery = query.toLocaleLowerCase();
  const matches: QuickMindNode[] = [];

  const visit = (node: QuickMindNode): void => {
    if (node.text.toLocaleLowerCase().includes(normalizedQuery)) {
      matches.push(node);
    }

    node.children.forEach(visit);
  };

  visit(root);
  return matches;
}

export function findNodeAncestorIds(root: QuickMindNode, nodeId: string): string[] {
  const visit = (node: QuickMindNode, ancestors: string[]): string[] | null => {
    if (node.id === nodeId) {
      return ancestors;
    }

    for (const child of node.children) {
      const found = visit(child, [...ancestors, node.id]);
      if (found) {
        return found;
      }
    }

    return null;
  };

  return visit(root, []) ?? [];
}
