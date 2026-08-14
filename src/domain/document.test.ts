import { describe, expect, it } from 'vitest';
import {
  countUserVisibleCharacters,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_DOCUMENT_TITLE,
  createQuickMindDocument,
  takeUserVisibleCharacters,
} from './document';

describe('createQuickMindDocument', () => {
  it('creates one identified root node with the default title', () => {
    const ids = ['document-id', 'root-id'];
    const document = createQuickMindDocument({
      createId: () => ids.shift() ?? 'unused-id',
      now: () => '2026-08-14T00:00:00.000Z',
    });

    expect(document).toEqual({
      meta: {
        id: 'document-id',
        schemaVersion: CURRENT_SCHEMA_VERSION,
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
      root: {
        id: 'root-id',
        text: DEFAULT_DOCUMENT_TITLE,
        isCollapsed: false,
        children: [],
      },
    });
  });

  it('counts and truncates user-visible graphemes without splitting emoji', () => {
    const title = 'A👩‍💻é';

    expect(countUserVisibleCharacters(title)).toBe(3);
    expect(takeUserVisibleCharacters(title, 2)).toBe('A👩‍💻');
  });
});
