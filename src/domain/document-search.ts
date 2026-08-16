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
