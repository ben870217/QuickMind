interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function initializeInstallPrompt(documentObject: Document = document): () => void {
  const button = documentObject.querySelector<HTMLButtonElement>('[data-install-action="prompt"]');
  const windowObject = documentObject.defaultView;
  if (!button || !windowObject) {
    return () => undefined;
  }

  let deferredPrompt: BeforeInstallPromptEvent | null = null;
  const hideButton = (): void => {
    button.hidden = true;
  };

  const onBeforeInstallPrompt = (event: Event): void => {
    const installEvent = event as Partial<BeforeInstallPromptEvent>;
    if (typeof installEvent.prompt !== 'function' || !installEvent.userChoice) {
      return;
    }

    event.preventDefault();
    deferredPrompt = event as BeforeInstallPromptEvent;
    if (!isStandalone(windowObject)) {
      button.hidden = false;
    }
  };

  const onClick = async (): Promise<void> => {
    if (!deferredPrompt) {
      return;
    }

    const installEvent = deferredPrompt;
    deferredPrompt = null;
    hideButton();
    try {
      await installEvent.prompt();
      await installEvent.userChoice;
    } catch {
      // The browser owns the native prompt lifecycle; no custom fallback is shown.
    }
  };

  const onAppInstalled = (): void => {
    deferredPrompt = null;
    hideButton();
  };

  hideButton();
  windowObject.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
  windowObject.addEventListener('appinstalled', onAppInstalled);
  button.addEventListener('click', onClick);

  return () => {
    windowObject.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    windowObject.removeEventListener('appinstalled', onAppInstalled);
    button.removeEventListener('click', onClick);
  };
}

function isStandalone(windowObject: Window): boolean {
  if (windowObject.matchMedia('(display-mode: standalone)').matches) {
    return true;
  }

  return Boolean((windowObject.navigator as Navigator & { standalone?: boolean }).standalone);
}
