/**
 * Circlix — PWA Registration & Lifecycle
 */

(function () {
  'use strict';

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('./sw.js')
        .then((reg) => {
          console.log('[Circlix PWA] Service Worker registered. Scope:', reg.scope);
        })
        .catch((err) => {
          console.warn('[Circlix PWA] Service Worker registration failed:', err);
        });
    });
  }

  // Handle PWA installation prompt event
  window.addEventListener('beforeinstallprompt', (e) => {
    // Stash event for custom install UI if desired in future versions
    window.deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    console.log('[Circlix PWA] App was successfully installed.');
    window.deferredPrompt = null;
  });
})();
