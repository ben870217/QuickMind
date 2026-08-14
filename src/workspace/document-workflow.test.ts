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

  it('adds a child and commits a normalized title', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'child-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
      now: () => '2026-08-14T00:01:00.000Z',
      saveDelayMs: 10_000,
    });
    const initial = await workflow.start();

    const editing = workflow.addChild(initial.document.root.id);
    expect(editing.editing).toEqual({ nodeId: 'child-id', originalText: '', isNew: true });

    expect(workflow.commitTitle('  第一個想法  ')).toBe(true);
    const state = workflow.getState();
    expect(state.document.root.children[0]?.text).toBe('第一個想法');
    expect(state.editing).toBeNull();
    expect(state.selectionId).toBe('child-id');
    expect(state.document.meta.updatedAt).toBe('2026-08-14T00:01:00.000Z');
  });

  it('cancels a new blank node without changing the document', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'child-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
      now: () => '2026-08-14T00:01:00.000Z',
    });
    const initial = await workflow.start();

    workflow.addChild(initial.document.root.id);
    expect(workflow.commitTitle('   ')).toBe(true);
    const state = workflow.getState();

    expect(state.document.root.children).toHaveLength(0);
    expect(state.selectionId).toBe('root-id');
    expect(state.editing).toBeNull();
    expect(state.document.meta.updatedAt).toBe('2026-08-14T00:00:00.000Z');
  });

  it('rejects a title longer than the visible character limit', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'child-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
    });
    const initial = await workflow.start();

    workflow.addChild(initial.document.root.id);

    expect(workflow.commitTitle('x'.repeat(201))).toBe(false);
    expect(workflow.getState().editing?.nodeId).toBe('child-id');
  });

  it('adds a sibling after the selected node and never creates a second root', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'child-id', 'sibling-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
    });
    const initial = await workflow.start();

    const rootAttempt = workflow.addSibling(initial.document.root.id);
    expect(rootAttempt.document.root.children).toHaveLength(0);

    workflow.addChild(initial.document.root.id);
    workflow.commitTitle('第一個想法');
    const child = workflow.getState().document.root.children[0];
    if (!child) {
      throw new Error('Expected the first child to exist');
    }

    workflow.addSibling(child.id);
    workflow.commitTitle('第二個想法');
    expect(workflow.getState().document.root.children.map((node) => node.text)).toEqual([
      '第一個想法',
      '第二個想法',
    ]);
  });

  it('deletes a subtree and moves selection to the previous sibling or parent', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'first-id', 'second-id', 'grandchild-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
      now: () => '2026-08-14T00:01:00.000Z',
    });
    const initial = await workflow.start();

    workflow.addChild(initial.document.root.id);
    workflow.commitTitle('第一個想法');
    const first = workflow.getState().document.root.children[0];
    if (!first) throw new Error('Expected the first child to exist');
    workflow.addSibling(first.id);
    workflow.commitTitle('第二個想法');
    const second = workflow.getState().document.root.children[1];
    if (!second) throw new Error('Expected the second child to exist');
    workflow.addChild(second.id);
    workflow.commitTitle('第二個想法的子節點');

    workflow.deleteNode(second.id);
    expect(workflow.getState().document.root.children.map((node) => node.text)).toEqual(['第一個想法']);
    expect(workflow.getState().selectionId).toBe('first-id');

    workflow.deleteNode(first.id);
    expect(workflow.getState().document.root.children).toHaveLength(0);
    expect(workflow.getState().selectionId).toBe('root-id');
  });

  it('toggles only nodes that have children', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'child-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
    });
    const initial = await workflow.start();

    workflow.toggleCollapse(initial.document.root.id);
    expect(workflow.getState().document.root.isCollapsed).toBe(false);
    workflow.addChild(initial.document.root.id);
    workflow.commitTitle('子節點');
    workflow.toggleCollapse(initial.document.root.id);
    expect(workflow.getState().document.root.isCollapsed).toBe(true);
    workflow.toggleCollapse(initial.document.root.children[0]?.id ?? null);
    expect(workflow.getState().document.root.children[0]?.isCollapsed).toBe(false);
  });

  it('navigates visible nodes and expands or collapses with left and right', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'first-id', 'second-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
    });
    const initial = await workflow.start();

    workflow.navigate('down');
    expect(workflow.getState().selectionId).toBe('root-id');
    workflow.addChild(initial.document.root.id);
    workflow.commitTitle('第一個想法');
    const first = workflow.getState().document.root.children[0];
    if (!first) throw new Error('Expected the first child to exist');
    workflow.addSibling(first.id);
    workflow.commitTitle('第二個想法');
    workflow.selectNode('root-id');

    workflow.navigate('right');
    expect(workflow.getState().selectionId).toBe('first-id');
    workflow.navigate('down');
    expect(workflow.getState().selectionId).toBe('second-id');
    workflow.navigate('up');
    expect(workflow.getState().selectionId).toBe('first-id');
    workflow.navigate('left');
    expect(workflow.getState().selectionId).toBe('root-id');
    workflow.toggleCollapse('root-id');
    workflow.navigate('down');
    expect(workflow.getState().selectionId).toBe('root-id');
  });

  it('moves nodes before, after, and inside a target while retaining moved selection', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'first-id', 'second-id', 'third-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
      now: () => '2026-08-14T00:01:00.000Z',
    });
    const initial = await workflow.start();

    workflow.addChild(initial.document.root.id);
    workflow.commitTitle('第一個');
    workflow.addSibling('first-id');
    workflow.commitTitle('第二個');
    workflow.addSibling('second-id');
    workflow.commitTitle('第三個');

    workflow.moveNode('first-id', 'second-id', 'after');
    expect(workflow.getState().document.root.children.map((node) => node.id)).toEqual([
      'second-id',
      'first-id',
      'third-id',
    ]);
    expect(workflow.getState().selectionId).toBe('first-id');

    workflow.moveNode('third-id', 'second-id', 'before');
    expect(workflow.getState().document.root.children.map((node) => node.id)).toEqual([
      'third-id',
      'second-id',
      'first-id',
    ]);

    workflow.moveNode('first-id', 'second-id', 'inside');
    const state = workflow.getState();
    expect(state.document.root.children.map((node) => node.id)).toEqual(['third-id', 'second-id']);
    expect(state.document.root.children[1]?.children.map((node) => node.id)).toEqual(['first-id']);
    expect(state.selectionId).toBe('first-id');
  });

  it('rejects moving the root or moving a node into its own descendant', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'parent-id', 'child-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
    });
    const initial = await workflow.start();

    workflow.addChild(initial.document.root.id);
    workflow.commitTitle('父節點');
    workflow.addChild('parent-id');
    workflow.commitTitle('子節點');

    expect(workflow.canMoveNode('root-id', 'parent-id')).toBe(false);
    expect(workflow.canMoveNode('parent-id', 'child-id')).toBe(false);
    expect(workflow.canMoveNode('parent-id', 'root-id', 'before')).toBe(false);
    expect(workflow.canMoveNode('parent-id', 'root-id', 'after')).toBe(false);
    expect(workflow.canMoveNode('parent-id', 'root-id', 'inside')).toBe(true);
    workflow.moveNode('parent-id', 'child-id', 'inside');

    const state = workflow.getState();
    expect(state.document.root.children[0]?.id).toBe('parent-id');
    expect(state.document.root.children[0]?.children[0]?.id).toBe('child-id');
  });
});
