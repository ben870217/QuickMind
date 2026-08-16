import { describe, expect, it } from 'vitest';
import {
  applyTheme,
  isThemePreference,
  readStoredThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
} from './theme';

describe('theme preference', () => {
  it('resolves system preference only at the time it is applied', () => {
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('accepts only the supported persisted values', () => {
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('sepia')).toBe(false);
    expect(readStoredThemePreference({ getItem: () => 'sepia' })).toBe('system');
    expect(readStoredThemePreference({ getItem: (key) => key === THEME_STORAGE_KEY ? 'dark' : null })).toBe('dark');
  });

  it('applies the resolved theme and synchronizes theme-color', () => {
    const documentElement = {
      dataset: {} as DOMStringMap,
      style: { colorScheme: '' },
    } as unknown as HTMLElement;
    const meta = { content: '' } as HTMLMetaElement;

    expect(applyTheme(documentElement, meta, 'dark', false)).toBe('dark');
    expect(documentElement.dataset.theme).toBe('dark');
    expect(documentElement.style.colorScheme).toBe('dark');
    expect(meta.content).toBe('#252322');
  });
});
