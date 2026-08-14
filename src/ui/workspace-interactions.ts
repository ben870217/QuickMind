import type { DocumentWorkflow } from '../workspace/document-workflow';

export function bindWorkspaceInteractions(
  workspace: HTMLElement,
  workflow: DocumentWorkflow,
  render: () => void,
): () => void {
  const focusEditor = (): void => {
    const editor = workspace.querySelector<HTMLInputElement>('[data-node-editor]');
    editor?.focus();
    editor?.select();
  };

  const onClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLElement>('[data-node-id]');
    if (!node || target.closest('[data-node-editor]')) {
      return;
    }

    workflow.selectNode(node.dataset.nodeId ?? null);
    render();
  };

  const onDoubleClick = (event: MouseEvent): void => {
    const target = event.target as HTMLElement;
    const node = target.closest<HTMLElement>('[data-node-id]');
    if (!node || target.closest('[data-node-editor]')) {
      return;
    }

    workflow.beginEditing(node.dataset.nodeId ?? '');
    render();
    focusEditor();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement;
    const editor = target.closest<HTMLInputElement>('[data-node-editor]');

    if (editor) {
      if (event.isComposing) {
        return;
      }

      if (event.key === 'Enter') {
        event.preventDefault();
        if (workflow.commitTitle(editor.value)) {
          render();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        workflow.cancelEditing();
        render();
      }

      return;
    }

    const state = workflow.getState();
    if (!state.selectionId) {
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      workflow.addSibling(state.selectionId);
      render();
      focusEditor();
    } else if (event.key === 'Tab') {
      event.preventDefault();
      workflow.addChild(state.selectionId);
      render();
      focusEditor();
    } else if (event.key === 'F2') {
      event.preventDefault();
      workflow.beginEditing(state.selectionId);
      render();
      focusEditor();
    }
  };

  workspace.addEventListener('click', onClick);
  workspace.addEventListener('dblclick', onDoubleClick);
  workspace.addEventListener('keydown', onKeyDown);

  return () => {
    workspace.removeEventListener('click', onClick);
    workspace.removeEventListener('dblclick', onDoubleClick);
    workspace.removeEventListener('keydown', onKeyDown);
  };
}
