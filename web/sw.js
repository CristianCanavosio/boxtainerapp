// Service worker de BoxTainer: solo recibe los avisos al celular (Web Push) y abre la app al tocarlos.
// No guarda la app en caché: siempre se carga la versión publicada.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (_) { d = { titulo: e.data && e.data.text() }; }
  const titulo = d.titulo || 'BoxTainer';
  e.waitUntil((async () => {
    await self.registration.showNotification(titulo, {
      body: d.cuerpo || '', icon: 'icons/icono-192.png', badge: 'icons/icono-192.png',
      tag: d.tag || undefined, data: { url: d.url || './' },
    });
    // número sobre el ícono, donde el celular lo permite
    if (typeof d.pendientes === 'number' && self.navigator.setAppBadge) {
      try { d.pendientes ? await self.navigator.setAppBadge(d.pendientes) : await self.navigator.clearAppBadge(); } catch (_) {}
    }
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || './', self.registration.scope).href;
  e.waitUntil((async () => {
    const ws = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of ws) {
      if (w.url.startsWith(self.registration.scope)) { await w.focus(); w.postMessage({ abrir: url }); return; }
    }
    await self.clients.openWindow(url);
  })());
});
