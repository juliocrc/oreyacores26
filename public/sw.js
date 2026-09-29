const CACHE_NAME = 'orey-acores-v3';
const OFFLINE_URL = '/offline.html';

// App shell: cachear na instalacao
const APP_SHELL = [
  '/',
  '/offline.html',
  '/manifest.json',
  '/icon-192x192.png',
  '/icon-512x512.png',
  '/favicon.ico',
];

// ============================================================
// INSTALACAO — cachear app shell
// ============================================================
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

// ============================================================
// ATIVACAO — limpar caches antigos
// ============================================================
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    ).then(() => self.clients.claim())
  );
});

// ============================================================
// FETCH — estrategia offline-first para app local
// ============================================================
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Apenas interceptar GET
  if (request.method !== 'GET') return;

  // --- NAVEGACAO (HTML pages) ---
  if (request.mode === 'navigate') {
    event.respondWith(navigationStrategy(request));
    return;
  }

  // ---Assets estaticos (_next/static, imagens, etc) ---
  event.respondWith(staticStrategy(request));
});

// ============================================================
// ESTRATEGIA DE NAVEGACAO
// Cache-first (stale-while-revalidate):
//   1. Responder imediatamente do cache (instant)
//   2. Atualizar cache em background
//   3. Se nao tem cache, ir a rede
//   4. Se rede falha, offline.html
// ============================================================
async function navigationStrategy(request) {
  // Rede primeiro: se o servidor responder (mesmo com erro HTTP), devolver a
  // resposta real. So mostramos "Servidor a Arrancar" se a rede falhar mesmo.
  try {
    const networkResponse = await fetch(request);
    if (networkResponse) {
      return networkResponse;
    }
  } catch {
    // Rede indisponivel — tentar cache / pagina offline
  }

  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;

  const offline = await cache.match(OFFLINE_URL);
  return offline || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

// ============================================================
// ESTRATEGIA PARA ASSETS ESTATICOS
// Cache-first: rapido, atualiza em background
// ============================================================
async function staticStrategy(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  if (cached) {
    // Atualizar em background (stale-while-revalidate)
    fetch(request).then((response) => {
      if (response && response.ok) {
        cache.put(request, response);
      }
    }).catch(() => {});
    return cached;
  }

  // Nao esta no cache — buscar a rede
  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('', { status: 408 });
  }
}

// ============================================================
// MENSAGENS — permite ao app forcar atualizacao do cache
// ============================================================
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
