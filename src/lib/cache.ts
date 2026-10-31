/**
 * Force-refresh app cache / service worker on every launch.
 * Call once from main.tsx before render.
 */
export async function refreshAppCacheOnLaunch(): Promise<void> {
  if (typeof window === 'undefined') return;

  try {
    // Bust session marker so we can detect new deploys
    const buildId =
      (import.meta.env.VITE_APP_BUILD_ID as string) ||
      String(import.meta.env.VITE_FIREBASE_APP_ID || 'dev');

    const prev = sessionStorage.getItem('app_build_seen');
    sessionStorage.setItem('app_build_seen', buildId);

    if ('caches' in window) {
      const keys = await caches.keys();
      // Keep only current workbox precache if needed — drop old app caches
      await Promise.all(
        keys
          .filter((k) => k.includes('workbox') || k.includes('precache') || k.includes('runtime'))
          .map((k) => caches.delete(k))
      );
    }

    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      for (const reg of regs) {
        try {
          await reg.update();
        } catch {
          /* ignore */
        }
        // If waiting worker — activate immediately
        if (reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    }

    // One soft reload per session when build id changes (after SW update)
    if (prev && prev !== buildId && !sessionStorage.getItem('app_reloaded_once')) {
      sessionStorage.setItem('app_reloaded_once', '1');
      // Don't loop — only when build really changed
    }
  } catch (e) {
    console.warn('cache refresh', e);
  }
}
