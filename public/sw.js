const CACHE = 'lifeos-v1'

const isImmutableAsset = (url) =>
  url.pathname.startsWith('/_next/static/') ||
  /\.(woff2?|ttf|otf)$/.test(url.pathname)

const isApiOrExternal = (url) =>
  url.pathname.startsWith('/api/') ||
  !url.hostname.endsWith(self.location.hostname.replace(/^[^.]+\./, ''))

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // API routes and Supabase: always hit the network, never cache
  if (isApiOrExternal(url)) return

  // Immutable assets (content-hashed by Next.js + fonts): cache-first
  if (isImmutableAsset(url)) {
    event.respondWith(
      caches.open(CACHE).then(async cache => {
        const hit = await cache.match(event.request)
        if (hit) return hit
        const res = await fetch(event.request)
        if (res.ok) cache.put(event.request, res.clone())
        return res
      })
    )
    return
  }

  // Navigation and everything else: network-first, fall back to cache
  // HTML is not cached directly — auth middleware must run on every nav
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  )
})
