import './styles.css';
import { renderAppShell } from './ui/app-shell';
import { renderWorkspace } from './ui/workspace';
import { DocumentWorkflow } from './workspace/document-workflow';
import { IndexedDbWorkspaceStore } from './persistence/workspace-store';
import { registerServiceWorker } from './platform/service-worker';
import { bindWorkspaceInteractions } from './ui/workspace-interactions';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('QuickMind app root is missing');
}

app.innerHTML = renderAppShell();
void registerServiceWorker();

const workspace = app.querySelector<HTMLElement>('[data-workspace]');
const status = app.querySelector<HTMLElement>('[data-app-status]');

if (!workspace || !status) {
  throw new Error('QuickMind workspace shell is incomplete');
}

const workspaceElement = workspace;
const statusElement = status;

const workflow = new DocumentWorkflow(new IndexedDbWorkspaceStore());

function updateStatus(state: ReturnType<DocumentWorkflow['getState']>): void {
  statusElement.textContent = state.persistence === 'error'
    ? '未保存到本機'
    : state.persistence === 'saving'
      ? '保存中'
      : state.connectivity === 'offline' ? '離線模式' : '已保存到本機';
}

function renderState(): void {
  const state = workflow.getState();
  renderWorkspace(workspaceElement, state);
  updateStatus(state);

  if (state.selectionId) {
    const restoreFocus = (): void => {
      const node = Array.from(workspaceElement.querySelectorAll<HTMLElement>('[data-node-id]'))
        .find((candidate) => candidate.dataset.nodeId === state.selectionId);
      const focusTarget = node?.querySelector<HTMLElement>('[data-node-editor], .node-card') ?? node;
      focusTarget?.focus();
    };
    restoreFocus();
    window.requestAnimationFrame(restoreFocus);
  }
}

function renderPersistenceState(): void {
  const state = workflow.getState();
  updateStatus(state);
  const persistenceBadge = workspaceElement.querySelector<HTMLElement>('[data-status-badge="persistence"]');
  if (persistenceBadge) {
    persistenceBadge.textContent = state.persistence === 'error' ? '未保存到本機' : state.persistence === 'saved' ? '已保存到本機' : '保存中';
  }
  if (state.persistence === 'error' && !state.editing) {
    renderState();
  }
}

workflow.subscribe(renderPersistenceState);
bindWorkspaceInteractions(workspaceElement, workflow, renderState);

window.addEventListener('online', () => {
  workflow.setConnectivity('online');
  renderState();
});

window.addEventListener('offline', () => {
  workflow.setConnectivity('offline');
  renderState();
});

const flushBeforePageHide = (): void => {
  try {
    void workflow.flushSave();
  } catch {
    // The app may be hiding before the asynchronous workspace bootstrap completes.
  }
};

window.addEventListener('pagehide', flushBeforePageHide);
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    flushBeforePageHide();
  }
});

void workflow.start().then(renderState).catch(() => {
  statusElement.textContent = '無法載入本機文件';
  workspaceElement.innerHTML = '<p class="workspace-error" role="alert">無法載入本機工作副本，請重新整理後再試。</p>';
});
