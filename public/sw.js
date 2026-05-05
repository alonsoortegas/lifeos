self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', () => clients.claim())
// TODO: add offline caching strategy
