import './styles.css';
import { renderAppShell } from './ui/app-shell';
import { renderWorkspace } from './ui/workspace';
import { DocumentWorkflow } from './workspace/document-workflow';
import { IndexedDbWorkspaceStore } from './persistence/workspace-store';
import { registerServiceWorker } from './platform/service-worker';

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

function renderState(): void {
  const state = workflow.getState();
  renderWorkspace(workspaceElement, state);
  statusElement.textContent = state.connectivity === 'offline' ? '離線模式' : '已保存到本機';
}

window.addEventListener('online', () => {
  workflow.setConnectivity('online');
  renderState();
});

window.addEventListener('offline', () => {
  workflow.setConnectivity('offline');
  renderState();
});

void workflow.start().then(renderState).catch(() => {
  statusElement.textContent = '無法載入本機文件';
  workspaceElement.innerHTML = '<p class="workspace-error" role="alert">無法載入本機工作副本，請重新整理後再試。</p>';
});
