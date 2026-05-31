const CACHE_NAME = 'routine-flow-v1';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './manifest.json',
  './assets/audio/bgm-standard.mp3',
  './assets/audio/bgm-urgent.mp3',
  './assets/audio/sfx-complete.mp3',
  './assets/audio/sfx-warning.mp3',
  './assets/audio/sfx-victory.mp3'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});
