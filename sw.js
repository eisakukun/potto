/* オフラインでも開けるようにする。本体は通信優先（直したら次に開いたとき反映）、圏外ならキャッシュから。 */
const CACHE = "potto-v6";
const SHELL = ["./", "./index.html", "./parse.js", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req).then(res => { if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then(c => c.put(req, cp)).catch(() => {}); } return res; })
    .catch(() => caches.match(req).then(hit => hit || caches.match("./index.html"))));
});
