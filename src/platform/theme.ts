export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'quickmind.theme';

export const THEME_COLORS: Record<ResolvedTheme, string> = {
  light: '#f4f0ea',
  dark: '#252322',
};

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function resolveTheme(preference: ThemePreference, systemIsDark: boolean): ResolvedTheme {
  if (preference === 'system') {
    return systemIsDark ? 'dark' : 'light';
  }

  return preference;
}

export function readStoredThemePreference(storage: Pick<Storage, 'getItem'> | null | undefined): ThemePreference {
  try {
    const stored = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

export function applyTheme(
  documentElement: HTMLElement,
  metaThemeColor: HTMLMetaElement | null,
  preference: ThemePreference,
  systemIsDark: boolean,
): ResolvedTheme {
  const resolved = resolveTheme(preference, systemIsDark);
  documentElement.dataset.theme = resolved;
  documentElement.style.colorScheme = resolved;
  if (metaThemeColor) {
    metaThemeColor.content = THEME_COLORS[resolved];
  }
  return resolved;
}

export interface ThemeControllerOptions {
  document?: Document;
  storage?: Pick<Storage, 'getItem' | 'setItem'> | null;
  systemIsDark?: boolean;
}

export function initializeTheme(options: ThemeControllerOptions = {}): () => void {
  const documentObject = options.document ?? document;
  const storage = options.storage === undefined ? getLocalStorage() : options.storage;
  const systemIsDark = options.systemIsDark ?? getSystemIsDark();
  const metaThemeColor = documentObject.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const select = documentObject.querySelector<HTMLSelectElement>('[data-theme-select]');
  let preference = readStoredThemePreference(storage);

  const apply = (): void => {
    applyTheme(documentObject.documentElement, metaThemeColor, preference, systemIsDark);
    if (select) {
      select.value = preference;
    }
  };

  const onChange = (): void => {
    if (!select || !isThemePreference(select.value)) {
      return;
    }

    preference = select.value;
    try {
      storage?.setItem(THEME_STORAGE_KEY, preference);
    } catch {
      // A storage failure still permits the current tab to use the selected theme.
    }
    apply();
  };

  select?.addEventListener('change', onChange);
  apply();

  return () => select?.removeEventListener('change', onChange);
}

function getLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getSystemIsDark(): boolean {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}
