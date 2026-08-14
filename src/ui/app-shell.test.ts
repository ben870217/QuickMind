import { describe, expect, it } from 'vitest';
import { renderAppShell } from './app-shell';

describe('QuickMind app shell', () => {
  it('shows the product name and an accessible workspace', () => {
    const markup = renderAppShell();

    expect(markup).toContain('<h1>QuickMind</h1>');
    expect(markup).toContain('aria-label="QuickMind 工作區"');
    expect(markup).toContain('role="status"');
    expect(markup).toContain('data-workspace');
  });
});
