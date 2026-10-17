/* Sổ Truyện runs from this saved copy of its own files. Once installed it never fetches app code
   from the network again, so it keeps working offline and even after the website is taken down.
   Stories never pass through here. */
const CACHE = "sotruyen-v5";
const FILES = ["./", "index.html", "app.js", "manifest.webmanifest", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FILES.map(f => new Request(f, {cache:"reload"})))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if(req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    caches.match(req, {ignoreSearch:true}).then(hit => hit ||
      (req.mode === "navigate" ? caches.match("index.html") : null)).then(hit => hit || fetch(req))
  );
});
