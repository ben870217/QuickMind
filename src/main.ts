import './styles.css';
import { renderAppShell } from './ui/app-shell';

const app = document.querySelector<HTMLElement>('#app');

if (!app) {
  throw new Error('QuickMind app root is missing');
}

app.innerHTML = renderAppShell();
