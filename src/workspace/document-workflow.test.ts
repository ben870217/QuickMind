import { describe, expect, it } from 'vitest';
import { createQuickMindDocument } from '../domain/document';
import type { QuickMindDocument } from '../domain/document';
import type { WorkspaceSnapshot, WorkspaceStore } from '../persistence/workspace-store';
import { DocumentWorkflow, MAX_HISTORY_ENTRIES } from './document-workflow';

class MemoryWorkspaceStore implements WorkspaceStore {
  document: QuickMindDocument | null = null;
  metadata = { hasUnexportedChanges: true };
  saveCount = 0;

  async load(): Promise<WorkspaceSnapshot | null> {
    return this.document
      ? { document: structuredClone(this.document), metadata: structuredClone(this.metadata) }
      : null;
  }

  async save(document: QuickMindDocument, metadata = { hasUnexportedChanges: true }): Promise<void> {
    this.saveCount += 1;
    this.document = structuredClone(document);
    this.metadata = structuredClone(metadata);
  }

  async clear(): Promise<void> {
    this.document = null;
  }
}

class FailingWorkspaceStore extends MemoryWorkspaceStore {
  failuresRemaining = 0;

  override async save(document: QuickMindDocument): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('save failed');
    }

    await super.save(document);
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
    expect(state.selectionId).toBe('new-root');
    expect(state.editing).toEqual({ nodeId: 'new-root', originalText: '未命名心智圖', isNew: false });
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
    expect(state.hasUnexportedChanges).toBe(true);
    expect(store.saveCount).toBe(0);
  });

  it('flushes a debounced document save before the page leaves', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      saveDelayMs: 10_000,
    });
    await workflow.start();

    workflow.commitTitle('待保存');
    expect(store.saveCount).toBe(1);

    await workflow.flushSave();

    expect(store.saveCount).toBe(2);
    expect(store.document?.root.text).toBe('待保存');
  });

  it('persists the native export state separately from the document', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
    });
    await workflow.start();

    workflow.markExported();
    await workflow.flushSave();

    const reopened = new DocumentWorkflow(store, {
      createDocument: () => {
        throw new Error('an existing workspace must be restored');
      },
    });
    const state = await reopened.start();

    expect(state.hasUnexportedChanges).toBe(false);
    expect(state.document.meta.id).toBe('document-id');
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

  it('does not let an uncommitted blank node enter another document operation', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'child-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
      saveDelayMs: 10_000,
    });
    const initial = await workflow.start();

    workflow.addChild(initial.document.root.id);
    const blocked = workflow.toggleCollapse(initial.document.root.id);
    expect(blocked.document.root.isCollapsed).toBe(false);
    expect(store.saveCount).toBe(1);

    workflow.selectNode(initial.document.root.id);
    const state = workflow.getState();
    expect(state.editing).toBeNull();
    expect(state.document.root.children).toHaveLength(0);
    expect(store.saveCount).toBe(1);
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

  it('undoes and redoes one committed title change with its original timestamps', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'child-id'];
    const timestamps = [
      '2026-08-14T00:00:00.000Z',
      '2026-08-14T00:00:01.000Z',
      '2026-08-14T00:00:02.000Z',
      '2026-08-14T00:00:03.000Z',
    ];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => timestamps.shift() ?? '2026-08-14T00:00:01.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
      now: () => timestamps.shift() ?? '2026-08-14T00:00:04.000Z',
      saveDelayMs: 10_000,
    });
    const initial = await workflow.start();

    workflow.addChild(initial.document.root.id);
    workflow.commitTitle('原始標題');
    workflow.beginEditing('child-id');
    workflow.commitTitle('更新標題');

    const changed = workflow.getState();
    expect(changed.canUndo).toBe(true);
    expect(changed.canRedo).toBe(false);
    expect(changed.document.root.children[0]?.text).toBe('更新標題');
    expect(changed.document.meta.updatedAt).toBe('2026-08-14T00:00:03.000Z');

    const undone = workflow.undo();
    expect(undone.document.root.children[0]?.text).toBe('原始標題');
    expect(undone.document.meta.updatedAt).toBe('2026-08-14T00:00:02.000Z');
    expect(undone.canRedo).toBe(true);

    const redone = workflow.redo();
    expect(redone.document.root.children[0]?.text).toBe('更新標題');
    expect(redone.document.meta.updatedAt).toBe('2026-08-14T00:00:03.000Z');
    expect(redone.canUndo).toBe(true);
    expect(store.saveCount).toBeGreaterThan(1);
  });

  it('clears the redo branch after a new document change', async () => {
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
    workflow.commitTitle('第一個標題');
    workflow.beginEditing('child-id');
    workflow.commitTitle('第二個標題');
    workflow.undo();
    expect(workflow.getState().canRedo).toBe(true);

    workflow.beginEditing('child-id');
    workflow.commitTitle('分支標題');
    expect(workflow.getState().canRedo).toBe(false);
    expect(workflow.redo().document.root.children[0]?.text).toBe('分支標題');
  });

  it('keeps only the most recent 100 document operations', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'child-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      createId: () => ids.shift() ?? 'unused',
      saveDelayMs: 10_000,
    });
    const initial = await workflow.start();

    workflow.addChild(initial.document.root.id);
    workflow.commitTitle('可折疊節點');
    for (let index = 0; index < MAX_HISTORY_ENTRIES + 1; index += 1) {
      workflow.toggleCollapse(initial.document.root.id);
    }

    for (let index = 0; index < MAX_HISTORY_ENTRIES; index += 1) {
      workflow.undo();
    }

    expect(workflow.getState().canUndo).toBe(false);
    expect(workflow.getState().document.root.isCollapsed).toBe(true);
  });

  it('replaces a document as one undoable import and treats identical imports as no-op', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
    });
    await workflow.start();

    const imported = workflow.getState().document;
    imported.meta.id = 'imported-document-id';
    imported.meta.updatedAt = '2026-08-14T00:02:00.000Z';
    imported.root.id = 'imported-root-id';
    imported.root.text = '匯入文件';

    expect(workflow.replaceDocument(imported)).toBe(true);
    const importedState = workflow.getState();
    expect(importedState.document).toEqual(imported);
    expect(importedState.selectionId).toBeNull();
    expect(importedState.hasUnexportedChanges).toBe(false);
    expect(importedState.canUndo).toBe(true);

    const saveCountAfterImport = store.saveCount;
    const importedTimestamp = importedState.document.meta.updatedAt;
    expect(workflow.replaceDocument(structuredClone(imported))).toBe(false);
    expect(store.saveCount).toBe(saveCountAfterImport);
    expect(workflow.getState().document.meta.updatedAt).toBe(importedTimestamp);

    const undone = workflow.undo();
    expect(undone.document.meta.id).toBe('document-id');
    expect(undone.hasUnexportedChanges).toBe(true);
    const redone = workflow.redo();
    expect(redone.document.meta.id).toBe('imported-document-id');
    expect(redone.hasUnexportedChanges).toBe(false);
  });

  it('does not put an uncommitted blank node into import history', async () => {
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

    const imported = createQuickMindDocument({
      createId: (() => {
        const importedIds = ['imported-document-id', 'imported-root-id'];
        return () => importedIds.shift() ?? 'unused';
      })(),
      now: () => '2026-08-14T00:01:00.000Z',
    });
    imported.root.text = '匯入文件';

    expect(workflow.replaceDocument(imported)).toBe(true);
    const undone = workflow.undo();
    expect(undone.document.root.children).toHaveLength(0);
    expect(undone.editing).toBeNull();
  });

  it('rejects a node addition over the 10,000-node limit atomically', async () => {
    const store = new MemoryWorkspaceStore();
    const root = {
      id: 'root-id',
      text: '根節點',
      isCollapsed: false,
      children: Array.from({ length: 9_999 }, (_, index) => ({
        id: `child-${index}`,
        text: `節點${index}`,
        isCollapsed: false,
        children: [],
      })),
    };
    const document = {
      meta: {
        id: 'document-id',
        schemaVersion: 1 as const,
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      },
      root,
    };
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => document,
      createId: () => 'new-child-id',
      saveDelayMs: 10_000,
    });
    await workflow.start();
    const before = workflow.getState();

    workflow.addChild('root-id');
    const after = workflow.getState();
    expect(after.document).toEqual(before.document);
    expect(after.document.meta.updatedAt).toBe(before.document.meta.updatedAt);
    expect(after.editing?.nodeId).toBe('root-id');
    expect(after.canUndo).toBe(false);
    expect(after.limitError?.reason).toBe('node-count');
    expect(after.limitError?.nodeCount).toBe(10_001);
    expect(store.saveCount).toBe(1);
  });

  it('keeps memory content on save failure and allows a successful retry', async () => {
    const store = new FailingWorkspaceStore();
    store.failuresRemaining = 4;
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: (() => {
          const ids = ['document-id', 'root-id'];
          return () => ids.shift() ?? 'unused';
        })(),
        now: () => '2026-08-14T00:00:00.000Z',
      }),
      saveRetryDelaysMs: [0, 0, 0],
    });
    const state = await workflow.start();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(workflow.getState().persistence).toBe('error');
    expect(workflow.getState().document).toEqual(state.document);

    store.failuresRemaining = 0;
    workflow.retrySave();
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(workflow.getState().persistence).toBe('saved');
    expect(store.document).toEqual(state.document);
  });

  it('clears the local copy into a new document and resets history', async () => {
    const store = new MemoryWorkspaceStore();
    const ids = ['document-id', 'root-id', 'replacement-document-id', 'replacement-root-id'];
    const workflow = new DocumentWorkflow(store, {
      createDocument: () => createQuickMindDocument({
        createId: () => ids.shift() ?? 'unused',
        now: () => '2026-08-14T00:00:00.000Z',
      }),
    });
    await workflow.start();
    const cleared = await workflow.clearDocument();

    expect(cleared.document.meta.id).toBe('replacement-document-id');
    expect(cleared.document.root.id).toBe('replacement-root-id');
    expect(cleared.restored).toBe(false);
    expect(cleared.canUndo).toBe(false);
    expect(cleared.hasUnexportedChanges).toBe(true);
    expect(store.document?.meta.id).toBe('replacement-document-id');
  });
});
