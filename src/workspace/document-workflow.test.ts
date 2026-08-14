import { describe, expect, it } from 'vitest';
import { createQuickMindDocument } from '../domain/document';
import type { QuickMindDocument } from '../domain/document';
import type { WorkspaceStore } from '../persistence/workspace-store';
import { DocumentWorkflow } from './document-workflow';

class MemoryWorkspaceStore implements WorkspaceStore {
  document: QuickMindDocument | null = null;
  saveCount = 0;

  async load(): Promise<QuickMindDocument | null> {
    return this.document ? structuredClone(this.document) : null;
  }

  async save(document: QuickMindDocument): Promise<void> {
    this.saveCount += 1;
    this.document = structuredClone(document);
  }

  async clear(): Promise<void> {
    this.document = null;
  }
}

describe('DocumentWorkflow', () => {
  it('creates and immediately saves a new local document when none exists', async () => {
    const store = new MemoryWorkspaceStore();
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: (() => {
          const ids = ['new-document', 'new-root'];
          return () => ids.shift() ?? 'unused';
        })(),
        now: () => '2026-08-14T00:00:00.000Z',
      }),
    });

    const state = await workflow.start();

    expect(state.restored).toBe(false);
    expect(state.persistence).toBe('saved');
    expect(state.document.meta.id).toBe('new-document');
    expect(state.document.root.text).toBe('未命名心智圖');
    expect(store.saveCount).toBe(1);
  });

  it('restores the existing local document without creating a replacement', async () => {
    const store = new MemoryWorkspaceStore();
    store.document = createQuickMindDocument({
      createId: (() => {
        const ids = ['saved-document', 'saved-root'];
        return () => ids.shift() ?? 'unused';
      })(),
      now: () => '2026-08-14T00:00:00.000Z',
    });
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => {
        throw new Error('a restored workspace must not create a document');
      },
    });

    const state = await workflow.start();

    expect(state.restored).toBe(true);
    expect(state.persistence).toBe('saved');
    expect(state.document.meta.id).toBe('saved-document');
    expect(store.saveCount).toBe(0);
  });

  it('reports the current connectivity without changing the document', async () => {
    const store = new MemoryWorkspaceStore();
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: (() => {
          const ids = ['offline-document', 'offline-root'];
          return () => ids.shift() ?? 'unused';
        })(),
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      initialConnectivity: 'offline',
    });

    const state = await workflow.start();
    const offlineState = workflow.setConnectivity('offline');

    expect(state.connectivity).toBe('offline');
    expect(offlineState.document).toEqual(state.document);
    expect(offlineState.persistence).toBe('saved');
  });
});
