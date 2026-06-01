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
  './assets/images/task1.png',
  './assets/images/task2.png',
  './assets/images/task3.png',
  './assets/images/task4.png',
  './assets/images/task5.png',
  './assets/images/task6.png',
  './assets/images/task7.png',
  './assets/images/task8.png',
  './assets/images/task9.png',
  './assets/images/task10.png',
  './assets/images/task11.png',
  './assets/images/task12.png',
  './assets/images/task13.png',
  './assets/images/task14.png',
  './assets/images/task15.png',
  './assets/images/task16.png',
  './assets/images/task17.png',
  './assets/images/task18.png',
  './assets/images/task19.png',
  './assets/images/task20.png',
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
