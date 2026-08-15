export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | undefined> {
  if (!('serviceWorker' in navigator)) {
    return undefined;
  }

  if (import.meta.env.DEV) {
    try {
      const scope = new URL(import.meta.env.BASE_URL, window.location.href).toString();
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        registrations
          .filter((registration) => registration.scope === scope)
          .map((registration) => registration.unregister()),
      );
    } catch {
      // Local development should continue even when stale worker cleanup is unavailable.
    }
    return undefined;
  }

  try {
    return await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
  } catch {
    return undefined;
  }
}
